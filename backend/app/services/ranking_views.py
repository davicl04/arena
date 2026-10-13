"""Read side of the Ranking screen: the general rankings by tier, the viewer's place and the window around it
(contract: docs/decisoes/0002-jogar.md, sections 12.6 and 20).

Everything is read from the materialized `standings` (the recalculation of `services.standings` writes positions,
tiers, the recent form and the best mark day); no match is queried. The tiers of a category are contiguous in
`rank_position` (the best tier first, Lendário a prefix; `tests/unit/test_ranking_tiers.py` guards it), so the
position inside a tier is `rank_position` minus the classified subjects in the tiers above it.
"""
from __future__ import annotations

import base64
import binascii
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.pagination import PAGE_DEFAULT
from app.models.identity import User
from app.models.rankings import FOOTBALL_FORMATS, RUN_DISTANCES_KM, TIERS, Standing
from app.models.teams import POSITIONS, Team, TeamMember
from app.schemas.common import PersonOut
from app.schemas.rankings import (
    MyRankingLineOut,
    RankingOverviewOut,
    RankingPageOut,
    RankingRowOut,
    RankingSubjectOut,
    TeamRefOut,
    TierCountsOut,
)
from app.services.people import people_out
from app.services.rankings import (
    CURRENT_CALC_VERSION,
    Cuts,
    legend_slots,
    load_cuts,
    ranking_key,
    required_matches,
    standing_line,
)

CURSOR_INVALID = 'Cursor de paginação inválido.'
TEAM_NOT_FOUND = 'Time não encontrado.'
# Rows read around the viewer: three above and three below inside the tier (the clients show two and use the
# ends as the faded edge) and the Lendários shown at the entrance of the Salão.
WINDOW_REACH = 3
LEGENDS_PREVIEW = 4


@dataclass(frozen=True)
class RankingParams:
    """Query of `GET /rankings`: football by team (`kind='time'`, format) or individual (format and position),
    tennis, or running by distance; `tier` keeps only one tier of the category. Rankings are general: there is no
    city."""
    sport: str
    kind: str | None = None
    format: str | None = None
    position: str | None = None
    distance_km: int | None = None
    cursor: str | None = None
    limit: int = PAGE_DEFAULT
    tier: str | None = None


@dataclass(frozen=True)
class Category:
    """A resolved category: its ranking key, cuts and the matches (marks) that classify."""
    ranking: str
    format: str | None
    position: str | None
    distance_km: int | None
    cuts: Cuts
    required: int

    @property
    def where(self) -> tuple:
        return category_filter(self.ranking, self.format, self.position, self.distance_km)

    @property
    def is_running(self) -> bool:
        return self.distance_km is not None


# ----- Cursor and category ----------------------------------------------------------------------------------

def _decode_position(cursor: str | None) -> int:
    if not cursor:
        return 0
    try:
        value = int(base64.urlsafe_b64decode(cursor + '=' * (-len(cursor) % 4)).decode())
    except (ValueError, binascii.Error, UnicodeDecodeError):
        raise HTTPException(422, CURSOR_INVALID) from None
    if value < 1:
        raise HTTPException(422, CURSOR_INVALID)
    return value


def _encode_position(position: int) -> str:
    return base64.urlsafe_b64encode(str(position).encode()).decode().rstrip('=')


def ranking_category(params: RankingParams) -> tuple[str, str | None, str | None, int | None]:
    """(ranking key, format, position, distance) of the query, or 422 for a missing category."""
    if params.sport == 'futebol':
        if params.kind not in ('time', 'individual'):
            raise HTTPException(422, 'Escolha se o ranking é de times ou individual.')
        if params.format not in FOOTBALL_FORMATS:
            raise HTTPException(422, 'Escolha o formato.')
        if params.kind == 'time':
            return ranking_key('futebol', team=True), params.format, None, None
        if params.position not in POSITIONS:
            raise HTTPException(422, 'Escolha a posição.')
        return ranking_key('futebol'), params.format, params.position, None
    if params.sport == 'tenis':
        return ranking_key('tenis'), None, None, None
    if params.distance_km is None:
        raise HTTPException(422, 'Escolha a distância.')
    if params.distance_km not in RUN_DISTANCES_KM:
        raise HTTPException(422, 'Distância inválida.')
    return ranking_key('corrida', distance_km=params.distance_km), None, None, params.distance_km


