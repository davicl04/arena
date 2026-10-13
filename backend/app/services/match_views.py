"""Read views of a match: the card (lists, play board, offers, queues) and the detail (screen P2 + C1) of stage 3.

Everything here only reads. `match_cards` loads a page of matches in a fixed number of queries (sides, accesses,
teams, people and blocks, courts and cities, score reports, pending terms and the viewer's lineup and stats);
`match_detail` adds the terms, slots and walk-ins, the event, the walkover and the cancellation. Permissions and
`needs_my_action` come from pure functions over rows already loaded (`permissions_for`, `needs_my_action`), so
the same rules can be tested without a database and the routes of each front keep their own checks in sync
(contract: docs/decisoes/0002-jogar.md, sections 7.4, 8, 10.1, 11.2 and 12.1).

Privacy: only `PersonOut` (name, @, avatar) leaves here, never e-mail or sports profiles; blocks hide the avatar
(`people.people_out`). Tiers are the ones stored at pairing, which are null while a subject is in placement.
Authorization is the caller's: routes load the match with `match_access.load_match_for` (404 for strangers) and
pass what they loaded.
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.events import Event
from app.models.identity import City, User
from app.models.matches import (
    Court,
    FootballStat,
    Match,
    MatchLineup,
    MatchResult,
    MatchSearch,
    MatchSide,
    MatchSlot,
    MatchTerms,
)
from app.models.rankings import TIERS
from app.models.teams import POSITIONS, Team
from app.schemas.common import PersonOut
from app.schemas.identity import CityOut
from app.schemas.matches import (
    BookingOut,
    CancellationOut,
    MatchCardOut,
    MatchDetailOut,
    MatchEventRefOut,
    MatchPermissionsOut,
    MatchResultOut,
    MatchSideOut,
    MatchSlotOut,
    MatchTermsOut,
    OpenSlotsOut,
    ScoreReportOut,
    TermsPairOut,
    WalkoverOut,
    court_out,
    score_out,
)
from app.schemas.rankings import TeamRefOut
from app.services.match_access import (
    MatchAccess,
    can_read_chat,
    can_write_chat,
    load_sides,
    match_accesses,
)
from app.services.match_rules import (
    Score,
    cancel_deadline,
    cancel_error,
    effective_match_state,
    match_phase,
    other_side,
    result_window_open,
    scores_agree,
    tennis_sets_from_json,
)
from app.services.people import people_out
from app.services.scoring import outcome_for, team_points, tennis_points

__all__ = ['MatchFacts', 'match_cards', 'match_detail', 'needs_my_action', 'permissions_for', 'report_score',
           'result_state_of', 'sides_out', 'stat_locked']

# Athletes of a football match: the roster (representatives and members) and the walk-ins.
STAT_ROLES = ('representante', 'membro', 'avulso')
# Roles that earn the team points of the result pill (a walk-in earns individual points).
TEAM_ROLES = ('representante', 'membro', 'atleta')
RESULT_STATES = ('agendada', 'realizada', 'encerrada', 'sem_resultado')


# ----- Pure rules --------------------------------------------------------------------------------------------

def _winner(score_a: int, score_b: int) -> str | None:
    return 'a' if score_a > score_b else 'b' if score_b > score_a else None


def report_score(report: Any) -> Score:
    """The score a side reported (`match_results` row), comparable with the other side's."""
    return Score(report.score_a, report.score_b, _winner(report.score_a, report.score_b),
                 tennis_sets_from_json(report.sets))


def stat_locked(stat: Any) -> bool:
    """The athlete cannot send or edit this stat any more: a contested one waits for the review of their
    representative, and a contested one already reviewed again is final (`PUT /matches/{id}/my-stats` answers 409)."""
    return stat.state == 'contestada' or (stat.state == 'revisada' and stat.contested_at is not None)


def can_see_report(match: Any, access: MatchAccess, reports: Mapping, side: str) -> bool:
    """Same visibility for the score and every value derived from it (including the points preview)."""
    return (side == access.side or access.side is None or match.state != 'agendada'
            or access.side in reports)


