"""Matchmaking queue (Jogar, fases 2 e 4): the `MatchmakingQueue` interface and its PostgreSQL implementation.

`match_searches` is the queue: every `ativa` row waits and the order comes from the query. There is no external
queue in the MVP (decided on 11 Oct 2026); Redis stays an option behind this interface, with PostgreSQL as the
source of truth. Pairing runs per bucket (`match_rules.bucket_key`) inside the caller's transaction:

1. `pg_advisory_xact_lock` on the bucket hash: searches of one bucket pair one at a time, buckets run in parallel
   and the lock holds across API instances. Two compatible searches created at the same moment are serialized
   here: whoever takes the lock second sees the first one (READ COMMITTED takes a new snapshot per statement),
   so neither stays waiting.
2. The search and the chosen candidate are re-read with `FOR UPDATE`: a search never enters two proposals, even
   with resubmissions or a concurrent cancellation (RNF06).
3. The proposal (match `proposta` with both sides), the end of both searches (`pareada`), notifications and audit
   go in the same transaction. Walk-ins get a slot offer instead (`oferecida`, held for 2 h).

The advisory lock is released at commit, so callers commit right after pairing.

Lock order of stage 3 (global; contract: docs/decisoes/0002-jogar.md, section 15.1): team → match → ranking →
bucket → slot → search. Whoever locks the match and may then pair or offer takes the bucket after it, and whoever
only reaches the queue through a slot or a search (the sweep of offers, the expiry of a lapsed offer) takes the
bucket first: nobody waits for a bucket while holding a slot or a search that a holder of the bucket wants. A
transaction holds one bucket, except the ones that must hold several (the ranking refresh and the sweep tasks), which
take them in ascending order of `bucket_lock_id` and commit between buckets when they can.
"""
from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Protocol

from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.models.identity import User
from app.models.matches import Match, MatchLineup, MatchSearch, MatchSide, MatchSlot
from app.models.rankings import Standing
from app.models.teams import Team, TeamMember
from app.services import audit, notifications
from app.services.match_access import side_users, subject_names
from app.services.match_events import post_event
from app.services.match_rules import (
    POSITION_LABELS,
    Candidate,
    TransitionError,
    bucket_key,
    bucket_lock_id,
    next_match_state,
    next_search_state,
    offer_expires_at,
    proposal_expires_at,
    rank_candidates,
)

BATCH = 500
OfferOutcome = Literal['recusada', 'sem_resposta', 'devolvida']
WithdrawalReason = Literal['vagas_reduzidas', 'partida_cancelada']


@dataclass(frozen=True)
class Pairing:
    """Result of a pairing: a proposal between two searches, or a slot offered to a walk-in."""
    kind: Literal['proposta', 'oferta']
    match: Match
    searches: tuple[MatchSearch, ...]
    slot: MatchSlot | None = None


class MatchmakingQueue(Protocol):
    """Queue operations the routes and the sweep depend on (PostgreSQL today, possibly Redis-indexed later)."""

    def enqueue(self, db: Session, search: MatchSearch, *, now: datetime) -> Pairing | None:
        """Inserts a new `ativa` search and tries to pair it at once (no commit)."""

    def try_match(self, db: Session, search: MatchSearch, *, now: datetime) -> Pairing | None:
        """Pairs a waiting search with the best compatible one of its bucket (or a slot, for a walk-in)."""

    def expire(self, db: Session, now: datetime) -> dict[str, int]:
        """Expires searches (24 h), proposals (2 h) and slot offers (2 h); returns the counts per kind."""


def _iso(moment: datetime | None) -> str | None:
    return moment.isoformat() if moment is not None else None


def _locked(db: Session, model, row_id: int | None, *, skip_locked: bool = False):
    """Re-reads one row with FOR UPDATE (optionally SKIP LOCKED) and refreshes the loaded copy."""
    if row_id is None:
        return None
    statement = select(model).where(model.id == row_id).with_for_update(skip_locked=skip_locked)
    return db.scalar(statement.execution_options(populate_existing=True))


