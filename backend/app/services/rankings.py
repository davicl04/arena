"""Tiers (elos): cut mapping, faced range and the read side of standings (Jogar, fases 1 e 5).

Standings are materialized by `services.standings` after each confirmed result (football and tennis, fase 5) and
after each running mark registered or removed (fase 6, `services.runs`). A subject without rows is in placement:
'sem_jogos' (football and tennis) or 'sem_marca' (running). A tier is never assigned before classification: the
recalculation writes a tier only to subjects with the required matches (marks, in running), and the lines below
show the tier of a row as stored.
"""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.identity import User
from app.models.rankings import FOOTBALL_FORMATS, RUN_DISTANCES_KM, TIERS, RankCut, Standing
from app.models.teams import POSITIONS, Team, TeamMember
from app.schemas.rankings import (
    FootballStandingsOut,
    FormatStandingOut,
    MeStandingsOut,
    PositionStandingOut,
    RunStandingOut,
    StandingLineOut,
    TeamRefOut,
    TeamStandingsOut,
)

CURRENT_CALC_VERSION = 1
# Used only if the cuts of the current version are missing; the migration inserts them.
DEFAULT_PLACEMENT = {'futebol': 3, 'tenis': 3, 'corrida': 1}


@dataclass(frozen=True)
class Cuts:
    ranking: str
    metric: str
    direction: str
    prata: Decimal
    ouro: Decimal
    diamante: Decimal
    placement_matches: int
    legend_share: Decimal
    window_weeks: int


def ranking_key(sport: str, *, team: bool = False, distance_km: int | None = None) -> str:
    """Ranking of a category: futebol_time, futebol_individual, tenis or corrida_<km>."""
    if sport == 'futebol':
        return 'futebol_time' if team else 'futebol_individual'
    if sport == 'tenis' and not team:
        return 'tenis'
    if sport == 'corrida' and not team and distance_km in RUN_DISTANCES_KM:
        return f'corrida_{distance_km}'
    raise ValueError('Categoria de ranking inválida.')


def load_cuts(db: Session, calc_version: int = CURRENT_CALC_VERSION) -> dict[str, Cuts]:
    rows = db.scalars(select(RankCut).where(RankCut.calc_version == calc_version)).all()
    return {row.ranking: Cuts(row.ranking, row.metric, row.direction, Decimal(row.prata), Decimal(row.ouro),
                              Decimal(row.diamante), row.placement_matches, Decimal(row.legend_share),
                              row.window_weeks) for row in rows}


def base_tier(value: Decimal | int | float, cuts: Cuts) -> str:
    """Fixed cuts up to Diamante: 'maior' means value >= cut, 'menor' (times) means value <= cut."""
    amount = Decimal(str(value))
    for tier in ('diamante', 'ouro', 'prata'):
        cut = getattr(cuts, tier)
        if (amount >= cut) if cuts.direction == 'maior' else (amount <= cut):
            return tier
    return 'bronze'


