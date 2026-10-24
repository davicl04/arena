"""Result, attendance, stats and contests of a match (Jogar, fase 5; etapa 3).

Contract: docs/decisoes/0002-jogar.md, section 12. Every route here locks the match first (`FOR UPDATE`), so the
two sides reporting at once, the attendance and the stats of one match are serialized; the ranking categories are
then locked by `services.standings` (lock order: match → ranking → bucket → search). Services commit once at the
end and answer with the view the route returns; `now` comes from the router, which keeps the deadlines testable.

- **Score (RN09, RN15):** each side reports; equal reports confirm the match ('realizada') and recalculate the
  rankings in the same transaction. A divergence waits for corrections until the 48 h end (`close_due_results`
  turns a friendly into 'sem_resultado'; the organizer decides championships in stage 4).
- **Attendance (RN03) and stats (RN10, RN12, RN13):** the athlete sends, the own representative reviews, the
  opposing representative contests once; contested items score only after the final review.
- **Rankings (RN11, RN14, RN16, RN23):** the general rankings are read from the materialized `standings` by
  `services.ranking_views` (no city).
"""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.identity import User
from app.models.matches import (
    SCORED_MATCH_STATES,
    STAT_FIELDS,
    FootballStat,
    Match,
    MatchLineup,
    MatchResult,
    MatchSide,
    MatchSlot,
)
from app.models.teams import TeamMember
from app.schemas.common import PersonOut
from app.schemas.matches import (
    AttendanceInput,
    FootballStatOut,
    LineupOut,
    MatchDetailOut,
    MyStatsInput,
    PointsPreviewOut,
    ResultInput,
    StatContestInput,
    StatReviewInput,
)
from app.schemas.results import LineupListOut, MyStatsOut
from app.services import audit, bracket_rules, championship_lifecycle, notifications
from app.services.match_access import (
    MatchAccess,
    audience,
    load_match_for,
    load_sides,
    match_access,
    side_actors,
    subject_names,
)
from app.services.match_events import post_event
from app.services.match_lifecycle import apply_final_score
from app.services.match_rules import (
    POSITION_LABELS,
    RuleError,
    Score,
    TransitionError,
    counted_stat_fields,
    next_match_state,
    next_stat_state,
    normalize_contested_fields,
    other_side,
    result_window_open,
    scores_agree,
    validate_football_score,
    validate_stat,
    validate_tennis_sets,
)
from app.services.match_views import can_see_report, match_detail
from app.services.match_views import report_score as score_of_report
from app.services.people import people_out
from app.services.scoring import individual_points, outcome_for
from app.services.standings import recalculate_for_match

REPORT_ROLES = 'Só os representantes informam o placar.'
RESULT_WINDOW = 'O placar é informado depois do horário da partida e até 48 h depois.'
RESULT_CONFIRMED = 'O placar já foi confirmado pelos dois lados.'
WALKOVER_REGISTERED = 'Há um W.O. registrado nesta partida.'
WALKOVER_NO_STATS = 'Partida decidida por W.O. não tem estatísticas.'
FOOTBALL_ONLY_STATS = 'As estatísticas são só do futebol.'
ATTENDANCE_ROLES = 'Só os representantes registram a presença.'
ATTENDANCE_WINDOW = 'A presença é registrada depois do horário da partida e até 48 h depois.'
ABSENT_SIDE = 'O seu lado está com W.O. registrado.'
STATS_ROLES = 'Só quem joga a partida envia estatísticas.'
STATS_WINDOW = 'As estatísticas são enviadas depois do horário da partida e até 48 h depois.'
MARKED_ABSENT = 'O representante marcou que você não jogou. Fale com ele.'
FINAL_REVIEW = 'Esta estatística já foi contestada e revisada; a revisão é final.'
REVIEW_ROLES = 'Só os representantes revisam as estatísticas.'
REVIEW_SIDE = 'Só o representante do time do atleta revisa a estatística.'
CONTEST_ROLES = 'Só os representantes contestam as estatísticas.'
CONTEST_SIDE = 'Só o representante do time adversário contesta a estatística.'
REVIEW_WINDOW = 'As estatísticas são revisadas e contestadas até 48 h depois do horário da partida.'
STAT_NOT_FOUND = 'Estatística não encontrada.'
CONTEST_REASON = 'Conte por que a estatística está errada.'
CONTEST_REASON_LENGTH = (5, 300)
STAT_ROLES = ('representante', 'membro', 'avulso')
OPEN_STATES = ('agendada', 'realizada')
POSITION_ABBREVIATIONS = {'goleiro': 'GOL', 'defesa': 'DEF', 'meio_campo': 'MEI', 'atacante': 'ATA'}
# RN13: the position-specific stat, singular and plural, for the chat banner.
POSITION_STAT_UNITS = {'goleiro': ('defesa', 'defesas'), 'defesa': ('desarme', 'desarmes'),
                       'meio_campo': ('passe decisivo', 'passes decisivos'),
                       'atacante': ('finalização no alvo', 'finalizações no alvo')}


