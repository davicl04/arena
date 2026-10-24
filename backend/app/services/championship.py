"""Chaveamento, agenda e decisão do organizador nos campeonatos (Times e campeonatos, fases 6 e 7).

Contrato: docs/decisoes/0003-times-campeonatos.md, seção 21, e docs/decisoes/0002-jogar.md, seção 17. As regras puras
(sorteio com semente, folgas, método do círculo, tabela, conflito de 2 h e a decisão) ficam em `bracket_rules`; os
ganchos que outras rotas chamam (avanço do vencedor, encerramento do evento, contadores) ficam em
`championship_lifecycle`. Aqui entram as rotas do organizador (sortear, trocar, confirmar, listar as partidas,
agendar e decidir) e a leitura da tabela pelos inscritos.

Ordem das travas (extensão da seção 19.1 de 0003): evento (`FOR UPDATE`, nível 3) → inscrições do evento (nível 5,
só ao confirmar o chaveamento) → partidas do evento, por id → rankings. O titular é sempre o da sessão: o dono do
evento age; os elencos e a administração enxergam a partida, mas não agem como organizador (`403`).
"""
from __future__ import annotations

import secrets
from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.models.brackets import EventBracket, EventPlacement, ResultDecision
from app.models.events import VISIBLE_EVENT_STATES, Event, EventEntry
from app.models.identity import User
from app.models.matches import Court, Match, MatchResult, MatchSide
from app.models.teams import Team
from app.schemas.brackets import (
    BracketMatchOut,
    BracketNextOut,
    BracketNodeOut,
    BracketOut,
    BracketPermissionsOut,
    BracketRoundOut,
    BracketSlotOut,
    BracketSwapInput,
    CompetitorOut,
    EventMatchCountsOut,
    EventMatchListOut,
    EventMatchRowOut,
    PlacementOut,
    ResultDecisionInput,
    ScheduleConflictOut,
    ScheduleInput,
    TableRowOut,
)
from app.schemas.matches import MatchDetailOut, score_out
from app.schemas.rankings import TeamRefOut
from app.services import audit, bracket_rules, championship_lifecycle, events, notifications
from app.services.championship_lifecycle import FINAL_RESULT_STATES, subject_of
from app.services.courts import MAX_REVIEW_SUGGESTIONS, usable_for_terms
from app.services.event_rules import (
    TransitionError,
    event_registration_deadline,
    next_event_state,
)
from app.services.match_access import audience, load_match_for, load_sides
from app.services.match_events import post_event
from app.services.match_lifecycle import apply_final_score
from app.services.match_rules import (
    RuleError,
    clean_court_name,
    court_key,
    court_kind_for,
    match_phase,
    next_match_state,
    result_deadline,
    scores_agree,
    walkover_score,
)
from app.services.match_views import match_cards, match_detail, report_score
from app.services.participants import entry_recipients
from app.services.people import people_out
from app.services.results import score_text, validate_score
from app.services.standings import recalculate_for_match
from app.services.sweep import expire_entries

NOT_ORGANIZER_SCHEDULE = 'Só o organizador do evento agenda as partidas.'
NOT_ORGANIZER_DECIDE = 'Só o organizador do evento decide o resultado.'
TABLE_FORBIDDEN = 'A tabela é só para os inscritos do evento.'
BRACKET_CONFIRMED = 'O chaveamento já foi confirmado.'
NO_BRACKET = 'Sorteie o chaveamento antes.'
WALKOVER_TEXT = {'futebol': '3 × 0', 'tenis': '6-0 6-0'}
SCHEDULABLE_STATES = ('combinando', 'agendada')
SCHEDULED_STATES = ('agendada', 'realizada', 'encerrada')


class ScheduleConflict(Exception):
    """A match of the event clashes with the new schedule (`409` with the match that conflicts)."""

    def __init__(self, message: str, conflict: ScheduleConflictOut):
        super().__init__(message)
        self.message = message
        self.conflict = conflict

    def body(self) -> dict:
        return {'detail': self.message, 'conflict': self.conflict.model_dump(mode='json')}


# ----- Loading -----------------------------------------------------------------------------------------------

def _bracket_of(db: Session, event_id: int, *, for_update: bool = False) -> EventBracket | None:
    statement = select(EventBracket).where(EventBracket.event_id == event_id)
    if for_update:
        statement = statement.with_for_update().execution_options(populate_existing=True)
    return db.scalar(statement)


def _event_matches(db: Session, event_id: int) -> list[Match]:
    """Matches of the event in bracket order: round, then position."""
    return list(db.scalars(select(Match).where(Match.event_id == event_id, Match.origin == 'campeonato')
                           .order_by(Match.round_number, Match.bracket_position, Match.id)))


def _labels(matches: Sequence[Match]) -> dict[int, str]:
    """"J1", "J2"… in bracket order (the matches already exclude the byes)."""
    return {match.id: f'J{index}' for index, match in enumerate(matches, start=1)}


def _stage(event: Event, match: Match, rounds: int) -> str:
    if event.competition_type == 'eliminacao_simples':
        return bracket_rules.round_name(match.round_number, rounds)
    return f'Rodada {match.round_number}'


def _round_count(event: Event, matches: Sequence[Match]) -> int:
    return max((match.round_number for match in matches), default=0)


def _confirmed_entries(db: Session, event_id: int) -> list[EventEntry]:
    return list(db.scalars(select(EventEntry).where(EventEntry.event_id == event_id, EventEntry.state == 'confirmada')
                           .order_by(EventEntry.created_at, EventEntry.id)))