def category_filter(ranking: str, format_: str | None, position: str | None, distance_km: int | None) -> tuple:
    if ranking == 'futebol_time':
        return Standing.sport == 'futebol', Standing.team_id.is_not(None), Standing.format == format_
    if ranking == 'futebol_individual':
        return (Standing.sport == 'futebol', Standing.user_id.is_not(None), Standing.format == format_,
                Standing.position == position)
    if distance_km is not None:
        return Standing.sport == 'corrida', Standing.distance_km == distance_km
    return (Standing.sport == 'tenis',)


def resolve_category(db: Session, params: RankingParams) -> Category:
    ranking, format_, position, distance_km = ranking_category(params)
    cuts = load_cuts(db, CURRENT_CALC_VERSION)
    sport = 'corrida' if distance_km else 'tenis' if ranking == 'tenis' else 'futebol'
    return Category(ranking, format_, position, distance_km, cuts[ranking], required_matches(cuts, ranking, sport))


# ----- Tiers: counts, offsets and gaps ----------------------------------------------------------------------

def tier_counts(db: Session, where: Sequence) -> dict[str, int]:
    """Classified subjects per tier of the category (zero for an empty tier), in one grouped query."""
    found = dict(db.execute(select(Standing.tier, func.count()).where(*where, Standing.rank_position.is_not(None))
                            .group_by(Standing.tier)).all())
    return {tier: int(found.get(tier, 0)) for tier in TIERS}


def tier_offset(counts: Mapping[str, int], tier: str) -> int:
    """Classified subjects in the tiers above `tier`: the `rank_position` just before the tier starts, so the
    position inside the tier is `rank_position - tier_offset`."""
    return sum(counts[other] for other in TIERS[TIERS.index(tier) + 1:])


def gap(ahead: Decimal | float | int, behind: Decimal | float | int, direction: str) -> float:
    """How far `ahead` (the better place) is from `behind` in the metric of the ranking: `maior` (points, average)
    is `ahead - behind`; `menor` (running time, in seconds) is `behind - ahead`. Never negative."""
    ahead, behind = Decimal(str(ahead)), Decimal(str(behind))
    return float(max(ahead - behind if direction == 'maior' else behind - ahead, Decimal(0)))


# ----- The viewer's lines ------------------------------------------------------------------------------------

def _team_ref(team: Team) -> TeamRefOut:
    return TeamRefOut(id=team.id, name=team.name, initials=team.initials, crest_url=team.crest_url)


def active_teams(db: Session, viewer: User) -> list[Team]:
    """The viewer's active teams: the ones they represent first, then the oldest membership."""
    return [team for _, team in db.execute(
        select(TeamMember, Team).join(Team, Team.id == TeamMember.team_id)
        .where(TeamMember.user_id == viewer.id, TeamMember.left_at.is_(None), Team.state == 'ativo')
        .order_by((TeamMember.role == 'representante').desc(), TeamMember.joined_at, Team.id)).all()]


def _my_rows(db: Session, viewer: User, category: Category,
             teams: Sequence[Team]) -> list[tuple[Team | None, Standing | None]]:
    """(team, standing) of each line of the viewer: every active team in a team ranking, or the athlete."""
    if category.ranking == 'futebol_time':
        rows = {row.team_id: row for row in db.scalars(select(Standing).where(
            Standing.team_id.in_([team.id for team in teams]), Standing.sport == 'futebol',
            Standing.format == category.format))} if teams else {}
        return [(team, rows.get(team.id)) for team in teams]
    row = db.scalar(select(Standing).where(Standing.user_id == viewer.id, *category.where))
    return [(None, row)]