def _conflict(error: TransitionError) -> HTTPException:
    return HTTPException(409, str(error))


def _plural(count: int, singular: str, plural: str) -> str:
    return f'{count} {singular if count == 1 else plural}'


def _iso(moment: datetime | None) -> str | None:
    return moment.isoformat() if moment is not None else None


def _winner(score_a: int, score_b: int) -> str | None:
    return 'a' if score_a > score_b else 'b' if score_b > score_a else None


def _ensure_open(match: Match, now: datetime, message: str) -> None:
    """The match is scheduled or confirmed and still inside the 48 h that follow its start."""
    if match.state not in OPEN_STATES or not result_window_open(match.starts_at, now):
        raise HTTPException(409, message)


# ----- Score (RN09, RN15) -----------------------------------------------------------------------------------

def validate_score(match: Match, data: ResultInput) -> Score:
    """The reported score: goals in football (0 to 99), sets in tennis (with the super tie-break when agreed)."""
    if match.sport == 'futebol':
        if data.sets is not None:
            raise RuleError('O futebol não tem sets: informe os gols.', 'sets')
        return validate_football_score(data.goals_a, data.goals_b)
    if data.goals_a is not None or data.goals_b is not None:
        raise RuleError('O placar do tênis é informado em sets.', 'sets')
    if data.sets is None:
        raise RuleError('Informe dois ou três sets.', 'sets')
    return validate_tennis_sets([item.model_dump() for item in data.sets], super_tiebreak=bool(match.super_tiebreak))


def _sets_text(score: Score, winner: str) -> str:
    """'6-4, 3-6, 10-7' from the winner's point of view; a tie-break shows the loser's points: '7-6(5)'."""
    parts = []
    for item in score.sets or ():
        won, lost = (item.a, item.b) if winner == 'a' else (item.b, item.a)
        text = f'{won}-{lost}'
        if item.tiebreak_a is not None and not item.super_tiebreak:
            text += f'({min(item.tiebreak_a, item.tiebreak_b)})'
        parts.append(text)
    return ', '.join(parts)


def score_text(sport: str, name_a: str, name_b: str, score: Score) -> str:
    """Chat banner of a confirmed score (no dates, shown as is by both clients)."""
    if sport == 'futebol':
        return f'Resultado confirmado: {name_a} {score.score_a} × {score.score_b} {name_b}.'
    won, lost = (name_a, name_b) if score.winner == 'a' else (name_b, name_a)
    high, low = max(score.score_a, score.score_b), min(score.score_a, score.score_b)
    return f'Resultado confirmado: {won} venceu {lost} por {high} sets a {low} ({_sets_text(score, score.winner)}).'


def report_score(db: Session, user: User, match_id: int, data: ResultInput, *, now: datetime) -> MatchDetailOut:
    """A side reports (or corrects) its score; equal reports confirm the result and recalculate the rankings."""
    match, sides, access = load_match_for(db, match_id, user, for_update=True)
    if not access.acts_for_side:
        raise HTTPException(403, REPORT_ROLES)
    if match.walkover_absent_side is not None:
        raise HTTPException(409, WALKOVER_REGISTERED)
    if match.state in SCORED_MATCH_STATES:
        raise HTTPException(409, RESULT_CONFIRMED)
    if match.state != 'agendada' or not result_window_open(match.starts_at, now):
        raise HTTPException(409, RESULT_WINDOW)
    score = validate_score(match, data)
    if match.origin == 'campeonato':
        bracket_rules.ensure_decisive(score, championship_lifecycle.is_knockout(db, match))

    reports = {row.side: row for row in db.scalars(select(MatchResult).where(MatchResult.match_id == match.id))}
    mine = reports.get(access.side)
    if mine is None or score_of_report(mine) != score:
        _store_report(db, match, sides, access, user, score, reports, now=now)
        db.commit()
    return match_detail(db, user, match, now=now, sides=sides, access=access)