def _plan_entries(db: Session, ids: Iterable[int | None]) -> dict[int, EventEntry]:
    wanted = {entry_id for entry_id in ids if entry_id is not None}
    if not wanted:
        return {}
    return {entry.id: entry for entry in db.scalars(select(EventEntry).where(EventEntry.id.in_(wanted)))}


def _competitors(db: Session, viewer: User, entries: Iterable[EventEntry],
                 places: Mapping[int, int]) -> dict[int, CompetitorOut]:
    """Team or athlete of each entry (crest and initials, or the compact person), in two queries."""
    entries = list(entries)
    team_ids = {entry.team_id for entry in entries if entry.team_id is not None}
    teams = {team.id: team for team in db.scalars(select(Team).where(Team.id.in_(team_ids)))} if team_ids else {}
    people = people_out(db, viewer, (entry.user_id for entry in entries))
    result = {}
    for entry in entries:
        team = teams.get(entry.team_id) if entry.team_id is not None else None
        result[entry.id] = CompetitorOut(
            entry_id=entry.id, kind='time' if entry.team_id is not None else 'atleta',
            team=TeamRefOut(id=team.id, name=team.name, initials=team.initials, crest_url=team.crest_url)
            if team is not None else None,
            athlete=people.get(entry.user_id) if entry.user_id is not None else None,
            place=places.get(entry.id))
    return result


def _names(db: Session, subjects: Iterable[tuple[str, int]]) -> dict[tuple[str, int], str]:
    wanted = set(subjects)
    teams = [key for kind, key in wanted if kind == 'time']
    users = [key for kind, key in wanted if kind == 'atleta']
    names: dict[tuple[str, int], str] = {}
    if teams:
        names.update({('time', team_id): name for team_id, name in db.execute(
            select(Team.id, Team.name).where(Team.id.in_(teams))).all()})
    if users:
        names.update({('atleta', user_id): name for user_id, name in db.execute(
            select(User.id, User.name).where(User.id.in_(users))).all()})
    return names


def _reports_differ(db: Session, match_ids: Sequence[int]) -> set[int]:
    """Matches whose two sides informed different scores."""
    if not match_ids:
        return set()
    reports: dict[int, dict[str, MatchResult]] = defaultdict(dict)
    for row in db.scalars(select(MatchResult).where(MatchResult.match_id.in_(match_ids))):
        reports[row.match_id][row.side] = row
    return {match_id for match_id, by_side in reports.items()
            if len(by_side) == 2 and not scores_agree(report_score(by_side['a']), report_score(by_side['b']))}


# ----- Draw (sortear, trocar, confirmar) ---------------------------------------------------------------------

def _supports_bracket(event: Event) -> bool:
    return event.sport in ('futebol', 'tenis') and event.competition_type is not None


def draw_blocker(db: Session, event: Event, bracket: EventBracket | None, now: datetime) -> str | None:
    """Why the organizer cannot draw now (`409`), or None: the event is published, registrations are over and at
    least two entries are confirmed; once confirmed, the bracket never changes."""
    if not _supports_bracket(event):
        return 'Este evento não tem chaveamento.'
    if event.state == 'em_andamento' or (bracket is not None and bracket.state == 'confirmado'):
        return BRACKET_CONFIRMED
    if event.state in ('encerrado', 'cancelado'):
        return 'Este evento não aceita mais sorteio.'
    if event.state != 'publicado':
        return 'Publique o evento antes de sortear.'
    deadline = event_registration_deadline(event)
    if deadline is None or now < deadline:
        return 'As inscrições ainda estão abertas. Sorteie depois do fim das inscrições.'
    if len(_confirmed_entries(db, event.id)) < bracket_rules.MIN_COMPETITORS:
        return 'Confirme pelo menos 2 inscrições para sortear o campeonato.'
    return None


def _plan(event: Event, entries: Sequence[EventEntry], seed: int) -> tuple[int, list[int | None]]:
    """(size, slots) of the draw: single elimination lays the shuffled entries into the seeded bracket (byes for
    the missing ones); round robin keeps the shuffled order."""
    ordered = bracket_rules.draw_order((entry.id for entry in entries), seed)
    if event.competition_type == 'eliminacao_simples':
        size = bracket_rules.elimination_size(len(ordered))
        return size, bracket_rules.elimination_slots(ordered, size)
    return len(ordered), list(ordered)


def draw_bracket(db: Session, user: User, event_id: int, *, now: datetime) -> BracketOut:
    """Sorts the confirmed entries with a stored seed (reproducible); sorting again replaces the draw until the
    organizer confirms it."""
    event = events.load_owned_event(db, event_id, user, for_update=True)
    events.ensure_writable(event)
    bracket = _bracket_of(db, event.id, for_update=True)
    blocker = draw_blocker(db, event, bracket, now)
    if blocker is not None:
        raise HTTPException(409, blocker)
    entries = _confirmed_entries(db, event.id)
    seed = secrets.randbits(63)
    size, slots = _plan(event, entries, seed)
    if bracket is None:
        bracket = EventBracket(event_id=event.id, kind=event.competition_type, draw_count=0, created_at=now)
        db.add(bracket)
    bracket.state, bracket.seed, bracket.size, bracket.slots, bracket.swaps = 'sorteado', seed, size, slots, []
    bracket.draw_count = (bracket.draw_count or 0) + 1
    bracket.drawn_by_id, bracket.drawn_at, bracket.updated_at = user.id, now, now
    db.flush()
    audit.record(db, actor_id=user.id, action='chaveamento.sorteado', target_type='event', target_id=event.id,
                 data={'seed': seed, 'kind': event.competition_type, 'entries': len(entries), 'size': size,
                       'byes': sum(1 for slot in slots if slot is None), 'draw_count': bracket.draw_count})
    db.commit()
    return bracket_view(db, user, event, now=now)