def _lead_metrics(db: Session, category: Category, counts: Mapping[str, int],
                  rows: Iterable[Standing | None]) -> dict[int, Decimal]:
    """Metric of the leader of the tier and of the next place of each ranked row, by `rank_position`, in one query."""
    wanted: set[int] = set()
    for row in rows:
        if row is None or row.tier is None or row.rank_position is None:
            continue
        offset = tier_offset(counts, row.tier)
        wanted.add(offset + 1)
        if row.rank_position < offset + counts[row.tier]:
            wanted.add(row.rank_position + 1)
    if not wanted:
        return {}
    return dict(db.execute(select(Standing.rank_position, Standing.metric_value).where(
        *category.where, Standing.rank_position.in_(wanted))).all())


def my_lines(db: Session, viewer: User, category: Category, counts: Mapping[str, int],
             teams: Sequence[Team]) -> list[MyRankingLineOut]:
    """The viewer's lines in this ranking (each active team in a team ranking), even while in placement, with the
    place inside the tier and the gaps to its leader and to the next one (ranked lines only)."""
    pairs = _my_rows(db, viewer, category, teams)
    metrics = _lead_metrics(db, category, counts, (row for _, row in pairs))
    lines = []
    for team, row in pairs:
        extra: dict = dict(tier_position=None, tier_size=None, leader_gap=None, next_gap=None,
                           next_tier_position=None)
        if row is not None and row.tier is not None and row.rank_position is not None:
            offset, size = tier_offset(counts, row.tier), counts[row.tier]
            position = row.rank_position - offset
            extra.update(tier_position=position, tier_size=size)
            if position > 1:
                extra['leader_gap'] = gap(metrics[offset + 1], row.metric_value, category.cuts.direction)
            if position < size:
                extra.update(next_gap=gap(row.metric_value, metrics[row.rank_position + 1], category.cuts.direction),
                             next_tier_position=position + 1)
        lines.append(MyRankingLineOut(team=None if team is None else _team_ref(team),
                                      **standing_line(row, category.required, running=category.is_running), **extra))
    return lines


# ----- Rows ---------------------------------------------------------------------------------------------------

@dataclass(frozen=True)
class Subjects:
    """Teams and people of a set of rows, read once (people keep the visibility rules of `people_out`)."""
    teams: dict[int, Team]
    people: dict[int, PersonOut]

    @classmethod
    def load(cls, db: Session, viewer: User, rows: Sequence[Standing]) -> Subjects:
        team_ids = [row.team_id for row in rows if row.team_id is not None]
        teams = {team.id: team for team in db.scalars(select(Team).where(Team.id.in_(team_ids)))} if team_ids else {}
        return cls(teams, people_out(db, viewer, [row.user_id for row in rows]))

    def team_of(self, row: Standing) -> TeamRefOut | None:
        team = self.teams.get(row.team_id) if row.team_id is not None else None
        return None if team is None else _team_ref(team)

    def athlete_of(self, row: Standing) -> PersonOut | None:
        return self.people.get(row.user_id) if row.user_id is not None else None


def _rows_out(rows: Sequence[Standing], category: Category, counts: Mapping[str, int], subjects: Subjects,
              viewer: User, my_teams: set[int]) -> list[RankingRowOut]:
    no_goals = category.ranking == 'futebol_individual' or category.is_running
    return [RankingRowOut(
        rank_position=row.rank_position, tier=row.tier, tier_position=row.rank_position - tier_offset(counts, row.tier),
        metric_value=float(row.metric_value), matches_played=row.matches_played, wins=row.wins, draws=row.draws,
        losses=row.losses, goals_for=None if no_goals else row.goals_for,
        goals_against=None if no_goals else row.goals_against,
        form=None if category.is_running else list(row.recent_form),
        best_mark_on=row.best_mark_on if category.is_running else None,
        team=subjects.team_of(row), athlete=subjects.athlete_of(row),
        is_mine=row.team_id in my_teams if row.team_id is not None else row.user_id == viewer.id) for row in rows]


# ----- Pages --------------------------------------------------------------------------------------------------