def _store_report(db: Session, match: Match, sides: Mapping[str, MatchSide], access: MatchAccess, user: User,
                  score: Score, reports: dict[str, MatchResult], *, now: datetime) -> None:
    corrected = access.side in reports
    row = reports.get(access.side)
    other = reports.get(other_side(access.side))
    # The reports already differed before this one (a correction that still differs): the organizer was told.
    was_divergent = (row is not None and other is not None
                     and not scores_agree(score_of_report(row), score_of_report(other)))
    if row is None:
        row = reports[access.side] = MatchResult(match_id=match.id, side=access.side, created_at=now)
        db.add(row)
    row.reported_by_id, row.score_a, row.score_b, row.sets, row.updated_at = (
        user.id, score.score_a, score.score_b, score.sets_json(), now)
    db.flush()
    names = subject_names(db, sides.values())
    mine_name = names[sides[access.side].id]

    if other is None:
        post_event(db, match.id, 'placar_enviado',
                   f'{mine_name} {"corrigiu" if corrected else "informou"} o placar. Falta o outro lado.',
                   side=access.side, now=now)
        audit.record(db, actor_id=user.id, action='resultado.informado', target_type='match', target_id=match.id,
                     data={'side': access.side, 'score_a': score.score_a, 'score_b': score.score_b,
                           'corrigido': corrected})
    elif scores_agree(score, score_of_report(other)):
        _confirm(db, match, sides, score, names, user, now=now)
    else:
        deadline = _iso(match.result_deadline)
        # Each divergent report notifies again: only the latest stays open for the two sides.
        notifications.resolve_actions(db, notifications.result_key(match.id))
        notifications.notify_many(
            db, [*side_actors(db, sides['a']), *side_actors(db, sides['b'])], 'resultado_divergente',
            {'match_id': match.id, 'deadline': deadline}, action_key=notifications.result_key(match.id),
            action_until=match.result_deadline)
        post_event(db, match.id, 'resultado_divergente',
                   'Os placares informados pelos dois lados não batem. Corrijam até o fim do prazo.', now=now)
        audit.record(db, actor_id=user.id, action='resultado.divergente', target_type='match', target_id=match.id,
                     data={'side': access.side, 'a': _report_data(reports['a']), 'b': _report_data(reports['b'])})
        if match.origin == 'campeonato' and not was_divergent:
            championship_lifecycle.on_divergence(db, match, now=now)


def _report_data(row: MatchResult) -> dict[str, int]:
    return {'score_a': row.score_a, 'score_b': row.score_b}


def _confirm(db: Session, match: Match, sides: Mapping[str, MatchSide], score: Score, names: Mapping[int, str],
             user: User, *, now: datetime) -> None:
    """Both sides reported the same score: the match is 'realizada' and the rankings take it in this transaction."""
    apply_final_score(match, score, source='confirmacao', now=now)
    match.state = next_match_state(match.state, 'confirmar_resultado')
    db.flush()
    # Equal scores: no divergence to fix, and the championship organizer no longer has to decide.
    notifications.resolve_actions_many(db, [notifications.result_key(match.id),
                                            notifications.decision_key(match.id)])
    championship_lifecycle.lock_following(db, match)       # a match lock, so it comes before the rankings
    recalculate_for_match(db, match, now=now)
    notifications.notify_many(db, audience(db, match, sides=dict(sides)), 'resultado_partida', {
        'match_id': match.id, 'outcome': 'confirmado', 'score_a': score.score_a, 'score_b': score.score_b})
    post_event(db, match.id, 'resultado_confirmado',
               score_text(match.sport, names[sides['a'].id], names[sides['b'].id], score), side=score.winner,
               payload={'score_a': score.score_a, 'score_b': score.score_b}, now=now)
    audit.record(db, actor_id=user.id, action='resultado.confirmado', target_type='match', target_id=match.id,
                 data={'score_a': score.score_a, 'score_b': score.score_b, 'winner': score.winner,
                       'source': 'confirmacao'})
    championship_lifecycle.after_score(db, match, now=now)