def _ensure_open_bracket(event: Event, bracket: EventBracket, action: str) -> None:
    """The draw can still change (`409` otherwise, with the reason): a cancelled or finished event accepts nothing,
    and a confirmed bracket (the event is under way) never changes."""
    if event.state in ('encerrado', 'cancelado'):
        raise HTTPException(409, f'Este evento não aceita mais {action}.')
    if bracket.state == 'confirmado' or event.state != 'publicado':
        raise HTTPException(409, BRACKET_CONFIRMED)


def swap_bracket(db: Session, user: User, event_id: int, data: BracketSwapInput, *, now: datetime) -> BracketOut:
    """Two places swap their entries; only before the bracket is confirmed."""
    event = events.load_owned_event(db, event_id, user, for_update=True)
    events.ensure_writable(event)
    bracket = _bracket_of(db, event.id, for_update=True)
    if bracket is None:
        raise HTTPException(409, NO_BRACKET)
    _ensure_open_bracket(event, bracket, 'troca de posições no chaveamento')
    slots = bracket_rules.swap_slots(bracket.slots, data.a, data.b)
    if event.competition_type == 'eliminacao_simples':
        bracket_rules.validate_elimination_slots(slots)
    bracket.slots, bracket.swaps, bracket.updated_at = slots, [*bracket.swaps, [data.a, data.b]], now
    audit.record(db, actor_id=user.id, action='chaveamento.trocado', target_type='event', target_id=event.id,
                 data={'a': data.a, 'b': data.b, 'entry_a': bracket.slots[data.a], 'entry_b': bracket.slots[data.b]})
    db.commit()
    return bracket_view(db, user, event, now=now)


def confirm_bracket(db: Session, user: User, event_id: int, *, now: datetime) -> BracketOut:
    """Generates the matches from the draw and starts the event ('em_andamento'): the teams see the table and the
    organizer schedules the matches. Receipts still under analysis block it; open reservations are released."""
    event = events.load_owned_event(db, event_id, user, for_update=True)
    events.ensure_writable(event)
    bracket = _bracket_of(db, event.id, for_update=True)
    if bracket is None:
        raise HTTPException(409, NO_BRACKET)
    _ensure_open_bracket(event, bracket, 'confirmação do chaveamento')
    deadline = event_registration_deadline(event)
    if deadline is None or now < deadline:
        raise HTTPException(409, 'As inscrições ainda estão abertas. Confirme depois do fim das inscrições.')
    entries = list(db.scalars(select(EventEntry).where(EventEntry.event_id == event.id).order_by(EventEntry.id)
                              .with_for_update().execution_options(populate_existing=True)))
    under_analysis = sum(1 for entry in entries if entry.state == 'em_analise')
    if under_analysis:
        plural = 's' if under_analysis > 1 else ''
        raise HTTPException(409, f'Analise {under_analysis} comprovante{plural} pendente{plural} antes de '
                                 'confirmar o chaveamento.')
    confirmed = [entry for entry in entries if entry.state == 'confirmada']
    planned = {entry_id for entry_id in bracket.slots if entry_id is not None}
    if planned != {entry.id for entry in confirmed}:
        raise HTTPException(409, 'As inscrições confirmadas mudaram desde o sorteio. Sorteie de novo.')
    # Reservations still open (or refused receipts that can be sent again) are released: the bracket is closed.
    released = [entry for entry in entries if entry.state in ('reservada', 'rejeitada')]
    expire_entries(db, released, now)

    names = _names(db, (subject_of(entry) for entry in confirmed))
    by_id = {entry.id: entry for entry in confirmed}
    created = _create_matches(db, event, bracket, by_id, names, now)
    event.state = next_event_state(event.state, 'iniciar')
    event.updated_at = now
    bracket.state, bracket.confirmed_at, bracket.confirmed_by_id, bracket.updated_at = 'confirmado', now, user.id, now
    db.flush()
    recipients = entry_recipients(db, confirmed, scope='membros')
    notifications.notify_many(db, [user_id for entry in confirmed for user_id in recipients[entry.id]],
                              'tabela_publicada', {'event_id': event.id, 'event_name': event.name}, actor_id=user.id)
    audit.record(db, actor_id=user.id, action='chaveamento.confirmado', target_type='event', target_id=event.id,
                 data={'matches': created, 'entries': len(confirmed), 'kind': event.competition_type,
                       'released': len(released)})
    db.commit()
    return bracket_view(db, user, event, now=now)


def _new_match(db: Session, event: Event, round_number: int, position: int, now: datetime) -> Match:
    match = Match(sport=event.sport, format=event.format, city_id=event.city_id, origin='campeonato',
                  event_id=event.id, round_number=round_number, bracket_position=position, state='combinando',
                  created_at=now, updated_at=now)
    db.add(match)
    db.flush()
    return match


def _add_side(db: Session, match: Match, label: str, entry: EventEntry, now: datetime) -> None:
    db.add(MatchSide(match_id=match.id, side=label, team_id=entry.team_id, user_id=entry.user_id, created_at=now))


