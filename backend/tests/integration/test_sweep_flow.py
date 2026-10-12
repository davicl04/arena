"""Sweep on PostgreSQL: expired reservations, refunds counted as received after 7 days and idempotency."""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.core.pagination import paginate
from app.models.audit import AuditLog
from app.models.events import EntryReceipt, Event, EventEntry
from app.models.identity import MediaObject, User
from app.models.notifications import Notification
from app.models.rankings import Standing
from app.models.teams import Team, TeamMember
from app.services import rankings
from app.services.participants import entry_recipients, entry_role
from app.services.sweep import run_sweep

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)
CITY = 5300108


def make_user(db, label):
    user = User(name=f'Atleta {label}', username=f'{label}.{uuid.uuid4().hex[:8]}',
                email=f'{label}-{uuid.uuid4().hex[:8]}@example.com', birth_date='1990-01-01', password_hash='x',
                active=True)
    db.add(user)
    db.flush()
    return user


def make_event(db, owner, **values):
    base = dict(organizer_user_id=owner.id, name='Copa Sudoeste Society', sport='futebol', format='society',
                competition_type='eliminacao_simples', capacity=8, city_id=CITY, venue='Arena Sudoeste',
                starts_at=NOW + timedelta(days=10), registration_closes_at=NOW + timedelta(days=7), price_cents=24000,
                pix_beneficiary='Rafa Nunes', pix_key_type='email', pix_key='copa@pix.com', state='publicado',
                published_at=NOW - timedelta(days=20))
    base.update(values)
    event = Event(**base)
    db.add(event)
    db.flush()
    return event


def make_team(db, representative, *members):
    team = Team(name='Ferrugem FC', city_id=CITY, state='ativo')
    db.add(team)
    db.flush()
    db.add(TeamMember(team_id=team.id, user_id=representative.id, role='representante', joined_via='criacao'))
    for member in members:
        db.add(TeamMember(team_id=team.id, user_id=member.id, role='membro', joined_via='convite'))
    db.flush()
    return team


def entry(db, event, *, until, state='reservada', **subject):
    item = EventEntry(event_id=event.id, state=state, price_cents=event.price_cents, reserved_until=until,
                      created_at=until - timedelta(hours=48), **subject)
    db.add(item)
    db.flush()
    return item


def refund_receipt(db, item, uploader, *, sent_at):
    media = MediaObject(id=uuid.uuid4(), user_id=uploader.id, bucket='arena-media',
                        object_key=f'receipts/{uuid.uuid4()}.pdf', content_type='application/pdf', size_bytes=10)
    db.add(media)
    db.flush()
    receipt = EntryReceipt(entry_id=item.id, kind='devolucao', media_id=media.id, uploaded_by_id=uploader.id,
                           created_at=sent_at)
    db.add(receipt)
    db.flush()
    return receipt


def stage_two(report):
    """Stage 2 counts of a full sweep run (the stage 3 tasks find nothing to do in these tests)."""
    return {name: report[name] for name in ('reservas_expiradas', 'devolucoes_recebidas')}


def notifications_of(db, type_):
    return db.scalars(select(Notification).where(Notification.type == type_).order_by(Notification.id)).all()


def audit_count(db, action):
    return db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.action == action))


def test_sweep_expires_due_reservations_once_and_keeps_the_others(client):
    _, db = client
    owner, rep, member, runner = (make_user(db, name) for name in ('organiza', 'rep', 'membro', 'corredor'))
    team = make_team(db, rep, member)
    football = make_event(db, owner)
    race = make_event(db, owner, name='Corrida do Lago', sport='corrida', format=None, competition_type=None,
                      distance_km=10, capacity=150, price_cents=6000)
    due_team = entry(db, football, until=NOW - timedelta(minutes=1), team_id=team.id)
    due_refused = entry(db, race, until=NOW, state='rejeitada', user_id=runner.id)
    running = entry(db, race, until=NOW + timedelta(hours=3), user_id=member.id)
    analysed = entry(db, football, until=NOW - timedelta(hours=2), state='em_analise', user_id=member.id)

    report = run_sweep(db, NOW)
    assert report['reservas_expiradas'] == 2 and report['devolucoes_recebidas'] == 0
    for item in (due_team, due_refused, running, analysed):
        db.refresh(item)
    assert (due_team.state, due_team.expired_at) == ('expirada', NOW)
    assert due_refused.state == 'expirada'
    # Still running, or already in the organizer's hands: untouched.
    assert running.state == 'reservada' and analysed.state == 'em_analise'
    sent = notifications_of(db, 'reserva_expirada')
    assert sorted((item.user_id, item.payload['entry_id']) for item in sent) == sorted(
        [(rep.id, due_team.id), (runner.id, due_refused.id)])
    assert all(item.actor_id is None and item.payload['event_name'] for item in sent)
    assert audit_count(db, 'inscricao.expirada') == 2

    # A second run (or a late one) changes nothing.
    assert stage_two(run_sweep(db, NOW + timedelta(seconds=30))) == {'reservas_expiradas': 0,
                                                                     'devolucoes_recebidas': 0}
    assert len(notifications_of(db, 'reserva_expirada')) == 2 and audit_count(db, 'inscricao.expirada') == 2