# ----- Lineups, points preview and the roster view ----------------------------------------------------------

@dataclass
class _Entry:
    """One athlete of the match: the lineup row (when there is one), the side and the stat."""
    user_id: int
    side: str
    guest: bool
    position: str | None
    lineup: MatchLineup | None
    stat: FootballStat | None


def _outcome_of(match: Match, side: str, reports: Mapping[str, MatchResult]) -> str | None:
    """Result for the preview: the confirmed score, else what the athlete's own side reported, else unknown."""
    if match.score_a is not None:
        return outcome_for(side, match.winner_side)
    own = reports.get(side)
    return outcome_for(side, _winner(own.score_a, own.score_b)) if own is not None else None


def points_preview(*, outcome: str | None, stat: FootballStat | None, final: bool) -> PointsPreviewOut:
    """Preview of RN12: presence 1, result 3/1/0, goals, assists and the position stat as sent (`total`), and which
    items already score (`counted`: reviewed, not pending a contest). Without a known result, `result` is null."""
    sent = individual_points(outcome=outcome, goals=stat.goals if stat else None,
                             assists=stat.assists if stat else None,
                             position_stat=stat.position_stat if stat else None)
    counted = counted_stat_fields(stat.state, stat.contested_fields, reviewed=stat.reviewed_at is not None) \
        if stat is not None else frozenset()
    return PointsPreviewOut(
        presence=float(sent.presence), result=float(sent.result) if outcome is not None else None,
        goals=float(sent.goals), assists=float(sent.assists), position_stat=float(sent.position_stat),
        total=float(sent.total), counted=[field for field in STAT_FIELDS if field in counted], final=final)


def _roster(db: Session, match: Match, sides: Mapping[str, MatchSide]) -> list[_Entry]:
    """Active members of both teams and everyone with a lineup row, by side: representatives first, then the
    roster, then the walk-ins. A person in both rosters belongs to the side of their lineup, else to the side
    they represent, else to side A (the same rule as `match_access`)."""
    lineups = {row.user_id: row for row in db.scalars(select(MatchLineup).where(
        MatchLineup.match_id == match.id, MatchLineup.removed_at.is_(None)).order_by(MatchLineup.id))}
    stats = {row.lineup_id: row for row in db.scalars(select(FootballStat).where(FootballStat.match_id == match.id))}
    team_side = {side.team_id: label for label, side in sides.items() if side.team_id is not None}
    members = db.scalars(select(TeamMember).where(
        TeamMember.team_id.in_(list(team_side)), TeamMember.left_at.is_(None))
        .order_by((TeamMember.role == 'representante').desc(), TeamMember.joined_at, TeamMember.id)
    ).all() if team_side else []
    home = {user_id: row.side for user_id, row in lineups.items()}
    belongs: dict[int, set[str]] = defaultdict(set)
    represents: dict[int, set[str]] = defaultdict(set)
    for member in members:
        belongs[member.user_id].add(team_side[member.team_id])
        if member.role == 'representante':
            represents[member.user_id].add(team_side[member.team_id])
    for member in members:
        if member.user_id not in home:
            home[member.user_id] = min(represents.get(member.user_id) or belongs[member.user_id])
    entries: list[_Entry] = []
    seen: set[int] = set()
    for label in ('a', 'b'):
        for member in members:
            if team_side[member.team_id] != label or home[member.user_id] != label or member.user_id in seen:
                continue
            seen.add(member.user_id)
            lineup = lineups.get(member.user_id)
            entries.append(_Entry(member.user_id, label, lineup.guest if lineup else False,
                                  (lineup.position if lineup and lineup.position else member.position), lineup,
                                  stats.get(lineup.id) if lineup else None))
        for user_id, lineup in lineups.items():
            if lineup.side == label and user_id not in seen:
                seen.add(user_id)
                entries.append(_Entry(user_id, label, lineup.guest, lineup.position, lineup, stats.get(lineup.id)))
    return entries


