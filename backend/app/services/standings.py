"""Materialized rankings after confirmed results (Jogar, fase 5).

The pure rules (points, records, order, classification and tiers) are in `services.scoring`; this module loads the
confirmed matches of the 52-week window, applies them and writes `standings` (contract: docs/decisoes/0002-jogar.md,
section 12.6). It is called inside the transaction that confirms a result, decides it, closes its deadline or
changes the attendance or the stats of a confirmed match; nothing here commits.

A ranking is recalculated whole (positions and the Lendário places depend on every classified subject), one
category at a time (`RankingKey`): teams by format, athletes by position and format, and tennis. Each category is
serialized by a transaction advisory lock, taken in a fixed order, so two results that touch the same ranking never
write at the same time and each one reads the other's committed match. Afterwards, the open searches of subjects
whose tier changed receive it and try to pair again (`matchmaking_queue.queue.try_match`).
"""
from __future__ import annotations

import hashlib
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import exists, func, or_, select, tuple_
from sqlalchemy.orm import Session

from app.models.matches import (
    OPEN_SEARCH_STATES,
    SCORED_MATCH_STATES,
    FootballStat,
    Match,
    MatchLineup,
    MatchSearch,
    MatchSide,
)
from app.models.rankings import FOOTBALL_FORMATS, Standing
from app.models.teams import POSITIONS
from app.services import scoring
from app.services.match_rules import bucket_key, bucket_lock_id, counted_stat_fields
from app.services.matchmaking_queue import queue
from app.services.rankings import CURRENT_CALC_VERSION, Cuts, load_cuts

RANKING_ORDER = ('futebol_time', 'futebol_individual', 'tenis')
# Columns of a `standings` row that a recalculation writes; a row is rewritten only when one of them changes.
VALUE_FIELDS = ('metric_value', 'matches_played', 'wins', 'draws', 'losses', 'goals_for', 'goals_against',
                'rank_position', 'tier', 'calc_version')


@dataclass(frozen=True)
class RankingKey:
    """One ranking category: all teams of a format, all athletes of a position and format, or all tennis players.

    Running rankings (`corrida_<km>`) belong to the running phase and are not recalculated here."""
    ranking: str
    format: str | None = None
    position: str | None = None

    def __post_init__(self) -> None:
        if self.ranking == 'futebol_time':
            valid = self.format in FOOTBALL_FORMATS and self.position is None
        elif self.ranking == 'futebol_individual':
            valid = self.format in FOOTBALL_FORMATS and self.position in POSITIONS
        else:
            valid = self.ranking == 'tenis' and self.format is None and self.position is None
        if not valid:
            raise ValueError('Chave de ranking inválida.')

    @property
    def sport(self) -> str:
        return 'tenis' if self.ranking == 'tenis' else 'futebol'

    @property
    def label(self) -> str:
        return ':'.join(part for part in (self.ranking, self.format, self.position) if part)

    @property
    def sort_key(self) -> tuple[int, str, str]:
        return RANKING_ORDER.index(self.ranking), self.format or '', self.position or ''


@dataclass(frozen=True)
class TierChange:
    """A subject whose tier (or placement) changed with a recalculation."""
    key: RankingKey
    subject_id: int
    old: str | None
    new: str | None


def ranking_lock_id(key: RankingKey) -> int:
    """Signed 64-bit key for `pg_advisory_xact_lock`, stable across processes and API instances."""
    digest = hashlib.sha256(f'arena:ranking:{key.label}'.encode()).digest()
    return int.from_bytes(digest[:8], 'big', signed=True)


def ranking_keys_for_match(db: Session, match: Match, *, positions: Iterable[str] = ()) -> list[RankingKey]:
    """The categories a match touches: both teams in its format and every position of its lineups (football), or
    the tennis ranking. `positions` adds positions that are no longer in the lineups (a corrected position)."""
    if match.sport == 'tenis':
        return [RankingKey('tenis')]
    played = db.scalars(select(MatchLineup.position).where(
        MatchLineup.match_id == match.id, MatchLineup.position.is_not(None)).distinct()).all()
    chosen = sorted({*played, *positions}, key=POSITIONS.index)
    return [RankingKey('futebol_time', match.format),
            *(RankingKey('futebol_individual', match.format, position) for position in chosen)]