def _create_matches(db: Session, event: Event, bracket: EventBracket, entries: Mapping[int, EventEntry],
                    names: Mapping[tuple[str, int], str], now: datetime) -> int:
    """Rows of `matches`, their sides and the chat banners. Created round by round, so the feeders of a match always
    have a smaller id than the match they feed (the lock order). Byes create no match: the entry that goes through
    is placed straight into the next one."""
    created: dict[tuple[int, int], Match] = {}
    links: list[tuple[Match, tuple[int, int, str]]] = []
    if event.competition_type == 'eliminacao_simples':
        for node in bracket_rules.elimination_layout(bracket.slots):
            if node.is_bye:
                continue
            match = _new_match(db, event, node.round, node.position, now)
            created[(node.round, node.position)] = match
            for label, ref in (('a', node.a), ('b', node.b)):
                if ref.entry_id is not None:
                    _add_side(db, match, label, entries[ref.entry_id], now)
            if node.next is not None:
                links.append((match, node.next))
            sides = [entries[ref.entry_id] for ref in (node.a, node.b) if ref.entry_id is not None]
            _banner(db, match, event, [names[subject_of(entry)] for entry in sides], now)
        for match, (round_number, position, label) in links:
            match.next_match_id, match.next_match_side = created[(round_number, position)].id, label
    else:
        for plan in bracket_rules.circle_rounds(bracket.slots):
            for position, (entry_a, entry_b) in enumerate(plan.pairs, start=1):
                match = _new_match(db, event, plan.number, position, now)
                created[(plan.number, position)] = match
                _add_side(db, match, 'a', entries[entry_a], now)
                _add_side(db, match, 'b', entries[entry_b], now)
                _banner(db, match, event, [names[subject_of(entries[entry_a])], names[subject_of(entries[entry_b])]], now)
    db.flush()
    return len(created)


def _banner(db: Session, match: Match, event: Event, names: Sequence[str], now: datetime) -> None:
    """First banner of the chat of a championship match."""
    if len(names) == 2:
        text = f'{event.name}: {names[0]} × {names[1]}. O organizador define data, horário e quadra.'
    elif names:
        text = f'{event.name}: {names[0]} aguarda o vencedor do jogo anterior. O organizador define data, horário e quadra.'
    else:
        text = f'{event.name}: esta partida espera os vencedores dos jogos anteriores.'
    post_event(db, match.id, 'partida_combinando', text, now=now)


# ----- Reading the bracket -----------------------------------------------------------------------------------

def _reader_event(db: Session, user: User, event_id: int, now: datetime) -> Event:
    """Organizer, administration and participants read the table (the channel readers of 0003, 10.1). Anyone else
    gets `404` while the event is not public and `403` when it is."""
    event = db.get(Event, event_id)
    staff = event is not None and (user.is_admin or event.organizer_user_id == user.id)
    if event is None or (not staff and event.state not in VISIBLE_EVENT_STATES):
        raise HTTPException(404, events.EVENT_NOT_FOUND)
    if not staff and not events.can_read_channel(db, event, user, now=now):
        raise HTTPException(403, TABLE_FORBIDDEN)
    return event


def get_bracket(db: Session, user: User, event_id: int, *, now: datetime) -> BracketOut:
    return bracket_view(db, user, _reader_event(db, user, event_id, now), now=now)


def _match_out(match: Match, *, court_names: Mapping[int, str], reports_differ: bool,
               now: datetime) -> BracketMatchOut:
    phase = match_phase(match.state, now=now, starts_at=match.starts_at,
                        walkover_absent_side=match.walkover_absent_side,
                        walkover_contested=match.walkover_contested_at is not None, reports_differ=reports_differ)
    overdue = match.result_deadline is not None and now >= match.result_deadline
    return BracketMatchOut(
        id=match.id, state=match.state, phase=phase, starts_at=match.starts_at,
        court_name=court_names.get(match.court_id) if match.court_id is not None else None,
        score=score_out(match.score_a, match.score_b, match.sets, match.winner_side),
        awaiting_decision=match.state == 'agendada' and (reports_differ or overdue)
        and match.starts_at is not None and now >= match.starts_at)