def lineups_out(db: Session, viewer: User, match: Match, *, now: datetime,
                sides: Mapping[str, MatchSide] | None = None, access: MatchAccess | None = None,
                only_user_id: int | None = None) -> list[LineupOut]:
    """Athletes of both sides with presence, stat and points preview (screen S1: Revisar elenco and Suas
    estatísticas). Football only; `only_user_id` returns just that athlete. The viewer's review and contest
    flags follow the rules of the routes: the own representative reviews, the opposing one contests once."""
    if match.sport != 'futebol':
        return []
    sides = dict(sides) if sides is not None else load_sides(db, [match.id])[match.id]
    access = access if access is not None else match_access(db, match, viewer, sides=sides)
    if access is None:
        raise HTTPException(404, 'Partida não encontrada.')
    entries = _roster(db, match, sides)
    if only_user_id is not None:
        entries = [entry for entry in entries if entry.user_id == only_user_id]
    reports = {row.side: row for row in db.scalars(select(MatchResult).where(MatchResult.match_id == match.id))}
    final = match.score_a is not None and (
        match.state == 'encerrada' or (match.result_deadline is not None and now >= match.result_deadline))
    open_stats = (match.state in OPEN_STATES and result_window_open(match.starts_at, now)
                  and match.walkover_absent_side is None)
    ids: list[int | None] = [entry.user_id for entry in entries]
    for entry in entries:
        if entry.stat is not None:
            ids += [entry.stat.reviewed_by_id, entry.stat.contested_by_id]
    people = people_out(db, viewer, ids)

    def person(user_id: int | None) -> PersonOut | None:
        return people.get(user_id) if user_id is not None else None

    result = []
    for entry in entries:
        who = people[entry.user_id]
        stat, lineup = entry.stat, entry.lineup
        present = lineup.present if lineup is not None else None
        acting = access.role == 'representante' and open_stats and stat is not None
        stat_out = None if stat is None else FootballStatOut(
            id=stat.id, goals=stat.goals, assists=stat.assists, position_stat=stat.position_stat, state=stat.state,
            submitted_at=stat.submitted_at, reviewed_at=stat.reviewed_at, reviewed_by=person(stat.reviewed_by_id),
            contested_at=stat.contested_at, contested_by=person(stat.contested_by_id),
            contest_reason=stat.contest_reason, contested_fields=stat.contested_fields)
        points = None
        if present is True:
            outcome = _outcome_of(match, entry.side, reports) if can_see_report(
                match, access, reports, entry.side) else None
            points = points_preview(outcome=outcome, stat=stat, final=final)
        result.append(LineupOut(
            user=who, side=entry.side, guest=entry.guest, position=entry.position, present=present, stat=stat_out,
            points=points, can_review=acting and entry.side == access.side
            and not (stat.state == 'revisada' and stat.contested_at is not None),
            can_contest=acting and entry.side != access.side and stat.contested_at is None))
    return result


# ----- Attendance (RN03) ------------------------------------------------------------------------------------