@dataclass(frozen=True)
class MatchFacts:
    """Rows, besides the match and the viewer's access, that the viewer's permissions depend on."""
    sides: Mapping[str, Any] = field(default_factory=dict)       # MatchSide per side
    pending_terms: Any | None = None                              # the pending MatchTerms
    reports: Mapping[str, Any] = field(default_factory=dict)     # MatchResult per side
    lineup: Any | None = None                                     # the viewer's MatchLineup
    stat: Any | None = None                                       # the viewer's FootballStat

    @property
    def reports_differ(self) -> bool:
        """Both sides reported and the scores are not the same (phase 'divergente')."""
        return len(self.reports) == 2 and not scores_agree(report_score(self.reports['a']),
                                                           report_score(self.reports['b']))


def permissions_for(match: Any, access: MatchAccess | None, facts: MatchFacts, *,
                    now: datetime) -> MatchPermissionsOut:
    """What the viewer can do in the match now (the web shows or hides the actions with these flags).

    Mirrors the rules of the routes in docs/decisoes/0002-jogar.md, sections 8 and 10 to 12: chat by state and
    role; everything else only for who acts for a side (representative or tennis athlete), on the stored state
    and the 48 h window. The administration and the organizer never act for a side here."""
    if access is None or access.role == 'historico':
        return MatchPermissionsOut(**dict.fromkeys(MatchPermissionsOut.model_fields, False))
    side, role, acts = access.side, access.role, access.acts_for_side
    friendly = match.origin == 'amistoso'
    football = match.sport == 'futebol'
    scheduled = match.state == 'agendada'
    walkover = match.walkover_absent_side is not None
    window = result_window_open(match.starts_at, now)
    # Terms change while the match is being arranged or before the start (RN05).
    terms_open = match.state == 'combinando' or (scheduled and match.starts_at is not None and now < match.starts_at)
    pending = facts.pending_terms
    can_accept = (acts and friendly and terms_open and pending is not None and pending.starts_at > now
                  and getattr(pending, f'accepted_{side}_at') is None)
    lineup, stat = facts.lineup, facts.stat
    # The organizer of a championship match does not act for a side: he schedules (both sides known, before the
    # start) and decides the result (after the start); the chat is his like anyone's in the match.
    organizer = role == 'organizador' and not friendly
    return MatchPermissionsOut(
        read_chat=can_read_chat(match, access),
        write_chat=can_write_chat(match, access),
        propose_terms=acts and friendly and terms_open,
        accept_terms=bool(can_accept),
        # Like the terms: while the match is being arranged or before the start (the route says the same).
        suggest_court=acts and friendly and terms_open,
        confirm_booking=(acts and scheduled and match.starts_at is not None and now < match.starts_at
                         and match.booking_side == side),
        cancel=acts and friendly and cancel_error(match.state, match.starts_at, now) is None,
        report_result=acts and scheduled and window and not walkover,
        register_walkover=(acts and friendly and scheduled and window and not walkover
                           and other_side(side) not in facts.reports),
        withdraw_walkover=(acts and scheduled and window and walkover and match.walkover_contested_at is None
                           and side == other_side(match.walkover_absent_side)),
        contest_walkover=(acts and scheduled and window and walkover and match.walkover_contested_at is None
                          and side == match.walkover_absent_side),
        attendance=(role == 'representante' and football and window and match.state in ('agendada', 'realizada')
                    and match.walkover_absent_side != side),
        send_stats=(role in STAT_ROLES and football and window and match.state in ('agendada', 'realizada')
                    and not walkover and (lineup is None or lineup.present is not False)
                    and (stat is None or not stat_locked(stat))),
        manage_slots=role == 'representante' and football and friendly and terms_open,
        schedule_match=(organizer and len(facts.sides) == 2 and (match.state == 'combinando' or (
            scheduled and match.starts_at is not None and now < match.starts_at))),
        decide_result=organizer and scheduled and match.starts_at is not None and now >= match.starts_at)


def needs_my_action(match: Any, access: MatchAccess | None, permissions: MatchPermissionsOut, facts: MatchFacts, *,
                    now: datetime) -> bool:
    """Accept the proposal or the terms, report (or correct) the score, contest a walkover or send the stats.

    Proposing terms, confirming the booking, cancelling and attendance are possible actions, not pending ones."""
    if access is None:
        return False
    if effective_match_state(match.state, match.proposal_expires_at, now) == 'proposta':
        mine = facts.sides.get(access.side) if access.side is not None else None
        return bool(access.acts_for_side and mine is not None and mine.accepted_at is None
                    and mine.declined_at is None)
    if access.role == 'organizador':
        overdue = match.result_deadline is not None and now >= match.result_deadline
        return bool((permissions.schedule_match and match.starts_at is None)
                    or (permissions.decide_result and (facts.reports_differ or overdue)))
    if permissions.accept_terms or permissions.contest_walkover:
        return True
    if permissions.report_result and (access.side not in facts.reports or facts.reports_differ):
        return True
    return permissions.send_stats and facts.stat is None