def bracket_view(db: Session, viewer: User, event: Event, *, now: datetime) -> BracketOut:
    """The tree (single elimination: rounds with "Folga" and "Vencedor J1 × Vencedor J2") or the rounds and table
    (round robin), with scores once the matches exist. Before the organizer confirms, only the organizer and the
    administration see the draw."""
    if not _supports_bracket(event):
        raise HTTPException(404, 'Este evento não tem chaveamento.')
    organizer = event.organizer_user_id == viewer.id
    staff = organizer or viewer.is_admin
    bracket = _bracket_of(db, event.id)
    shown = bracket is not None and (bracket.state == 'confirmado' or staff)
    state = bracket.state if shown else 'sem_chaveamento'
    empty = dict(event_id=event.id, event_name=event.name, event_state=event.state, sport=event.sport,
                 format=event.format, kind=event.competition_type, is_organizer=organizer, state=state, byes=0,
                 rounds=[], table=None, placements=None, champion=None)
    # The organizer draws, swaps and confirms while the event is published and the bracket is not confirmed.
    open_draw = (organizer and event.state == 'publicado' and event.revocation_decision != 'pendente'
                 and (bracket is None or bracket.state == 'sorteado'))
    blocker = draw_blocker(db, event, bracket, now) if open_draw else None
    editable = open_draw and bracket is not None and bracket.state == 'sorteado'
    permissions = BracketPermissionsOut(can_draw=open_draw and blocker is None, can_swap=editable,
                                        can_confirm=editable, draw_blocker=blocker)
    if not shown:
        return BracketOut(**empty, size=None, seed=None, draw_count=None, drawn_at=None, confirmed_at=None,
                          permissions=permissions)

    slots: list[int | None] = list(bracket.slots)
    entries = _plan_entries(db, slots)
    places = {entry_id: index for index, entry_id in enumerate(slots) if entry_id is not None}
    competitors = _competitors(db, viewer, entries.values(), places)
    matches = _event_matches(db, event.id) if bracket.state == 'confirmado' else []
    by_position = {(match.round_number, match.bracket_position): match for match in matches}
    sides = load_sides(db, [match.id for match in matches]) if matches else {}
    differing = _reports_differ(db, [match.id for match in matches if match.state == 'agendada'])
    court_names = dict(db.execute(select(Court.id, Court.name).where(
        Court.id.in_({match.court_id for match in matches if match.court_id is not None}))).all()) if matches else {}
    entry_of = {subject_of(entry): entry.id for entry in entries.values()}

    def competitor_of(side: MatchSide | None) -> CompetitorOut | None:
        if side is None:
            return None
        entry_id = entry_of.get(subject_of(side))
        return competitors.get(entry_id) if entry_id is not None else None

    def node_for(round_number: int, position: int, number: int | None, refs: Sequence[bracket_rules.SlotRef],
                 next_ref, first_round: bool) -> BracketNodeOut:
        match = by_position.get((round_number, position))
        match_sides = sides.get(match.id, {}) if match is not None else {}
        out_slots = []
        for index, (label, ref) in enumerate(zip(('a', 'b'), refs, strict=True)):
            place = 2 * (position - 1) + index if first_round else None
            if ref.bye:
                out_slots.append(BracketSlotOut(kind='folga', competitor=None, placeholder='Folga', from_match=None,
                                                advanced_by_bye=False, place=place, winner=False))
                continue
            competitor = competitors.get(ref.entry_id) if ref.entry_id is not None else competitor_of(
                match_sides.get(label))
            if competitor is None:
                out_slots.append(BracketSlotOut(kind='vencedor', competitor=None,
                                                placeholder=f'Vencedor J{ref.from_match}', from_match=ref.from_match,
                                                advanced_by_bye=False, place=place, winner=False))
            else:
                out_slots.append(BracketSlotOut(
                    kind='competidor', competitor=competitor, placeholder=None, from_match=ref.from_match,
                    advanced_by_bye=ref.advanced, place=place,
                    winner=match is not None and match.winner_side == label and match.score_a is not None))
        return BracketNodeOut(
            position=position, number=number, label=f'J{number}' if number is not None else None,
            bye=number is None, slots=out_slots,
            match=_match_out(match, court_names=court_names, reports_differ=match.id in differing, now=now)
            if match is not None else None,
            next=BracketNextOut(round=next_ref[0], position=next_ref[1], side=next_ref[2]) if next_ref else None)

    rounds: list[BracketRoundOut] = []
    table = None
    if event.competition_type == 'eliminacao_simples':
        layout = bracket_rules.elimination_layout(slots)
        total = bracket_rules.round_count(len(slots))
        for round_number in range(1, total + 1):
            nodes = [node_for(node.round, node.position, node.number, (node.a, node.b), node.next, round_number == 1)
                     for node in layout if node.round == round_number]
            rounds.append(BracketRoundOut(number=round_number, name=bracket_rules.round_name(round_number, total),
                                          nodes=nodes, rest=None))
        byes = sum(1 for slot in slots if slot is None)
    else:
        number = 0
        for plan in bracket_rules.circle_rounds(slots):
            nodes = []
            for position, (entry_a, entry_b) in enumerate(plan.pairs, start=1):
                number += 1
                nodes.append(node_for(plan.number, position, number,
                                      (bracket_rules.SlotRef(entry_id=entry_a), bracket_rules.SlotRef(entry_id=entry_b)),
                                      None, False))
            rounds.append(BracketRoundOut(number=plan.number, name=f'Rodada {plan.number}', nodes=nodes,
                                          rest=competitors.get(plan.rest) if plan.rest is not None else None))
        byes = 0
        table = _table_out(matches, sides, slots, entry_of, competitors)

    placements, champion = _placements_out(db, event, competitors)
    empty.update(byes=byes, rounds=rounds, table=table, placements=placements, champion=champion)
    return BracketOut(
        **empty, size=bracket.size, seed=bracket.seed if staff else None,
        draw_count=bracket.draw_count if staff else None, drawn_at=bracket.drawn_at if staff else None,
        confirmed_at=bracket.confirmed_at, permissions=permissions)


def _table_out(matches: Sequence[Match], sides: Mapping[int, Mapping[str, MatchSide]], slots: Sequence[int | None],
               entry_of: Mapping[tuple[str, int], int], competitors: Mapping[int, CompetitorOut]) -> list[TableRowOut]:
    results = []
    for match in matches:
        if match.state not in FINAL_RESULT_STATES or match.score_a is None:
            continue
        by_side = sides.get(match.id, {})
        entry_a = entry_of.get(subject_of(by_side['a'])) if 'a' in by_side else None
        entry_b = entry_of.get(subject_of(by_side['b'])) if 'b' in by_side else None
        if entry_a is not None and entry_b is not None:
            results.append((entry_a, entry_b, match.score_a, match.score_b))
    order = [entry_id for entry_id in slots if entry_id is not None]
    rows = bracket_rules.table_standings(order, results)
    return [TableRowOut(position=index, competitor=competitors[row.entry_id], played=row.played, wins=row.wins,
                        draws=row.draws, losses=row.losses, goals_for=row.goals_for,
                        goals_against=row.goals_against, goal_difference=row.goal_difference, points=row.points)
            for index, row in enumerate(rows, start=1)]


def _placements_out(db: Session, event: Event,
                    competitors: Mapping[int, CompetitorOut]) -> tuple[list[PlacementOut] | None, CompetitorOut | None]:
    if event.state != 'encerrado':
        return None, None
    rows = list(db.scalars(select(EventPlacement).where(EventPlacement.event_id == event.id)
                           .order_by(EventPlacement.placement, EventPlacement.entry_id)))
    placements = [PlacementOut(placement=row.placement, competitor=competitors[row.entry_id],
                               bonus_points=row.bonus_points) for row in rows if row.entry_id in competitors]
    champion = next((item.competitor for item in placements if item.placement == 1), None)
    return placements, champion