def set_attendance(db: Session, user: User, match_id: int, data: AttendanceInput, *,
                   now: datetime) -> LineupListOut:
    """The representative decides who played in the side (roster members and walk-ins). With the match already
    confirmed, the rankings are recalculated."""
    match, sides, access = load_match_for(db, match_id, user, for_update=True)
    if access.role != 'representante':
        raise HTTPException(403, ATTENDANCE_ROLES)
    _ensure_open(match, now, ATTENDANCE_WINDOW)
    if match.walkover_absent_side == access.side:
        raise HTTPException(409, ABSENT_SIDE)
    ids = [item.user_id for item in data.athletes]
    if len(set(ids)) != len(ids):
        raise RuleError('Cada atleta aparece uma vez.', 'athletes')

    side = sides[access.side]
    roster = {member.user_id: member for member in db.scalars(select(TeamMember).where(
        TeamMember.team_id == side.team_id, TeamMember.left_at.is_(None)))}
    lineups = {row.user_id: row for row in db.scalars(select(MatchLineup).where(
        MatchLineup.match_id == match.id, MatchLineup.user_id.in_(ids)).with_for_update())}
    # First every athlete is checked, then the rows change: a refused list changes nothing.
    plan = []
    for item in data.athletes:
        lineup = lineups.get(item.user_id)
        if lineup is not None and (lineup.side != access.side or lineup.removed_at is not None):
            raise RuleError('Este atleta já atua pelo outro lado.' if lineup.side != access.side
                            else 'Este atleta foi removido da partida.', 'athletes')
        if lineup is None and item.user_id not in roster:
            raise RuleError('Este atleta não está no elenco deste lado.', 'athletes')
        position = item.position or (lineup.position if lineup is not None else None) or (
            roster[item.user_id].position if item.user_id in roster else None)
        if item.present and position is None:
            raise RuleError('Informe a posição de quem jogou.', 'athletes')
        plan.append((item, lineup, position))
    moved: set[str] = set()
    present, absent = [], []
    for item, lineup, position in plan:
        if lineup is None:
            lineup = MatchLineup(match_id=match.id, side=access.side, user_id=item.user_id, team_id=side.team_id,
                                 guest=False, created_at=now)
            db.add(lineup)
        elif lineup.position is not None and lineup.position != position:
            moved.add(lineup.position)
        lineup.position, lineup.present = position, item.present
        lineup.present_marked_by_id, lineup.updated_at = user.id, now
        (present if item.present else absent).append(item.user_id)
    db.flush()
    if match.state == 'realizada':
        recalculate_for_match(db, match, now=now, positions=moved)
    names = subject_names(db, [side])
    post_event(db, match.id, 'presenca_registrada',
               f'{names[side.id]} registrou a presença: {_plural(len(present), "presente", "presentes")} e '
               f'{_plural(len(absent), "ausente", "ausentes")}.', side=access.side,
               payload={'side': access.side, 'present': len(present), 'absent': len(absent)}, now=now)
    audit.record(db, actor_id=user.id, action='presenca.registrada', target_type='match', target_id=match.id,
                 data={'side': access.side, 'present': present, 'absent': absent})
    db.commit()
    return LineupListOut(items=lineups_out(db, user, match, now=now, sides=sides, access=access))


# ----- Own stats (RN10, RN12, RN13) -------------------------------------------------------------------------

def stats_text(name: str, position: str, goals: int | None, assists: int | None, position_stat: int | None) -> str:
    """Chat banner of the stats an athlete sent: 'Tiago enviou: 2 gols, 4 finalizações no alvo (ATA).'"""
    parts = []
    if goals is not None:
        parts.append(_plural(goals, 'gol', 'gols'))
    if assists is not None:
        parts.append(_plural(assists, 'assistência', 'assistências'))
    if position_stat is not None:
        parts.append(_plural(position_stat, *POSITION_STAT_UNITS[position]))
    label = POSITION_ABBREVIATIONS[position]
    if not parts:
        return f'{name} confirmou presença como {POSITION_LABELS[position].lower()} ({label}).'
    return f'{name} enviou: {", ".join(parts)} ({label}).'