def rankings_page(db: Session, viewer: User, params: RankingParams) -> RankingPageOut:
    """A page of a general ranking in position order (classified subjects only; positions and tiers are the ones
    materialized by `services.standings`), optionally one tier of it, with the viewer's own lines, which also exist
    in placement. In a running distance, `metric_value` is the best time in seconds of the window (the lowest
    wins), `matches_played` counts the marks and the record fields are zero or null. `tier_counts` always
    describes the whole category."""
    category = resolve_category(db, params)
    counts = tier_counts(db, category.where)
    teams = active_teams(db, viewer) if category.ranking == 'futebol_time' else []
    mine = my_lines(db, viewer, category, counts, teams)
    tier_filter = () if params.tier is None else (Standing.tier == params.tier,)
    rows = list(db.scalars(select(Standing).where(
        *category.where, *tier_filter, Standing.rank_position > _decode_position(params.cursor))
        .order_by(Standing.rank_position, Standing.id).limit(params.limit + 1)))
    more = len(rows) > params.limit
    rows = rows[:params.limit]
    items = _rows_out(rows, category, counts, Subjects.load(db, viewer, rows), viewer, {team.id for team in teams})
    classified = sum(counts.values())
    return RankingPageOut(
        ranking=category.ranking, format=category.format, position=category.position,
        distance_km=category.distance_km, calc_version=CURRENT_CALC_VERSION, required=category.required,
        classified_count=classified, legend_slots=legend_slots(classified, category.cuts.legend_share),
        tier_counts=TierCountsOut(**counts), items=items,
        next_cursor=_encode_position(rows[-1].rank_position) if more else None, mine=mine)


def ranking_overview(db: Session, viewer: User, params: RankingParams, *,
                     team_id: int | None = None) -> RankingOverviewOut:
    """The Ranking screen in one read: the category totals, the viewer's lines, the line the plate shows
    (`team_id`, which must be an active team of the viewer, or the first line), the rows around it inside its tier
    and the first Lendários. `404` for a team that is not an active team of the viewer."""
    category = resolve_category(db, params)
    teams = active_teams(db, viewer)
    if team_id is not None and team_id not in {team.id for team in teams}:
        raise HTTPException(404, TEAM_NOT_FOUND)
    counts = tier_counts(db, category.where)
    is_team_ranking = category.ranking == 'futebol_time'
    mine = my_lines(db, viewer, category, counts, teams if is_team_ranking else [])
    selected = next((line for line in mine if is_team_ranking and line.team.id == team_id), mine[0] if mine else None)
    window_rows: list[Standing] = []
    if selected is not None and selected.tier is not None:
        offset = tier_offset(counts, selected.tier)
        first = max(1, selected.tier_position - WINDOW_REACH)
        last = min(selected.tier_size, selected.tier_position + WINDOW_REACH)
        window_rows = list(db.scalars(select(Standing).where(
            *category.where, Standing.rank_position.between(offset + first, offset + last))
            .order_by(Standing.rank_position, Standing.id)))
    legend_rows = list(db.scalars(select(Standing).where(*category.where, Standing.tier == 'lendario')
                                  .order_by(Standing.rank_position, Standing.id).limit(LEGENDS_PREVIEW)))
    subjects = Subjects.load(db, viewer, [*window_rows, *legend_rows])
    classified = sum(counts.values())
    return RankingOverviewOut(
        ranking=category.ranking, format=category.format, position=category.position,
        distance_km=category.distance_km, calc_version=CURRENT_CALC_VERSION, required=category.required,
        classified_count=classified, legend_slots=legend_slots(classified, category.cuts.legend_share),
        tier_counts=TierCountsOut(**counts), mine=mine,
        selected_team_id=selected.team.id if is_team_ranking and selected is not None else None,
        window=None if selected is None or selected.tier is None else _rows_out(
            window_rows, category, counts, subjects, viewer, {team.id for team in teams}),
        legends_preview=[RankingSubjectOut(team=subjects.team_of(row), athlete=subjects.athlete_of(row))
                         for row in legend_rows])


__all__ = ['Category', 'RankingParams', 'active_teams', 'gap', 'my_lines', 'ranking_category', 'ranking_overview',
           'rankings_page', 'resolve_category', 'tier_counts', 'tier_offset']
