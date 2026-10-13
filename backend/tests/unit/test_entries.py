"""Pure rules of the athlete side of events: roles, eligibility summary, flags, giving up and refunds."""
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

from app.models.events import EntryReceipt, EventEntry
from app.schemas.entries import EntryCreateInput, RefundDecisionInput, RefundResponseInput
from app.schemas.events import ReceiptOut
from app.schemas.rankings import TeamRefOut
from app.services import entries as entries_service
from app.services.entries import (
    EntryReceipts,
    can_view_receipt,
    cancel_error,
    clean_reason,
    entry_flags,
    football_eligibility,
    holding_now,
    is_open_refund,
    pick_my_entry,
    refund_waiting_answer,
    resolve_role,
    role_message,
    summary_rank,
)

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)
LIONS = TeamRefOut(id=1, name='Leões do Cerrado', initials='LC', crest_url=None)
RUST = TeamRefOut(id=2, name='Ferrugem', initials='FE', crest_url=None)


def entry(entry_id, state, *, minutes=0, until=None, origin=None):
    return EventEntry(id=entry_id, state=state, reserved_until=until, cancel_origin=origin,
                      created_at=NOW + timedelta(minutes=minutes))


def refund(response=None, *, resolution=None, sent=NOW - timedelta(days=1), kind='devolucao'):
    return EntryReceipt(id=9, kind=kind, participant_response=response, resolution=resolution, created_at=sent)


def test_roles_put_who_acts_first_and_hide_unrelated_viewers():
    assert resolve_role('atleta', organizer=True, admin=True) == 'atleta'
    assert resolve_role('representante', organizer=False, admin=True) == 'representante'
    assert resolve_role('membro', organizer=True, admin=False) == 'organizador'
    assert resolve_role(None, organizer=False, admin=True) == 'administracao'
    assert resolve_role('membro', organizer=False, admin=False) == 'membro'
    assert resolve_role(None, organizer=False, admin=False) is None
    assert [role for role in ('atleta', 'representante', 'membro', 'organizador', 'administracao', None)
            if can_view_receipt(role)] == ['atleta', 'representante', 'organizador', 'administracao']
    assert role_message('cancel', team=True) == 'Só representantes cancelam a inscrição do time.'
    assert role_message('receipt', team=False) == 'Só o atleta inscrito envia o comprovante.'


def test_football_eligibility_summarizes_the_represented_teams():
    alone = football_eligibility(None, [])
    assert (alone.eligible, alone.reason, alone.teams) == (False, 'sem_time', [])
    assert alone.message == 'Para inscrever um time, você precisa ser representante dele.'

    open_event = football_eligibility(None, [(LIONS, None, None)])
    assert (open_event.eligible, open_event.reason, open_event.teams[0].eligible) == (True, None, True)

    one_fits = football_eligibility(['prata'], [(LIONS, None, None), (RUST, 'prata', None)])
    assert one_fits.eligible and [team.reason for team in one_fits.teams] == ['em_classificacao', None]

    refused = football_eligibility(['ouro'], [(LIONS, 'prata', None), (RUST, None, None)])
    assert (refused.eligible, refused.reason, refused.message) == (False, 'fora_da_faixa', 'Este evento aceita só Ouro.')

    entered = football_eligibility(['prata'], [(LIONS, 'prata', 31)])
    assert (entered.eligible, entered.reason, entered.message, entered.teams[0].entry_id) == (False, None, None, 31)
    entered_and_refused = football_eligibility(['prata'], [(LIONS, 'prata', 31), (RUST, 'bronze', None)])
    assert (entered_and_refused.eligible, entered_and_refused.reason) == (False, None)


def test_poster_shows_the_entry_holding_a_spot_then_refunds_then_expiries():
    lapsed = entry(1, 'reservada', until=NOW - timedelta(minutes=1), minutes=5)
    cancelled = entry(2, 'cancelada', minutes=9)
    refunding = entry(3, 'devolucao_pendente', minutes=1)
    holding = entry(4, 'rejeitada', until=NOW + timedelta(hours=1))
    assert pick_my_entry([], NOW) is None
    assert pick_my_entry([cancelled], NOW) is None
    assert pick_my_entry([lapsed, cancelled], NOW) is lapsed
    assert pick_my_entry([lapsed, refunding], NOW) is refunding
    assert pick_my_entry([lapsed, refunding, holding, cancelled], NOW) is holding
    newer = entry(5, 'expirada', minutes=20)
    assert pick_my_entry([lapsed, newer], NOW) is newer
    assert [summary_rank(state) for state in ('confirmada', 'devolvida', 'expirada', 'cancelada')] == [0, 1, 2, None]
    assert holding_now(holding, NOW) and not holding_now(lapsed, NOW)


def test_giving_up_follows_payment_state_and_start():
    later = NOW + timedelta(days=1)
    assert cancel_error('confirmada', paid=False, starts_at=later, now=NOW) is None
    assert cancel_error('reservada', paid=True, starts_at=later, now=NOW) is None
    assert cancel_error('rejeitada', paid=True, starts_at=later, now=NOW) is None
    assert cancel_error('em_analise', paid=True, starts_at=later, now=NOW) == (
        'Para desistir de uma inscrição paga, fale com o organizador.')
    assert cancel_error('confirmada', paid=True, starts_at=later, now=NOW) == (
        'Para desistir de uma inscrição paga, fale com o organizador.')
    assert cancel_error('expirada', paid=True, starts_at=later, now=NOW) == 'Esta inscrição já foi encerrada.'
    assert cancel_error('confirmada', paid=False, starts_at=NOW, now=NOW) == 'O evento já começou.'