def send_my_stats(db: Session, user: User, match_id: int, data: MyStatsInput, *, now: datetime) -> MyStatsOut:
    """The athlete (roster member or walk-in) sends the position played and the optional numbers; sending marks
    the presence. A new or edited stat waits for the review of the own representative."""
    match, sides, access = load_match_for(db, match_id, user, for_update=True)
    if match.sport != 'futebol':
        raise HTTPException(409, FOOTBALL_ONLY_STATS)
    if access.role not in STAT_ROLES:
        raise HTTPException(403, STATS_ROLES)
    if match.walkover_absent_side is not None:
        raise HTTPException(409, WALKOVER_NO_STATS)
    _ensure_open(match, now, STATS_WINDOW)
    lineup = db.scalar(select(MatchLineup).where(MatchLineup.match_id == match.id, MatchLineup.user_id == user.id)
                       .with_for_update().execution_options(populate_existing=True))
    if lineup is not None and lineup.present is False:
        raise HTTPException(409, MARKED_ABSENT)
    goals = validate_stat(data.goals, 'goals')
    assists = validate_stat(data.assists, 'assists')
    position_stat = validate_stat(data.position_stat, 'position_stat')
    stat = db.scalar(select(FootballStat).where(FootballStat.lineup_id == lineup.id).with_for_update()
                     .execution_options(populate_existing=True)) if lineup is not None else None
    if stat is not None:
        if stat.state == 'revisada' and stat.contested_at is not None:
            raise HTTPException(409, FINAL_REVIEW)
        try:
            next_state = next_stat_state(stat.state, 'editar')
        except TransitionError as error:
            raise _conflict(error) from None

    previous = lineup.position if lineup is not None else None
    if lineup is None:
        slot_id = db.scalar(select(MatchSlot.id).where(
            MatchSlot.match_id == match.id, MatchSlot.filled_by_id == user.id,
            MatchSlot.state == 'preenchida')) if access.role == 'avulso' else None
        lineup = MatchLineup(match_id=match.id, side=access.side, user_id=user.id,
                             team_id=sides[access.side].team_id, guest=access.role == 'avulso', slot_id=slot_id,
                             created_at=now)
        db.add(lineup)
    lineup.position, lineup.present, lineup.updated_at = data.position, True, now
    if lineup.present_marked_by_id is None:
        lineup.present_marked_by_id = user.id
    db.flush()
    if stat is None:
        stat = FootballStat(lineup_id=lineup.id, match_id=match.id, user_id=user.id, state='enviada',
                            submitted_at=now, created_at=now)
        db.add(stat)
    else:
        stat.state, stat.submitted_at, stat.reviewed_at, stat.reviewed_by_id = next_state, now, None, None
    stat.goals, stat.assists, stat.position_stat, stat.updated_at = goals, assists, position_stat, now
    db.flush()
    if match.state == 'realizada':
        recalculate_for_match(db, match, now=now, positions={previous} if previous else ())
    post_event(db, match.id, 'estatisticas_enviadas',
               stats_text(user.name, data.position, goals, assists, position_stat), side=access.side,
               payload={'user_id': user.id, 'stat_id': stat.id}, now=now)
    db.commit()
    own = lineups_out(db, user, match, now=now, sides=sides, access=access, only_user_id=user.id)[0]
    return MyStatsOut(lineup=own, preview=own.points)


# ----- Review and contest (RN10) ----------------------------------------------------------------------------

def _stat_for(db: Session, match: Match, stat_id: int) -> tuple[FootballStat, MatchLineup]:
    stat = db.scalar(select(FootballStat).where(FootballStat.id == stat_id, FootballStat.match_id == match.id)
                     .with_for_update().execution_options(populate_existing=True))
    lineup = db.get(MatchLineup, stat.lineup_id) if stat is not None else None
    if stat is None or lineup is None or lineup.removed_at is not None:
        raise HTTPException(404, STAT_NOT_FOUND)
    return stat, lineup


def review_stat(db: Session, user: User, match_id: int, stat_id: int, data: StatReviewInput, *,
                now: datetime) -> LineupOut:
    """The representative of the athlete's side approves the stat, correcting what is wrong (position and the
    three numbers). After a contest, this review is final and the contested items score again."""
    match, sides, access = load_match_for(db, match_id, user, for_update=True)
    stat, lineup = _stat_for(db, match, stat_id)
    if access.role != 'representante':
        raise HTTPException(403, REVIEW_ROLES)
    if lineup.side != access.side:
        raise HTTPException(403, REVIEW_SIDE)
    if match.walkover_absent_side is not None:
        raise HTTPException(409, WALKOVER_NO_STATS)
    _ensure_open(match, now, REVIEW_WINDOW)
    state = next_stat_state(stat.state, 'revisar', contested_before=stat.contested_at is not None)

    corrections = data.model_dump(exclude_unset=True)
    values = {
        'goals': validate_stat(corrections.get('goals', stat.goals), 'goals'),
        'assists': validate_stat(corrections.get('assists', stat.assists), 'assists'),
        'position_stat': validate_stat(corrections.get('position_stat', stat.position_stat), 'position_stat'),
    }
    position = corrections.get('position', lineup.position)
    if position is None:
        raise RuleError('Informe a posição de quem jogou.', 'position')
    after_contest = stat.state == 'contestada'
    previous = lineup.position
    stat.goals, stat.assists, stat.position_stat = values['goals'], values['assists'], values['position_stat']
    stat.state, stat.reviewed_at, stat.reviewed_by_id, stat.updated_at = state, now, user.id, now
    lineup.position, lineup.updated_at = position, now
    db.flush()
    if match.state == 'realizada':
        recalculate_for_match(db, match, now=now, positions={previous} if previous and previous != position else ())
    athlete = db.get(User, stat.user_id)
    post_event(db, match.id, 'estatistica_revisada', f'As estatísticas de {athlete.name} foram revisadas.',
               side=lineup.side, payload={'user_id': stat.user_id, 'stat_id': stat.id}, now=now)
    audit.record(db, actor_id=user.id, action='estatistica.revisada', target_type='football_stat',
                 target_id=stat.id, data={'match_id': match.id, 'user_id': stat.user_id,
                                          'corrections': sorted(corrections), 'after_contest': after_contest})
    db.commit()
    return lineups_out(db, user, match, now=now, sides=sides, access=access, only_user_id=stat.user_id)[0]


