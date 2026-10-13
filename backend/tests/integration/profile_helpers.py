"""Helpers of the profile history tests: teams with dated stays, closed matches in every final state, lineups and
stats. Rows go straight to the database with explicit dates, so the participation rule is deterministic."""
from datetime import datetime, timezone

from sqlalchemy import select

from app.models.matches import FootballStat, Match
from app.models.teams import Team, TeamMember
from app.services.match_lifecycle import apply_final_score
from app.services.match_rules import validate_football_score, validate_tennis_sets, walkover_score
from app.services.profile_history import participation_clause
from tests.integration.match_helpers import CITY, NOW, add, scheduled_match
from tests.integration.result_helpers import DAY, HOUR, tennis_match

LONG_AGO = datetime(2025, 1, 1, tzinfo=timezone.utc)
SETS = [{'a': 6, 'b': 4}, {'a': 6, 'b': 3}]


def new_team(db, name='Ferrugem FC'):
    return add(db, Team(name=name, city_id=CITY, state='ativo'))


def join(db, team, user, joined_at=LONG_AGO, left_at=None, role='membro'):
    """A stay in the team with explicit dates (a stay that ended has its reason)."""
    return add(db, TeamMember(team_id=team.id, user_id=user.id, role=role, joined_via='convite', joined_at=joined_at,
                              left_at=left_at, left_reason='saiu' if left_at else None))


def _close(match, state, when):
    match.state = state
    match.closed_at = when


def football(db, team_a, team_b, goals_a, goals_b, *, starts_at=NOW - 2 * DAY, state='encerrada', format_='society'):
    """A football match closed with a confirmed score ('encerrada'), or without result / cancelled (no score)."""
    match = scheduled_match(db, team_a, team_b, starts_at=starts_at, format_=format_, open_slots=False)
    if state in ('realizada', 'encerrada'):
        apply_final_score(match, validate_football_score(goals_a, goals_b), source='confirmacao',
                          now=starts_at + 3 * HOUR)
        _close(match, state, starts_at + 3 * HOUR if state == 'encerrada' else None)
    else:
        close_without_score(match, state, starts_at)
    db.flush()
    return match


def close_without_score(match, state, starts_at):
    _close(match, state, starts_at + 3 * HOUR)
    if state == 'cancelada':
        match.cancelled_at = starts_at - HOUR


def walkover(db, team_a, team_b, absent, *, starts_at=NOW - 2 * DAY, decision=None):
    """A football walkover kept (`encerrada`, 3x0 to who showed up) or annulled by the administration."""
    match = scheduled_match(db, team_a, team_b, starts_at=starts_at, open_slots=False)
    match.walkover_absent_side = absent
    match.walkover_registered_at = starts_at + HOUR
    if decision == 'anulado':
        match.walkover_contested_at, match.walkover_contest_reason = starts_at + 2 * HOUR, 'Estávamos lá.'
        match.walkover_decision, match.walkover_decided_at = 'anulado', starts_at + DAY
        match.walkover_decision_reason = 'Presença comprovada.'
        _close(match, 'sem_resultado', starts_at + DAY)
    else:
        apply_final_score(match, walkover_score('futebol', absent), source='wo', now=starts_at + 3 * HOUR)
        _close(match, 'encerrada', starts_at + 3 * HOUR)
    db.flush()
    return match


def tennis(db, player_a, player_b, *, sets=SETS, starts_at=NOW - 2 * DAY, state='encerrada'):
    match = tennis_match(db, player_a, player_b, starts_at=starts_at)
    if state in ('realizada', 'encerrada'):
        apply_final_score(match, validate_tennis_sets(sets), source='confirmacao', now=starts_at + 3 * HOUR)
        _close(match, state, starts_at + 3 * HOUR if state == 'encerrada' else None)
    else:
        close_without_score(match, state, starts_at)
    db.flush()
    return match


def stat(db, line, *, state='revisada', reviewed=True, contested_fields=None, goals=None, assists=None,
         position_stat=None):
    return add(db, FootballStat(
        lineup_id=line.id, match_id=line.match_id, user_id=line.user_id, goals=goals, assists=assists,
        position_stat=position_stat, state=state, reviewed_at=NOW if reviewed else None,
        contested_at=NOW if state == 'contestada' else None, contest_reason='Errado' if state == 'contestada' else None,
        contested_fields=contested_fields, submitted_at=NOW))


def history_ids(db, user):
    """Ids of the matches in the history of the athlete, by the rule A1."""
    return set(db.scalars(select(Match.id).where(participation_clause(user.id))))