def result_state_of(match: Any, facts: MatchFacts) -> str:
    """State of the result card (S1): walkover first, then the confirmed score, then the reports of the sides."""
    if match.walkover_absent_side is not None and match.state == 'agendada':
        return 'wo_contestado' if match.walkover_contested_at is not None else 'wo_registrado'
    if match.score_a is not None:
        return 'confirmado'
    if match.state == 'sem_resultado':
        return 'sem_resultado'
    return 'divergente' if facts.reports_differ else 'aguardando'


def _has_result_view(match: Any, now: datetime) -> bool:
    """The result card exists from the start of the match on (and for closed matches)."""
    if match.state not in RESULT_STATES or match.result_deadline is None:
        return False
    return match.state != 'agendada' or (match.starts_at is not None and now >= match.starts_at)


def _team_ref(team: Team) -> TeamRefOut:
    return TeamRefOut(id=team.id, name=team.name, initials=team.initials, crest_url=team.crest_url)


def _declared_slots(side: Any) -> OpenSlotsOut | None:
    """The walk-in spots the side declared when searching, per position; null when it declared none."""
    declared = side.declared_slots or {}
    counts = {position: int(declared.get(position, 0)) for position in POSITIONS}
    return OpenSlotsOut(**counts) if any(counts.values()) else None


def _side_out(side: Any, teams: Mapping[int, Team], people: Mapping[int, PersonOut],
              my_side: str | None, *, declared: bool = False) -> MatchSideOut:
    """`declared`: the match is still a proposal or being arranged, so the declared spots are shown (once it is
    scheduled they live in the match's slots)."""
    team = teams.get(side.team_id) if side.team_id is not None else None
    return MatchSideOut(
        side=side.side, kind='time' if side.team_id is not None else 'atleta',
        team=_team_ref(team) if team is not None else None,
        athlete=people.get(side.user_id) if side.user_id is not None else None,
        # Stored at pairing, null in placement: a tier is never shown for who is still being classified.
        tier=side.tier if side.tier in TIERS else None,
        accepted_at=side.accepted_at, is_mine=my_side is not None and side.side == my_side,
        declared_slots=_declared_slots(side) if declared else None)


def _teams(db: Session, team_ids: Iterable[int | None]) -> dict[int, Team]:
    ids = {team_id for team_id in team_ids if team_id is not None}
    return {team.id: team for team in db.scalars(select(Team).where(Team.id.in_(ids)))} if ids else {}


def sides_out(db: Session, viewer: User, sides: Mapping[int, Mapping[str, MatchSide]], *,
              my_sides: Mapping[int, str | None] | None = None) -> dict[int, list[MatchSideOut]]:
    """The sides of several matches ([a, b], the ones that exist) for proposals, offers and other cards:
    teams and athletes in a fixed number of queries; `my_sides` gives the viewer's side per match."""
    rows = [side for by_side in sides.values() for side in by_side.values()]
    teams = _teams(db, (side.team_id for side in rows))
    people = people_out(db, viewer, (side.user_id for side in rows))
    mine = my_sides or {}
    return {match_id: [_side_out(by_side[key], teams, people, mine.get(match_id)) for key in ('a', 'b')
                       if key in by_side] for match_id, by_side in sides.items()}


def _offered_sides(db: Session, viewer: User, match_ids: Sequence[int]) -> dict[int, str]:
    """Matches where the viewer holds a pending slot offer (a walk-in sees the card before accepting)."""
    rows = db.execute(select(MatchSlot.match_id, MatchSlot.side).join(
        MatchSearch, MatchSearch.slot_id == MatchSlot.id).where(
        MatchSlot.match_id.in_(match_ids), MatchSlot.state == 'oferecida', MatchSearch.user_id == viewer.id,
        MatchSearch.state == 'pareada')).all()
    return {match_id: side for match_id, side in rows}