def recalculate_for_match(db: Session, match: Match, *, now: datetime, positions: Iterable[str] = ()) -> None:
    """Recalculates every ranking the match touches (no commit): both teams in the format (`futebol_time`), each
    position of its lineups (`futebol_individual`) or both players (`tenis`), with the window, classification,
    positions and tiers of `services.scoring` and `CURRENT_CALC_VERSION`. Afterwards, the open searches of
    subjects whose tier changed get the new tier and are paired again.

    Called when the score is confirmed, a walkover or a decision becomes the result, the deadline closes the match
    and when attendance or stats of a confirmed match change (`positions`: previous positions to recalculate)."""
    recalculate_rankings(db, ranking_keys_for_match(db, match, positions=positions), now=now)


def recalculate_rankings(db: Session, keys: Iterable[RankingKey], *, now: datetime, touch: bool = False) -> int:
    """Recalculates the given categories whole (no commit) and returns how many `standings` rows changed (written,
    created or removed). `touch` also stamps the unchanged rows with `now` (the daily window task uses it, so a
    category is looked at once per departure from the window)."""
    ordered = sorted(set(keys), key=lambda key: key.sort_key)
    if not ordered:
        return 0
    cuts = load_cuts(db, CURRENT_CALC_VERSION)
    changed = 0
    changes: list[TierChange] = []
    for key in ordered:
        if key.ranking not in cuts:
            raise RuntimeError(f'Cortes do ranking {key.ranking} ausentes na versão {CURRENT_CALC_VERSION}.')
        db.execute(select(func.pg_advisory_xact_lock(ranking_lock_id(key))))
        count, tiers = _recalculate_key(db, key, cuts[key.ranking], now=now, touch=touch)
        changed += count
        changes += tiers
    db.flush()
    _refresh_searches(db, changes, now=now)
    return changed


# ----- One category -----------------------------------------------------------------------------------------

def _scored(window_start: datetime, now: datetime):
    """Matches with a final score that started inside the window (RN11): confirmed, walkover or decided."""
    return (Match.state.in_(SCORED_MATCH_STATES), Match.score_a.is_not(None), Match.starts_at >= window_start,
            Match.starts_at <= now)


def _team_records(db: Session, key: RankingKey, window_start: datetime, now: datetime) -> list:
    rows = db.execute(
        select(MatchSide.team_id, MatchSide.side, Match.score_a, Match.score_b)
        .join(Match, Match.id == MatchSide.match_id)
        .where(*_scored(window_start, now), Match.sport == 'futebol', Match.format == key.format,
               MatchSide.team_id.is_not(None))).all()
    games: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for team_id, side, score_a, score_b in rows:
        games[team_id].append((score_a, score_b) if side == 'a' else (score_b, score_a))
    return [scoring.team_record(team_id, items) for team_id, items in games.items()]


def _individual_records(db: Session, key: RankingKey, window_start: datetime, now: datetime) -> list:
    """Appearances with presence confirmed (RN03) in the position and format. Stat items count as RN10 says; in a
    walkover only the side that showed up counts, with presence and the win, and there are no stats."""
    rows = db.execute(
        select(MatchLineup.user_id, MatchLineup.side, Match.winner_side, Match.walkover_absent_side,
               FootballStat.state, FootballStat.goals, FootballStat.assists, FootballStat.position_stat,
               FootballStat.contested_fields, FootballStat.reviewed_at)
        .select_from(MatchLineup)
        .join(Match, Match.id == MatchLineup.match_id)
        .outerjoin(FootballStat, FootballStat.lineup_id == MatchLineup.id)
        .where(*_scored(window_start, now), Match.sport == 'futebol', Match.format == key.format,
               MatchLineup.position == key.position, MatchLineup.present.is_(True),
               MatchLineup.removed_at.is_(None))).all()
    appearances: dict[int, list[tuple[str, scoring.IndividualPoints]]] = defaultdict(list)
    for user_id, side, winner, absent, state, goals, assists, position_stat, contested, reviewed_at in rows:
        if absent is not None and side == absent:
            continue
        counted = frozenset() if absent is not None or state is None else counted_stat_fields(
            state, contested, reviewed=reviewed_at is not None)
        outcome = scoring.outcome_for(side, winner)
        appearances[user_id].append((outcome, scoring.individual_points(
            outcome=outcome, goals=goals, assists=assists, position_stat=position_stat, counted=counted)))
    return [scoring.individual_record(user_id, items) for user_id, items in appearances.items()]