# ----- Matches of the event (S1) -----------------------------------------------------------------------------

def _staff_event(db: Session, user: User, event_id: int) -> Event:
    event = db.get(Event, event_id)
    if event is None or (event.organizer_user_id != user.id and not user.is_admin):
        raise HTTPException(404, events.EVENT_NOT_FOUND)
    return event


def _rows(db: Session, viewer: User, event: Event, matches: Sequence[Match], targets: Sequence[Match], *,
          now: datetime) -> list[EventMatchRowOut]:
    """Rows for `targets`, with labels and placeholders computed from every match of the event."""
    labels = _labels(matches)
    rounds = _round_count(event, matches)
    feeders = {(match.next_match_id, match.next_match_side): labels[match.id]
               for match in matches if match.next_match_id is not None}
    sides = load_sides(db, [match.id for match in targets])
    differing = _reports_differ(db, [match.id for match in targets if match.state == 'agendada'])
    cards = {card.id: card for card in match_cards(db, viewer, targets, now=now)}
    writable = event.state == 'em_andamento' and event.revocation_decision != 'pendente'
    rows = []
    for match in targets:
        known = sides[match.id]
        placeholders = [None if label in known else f'Vencedor {feeders.get((match.id, label), "?")}'
                        for label in ('a', 'b')]
        schedulable = (writable and len(known) == 2 and (
            match.state == 'combinando' or (match.state == 'agendada' and now < match.starts_at)))
        overdue = match.result_deadline is not None and now >= match.result_deadline
        decide = (match.state == 'agendada' and match.starts_at is not None and now >= match.starts_at
                  and (match.id in differing or overdue))
        rows.append(EventMatchRowOut(
            card=cards[match.id], label=labels[match.id], stage=_stage(event, match, rounds),
            round_number=match.round_number, position=match.bracket_position, placeholders=placeholders,
            can_schedule=schedulable, awaiting_decision=decide))
    return rows


def _group(row: EventMatchRowOut) -> tuple:
    """Without a date first (schedulable ones, then those waiting for a winner), then the scheduled ones by start,
    then the finished ones, the latest first."""
    card = row.card
    if card.state in FINAL_RESULT_STATES or card.state in ('cancelada', 'sem_resultado'):
        return 2, -(card.starts_at.timestamp() if card.starts_at else 0), row.round_number, row.position
    if card.starts_at is None:
        return 0, 0 if row.can_schedule else 1, row.round_number, row.position
    return 1, card.starts_at.timestamp(), row.round_number, row.position


def list_event_matches(db: Session, user: User, event_id: int, *, now: datetime) -> EventMatchListOut:
    event = _staff_event(db, user, event_id)
    matches = _event_matches(db, event.id)
    rows = sorted(_rows(db, user, event, matches, matches, now=now), key=_group) if matches else []
    counts = championship_lifecycle.status_for(db, [event], now).get(event.id)
    return EventMatchListOut(items=rows, counts=EventMatchCountsOut(
        total=len(rows), to_schedule=counts.to_schedule if counts else 0, waiting=counts.waiting if counts else 0,
        scheduled=counts.scheduled if counts else 0, to_decide=counts.to_decide if counts else 0,
        finished=counts.finished if counts else 0))


# ----- Schedule ----------------------------------------------------------------------------------------------

def _organizer_match(db: Session, user: User, match_id: int, message: str):
    """The championship match for the owner of its event: `404` for strangers (and for friendlies), `403` for whoever
    sees the match without owning the event (the rosters and the administration)."""
    match, _, access = load_match_for(db, match_id, user)
    if match.origin != 'campeonato' or match.event_id is None:
        raise HTTPException(404, 'Partida não encontrada.')
    if db.scalar(select(Event.organizer_user_id).where(Event.id == match.event_id)) != user.id:
        raise HTTPException(403, message)
    return match, access


def _lock_match(db: Session, match_id: int) -> Match:
    return db.scalar(select(Match).where(Match.id == match_id).with_for_update()
                     .execution_options(populate_existing=True))


def _resolve_court(db: Session, match: Match, data: ScheduleInput) -> tuple[Court | None, tuple[str, str | None] | None]:
    """The court of the schedule: from the catalog (`court_id`), or a suggestion (an equivalent published court or a
    suggestion under review made by any match of the same event is reused, so the review queue gets one row per
    place and the 2 h court conflict sees it; otherwise a new one is created after the conflict check). Exactly
    one."""
    if (data.court_id is None) == (data.court_suggestion is None):
        raise RuleError('Escolha uma quadra do catálogo ou sugira uma.', 'court_id')
    if data.court_id is not None:
        return usable_for_terms(db, match, data.court_id), None
    name = clean_court_name(data.court_suggestion.name)
    address = (data.court_suggestion.address or '').strip() or None
    needed, key = court_kind_for(match.sport, match.format), court_key(name)
    of_event = select(Match.id).where(Match.event_id == match.event_id)
    existing = db.scalar(select(Court).where(
        Court.city_id == match.city_id, Court.kind == needed, Court.name_key == key,
        or_(Court.state == 'publicada', and_(Court.state == 'em_revisao', Court.origin_match_id.in_(of_event))))
        .order_by(Court.state.desc(), Court.id).limit(1))
    if existing is not None:
        return existing, None
    open_suggestions = db.scalar(select(Court.id).where(
        Court.state == 'em_revisao', Court.origin_match_id == match.id).offset(MAX_REVIEW_SUGGESTIONS - 1).limit(1))
    if open_suggestions is not None:
        raise TransitionError(f'Esta partida já tem {MAX_REVIEW_SUGGESTIONS} sugestões de quadra em revisão.')
    return None, (name, address)