def test_sweep_counts_unanswered_refunds_as_received_after_seven_days(client):
    _, db = client
    owner, rep, member, runner, other = (make_user(db, name) for name in ('organiza', 'rep', 'membro', 'corredor',
                                                                           'outro'))
    team = make_team(db, rep, member)
    event = make_event(db, owner, state='cancelado', cancelled_at=NOW - timedelta(days=9), cancel_reason='Chuva forte',
                       cancelled_by_id=owner.id)
    old = entry(db, event, until=NOW - timedelta(days=12), state='devolucao_pendente', team_id=team.id)
    recent = entry(db, event, until=NOW - timedelta(days=12), state='devolucao_pendente', user_id=runner.id)
    answered = entry(db, event, until=NOW - timedelta(days=12), state='devolucao_contestada', user_id=other.id)
    old_receipt = refund_receipt(db, old, owner, sent_at=NOW - timedelta(days=7))
    recent_receipt = refund_receipt(db, recent, owner, sent_at=NOW - timedelta(days=6, hours=23))
    contested = refund_receipt(db, answered, owner, sent_at=NOW - timedelta(days=8))
    contested.participant_response, contested.responded_at = 'contestada', NOW - timedelta(days=7)
    contested.contest_reason = 'Não recebi'
    db.flush()

    report = run_sweep(db, NOW)
    assert stage_two(report) == {'reservas_expiradas': 0, 'devolucoes_recebidas': 1}
    for item in (old, recent, answered, old_receipt, recent_receipt, contested):
        db.refresh(item)
    assert (old.state, old.refunded_at) == ('devolvida', NOW)
    assert (old_receipt.participant_response, old_receipt.responded_at, old_receipt.responded_by_id) == (
        'automatica', NOW, None)
    assert recent.state == 'devolucao_pendente' and recent_receipt.participant_response is None
    assert answered.state == 'devolucao_contestada' and contested.participant_response == 'contestada'
    sent = notifications_of(db, 'devolucao_confirmada')
    # The organizer and the participants: every active member of the team, not only its representatives.
    assert sorted(item.user_id for item in sent) == sorted([owner.id, rep.id, member.id])
    assert all(item.payload == {'event_id': event.id, 'event_name': event.name, 'entry_id': old.id,
                                'receipt_id': old_receipt.id, 'automatic': True} for item in sent)
    assert audit_count(db, 'devolucao.confirmada_automaticamente') == 1

    # One hour later the other receipt completes its 7 days; after that, nothing is left to change.
    assert stage_two(run_sweep(db, NOW + timedelta(hours=1))) == {'reservas_expiradas': 0, 'devolucoes_recebidas': 1}
    db.refresh(recent)
    assert recent.state == 'devolvida'
    assert stage_two(run_sweep(db, NOW + timedelta(hours=1, minutes=1))) == {'reservas_expiradas': 0,
                                                                             'devolucoes_recebidas': 0}
    assert audit_count(db, 'devolucao.confirmada_automaticamente') == 2


def test_recipients_roles_and_tiers_follow_the_entry_subject(client):
    _, db = client
    owner, rep, member, athlete, stranger = (make_user(db, name) for name in
                                             ('organiza', 'rep', 'membro', 'atleta', 'estranho'))
    team = make_team(db, rep, member)
    event = make_event(db, owner)
    team_entry = entry(db, event, until=NOW + timedelta(hours=40), team_id=team.id)
    solo = entry(db, event, until=NOW + timedelta(hours=40), user_id=athlete.id)
    assert entry_recipients(db, [team_entry, solo]) == {team_entry.id: [rep.id], solo.id: [athlete.id]}
    assert entry_recipients(db, [team_entry], scope='membros') == {team_entry.id: [rep.id, member.id]}
    assert entry_recipients(db, []) == {}
    assert entry_role(db, team_entry, rep.id) == 'representante'
    assert entry_role(db, team_entry, member.id) == 'membro'
    assert entry_role(db, team_entry, stranger.id) is None
    assert entry_role(db, solo, athlete.id) == 'atleta' and entry_role(db, solo, rep.id) is None

    base = dict(metric_value=0, matches_played=3, calc_version=1)
    db.add_all([Standing(team_id=team.id, sport='futebol', format='society', tier='prata', rank_position=4, **base),
                Standing(user_id=athlete.id, sport='tenis', tier='ouro', rank_position=1, **base),
                Standing(user_id=athlete.id, sport='corrida', distance_km=10, **base)])
    db.flush()
    assert rankings.subject_tier(db, 'futebol', team_id=team.id, format='society') == 'prata'
    assert rankings.subject_tier(db, 'futebol', team_id=team.id, format='campo') is None
    assert rankings.subject_tier(db, 'tenis', user_id=athlete.id) == 'ouro'
    assert rankings.subject_tier(db, 'corrida', user_id=athlete.id, distance_km=10) is None
    assert rankings.subject_tier(db, 'tenis', user_id=rep.id) is None


def test_upcoming_events_page_in_ascending_order(client):
    _, db = client
    owner = make_user(db, 'organiza')
    events = [make_event(db, owner, name=f'Evento {day}', starts_at=NOW + timedelta(days=day),
                         registration_closes_at=NOW + timedelta(days=day - 1)) for day in (5, 2, 9)]
    statement = select(Event).where(Event.organizer_user_id == owner.id)
    first, cursor = paginate(statement, None, 2, Event.starts_at, Event.id, db, ascending=True)
    assert [item.name for item in first] == ['Evento 2', 'Evento 5'] and cursor
    rest, end = paginate(statement, cursor, 2, Event.starts_at, Event.id, db, ascending=True)
    assert [item.name for item in rest] == ['Evento 9'] and end is None
    assert len(events) == 3
