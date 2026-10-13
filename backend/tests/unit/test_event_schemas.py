from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import select
from sqlalchemy.dialects import postgresql

from app.core.pagination import encode_cursor, paginate
from app.models.events import EntryReceipt, Event
from app.models.identity import City, MediaObject
from app.schemas.common import PersonOut
from app.schemas.events import (
    checklist_out,
    next_action_out,
    pending_out,
    pix_out,
    poster_out,
    receipt_file_url,
    receipt_out,
)
from app.services import rankings
from app.services.event_rules import NextAction, PendingCounts, draft_checklist

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)


def published(**values):
    base = dict(id=9, organizer_user_id=1, name='Copa Sudoeste Society', sport='futebol', format='society',
                competition_type='eliminacao_simples', capacity=8, city_id=5300108, venue='Arena Sudoeste',
                starts_at=NOW + timedelta(days=10), registration_closes_at=NOW + timedelta(days=7), price_cents=24000,
                pix_beneficiary='Rafa Nunes', pix_key_type='email', pix_key='copa@pix.com', pix_copy_paste=None,
                pix_instructions='Envie o comprovante.', state='publicado', revocation_decision=None)
    base.update(values)
    return Event(**base)


def test_poster_combines_counts_deadline_and_phase():
    city = City(id=5300108, name='Brasília', state='DF')
    poster = poster_out(published(), city, entries_count=5, confirmed_count=3, now=NOW)
    assert (poster.entries_count, poster.confirmed_count, poster.phase, poster.city.name) == (5, 3,
                                                                                              'inscricoes_abertas',
                                                                                              'Brasília')
    assert poster.registration_deadline == NOW + timedelta(days=7) and not poster.revocation_pending
    suspended = poster_out(published(revocation_decision='pendente'), None, entries_count=0, confirmed_count=0,
                           now=NOW + timedelta(days=8))
    assert (suspended.phase, suspended.revocation_pending, suspended.city) == ('inscricoes_encerradas', True, None)
    draft = poster_out(Event(id=1, name='Rascunho', state='rascunho'), None, entries_count=0, confirmed_count=0,
                       now=NOW)
    assert (draft.phase, draft.sport, draft.registration_deadline) == ('rascunho', None, None)


def test_pix_only_for_paid_events():
    assert pix_out(published(price_cents=0)) is None
    pix = pix_out(published())
    assert (pix.beneficiary, pix.key_type, pix.key, pix.instructions) == ('Rafa Nunes', 'email', 'copa@pix.com',
                                                                          'Envie o comprovante.')


def test_receipt_out_exposes_the_authorized_file_route_and_the_refund_clock():
    person = PersonOut(id=3, name='Léo Matos', username='leo', avatar_url=None)
    pdf = MediaObject(content_type='application/pdf', size_bytes=2048)
    refund = EntryReceipt(id=12, kind='devolucao', created_at=NOW)
    out = receipt_out(refund, pdf, person)
    assert (out.file_url, out.file_type, out.size_bytes, out.uploaded_by.id) == (
        '/api/v1/receipts/12/file', 'pdf', 2048, 3)
    assert out.auto_confirm_at == NOW + timedelta(days=7)
    refund.participant_response, refund.responded_at = 'confirmada', NOW
    assert receipt_out(refund, pdf, None).auto_confirm_at is None
    payment = EntryReceipt(id=13, kind='pagamento', created_at=NOW, decision='recusado', reason_code='valor_diferente',
                           decided_at=NOW)
    image = receipt_out(payment, MediaObject(content_type='image/webp', size_bytes=10), None)
    assert (image.file_type, image.decision, image.reason_code, image.auto_confirm_at) == (
        'imagem', 'recusado', 'valor_diferente', None)
    assert receipt_file_url(5) == '/api/v1/receipts/5/file'


def test_checklist_pending_and_next_action_outputs():
    items = checklist_out(draft_checklist(SimpleNamespace(
        name='Copa', sport=None, format=None, distance_km=None, competition_type=None, capacity=None,
        accepted_tiers=None, city_id=None, venue=None, starts_at=None, registration_closes_at=None, price_cents=None,
        pix_beneficiary=None, pix_key_type=None, pix_key=None), NOW))
    assert [item.key for item in items][0] == 'nome_modalidade' and not any(item.done for item in items)
    assert pending_out(PendingCounts(receipts=2, refunds_to_send=1)).total == 3
    action = next_action_out(NextAction('analisar_comprovantes', 2))
    assert (action.kind, action.count, action.deadline) == ('analisar_comprovantes', 2, None)


class CaptureDb:
    def __init__(self):
        self.statement = None

    def scalars(self, statement):
        self.statement = statement
        return SimpleNamespace(all=lambda: [])


def compiled(statement):
    return str(statement.compile(dialect=postgresql.dialect(), compile_kwargs={'literal_binds': True}))


def test_paginate_can_list_upcoming_items_in_ascending_order():
    db = CaptureDb()
    cursor = encode_cursor(NOW, 4)
    rows, next_cursor = paginate(select(Event), cursor, 20, Event.starts_at, Event.id, db, ascending=True)
    sql = compiled(db.statement)
    assert (rows, next_cursor) == ([], None)
    assert '(events.starts_at, events.id) > (' in sql and 'ORDER BY events.starts_at ASC, events.id ASC' in sql
    paginate(select(Event), cursor, 20, Event.starts_at, Event.id, db)
    assert '(events.starts_at, events.id) < (' in compiled(db.statement)


def test_subject_tier_refuses_categories_outside_rn18():
    for kwargs in ({'sport': 'futebol', 'team_id': 1}, {'sport': 'futebol', 'user_id': 1, 'format': 'society'},
                   {'sport': 'tenis'}, {'sport': 'corrida', 'user_id': 1, 'distance_km': 7}, {'sport': 'xadrez'}):
        sport = kwargs.pop('sport')
        with pytest.raises(ValueError):
            rankings.subject_tier(None, sport, **kwargs)