def _bookings(db: Session, event: Event, skip_match_id: int) -> tuple[list[bracket_rules.Booking], dict[int, Match]]:
    others = list(db.scalars(select(Match).where(
        Match.event_id == event.id, Match.id != skip_match_id, Match.starts_at.is_not(None),
        Match.state.in_(SCHEDULED_STATES))))
    sides = load_sides(db, [match.id for match in others])
    court_ids = {match.court_id for match in others if match.court_id is not None}
    keys = dict(db.execute(select(Court.id, Court.name_key).where(Court.id.in_(court_ids))).all()) if court_ids else {}
    return [bracket_rules.Booking(match.id, match.starts_at, match.court_id,
                                  frozenset(subject_of(side) for side in sides[match.id].values()),
                                  keys.get(match.court_id))
            for match in others], {match.id: match for match in others}


def _conflict_error(db: Session, event: Event, kind: str, other: bracket_rules.Booking, mine: Iterable[tuple[str, int]],
                    court: Court | None) -> ScheduleConflict:
    matches = _event_matches(db, event.id)
    labels, rounds = _labels(matches), _round_count(event, matches)
    clash = next(match for match in matches if match.id == other.match_id)
    court_name = db.scalar(select(Court.name).where(Court.id == clash.court_id)) if clash.court_id else None
    label = labels[clash.id]
    if kind == 'quadra':
        message = (f'A quadra {court.name if court else court_name} já tem o {label} a menos de 2 h desse horário. '
                   'Escolha outro horário ou outra quadra.')
    else:
        shared = next(iter(set(mine) & other.subjects))
        name = _names(db, [shared]).get(shared, 'Um dos times')
        message = f'{name} já joga o {label} a menos de 2 h desse horário. Escolha outro horário.'
    return ScheduleConflict(message, ScheduleConflictOut(
        kind=kind, match_id=clash.id, label=label, stage=_stage(event, clash, rounds), starts_at=clash.starts_at,
        court_name=court_name))


def schedule_match(db: Session, user: User, match_id: int, data: ScheduleInput, *, now: datetime) -> EventMatchRowOut:
    """The organizer sets (or changes, before the start) the start time, free to the minute, and the court of a
    match whose two sides are known. A court with another match of the event less than 2 h apart, or a competitor
    that plays another match less than 2 h apart, is refused with `409` and the match that conflicts. Both rosters
    are told; the Arena only records the booking with the venue (RN08)."""
    match, access = _organizer_match(db, user, match_id, NOT_ORGANIZER_SCHEDULE)
    event = events.load_owned_event(db, match.event_id, user, for_update=True)
    events.ensure_writable(event)
    match = _lock_match(db, match.id)
    if event.state != 'em_andamento':
        raise HTTPException(409, 'Confirme o chaveamento antes de agendar as partidas.'
                            if event.state == 'publicado' else 'Este evento não aceita mais agendamento.')
    if match.state not in SCHEDULABLE_STATES:
        raise HTTPException(409, 'Esta partida foi cancelada.' if match.state == 'cancelada'
                            else 'O resultado desta partida já foi definido.')
    if match.state == 'agendada' and now >= match.starts_at:
        raise HTTPException(409, 'A partida já começou: depois do início só o resultado pode mudar.')
    sides = load_sides(db, [match.id])[match.id]
    if len(sides) < 2:
        raise HTTPException(409, 'Esta partida ainda espera o resultado dos jogos anteriores.')

    starts_at = bracket_rules.validate_schedule_start(data.starts_at, now).astimezone(timezone.utc)
    court, suggestion = _resolve_court(db, match, data)
    subjects = [subject_of(side) for side in sides.values()]
    bookings, _ = _bookings(db, event, match.id)
    clash = bracket_rules.find_conflict(starts_at, court.id if court is not None else None, subjects, bookings,
                                        court.name_key if court is not None else court_key(suggestion[0]))
    if clash is not None:
        raise _conflict_error(db, event, clash[0], clash[1], subjects, court)
    if court is None:
        name, address = suggestion
        court = Court(city_id=match.city_id, name=name, name_key=court_key(name), address=address,
                      kind=court_kind_for(match.sport, match.format), state='em_revisao', suggested_by_id=user.id,
                      origin_match_id=match.id, created_at=now, updated_at=now)
        db.add(court)
        db.flush()
        post_event(db, match.id, 'quadra_sugerida',
                   f'O organizador sugeriu a quadra {name}. A administração vai revisar; até lá ela vale só nesta '
                   'partida.', author_id=user.id, payload={'court_id': court.id}, now=now)
        audit.record(db, actor_id=user.id, action='quadra.sugerida', target_type='court', target_id=court.id,
                     data={'match_id': match.id, 'kind': court.kind, 'event_id': event.id})

    first = match.state == 'combinando'
    previous = {'starts_at': match.starts_at.isoformat() if match.starts_at else None, 'court_id': match.court_id}
    if first:
        match.state = next_match_state(match.state, 'agendar')
    match.starts_at, match.court_id, match.result_deadline = starts_at, court.id, result_deadline(starts_at)
    match.booking_side = match.booking_confirmed_at = match.booking_confirmed_by_id = None
    match.updated_at = now
    db.flush()

    people = audience(db, match, sides=sides, include_guests=False)
    notifications.notify_many(db, people, 'partida_agendada', {
        'match_id': match.id, 'terms_id': None, 'starts_at': starts_at.isoformat(), 'court_name': court.name,
        'changed': not first, 'event_id': event.id, 'event_name': event.name}, actor_id=user.id)
    post_event(db, match.id, 'partida_agendada',
               (f'O organizador agendou a partida na quadra {court.name}.' if first
                else f'O organizador alterou a partida: quadra {court.name}.'),
               author_id=user.id, payload={'starts_at': starts_at.isoformat(), 'court_id': court.id,
                                           'changed': not first}, now=now)
    audit.record(db, actor_id=user.id, action='partida.agendada' if first else 'partida.reagendada',
                 target_type='match', target_id=match.id,
                 data={'event_id': event.id, 'starts_at': starts_at.isoformat(), 'court_id': court.id,
                       'previous': None if first else previous})
    db.commit()
    matches = _event_matches(db, event.id)
    return _rows(db, user, event, matches, [match], now=now)[0]