def test_flags_depend_on_role_state_and_deadlines():
    future = NOW + timedelta(hours=3)
    base = dict(paid=True, starts_at=NOW + timedelta(days=2), now=NOW)
    assert entry_flags(role='atleta', state='reservada', reserved_until=future, refund=None, **base) == (
        True, True, False)
    assert entry_flags(role='membro', state='reservada', reserved_until=future, refund=None, **base) == (
        False, False, False)
    assert entry_flags(role='representante', state='reservada', reserved_until=NOW, refund=None, **base) == (
        False, True, False)
    waiting = refund()
    assert entry_flags(role='atleta', state='devolucao_pendente', reserved_until=None, refund=waiting, **base) == (
        False, False, True)
    assert entry_flags(role='organizador', state='devolucao_pendente', reserved_until=None, refund=waiting,
                       **base) == (False, False, False)


def test_refund_answers_close_after_seven_days_or_once_answered():
    assert refund_waiting_answer(refund(), NOW)
    assert not refund_waiting_answer(refund(sent=NOW - timedelta(days=7)), NOW)
    assert not refund_waiting_answer(refund('contestada'), NOW)
    assert not refund_waiting_answer(None, NOW)
    assert not refund_waiting_answer(refund(kind='pagamento'), NOW)
    assert is_open_refund(refund()) and is_open_refund(refund('contestada'))
    assert not is_open_refund(refund('contestada', resolution='pendente'))
    assert not is_open_refund(refund('confirmada')) and not is_open_refund(refund(kind='pagamento'))


def test_receipt_history_picks_the_latest_payment_and_the_open_refund():
    def out(receipt):
        return ReceiptOut.model_construct(id=receipt.id, kind=receipt.kind)

    payment_new, payment_old = (EntryReceipt(id=item, kind='pagamento') for item in (5, 2))
    closed = EntryReceipt(id=4, kind='devolucao', participant_response='contestada', resolution='pendente')
    open_refund = EntryReceipt(id=3, kind='devolucao', participant_response=None, resolution=None)
    history = EntryReceipts([(receipt, out(receipt)) for receipt in (payment_new, closed, open_refund, payment_old)])
    assert history.latest_payment().id == 5
    assert history.refund_row() is open_refund and history.refund().id == 3
    only_closed = EntryReceipts([(closed, out(closed))])
    assert only_closed.refund_row() is closed and only_closed.refund().id == 4
    assert EntryReceipts().latest_payment() is None and EntryReceipts().refund() is None


def test_reasons_are_trimmed_and_bounded():
    assert clean_reason('  O Pix   não caiu. ', 'Conte o que aconteceu com a devolução.') == 'O Pix não caiu.'
    for value in (None, 'ok', 'x' * 501):
        with pytest.raises(HTTPException) as error:
            clean_reason(value, 'Descreva a decisão.')
        assert (error.value.status_code, error.value.detail) == (422, 'Descreva a decisão.')


def test_inputs_reject_unknown_fields_and_values():
    assert EntryCreateInput().team_id is None and EntryCreateInput(team_id=4).team_id == 4
    with pytest.raises(ValidationError):
        EntryCreateInput(team_id=4, user_id=9)
    assert RefundResponseInput(response='confirmar').reason is None
    with pytest.raises(ValidationError):
        RefundResponseInput(response='aceitar')
    with pytest.raises(ValidationError):
        RefundDecisionInput(decision='devolvida')
    assert RefundDecisionInput(decision='pendente', reason='Comprovante ilegível.').decision == 'pendente'


class FakeSession:
    def __init__(self, error=None):
        self.error, self.added, self.rolled_back = error, [], False

    def add(self, row):
        self.added.append(row)

    def flush(self):
        pass

    def commit(self):
        if self.error is not None:
            raise self.error

    def rollback(self):
        self.rolled_back = True


def test_saving_a_receipt_removes_the_uploaded_object_when_the_commit_fails(monkeypatch):
    discarded = []
    monkeypatch.setattr(entries_service.media, 'discard_object', discarded.append)
    stored = SimpleNamespace(id=uuid.uuid4())
    options = dict(kind='pagamento', uploader_id=1, now=NOW, conflict='Esta inscrição não aguarda comprovante.')
    seen = []
    saved = entries_service.save_receipt(FakeSession(), EventEntry(id=3), stored, effects=seen.append, **options)
    assert (saved.entry_id, saved.media_id, seen, discarded) == (3, stored.id, [saved], [])

    race = FakeSession(IntegrityError('INSERT', {}, Exception('uq_entry_receipts_payment_pending')))
    with pytest.raises(HTTPException) as error:
        entries_service.save_receipt(race, EventEntry(id=3), stored, effects=lambda receipt: None, **options)
    assert (error.value.status_code, error.value.detail) == (409, 'Esta inscrição não aguarda comprovante.')
    assert race.rolled_back and discarded == [stored]

    broken = FakeSession(RuntimeError('commit perdido'))
    with pytest.raises(RuntimeError):
        entries_service.save_receipt(broken, EventEntry(id=3), stored, effects=lambda receipt: None, **options)
    assert broken.rolled_back and discarded == [stored, stored]