def _tennis_records(db: Session, window_start: datetime, now: datetime) -> list:
    """10 points per confirmed win (RN16). The championship bonus (champion +40, runner-up +20, semifinalists +10)
    is added by the championship phase (stage 4), which feeds `bonus`; until then it is zero."""
    rows = db.execute(
        select(MatchSide.user_id, MatchSide.side, Match.score_a, Match.score_b)
        .join(Match, Match.id == MatchSide.match_id)
        .where(*_scored(window_start, now), Match.sport == 'tenis', MatchSide.user_id.is_not(None))).all()
    games: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for user_id, side, score_a, score_b in rows:
        games[user_id].append((score_a, score_b) if side == 'a' else (score_b, score_a))
    return [scoring.tennis_record(user_id, items) for user_id, items in games.items()]


def _stored_rows(db: Session, key: RankingKey) -> dict[int, Standing]:
    if key.ranking == 'futebol_time':
        statement = select(Standing).where(Standing.sport == 'futebol', Standing.team_id.is_not(None),
                                           Standing.format == key.format)
    elif key.ranking == 'futebol_individual':
        statement = select(Standing).where(Standing.sport == 'futebol', Standing.user_id.is_not(None),
                                           Standing.format == key.format, Standing.position == key.position)
    else:
        statement = select(Standing).where(Standing.sport == 'tenis')
    rows = db.scalars(statement.execution_options(populate_existing=True)).all()
    return {(row.team_id if key.ranking == 'futebol_time' else row.user_id): row for row in rows}


def _new_row(key: RankingKey, subject_id: int) -> Standing:
    return Standing(team_id=subject_id if key.ranking == 'futebol_time' else None,
                    user_id=None if key.ranking == 'futebol_time' else subject_id, sport=key.sport,
                    format=key.format, position=key.position)


def _recalculate_key(db: Session, key: RankingKey, cuts: Cuts, *, now: datetime,
                     touch: bool) -> tuple[int, list[TierChange]]:
    window_start = scoring.window_start(now, cuts.window_weeks)
    if key.ranking == 'futebol_time':
        records, order = _team_records(db, key, window_start, now), scoring.team_order
    elif key.ranking == 'futebol_individual':
        records, order = _individual_records(db, key, window_start, now), scoring.individual_order
    else:
        records, order = _tennis_records(db, window_start, now), scoring.tennis_order
    placements = scoring.rank_records(records, cuts=cuts, order=order)

    stored = _stored_rows(db, key)
    changed = 0
    tiers: list[TierChange] = []
    for placement in placements:
        subject_id = placement.record.subject_id
        values = scoring.standing_fields(placement, calc_version=CURRENT_CALC_VERSION)
        if key.ranking == 'futebol_individual':
            # The individual metric is an average: there are no goals or sets to keep.
            values['goals_for'] = values['goals_against'] = 0
        row = stored.pop(subject_id, None)
        if row is None:
            row = _new_row(key, subject_id)
            old_tier = None
            db.add(row)
        else:
            old_tier = row.tier
        if row.id is None or any(getattr(row, name) != values[name] for name in VALUE_FIELDS):
            for name in VALUE_FIELDS:
                setattr(row, name, values[name])
            row.updated_at = now
            changed += 1
        elif touch:
            row.updated_at = now
        if old_tier != placement.tier:
            tiers.append(TierChange(key, subject_id, old_tier, placement.tier))
    # Subjects with no match left in the window have no row: back to "sem jogos".
    for subject_id, row in stored.items():
        if row.tier is not None:
            tiers.append(TierChange(key, subject_id, row.tier, None))
        db.delete(row)
        changed += 1
    return changed, tiers


# ----- Open searches ----------------------------------------------------------------------------------------