# ----- Loading -----------------------------------------------------------------------------------------------

class _Sheet:
    """Rows needed to serialize a batch of matches for one viewer, loaded in a fixed number of queries."""

    def __init__(self, db: Session, viewer: User, matches: Sequence[Match], *, now: datetime, detail: bool,
                 sides: Mapping[int, Mapping[str, MatchSide]] | None = None,
                 access: Mapping[int, MatchAccess | None] | None = None):
        self.viewer, self.now, self.detail = viewer, now, detail
        unique = list({match.id: match for match in matches}.values())
        ids = [match.id for match in unique]
        given_sides, given_access = sides or {}, access or {}
        self.sides: dict[int, Mapping[str, MatchSide]] = {i: given_sides[i] for i in ids if i in given_sides}
        missing = [i for i in ids if i not in self.sides]
        if missing:
            self.sides.update(load_sides(db, missing))
        self.access: dict[int, MatchAccess | None] = {i: given_access[i] for i in ids if i in given_access}
        todo = [match for match in unique if match.id not in self.access]
        if todo:
            self.access.update(match_accesses(db, todo, viewer, sides=self.sides))
        # A walk-in with a pending offer sees the card of the match without being in it (cards only).
        self.offered: dict[int, str] = {}
        unresolved = [i for i in ids if self.access.get(i) is None]
        if unresolved and not detail:
            self.offered = _offered_sides(db, viewer, unresolved)
            self.access.update({match_id: MatchAccess('avulso', side) for match_id, side in self.offered.items()})
        if any(self.access.get(i) is None for i in ids):
            raise HTTPException(404, 'Partida não encontrada.')

        def in_states(*states: str) -> list[int]:
            return [match.id for match in unique if match.state in states]

        report_ids = in_states(*RESULT_STATES) if detail else in_states('agendada')
        self.reports: dict[int, dict[str, MatchResult]] = {i: {} for i in report_ids}
        if report_ids:
            for row in db.scalars(select(MatchResult).where(MatchResult.match_id.in_(report_ids))):
                self.reports[row.match_id][row.side] = row

        term_ids = ids if detail else in_states('combinando', 'agendada')
        term_states = ('pendente', 'aceita') if detail else ('pendente',)
        terms = db.scalars(select(MatchTerms).where(MatchTerms.match_id.in_(term_ids),
                                                    MatchTerms.state.in_(term_states))
                           .order_by(MatchTerms.id)).all() if term_ids else []
        self.pending = {item.match_id: item for item in terms if item.state == 'pendente'}
        self.accepted = {item.match_id: item for item in terms if item.state == 'aceita'}

        # The viewer's own appearance and stats decide the stats permission (football, open window only).
        stat_ids = [match.id for match in unique if match.sport == 'futebol'
                    and match.state in ('agendada', 'realizada')]
        self.lineups = {row.match_id: row for row in db.scalars(select(MatchLineup).where(
            MatchLineup.match_id.in_(stat_ids), MatchLineup.user_id == viewer.id))} if stat_ids else {}
        self.stats = {row.match_id: row for row in db.scalars(select(FootballStat).where(
            FootballStat.match_id.in_(stat_ids), FootballStat.user_id == viewer.id))} if stat_ids else {}

        self.slots: dict[int, list[MatchSlot]] = {i: [] for i in ids}
        if detail:
            for slot in db.scalars(select(MatchSlot).where(MatchSlot.match_id.in_(ids), MatchSlot.state != 'fechada')
                                   .order_by(MatchSlot.id)):
                self.slots[slot.match_id].append(slot)
            for slots in self.slots.values():
                slots.sort(key=lambda slot: (slot.side, POSITIONS.index(slot.position), slot.id))
        event_ids = {match.event_id for match in unique if match.event_id is not None} if detail else set()
        self.events = dict(db.execute(select(Event.id, Event.name).where(Event.id.in_(event_ids))).all()
                           ) if event_ids else {}

        court_ids = {match.court_id for match in unique if match.court_id is not None}
        court_ids |= {item.court_id for item in (*self.pending.values(), *self.accepted.values())}
        self.courts = {court.id: court for court in db.scalars(select(Court).where(Court.id.in_(court_ids)))
                       } if court_ids else {}
        city_ids = {court.city_id for court in self.courts.values()}
        if detail:
            city_ids |= {match.city_id for match in unique}
        self.cities = {city.id: city for city in db.scalars(select(City).where(City.id.in_(city_ids)))
                       } if city_ids else {}

        sides_rows = [side for i in ids for side in self.sides[i].values()]
        self.teams = _teams(db, (side.team_id for side in sides_rows))
        people_ids: list[int | None] = [side.user_id for side in sides_rows]
        if detail:
            people_ids += [item.proposed_by_id for item in (*self.pending.values(), *self.accepted.values())]
            people_ids += [value for match in unique for value in (
                match.walkover_registered_by_id, match.walkover_contested_by_id, match.cancelled_by_id)]
            people_ids += [slot.filled_by_id for slots in self.slots.values() for slot in slots]
            people_ids += [row.reported_by_id for by_side in self.reports.values() for row in by_side.values()]
        self.people = people_out(db, viewer, people_ids)

    # ----- Pieces

    def facts(self, match: Match) -> MatchFacts:
        return MatchFacts(sides=self.sides[match.id], pending_terms=self.pending.get(match.id),
                          reports=self.reports.get(match.id, {}), lineup=self.lineups.get(match.id),
                          stat=self.stats.get(match.id))

    def court(self, court_id: int | None):
        court = self.courts.get(court_id) if court_id is not None else None
        return court_out(court, self.cities[court.city_id]) if court is not None else None

    def person(self, user_id: int | None) -> PersonOut | None:
        return self.people.get(user_id) if user_id is not None else None

    # ----- Card

    def card(self, match: Match) -> MatchCardOut:
        access = self.access[match.id]
        facts = self.facts(match)
        permissions = permissions_for(match, access, facts, now=self.now)
        by_side = self.sides[match.id]
        action = match.id not in self.offered and needs_my_action(match, access, permissions, facts, now=self.now)
        return MatchCardOut(
            id=match.id, sport=match.sport, format=match.format, origin=match.origin,
            state=effective_match_state(match.state, match.proposal_expires_at, self.now),
            phase=match_phase(match.state, now=self.now, proposal_expires_at_=match.proposal_expires_at,
                              starts_at=match.starts_at, walkover_absent_side=match.walkover_absent_side,
                              walkover_contested=match.walkover_contested_at is not None,
                              reports_differ=facts.reports_differ),
            sides=[_side_out(by_side[key], self.teams, self.people, access.side,
                             declared=match.state in ('proposta', 'combinando')) for key in ('a', 'b') if key in by_side],
            my_side=access.side, my_role=access.role, starts_at=match.starts_at, court=self.court(match.court_id),
            result_deadline=match.result_deadline,
            score=score_out(match.score_a, match.score_b, match.sets, match.winner_side),
            needs_my_action=action)

    # ----- Detail

    def terms_out(self, terms: MatchTerms | None) -> MatchTermsOut | None:
        if terms is None:
            return None
        return MatchTermsOut(
            id=terms.id, starts_at=terms.starts_at, court=self.court(terms.court_id), booking_side=terms.booking_side,
            super_tiebreak=terms.super_tiebreak, proposed_by=self.person(terms.proposed_by_id),
            proposed_by_side=terms.proposed_by_side, state=terms.state, accepted_a_at=terms.accepted_a_at,
            accepted_b_at=terms.accepted_b_at, created_at=terms.created_at)

    def result_out(self, match: Match, access: MatchAccess, facts: MatchFacts) -> MatchResultOut | None:
        if not _has_result_view(match, self.now):
            return None
        final = score_out(match.score_a, match.score_b, match.sets, match.winner_side)
        reports: dict[str, ScoreReportOut | None] = {'a': None, 'b': None}
        # Blind report (12.3): while the result is open, the other side's score stays hidden until my side has
        # reported mine (which includes the divergence, where both reported); who reports for no side (the
        # administration, the organizer) and a settled result see them all. Hidden: the report exists, `score` is null.
        for key, row in facts.reports.items():
            shown = can_see_report(match, access, facts.reports, key)
            reports[key] = ScoreReportOut(
                side=key,
                score=score_out(row.score_a, row.score_b, row.sets, _winner(row.score_a, row.score_b)) if shown else None,
                reported_by=self.person(row.reported_by_id), updated_at=row.updated_at)
        points = None
        if final is not None and access.side is not None and access.role in TEAM_ROLES:
            if match.sport == 'futebol':
                points = team_points(outcome_for(access.side, match.winner_side))
            elif match.winner_side is not None:
                points = tennis_points(outcome_for(access.side, match.winner_side))
        return MatchResultOut(
            state=result_state_of(match, facts), deadline=match.result_deadline, reports=reports, final=final,
            source=match.result_source, confirmed_at=match.result_confirmed_at,
            decision_reason=match.result_decision_reason or match.walkover_decision_reason, points=points)

    def walkover_out(self, match: Match) -> WalkoverOut | None:
        if match.walkover_absent_side is None:
            return None
        return WalkoverOut(
            absent_side=match.walkover_absent_side, registered_by=self.person(match.walkover_registered_by_id),
            registered_at=match.walkover_registered_at, contest_until=match.result_deadline,
            contested_by=self.person(match.walkover_contested_by_id), contested_at=match.walkover_contested_at,
            contest_reason=match.walkover_contest_reason, decision=match.walkover_decision,
            decision_reason=match.walkover_decision_reason)

    def detail_out(self, match: Match) -> MatchDetailOut:
        access = self.access[match.id]
        facts = self.facts(match)
        card = self.card(match)
        booking = None
        if match.booking_side is not None:
            booking = BookingOut(side=match.booking_side,
                                 state='confirmada' if match.booking_confirmed_at is not None else 'a_confirmar',
                                 confirmed_at=match.booking_confirmed_at)
        cancellation = None
        if match.cancelled_at is not None:
            cancellation = CancellationOut(at=match.cancelled_at, by=self.person(match.cancelled_by_id),
                                           reason=match.cancel_reason)
        slots = [MatchSlotOut(id=slot.id, side=slot.side, position=slot.position, state=slot.state,
                              guest=self.person(slot.filled_by_id), filled_at=slot.filled_at)
                 for slot in self.slots[match.id]]
        return MatchDetailOut(
            **{name: getattr(card, name) for name in MatchCardOut.model_fields},
            city=CityOut.model_validate(self.cities[match.city_id]),
            event=MatchEventRefOut(id=match.event_id, name=self.events[match.event_id])
            if match.event_id is not None else None,
            round_number=match.round_number,
            # The 2 h of the proposal only matter while it is one.
            proposal_expires_at=match.proposal_expires_at if match.state == 'proposta' else None,
            terms=TermsPairOut(current=self.terms_out(self.accepted.get(match.id)),
                               pending=self.terms_out(self.pending.get(match.id))),
            booking=booking, super_tiebreak=match.super_tiebreak,
            cancel_until=cancel_deadline(match.starts_at) if match.state == 'agendada' else None,
            slots=slots, result=self.result_out(match, access, facts), walkover=self.walkover_out(match),
            cancellation=cancellation, permissions=permissions_for(match, access, facts, now=self.now))