def proposal_bucket(match: Match) -> str:
    """Bucket of the proposal of a match: both searches of a pairing share it (same kind, city and format)."""
    return bucket_key('time' if match.sport == 'futebol' else 'tenis', match.city_id, match.format)


def _involved(match_id, user_id):
    """The athlete is already in the match: in its lineup (also a removed walk-in) or an active member of a side."""
    side = aliased(MatchSide)
    in_lineup = exists().where(MatchLineup.match_id == match_id, MatchLineup.user_id == user_id)
    in_roster = exists().where(side.match_id == match_id, TeamMember.team_id == side.team_id,
                               TeamMember.user_id == user_id, TeamMember.left_at.is_(None))
    return or_(in_lineup, in_roster)


class PostgresMatchmakingQueue:
    """PostgreSQL implementation: advisory lock per bucket, `FOR UPDATE` re-reads and one transaction."""

    # ----- Locks ---------------------------------------------------------------------------------------------

    @staticmethod
    def lock_bucket(db: Session, key: str) -> None:
        """Serializes pairing in one bucket until the end of the transaction (reentrant in the same session)."""
        db.execute(select(func.pg_advisory_xact_lock(bucket_lock_id(key))))

    # ----- Enqueue and pair ----------------------------------------------------------------------------------

    def enqueue(self, db: Session, search: MatchSearch, *, now: datetime) -> Pairing | None:
        """Inserts the search (unique open search per subject and sport: IntegrityError for the caller) and tries
        to pair it in the same transaction."""
        if search.state != 'ativa':
            raise ValueError('Só buscas ativas entram na fila.')
        db.add(search)
        db.flush()
        return self.try_match(db, search, now=now)

    def try_match(self, db: Session, search: MatchSearch, *, now: datetime) -> Pairing | None:
        self.lock_bucket(db, bucket_key(search.kind, search.city_id, search.format))
        current = self._waiting_search(db, search.id, now)
        if current is None or current.state != 'ativa' or current.expires_at <= now:
            return None
        if current.kind == 'avulso':
            return self._offer_to_walkin(db, current, now)
        for candidate in self._candidates(db, current, now):
            other = self._waiting_search(db, candidate.id, now)
            if other is None or other.state != 'ativa' or other.expires_at <= now:
                continue
            return self._propose(db, other, current, now)
        return None

    @staticmethod
    def _waiting_search(db: Session, search_id: int, now: datetime) -> MatchSearch | None:
        """Recheck the subject when locking a waiting search, including the one the sweep starts from."""
        active_subject = or_(
            exists().where(Team.id == MatchSearch.team_id, Team.state == 'ativo'),
            exists().where(User.id == MatchSearch.user_id, User.active.is_(True)))
        return db.scalar(select(MatchSearch).where(
            MatchSearch.id == search_id, MatchSearch.state == 'ativa', MatchSearch.expires_at > now,
            active_subject).with_for_update().execution_options(populate_existing=True))

    def _candidates(self, db: Session, current: MatchSearch, now: datetime) -> list[MatchSearch]:
        """Waiting searches of the bucket in pairing order: same tier, neighbour, then the oldest.

        Teams that share an active representative never face each other (the same person would accept both
        sides); closed teams and inactive accounts are skipped."""
        statement = select(MatchSearch).where(
            MatchSearch.state == 'ativa', MatchSearch.kind == current.kind, MatchSearch.city_id == current.city_id,
            MatchSearch.id != current.id, MatchSearch.expires_at > now)
        if current.kind == 'time':
            representatives = select(TeamMember.user_id).where(
                TeamMember.team_id == current.team_id, TeamMember.role == 'representante', TeamMember.left_at.is_(None))
            shared = select(TeamMember.team_id).where(
                TeamMember.user_id.in_(representatives), TeamMember.role == 'representante',
                TeamMember.left_at.is_(None))
            statement = statement.join(Team, Team.id == MatchSearch.team_id).where(
                MatchSearch.format == current.format, Team.state == 'ativo', MatchSearch.team_id.not_in(shared))
        else:
            statement = statement.join(User, User.id == MatchSearch.user_id).where(
                User.active.is_(True), MatchSearch.user_id != current.user_id)
        rows = db.scalars(statement.order_by(MatchSearch.started_at, MatchSearch.id)).all()
        return rank_candidates(Candidate(row, current.tier, row.tier, row.started_at, row.id) for row in rows)

    def _propose(self, db: Session, waiting: MatchSearch, newcomer: MatchSearch, now: datetime) -> Pairing:
        """Creates the proposal (side A = the search that waited) and takes both searches out of the queue."""
        match = Match(sport=newcomer.sport, format=newcomer.format, city_id=newcomer.city_id, origin='amistoso',
                      state='proposta', proposal_expires_at=proposal_expires_at(now), created_at=now, updated_at=now)
        db.add(match)
        db.flush()
        sides = []
        for label, search in (('a', waiting), ('b', newcomer)):
            side = MatchSide(match_id=match.id, side=label, team_id=search.team_id, user_id=search.user_id,
                             search_id=search.id, tier=search.tier, created_at=now,
                             declared_slots=dict(search.open_slots) if search.open_slots is not None else None)
            db.add(side)
            sides.append(side)
            search.state = next_search_state(search.state, 'parear')
            search.match_id = match.id
            search.updated_at = now
        db.flush()
        names = subject_names(db, sides)
        actors = side_users(db, sides)
        for side, other in ((sides[0], sides[1]), (sides[1], sides[0])):
            notifications.notify_many(db, actors[side.id], 'proposta_partida', {
                'match_id': match.id, 'sport': match.sport, 'format': match.format, 'opponent_name': names[other.id],
                'expires_at': _iso(match.proposal_expires_at)})
        audit.record(db, actor_id=None, action='partida.proposta_criada', target_type='match', target_id=match.id,
                     data={'search_ids': [waiting.id, newcomer.id], 'automatico': True})
        return Pairing('proposta', match, (waiting, newcomer))

    # ----- Walk-ins (RN06) -----------------------------------------------------------------------------------

    @staticmethod
    def _walkin_tiers(db: Session, user_ids: Iterable[int]) -> dict[tuple[int, str, str], str | None]:
        """Individual football tiers {(user, position, format): tier}; missing means placement (any level)."""
        ids = list(dict.fromkeys(user_ids))
        if not ids:
            return {}
        rows = db.execute(select(Standing.user_id, Standing.position, Standing.format, Standing.tier).where(
            Standing.user_id.in_(ids), Standing.sport == 'futebol', Standing.position.is_not(None))).all()
        return {(user_id, position, format_): tier for user_id, position, format_, tier in rows}

    def _offer_to_walkin(self, db: Session, search: MatchSearch, now: datetime) -> Pairing | None:
        """First compatible open slot of a scheduled match of the city: the walk-in's tier in the slot's position
        and format against the tier of the team that opened it."""
        statement = (
            select(MatchSlot, Match, MatchSide)
            .join(Match, Match.id == MatchSlot.match_id)
            .join(MatchSide, (MatchSide.match_id == MatchSlot.match_id) & (MatchSide.side == MatchSlot.side))
            .where(MatchSlot.state == 'aberta', Match.state == 'agendada', Match.sport == 'futebol',
                   Match.city_id == search.city_id, Match.starts_at > now, ~_involved(Match.id, search.user_id)))
        if search.position is not None:
            statement = statement.where(MatchSlot.position == search.position)
        rows = db.execute(statement.order_by(MatchSlot.opened_at, MatchSlot.id)).all()
        tiers = self._walkin_tiers(db, [search.user_id])
        ranked = rank_candidates(
            Candidate((slot, match, side), tiers.get((search.user_id, slot.position, match.format)), side.tier,
                      slot.opened_at, slot.id) for slot, match, side in rows)
        for slot, match, side in ranked:
            held = _locked(db, MatchSlot, slot.id)
            if held is None or held.state != 'aberta':
                continue
            return self._offer(db, search, held, match, side, now)
        return None

    def offer_slots(self, db: Session, match: Match, *, now: datetime) -> list[Pairing]:
        """Offers the open slots of a scheduled match to waiting walk-ins (called when slots open or reopen)."""
        if match.sport != 'futebol' or match.state != 'agendada' or match.starts_at is None or match.starts_at <= now:
            return []
        self.lock_bucket(db, bucket_key('avulso', match.city_id))
        sides = {side.side: side for side in db.scalars(select(MatchSide).where(MatchSide.match_id == match.id))}
        slots = db.scalars(select(MatchSlot).where(MatchSlot.match_id == match.id, MatchSlot.state == 'aberta')
                           .order_by(MatchSlot.opened_at, MatchSlot.id).with_for_update()
                           .execution_options(populate_existing=True)).all()
        pairings = []
        for slot in slots:
            side = sides[slot.side]
            rows = db.scalars(
                select(MatchSearch).join(User, User.id == MatchSearch.user_id)
                .where(MatchSearch.kind == 'avulso', MatchSearch.state == 'ativa', MatchSearch.city_id == match.city_id,
                       MatchSearch.expires_at > now, User.active.is_(True),
                       or_(MatchSearch.position.is_(None), MatchSearch.position == slot.position),
                       ~_involved(match.id, MatchSearch.user_id))
                .order_by(MatchSearch.started_at, MatchSearch.id)).all()
            tiers = self._walkin_tiers(db, [row.user_id for row in rows])
            ranked = rank_candidates(Candidate(row, tiers.get((row.user_id, slot.position, match.format)), side.tier,
                                               row.started_at, row.id) for row in rows)
            for row in ranked:
                search = self._waiting_search(db, row.id, now)
                if search is None or search.state != 'ativa' or search.expires_at <= now:
                    continue
                pairings.append(self._offer(db, search, slot, match, side, now))
                break
        return pairings

    def _offer(self, db: Session, search: MatchSearch, slot: MatchSlot, match: Match, side: MatchSide,
               now: datetime) -> Pairing:
        slot.state = 'oferecida'
        search.state = next_search_state(search.state, 'parear')
        search.slot_id = slot.id
        search.offer_expires_at = offer_expires_at(now, match.starts_at)
        search.updated_at = now
        db.flush()
        team_name = db.scalar(select(Team.name).where(Team.id == side.team_id)) or ''
        notifications.notify(db, search.user_id, 'vaga_encontrada', {
            'match_id': match.id, 'slot_id': slot.id, 'position': slot.position, 'format': match.format,
            'team_name': team_name, 'starts_at': _iso(match.starts_at), 'expires_at': _iso(search.offer_expires_at)})
        audit.record(db, actor_id=None, action='vaga.oferecida', target_type='match_slot', target_id=slot.id,
                     data={'match_id': match.id, 'search_id': search.id, 'automatico': True})
        return Pairing('oferta', match, (search,), slot)

    def _offered_search(self, db: Session, slot_id: int, user_id: int) -> MatchSearch | None:
        return db.scalar(select(MatchSearch).where(MatchSearch.slot_id == slot_id, MatchSearch.user_id == user_id,
                                                   MatchSearch.kind == 'avulso', MatchSearch.state == 'pareada'))

    def accept_offer(self, db: Session, slot_id: int, user: User, *, now: datetime) -> MatchLineup | None:
        """'Quero jogar': fills the held slot atomically and puts the walk-in in the lineup as a guest of that
        match only (RN06). None when the slot is not offered to this user (404 for the route).

        Locks match → slot → search; a slot filled twice is impossible (state check under lock and the unique
        index of one filled slot per athlete and match)."""
        offered = self._offered_search(db, slot_id, user.id)
        if offered is None:
            return None
        slot_row = db.get(MatchSlot, slot_id)
        match = _locked(db, Match, slot_row.match_id)
        slot = _locked(db, MatchSlot, slot_id)
        search = _locked(db, MatchSearch, offered.id)
        if search.state != 'pareada' or search.slot_id != slot.id or slot.state != 'oferecida':
            raise TransitionError('Esta vaga não está mais reservada para você.')
        if search.offer_expires_at is None or search.offer_expires_at <= now:
            raise TransitionError('O prazo para aceitar esta vaga acabou.')
        if match.state != 'agendada' or match.starts_at is None or match.starts_at <= now:
            raise TransitionError('Esta partida não recebe mais avulsos.')
        side = db.scalar(select(MatchSide).where(MatchSide.match_id == match.id, MatchSide.side == slot.side))
        slot.state, slot.filled_by_id, slot.filled_at = 'preenchida', user.id, now
        search.state = next_search_state(search.state, 'concluir')
        search.match_id, search.ended_at, search.updated_at = match.id, now, now
        lineup = MatchLineup(match_id=match.id, side=slot.side, user_id=user.id, team_id=side.team_id, guest=True,
                             slot_id=slot.id, position=slot.position, created_at=now, updated_at=now)
        db.add(lineup)
        db.flush()
        notifications.notify_many(db, side_users(db, [side])[side.id], 'vaga_preenchida', {
            'match_id': match.id, 'slot_id': slot.id, 'position': slot.position}, actor_id=user.id)
        post_event(db, match.id, 'avulso_entrou',
                   f'{user.name} entrou como avulso ({POSITION_LABELS[slot.position]}).', side=slot.side,
                   payload={'user_id': user.id, 'slot_id': slot.id, 'position': slot.position}, now=now)
        audit.record(db, actor_id=user.id, action='vaga.preenchida', target_type='match_slot', target_id=slot.id,
                     data={'match_id': match.id, 'search_id': search.id, 'position': slot.position})
        return lineup

    def decline_offer(self, db: Session, slot_id: int, user: User, *, now: datetime) -> bool:
        """The walk-in refuses the slot: the search ends ('recusada') and the slot goes to the next walk-in."""
        offered = self._offered_search(db, slot_id, user.id)
        if offered is None:
            return False
        slot = _locked(db, MatchSlot, slot_id)
        search = _locked(db, MatchSearch, offered.id)
        if search.state != 'pareada' or search.slot_id != slot_id:
            raise TransitionError('Esta vaga não está mais reservada para você.')
        self.release_offer(db, search, slot, outcome='recusada', now=now, actor_id=user.id)
        self.offer_slots(db, db.get(Match, slot.match_id), now=now)
        return True

    def release_offer(self, db: Session, search: MatchSearch, slot: MatchSlot | None, *, outcome: OfferOutcome,
                      now: datetime, actor_id: int | None = None,
                      reason: WithdrawalReason = 'vagas_reduzidas') -> None:
        """Ends a slot offer (caller locked slot and search). Refused or unanswered: the search ends and the slot
        reopens. 'devolvida' (the slot closed or the match was cancelled, `reason` says which): the search returns
        to the queue, the walk-in is told the offer was withdrawn (`oferta_retirada`) and the caller closes the
        slot."""
        if outcome == 'devolvida':
            requeued = self.requeue(db, search, now=now)
            if slot is not None:
                self._tell_withdrawn(db, search, slot, reason=reason, requeued=requeued, actor_id=actor_id)
        else:
            search.state = next_search_state(search.state, 'recusar' if outcome == 'recusada' else 'sem_resposta')
            search.ended_at, search.updated_at = now, now
            if slot is not None and slot.state == 'oferecida':
                slot.state = 'aberta'
        audit.record(db, actor_id=actor_id, action=f'vaga.oferta_{outcome}', target_type='match_slot',
                     target_id=slot.id if slot is not None else None,
                     data={'search_id': search.id, **({'automatico': True} if actor_id is None else {})})

    @staticmethod
    def _tell_withdrawn(db: Session, search: MatchSearch, slot: MatchSlot, *, reason: WithdrawalReason,
                        requeued: bool, actor_id: int | None) -> None:
        team_name = db.scalar(select(Team.name).join(MatchSide, MatchSide.team_id == Team.id).where(
            MatchSide.match_id == slot.match_id, MatchSide.side == slot.side)) or ''
        notifications.notify(db, search.user_id, 'oferta_retirada', {
            'match_id': slot.match_id, 'slot_id': slot.id, 'position': slot.position, 'team_name': team_name,
            'reason': reason, 'requeued': requeued}, actor_id=actor_id)

    # ----- Proposal lifecycle --------------------------------------------------------------------------------

    def requeue(self, db: Session, search: MatchSearch, *, now: datetime) -> bool:
        """Back to the queue with its original 24 h (True), or expired if they are over (False)."""
        if search.expires_at > now:
            search.state = next_search_state(search.state, 'voltar_a_fila')
            search.match_id = search.slot_id = search.offer_expires_at = None
            search.updated_at = now
            return True
        search.state = next_search_state(search.state, 'expirar')
        search.ended_at, search.updated_at = now, now
        return False

    def accept_proposal(self, db: Session, match: Match, side_label: str, user: User, *, now: datetime) -> bool:
        """A representative (or the tennis player) accepts for one side; idempotent for a side that accepted.
        The caller locked the match and checked the role. Returns True when both sides accepted: the match goes to
        'combinando', the chat opens and both searches end as 'concluida'."""
        if match.state != 'proposta' or match.proposal_expires_at is None or match.proposal_expires_at <= now:
            raise TransitionError('Esta proposta não está mais aberta.')
        sides = {side.side: side for side in db.scalars(select(MatchSide).where(MatchSide.match_id == match.id))}
        mine, other = sides[side_label], sides['b' if side_label == 'a' else 'a']
        if mine.accepted_at is not None:
            return False
        mine.accepted_at, mine.accepted_by_id = now, user.id
        complete = other.accepted_at is not None
        names = subject_names(db, sides.values())
        audit.record(db, actor_id=user.id, action='partida.proposta_aceita', target_type='match', target_id=match.id,
                     data={'side': side_label, 'complete': complete})
        if not complete:
            notifications.notify_many(db, side_users(db, [other])[other.id], 'proposta_aceita', {
                'match_id': match.id, 'opponent_name': names[mine.id], 'complete': False}, actor_id=user.id)
            return False
        match.state = next_match_state(match.state, 'aceitar_proposta')
        match.updated_at = now
        searches = db.scalars(select(MatchSearch).where(MatchSearch.id.in_(
            [side.search_id for side in sides.values() if side.search_id is not None])).order_by(MatchSearch.id)
            .with_for_update().execution_options(populate_existing=True)).all()
        for search in searches:
            if search.state == 'pareada' and search.match_id == match.id:
                search.state = next_search_state(search.state, 'concluir')
                search.ended_at, search.updated_at = now, now
        members = side_users(db, list(sides.values()), scope='membros')
        for side, opponent in ((mine, other), (other, mine)):
            notifications.notify_many(db, members[side.id], 'proposta_aceita', {
                'match_id': match.id, 'opponent_name': names[opponent.id], 'complete': True}, actor_id=user.id)
        post_event(db, match.id, 'partida_combinando',
                   'Proposta aceita pelos dois lados. Combinem dia, horário e quadra.', now=now)
        return True

    def dissolve_proposal(self, db: Session, match: Match, *, outcome: Literal['recusada', 'expirada'],
                          now: datetime, actor_id: int | None = None,
                          declined_side: str | None = None) -> list[MatchSearch]:
        """Ends a proposal (the caller locked the match in 'proposta'). Declined: the side that declined ends its
        search and the other side returns to the queue. Expired: a side that had accepted returns to the queue with
        its original deadline; a side that did not answer ends ('sem_resposta'). Returns the requeued searches; the
        caller pairs them again (`try_match`). Takes the bucket of the proposal before the searches (lock order)."""
        self.lock_bucket(db, proposal_bucket(match))
        match.state = next_match_state(match.state, 'recusar_proposta' if outcome == 'recusada' else 'expirar_proposta')
        match.closed_at = match.updated_at = now
        sides = db.scalars(select(MatchSide).where(MatchSide.match_id == match.id).order_by(MatchSide.side)).all()
        ids = [side.search_id for side in sides if side.search_id is not None]
        searches = {search.id: search for search in db.scalars(
            select(MatchSearch).where(MatchSearch.id.in_(ids)).order_by(MatchSearch.id).with_for_update()
            .execution_options(populate_existing=True)).all()} if ids else {}
        names = subject_names(db, sides)
        actors = side_users(db, sides)
        requeued: list[MatchSearch] = []
        for side in sides:
            opponent = next(item for item in sides if item is not side)
            if outcome == 'recusada' and side.side == declined_side:
                side.declined_at, side.declined_by_id = now, actor_id
                ending = 'recusar'
            elif outcome == 'expirada' and side.accepted_at is None:
                ending = 'sem_resposta'
            else:
                ending = None
            search = searches.get(side.search_id)
            back = False
            if search is not None and search.state == 'pareada' and search.match_id == match.id:
                if ending is None:
                    back = self.requeue(db, search, now=now)
                    if back:
                        requeued.append(search)
                else:
                    search.state = next_search_state(search.state, ending)
                    search.ended_at, search.updated_at = now, now
            notifications.notify_many(db, actors[side.id], 'proposta_encerrada', {
                'match_id': match.id, 'opponent_name': names[opponent.id], 'reason': outcome, 'requeued': back},
                actor_id=actor_id)
        data = {'requeued_search_ids': [search.id for search in requeued]}
        data.update({'side': declined_side} if declined_side else {'automatico': True} if actor_id is None else {})
        audit.record(db, actor_id=actor_id, action=f'partida.proposta_{outcome}', target_type='match',
                     target_id=match.id, data=data)
        return requeued

    def decline_proposal(self, db: Session, match: Match, side_label: str, user: User, *,
                         now: datetime) -> list[Pairing]:
        """'Recusar': ends the decliner's search and pairs the other side again at once (caller locked the match)."""
        if match.state != 'proposta' or match.proposal_expires_at is None or match.proposal_expires_at <= now:
            raise TransitionError('Esta proposta não está mais aberta.')
        requeued = self.dissolve_proposal(db, match, outcome='recusada', now=now, actor_id=user.id,
                                          declined_side=side_label)
        return [pairing for search in requeued if (pairing := self.try_match(db, search, now=now)) is not None]

    # ----- Expiry (sweep) ------------------------------------------------------------------------------------

    def expire_searches(self, db: Session, now: datetime) -> int:
        """Waiting searches past their 24 h become 'expirada' (rows locked with SKIP LOCKED; idempotent)."""
        rows = db.scalars(select(MatchSearch).where(MatchSearch.state == 'ativa', MatchSearch.expires_at <= now)
                          .order_by(MatchSearch.expires_at, MatchSearch.id).limit(BATCH)
                          .with_for_update(skip_locked=True)).all()
        for search in rows:
            search.state = next_search_state(search.state, 'expirar')
            search.ended_at = search.updated_at = now
            audit.record(db, actor_id=None, action='busca.expirada', target_type='match_search', target_id=search.id,
                         data={'automatico': True})
        return len(rows)

    def expire_proposals(self, db: Session, now: datetime, *, commit: Callable[[], None] | None = None) -> int:
        """Proposals past their 2 h end; the side that accepted returns to the queue and is paired again.

        One proposal at a time (match, then its bucket, then its searches), committing after each when `commit` is
        given, so a sweep never holds the buckets of several cities at once. A busy match waits for the next run."""
        due = db.scalars(select(Match.id).where(Match.state == 'proposta', Match.proposal_expires_at <= now)
                         .order_by(Match.proposal_expires_at, Match.id).limit(BATCH)).all()
        ended = 0
        for match_id in due:
            match = _locked(db, Match, match_id, skip_locked=True)
            if (match is None or match.state != 'proposta' or match.proposal_expires_at is None
                    or match.proposal_expires_at > now):
                continue
            for search in self.dissolve_proposal(db, match, outcome='expirada', now=now):
                self.try_match(db, search, now=now)
            ended += 1
            if commit is not None:
                commit()
        return ended

    def expire_offers(self, db: Session, now: datetime, *, commit: Callable[[], None] | None = None) -> int:
        """Slot offers past their deadline: the walk-in's search ends ('sem_resposta') and the slot goes to the
        next walk-in. Bucket by bucket, in ascending lock id and committing after each when `commit` is given: the
        bucket of the city comes first, then the slot, then the search (SKIP LOCKED; a busy row waits for the next
        run), the same order as the routes that release or open slots."""
        due = db.execute(select(MatchSearch.id, MatchSearch.slot_id, MatchSearch.city_id).where(
            MatchSearch.kind == 'avulso', MatchSearch.state == 'pareada', MatchSearch.offer_expires_at <= now)
            .order_by(MatchSearch.offer_expires_at, MatchSearch.id).limit(BATCH)).all()
        buckets: dict[str, list[tuple[int, int]]] = {}
        for search_id, slot_id, city_id in due:
            buckets.setdefault(bucket_key('avulso', city_id), []).append((search_id, slot_id))
        released = 0
        for key in sorted(buckets, key=bucket_lock_id):
            self.lock_bucket(db, key)
            matches: dict[int, None] = {}
            for search_id, slot_id in buckets[key]:
                slot = _locked(db, MatchSlot, slot_id, skip_locked=True)
                search = _locked(db, MatchSearch, search_id, skip_locked=True) if slot is not None else None
                if (search is None or search.state != 'pareada' or search.slot_id != slot_id
                        or search.offer_expires_at is None or search.offer_expires_at > now):
                    continue
                self.release_offer(db, search, slot, outcome='sem_resposta', now=now)
                matches[slot.match_id] = None
                released += 1
            for match_id in matches:
                self.offer_slots(db, db.get(Match, match_id), now=now)
            if commit is not None:
                commit()
        return released

    def expire(self, db: Session, now: datetime) -> dict[str, int]:
        return {'buscas': self.expire_searches(db, now), 'propostas': self.expire_proposals(db, now),
                'ofertas': self.expire_offers(db, now)}

    # ----- Sweep: pair again bucket by bucket ---------------------------------------------------------------

    def rematch(self, db: Session, now: datetime, *, commit: Callable[[], None] | None = None) -> int:
        """Safety net: tries every waiting search again, bucket by bucket (oldest first), committing after each
        bucket when `commit` is given so locks are short. Returns how many pairings were made."""
        buckets = db.execute(select(MatchSearch.kind, MatchSearch.city_id, MatchSearch.format).where(
            MatchSearch.state == 'ativa', MatchSearch.expires_at > now).distinct()).all()
        pairings = 0
        for kind, city_id, format_ in sorted(buckets, key=lambda row: (row[0], row[1], row[2] or '')):
            format_filter = MatchSearch.format.is_(None) if format_ is None else MatchSearch.format == format_
            ids = db.scalars(select(MatchSearch.id).where(
                MatchSearch.state == 'ativa', MatchSearch.kind == kind, MatchSearch.city_id == city_id, format_filter,
                MatchSearch.expires_at > now).order_by(MatchSearch.started_at, MatchSearch.id)).all()
            for search_id in ids:
                search = db.get(MatchSearch, search_id)
                if search is not None and self.try_match(db, search, now=now) is not None:
                    pairings += 1
            if commit is not None:
                commit()
        return pairings


queue = PostgresMatchmakingQueue()