def _refresh_searches(db: Session, changes: list[TierChange], *, now: datetime) -> None:
    """The tier of an open search is the one of its subject; when a recalculation changes it, the search receives
    the new tier and a waiting search (`ativa`) tries to pair again, since the new tier may have a partner.

    Walk-in searches keep no tier (it is compared per slot, from `standings`), but a change in their individual
    tiers also makes them try again. Buckets are locked in a fixed order, and a bucket is locked before its
    searches, as the queue itself does. Searches already held by a proposal (`pareada`) are updated when free."""
    teams = {(change.subject_id, change.key.format): change.new for change in changes
             if change.key.ranking == 'futebol_time'}
    players = {change.subject_id: change.new for change in changes if change.key.ranking == 'tenis'}
    walkins = {change.subject_id for change in changes if change.key.ranking == 'futebol_individual'}
    conditions = []
    if teams:
        conditions.append((MatchSearch.kind == 'time') & tuple_(MatchSearch.team_id, MatchSearch.format).in_(
            list(teams)))
    if players:
        conditions.append((MatchSearch.kind == 'tenis') & MatchSearch.user_id.in_(list(players)))
    if walkins:
        conditions.append((MatchSearch.kind == 'avulso') & MatchSearch.user_id.in_(list(walkins)))
    if not conditions:
        return
    rows = db.execute(select(MatchSearch.id, MatchSearch.kind, MatchSearch.city_id, MatchSearch.format).where(
        MatchSearch.state.in_(OPEN_SEARCH_STATES), or_(*conditions))).all()
    buckets: dict[str, list[int]] = defaultdict(list)
    for search_id, kind, city_id, format_ in rows:
        buckets[bucket_key(kind, city_id, format_)].append(search_id)
    for bucket in sorted(buckets, key=bucket_lock_id):
        queue.lock_bucket(db, bucket)
        statement = select(MatchSearch).where(MatchSearch.id.in_(buckets[bucket])).order_by(
            MatchSearch.started_at, MatchSearch.id).execution_options(populate_existing=True)
        waiting = db.scalars(statement.where(MatchSearch.state == 'ativa').with_for_update()).all()
        held = db.scalars(statement.where(MatchSearch.state == 'pareada').with_for_update(skip_locked=True)).all()
        for search in (*waiting, *held):
            if search.kind == 'time':
                tier = teams.get((search.team_id, search.format), search.tier)
            elif search.kind == 'tenis':
                tier = players.get(search.user_id, search.tier)
            else:
                continue
            if search.tier != tier:
                search.tier, search.updated_at = tier, now
        db.flush()
        for search in waiting:
            queue.try_match(db, search, now=now)


# ----- Window (sweep) ---------------------------------------------------------------------------------------

def recalculate_outside_window(db: Session, now: datetime) -> int:
    """Sweep task `rankings_janela`: matches that left the 52-week window since a category was last written stop
    counting. A category is looked at when it has a confirmed match that started between the age of its oldest row
    and the start of the window now; it is then recalculated whole and its rows are stamped, so the next run finds
    nothing to do (idempotent). Returns how many rows changed."""
    cuts = load_cuts(db, CURRENT_CALC_VERSION)
    groups = db.execute(
        select(Standing.sport, Standing.team_id.is_not(None), Standing.format, Standing.position,
               func.min(Standing.updated_at))
        .where(Standing.sport.in_(('futebol', 'tenis')))
        .group_by(Standing.sport, Standing.team_id.is_not(None), Standing.format, Standing.position)).all()
    stale: list[RankingKey] = []
    for sport, is_team, format_, position, oldest in groups:
        ranking = 'tenis' if sport == 'tenis' else 'futebol_time' if is_team else 'futebol_individual'
        weeks = cuts[ranking].window_weeks
        departed = (Match.state.in_(SCORED_MATCH_STATES), Match.score_a.is_not(None), Match.sport == sport,
                    Match.starts_at >= oldest - timedelta(weeks=weeks), Match.starts_at < now - timedelta(weeks=weeks))
        if format_ is not None:
            departed += (Match.format == format_,)
        if db.scalar(select(exists().where(*departed))):
            stale.append(RankingKey(ranking, format_, position))
    return recalculate_rankings(db, stale, now=now, touch=True)


__all__ = ['RankingKey', 'TierChange', 'ranking_keys_for_match', 'ranking_lock_id',
           'recalculate_for_match', 'recalculate_outside_window', 'recalculate_rankings']