def contest_stat(db: Session, user: User, match_id: int, stat_id: int, data: StatContestInput, *,
                 now: datetime) -> LineupOut:
    """The opposing representative contests items of a stat, once. The contested items do not score until the
    representative of the athlete reviews again."""
    match, sides, access = load_match_for(db, match_id, user, for_update=True)
    stat, lineup = _stat_for(db, match, stat_id)
    if access.role != 'representante':
        raise HTTPException(403, CONTEST_ROLES)
    if lineup.side == access.side:
        raise HTTPException(403, CONTEST_SIDE)
    if match.walkover_absent_side is not None:
        raise HTTPException(409, WALKOVER_NO_STATS)
    _ensure_open(match, now, REVIEW_WINDOW)
    fields = normalize_contested_fields(data.fields)
    reason = data.reason.strip()
    if not CONTEST_REASON_LENGTH[0] <= len(reason) <= CONTEST_REASON_LENGTH[1]:
        raise RuleError(CONTEST_REASON, 'reason')
    try:
        state = next_stat_state(stat.state, 'contestar', contested_before=stat.contested_at is not None)
    except TransitionError as error:
        raise _conflict(error) from None
    stat.state, stat.contested_at, stat.contested_by_id = state, now, user.id
    stat.contested_fields, stat.contest_reason, stat.updated_at = fields, reason, now
    db.flush()
    if match.state == 'realizada':
        recalculate_for_match(db, match, now=now)
    notifications.notify_many(db, [stat.user_id, *side_actors(db, sides[lineup.side])], 'estatistica_contestada', {
        'match_id': match.id, 'stat_id': stat.id, 'fields': fields, 'reason': reason}, actor_id=user.id)
    athlete = db.get(User, stat.user_id)
    post_event(db, match.id, 'estatistica_contestada', f'As estatísticas de {athlete.name} foram contestadas.',
               side=access.side, payload={'user_id': stat.user_id, 'stat_id': stat.id, 'fields': fields}, now=now)
    audit.record(db, actor_id=user.id, action='estatistica.contestada', target_type='football_stat',
                 target_id=stat.id, data={'match_id': match.id, 'user_id': stat.user_id, 'fields': fields})
    db.commit()
    return lineups_out(db, user, match, now=now, sides=sides, access=access, only_user_id=stat.user_id)[0]


def match_lineups(db: Session, user: User, match_id: int, *, now: datetime) -> LineupListOut:
    """`GET /matches/{id}/stats`: current access reads the roster; historical access reads only own stats."""
    match, sides, access = load_match_for(db, match_id, user, allow_history=True)
    return LineupListOut(items=lineups_out(db, user, match, now=now, sides=sides, access=access,
                                         only_user_id=user.id if access.role == 'historico' else None))


__all__ = ['contest_stat', 'lineups_out', 'match_lineups', 'points_preview',
           'report_score', 'review_stat', 'send_my_stats', 'set_attendance', 'validate_score']