# ----- Public views ------------------------------------------------------------------------------------------

def match_cards(db: Session, user: User, matches: Sequence[Match], *, now: datetime) -> list[MatchCardOut]:
    """Cards of a page of matches for the viewer, in the order given, with a fixed number of queries.

    The matches must be the viewer's (the lists select them that way): a stranger's match raises
    `404 Partida não encontrada.`. The one exception is a walk-in holding a pending slot offer, who sees the
    card with the role 'avulso' on the side that opened the slot (`needs_my_action` stays false: the offer has
    its own answer)."""
    if not matches:
        return []
    sheet = _Sheet(db, user, matches, now=now, detail=False)
    return [sheet.card(match) for match in matches]


def match_detail(db: Session, user: User, match: Match, *, now: datetime,
                 sides: Mapping[str, MatchSide] | None = None, access: MatchAccess | None = None) -> MatchDetailOut:
    """Detail of one match for the viewer (screen P2 + C1). Routes pass the `sides` and `access` they got from
    `match_access.load_match_for` to save the queries; without them, they are loaded here (a stranger gets
    `404 Partida não encontrada.`)."""
    sheet = _Sheet(db, user, [match], now=now, detail=True,
                   sides=None if sides is None else {match.id: sides},
                   access=None if access is None else {match.id: access})
    return sheet.detail_out(match)