# ----- Result decision (D3) ----------------------------------------------------------------------------------

def _report_snapshot(reports: Mapping[str, MatchResult]) -> dict:
    return {label: {'score_a': row.score_a, 'score_b': row.score_b} for label, row in reports.items()}


def decide_result(db: Session, user: User, match_id: int, data: ResultDecisionInput, *,
                  now: datetime) -> MatchDetailOut:
    """Only the organizer of the event settles a championship match: a divergence (any time after the start), a match
    with no confirmed score 48 h after the start, or a W.O. (after the start). The justification (5 to 500
    characters) is registered in `result_decisions`, in the audit log and on the match, where both teams read it.
    The decision feeds the rankings, takes the winner to the next match and tells both rosters."""
    match, access = _organizer_match(db, user, match_id, NOT_ORGANIZER_DECIDE)
    event = events.load_owned_event(db, match.event_id, user, for_update=True)
    events.ensure_writable(event)
    match = _lock_match(db, match.id)
    sides = load_sides(db, [match.id])[match.id]
    reports = {row.side: row for row in db.scalars(select(MatchResult).where(MatchResult.match_id == match.id))}
    differ = len(reports) == 2 and not scores_agree(report_score(reports['a']), report_score(reports['b']))
    walkover = data.walkover_absent_side is not None
    started = match.starts_at is not None and now >= match.starts_at
    overdue = match.result_deadline is not None and now >= match.result_deadline
    kind = bracket_rules.decision_kind(state=match.state, started=started, reports_differ=differ,
                                       deadline_passed=overdue, walkover=walkover)
    if len(sides) < 2:
        raise HTTPException(409, 'Esta partida ainda espera o resultado dos jogos anteriores.')

    justification = bracket_rules.clean_justification(data.justification)
    if walkover == (data.score is not None):
        raise RuleError('Informe o placar ou o lado ausente (W.O.), não os dois.', 'score')
    if walkover:
        score = walkover_score(match.sport, data.walkover_absent_side)
    else:
        score = validate_score(match, data.score)
        bracket_rules.ensure_decisive(score, event.competition_type == 'eliminacao_simples')

    names = _names(db, (subject_of(side) for side in sides.values()))
    name = {label: names[subject_of(side)] for label, side in sides.items()}
    apply_final_score(match, score, source='organizador', now=now, decided_by_id=user.id, reason=justification)
    match.state = next_match_state(match.state, 'decidir_resultado')
    match.closed_at = now
    if walkover:
        match.walkover_absent_side = data.walkover_absent_side
        match.walkover_registered_by_id, match.walkover_registered_at = user.id, now
    db.add(ResultDecision(
        match_id=match.id, event_id=event.id, decided_by_id=user.id, kind=kind, score_a=score.score_a,
        score_b=score.score_b, sets=score.sets_json(), winner_side=score.winner,
        walkover_absent_side=data.walkover_absent_side, justification=justification,
        reports=_report_snapshot(reports), created_at=now))
    db.flush()
    # The decision settles the match: the organizer's pending and the correction both sides were asked for close.
    notifications.resolve_actions_many(db, [notifications.decision_key(match.id), notifications.result_key(match.id)])
    championship_lifecycle.lock_following(db, match)       # a match lock, so it comes before the rankings
    recalculate_for_match(db, match, now=now)

    if walkover:
        absent, present = data.walkover_absent_side, 'b' if data.walkover_absent_side == 'a' else 'a'
        summary = (f'O organizador decidiu o W.O.: {name[present]} vence por {WALKOVER_TEXT[match.sport]}; '
                   f'{name[absent]} não compareceu.')
    else:
        summary = score_text(match.sport, name['a'], name['b'], score).replace(
            'Resultado confirmado:', 'O organizador decidiu o resultado:')
    post_event(db, match.id, 'resultado_decidido', f'{summary} Justificativa: {justification}',
               side=score.winner, author_id=user.id, now=now,
               payload={'kind': kind, 'score_a': score.score_a, 'score_b': score.score_b,
                        'absent_side': data.walkover_absent_side})
    notifications.notify_many(
        db, audience(db, match, sides=sides, include_guests=False), 'decisao_registrada',
        {'match_id': match.id, 'event_id': event.id, 'event_name': event.name, 'kind': kind,
         'score_a': score.score_a, 'score_b': score.score_b, 'justification': justification,
         'absent_side': data.walkover_absent_side}, actor_id=user.id)
    audit.record(db, actor_id=user.id, action='resultado.decidido', target_type='match', target_id=match.id,
                 data={'event_id': event.id, 'kind': kind, 'score_a': score.score_a, 'score_b': score.score_b,
                       'winner': score.winner, 'absent_side': data.walkover_absent_side,
                       'justification': justification, 'reports': _report_snapshot(reports)})
    championship_lifecycle.after_score(db, match, now=now)
    db.commit()
    return match_detail(db, user, match, now=now, sides=sides, access=access)


__all__ = ['ScheduleConflict', 'bracket_view', 'confirm_bracket', 'decide_result', 'draw_blocker', 'draw_bracket',
           'get_bracket', 'list_event_matches', 'schedule_match', 'swap_bracket']