def legend_slots(classified_count: int, share: Decimal) -> int:
    """How many places can be Lendário: floor(classified × share). Fewer than 7 classified at 15% gives 0."""
    return int((Decimal(max(classified_count, 0)) * Decimal(share)) // 1)


def tier_for(value: Decimal | int | float, cuts: Cuts, *, rank_position: int, classified_count: int) -> str:
    """Tier of a classified subject; Lendário needs Diamante and a place inside the top share."""
    tier = base_tier(value, cuts)
    if tier == 'diamante' and 1 <= rank_position <= legend_slots(classified_count, cuts.legend_share):
        return 'lendario'
    return tier


def faced_tiers(tier: str | None) -> list[str]:
    """Same or neighbouring tier; without a tier (placement) any level is faced."""
    if tier is None:
        return list(TIERS)
    index = TIERS.index(tier)
    return list(TIERS[max(0, index - 1):index + 2])


def can_face(left: str | None, right: str | None) -> bool:
    if left is None or right is None:
        return True
    return abs(TIERS.index(left) - TIERS.index(right)) <= 1


def standing_line(row: Standing | None, required: int, *, running: bool = False) -> dict:
    """Fields of StandingLineOut for one category; `row` is None when the subject never played."""
    played = row.matches_played if row is not None else 0
    tier = row.tier if row is not None else None
    if tier is not None:
        state = 'ranqueado'
    elif played <= 0:
        state = 'sem_marca' if running else 'sem_jogos'
    else:
        state = 'classificacao'
    return {
        'state': state,
        'tier': tier,
        'played': min(played, required) if tier is None else played,
        'required': required,
        'rank_position': row.rank_position if row is not None and tier is not None else None,
        'metric_value': float(row.metric_value) if row is not None and played > 0 else None,
        'faces': faced_tiers(tier),
        'faces_any_level': tier is None,
    }


def subject_tier(db: Session, sport: str, *, team_id: int | None = None, user_id: int | None = None,
                 format: str | None = None, distance_km: int | None = None) -> str | None:
    """Current tier in the category an event looks at (RN18); None while in placement or without games.

    Football: the team in the event format. Tennis: the athlete. Running: the athlete at the race distance.
    """
    if sport == 'futebol' and team_id is not None and format in FOOTBALL_FORMATS:
        where = (Standing.team_id == team_id, Standing.format == format)
    elif sport == 'tenis' and user_id is not None:
        where = (Standing.user_id == user_id,)
    elif sport == 'corrida' and user_id is not None and distance_km in RUN_DISTANCES_KM:
        where = (Standing.user_id == user_id, Standing.distance_km == distance_km)
    else:
        raise ValueError('Categoria de elegibilidade inválida.')
    return db.scalar(select(Standing.tier).where(Standing.sport == sport, *where))


def required_matches(cuts: dict[str, Cuts], ranking: str, sport: str) -> int:
    """Matches (marks, in running) that classify a subject in a ranking, from the cuts of the current version."""
    cut = cuts.get(ranking)
    return cut.placement_matches if cut is not None else DEFAULT_PLACEMENT[sport]


def team_format_grid(db: Session, team_ids: Iterable[int], *,
                     cuts: dict[str, Cuts] | None = None) -> dict[int, list[FormatStandingOut]]:
    """Futsal | Society | Campo grid of several teams in one query (team card C5 and /me/standings)."""
    ids = list(dict.fromkeys(team_ids))
    if not ids:
        return {}
    cuts = load_cuts(db) if cuts is None else cuts
    required = required_matches(cuts, 'futebol_time', 'futebol')
    rows = db.scalars(select(Standing).where(Standing.team_id.in_(ids), Standing.sport == 'futebol')).all()
    by_key = {(row.team_id, row.format): row for row in rows}
    return {team_id: [FormatStandingOut(format=fmt, **standing_line(by_key.get((team_id, fmt)), required))
                      for fmt in FOOTBALL_FORMATS] for team_id in ids}


def my_standings(db: Session, user: User) -> MeStandingsOut:
    """Every category of the session user: active teams × format, position × format, tennis and distances."""
    cuts = load_cuts(db)
    memberships = db.execute(
        select(TeamMember, Team).join(Team, Team.id == TeamMember.team_id)
        .where(TeamMember.user_id == user.id, TeamMember.left_at.is_(None), Team.state == 'ativo')
        .order_by((TeamMember.role == 'representante').desc(), TeamMember.joined_at, Team.id)
    ).all()
    grid = team_format_grid(db, [team.id for _, team in memberships], cuts=cuts)
    teams = [TeamStandingsOut(team=TeamRefOut(id=team.id, name=team.name, initials=team.initials,
                                              crest_url=team.crest_url),
                              my_role=member.role, formats=grid[team.id]) for member, team in memberships]

    rows = db.scalars(select(Standing).where(Standing.user_id == user.id)).all()
    football = {(row.position, row.format): row for row in rows if row.sport == 'futebol'}
    tennis = next((row for row in rows if row.sport == 'tenis'), None)
    running = {row.distance_km: row for row in rows if row.sport == 'corrida'}
    individual_required = required_matches(cuts, 'futebol_individual', 'futebol')
    individual = [PositionStandingOut(position=position, format=fmt,
                                      **standing_line(football.get((position, fmt)), individual_required))
                  for position in POSITIONS for fmt in FOOTBALL_FORMATS]
    corrida = [RunStandingOut(distance_km=km, **standing_line(
        running.get(km), required_matches(cuts, ranking_key('corrida', distance_km=km), 'corrida'), running=True))
        for km in RUN_DISTANCES_KM]
    return MeStandingsOut(
        calc_version=CURRENT_CALC_VERSION,
        futebol=FootballStandingsOut(teams=teams, individual=individual),
        tenis=StandingLineOut(**standing_line(tennis, required_matches(cuts, 'tenis', 'tenis'))),
        corrida=corrida,
    )
