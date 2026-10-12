"""Global lock order of stage 2 under real concurrency (services/events.py, module docstring).

The riskiest pair is a payment receipt (a transition of one entry) racing a change of the whole event: the
organizer's decision on another receipt and the cancellation. Every transition of one entry locks the event FOR
SHARE before the entry, and the cancellation locks the event FOR UPDATE before the entries, so neither can hold an
entry while waiting for the event. These tests commit on separate connections, so they create their own rows and
remove them at the end, like the other concurrency tests.
"""
import threading
import time
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import and_, delete, func, or_, select, text
from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.models.events import EntryReceipt, Event, EventEntry
from app.models.identity import MediaObject, User
from app.models.notifications import Notification
from app.schemas.organizer_events import ReceiptDecisionInput
from app.services import entries, events
from app.services import media as media_service
from tests.integration.entry_helpers import PDF, FakeStorage
from tests.integration.team_helpers import CITY

CANCEL_REASON = 'Parque fechado pela prefeitura'
NOT_WAITING = 'Esta inscrição não aguarda comprovante.'


def now():
    return datetime.now(timezone.utc)


class GatedStorage(FakeStorage):
    """Storage whose upload waits for `release`: the receipt transaction stays open, holding its locks."""

    def __init__(self, *, gated: bool):
        super().__init__()
        self.gated = gated
        self.entered = threading.Event()
        self.release = threading.Event()

    def put_object(self, Bucket, Key, Body, **extra):
        self.entered.set()
        if self.gated:
            assert self.release.wait(15), 'upload never released'
        super().put_object(Bucket, Key, Body, **extra)


class Scene:
    """A paid race with one reservation, one refused receipt and one receipt under analysis."""

    def __init__(self, engine):
        self.engine = engine
        tag = uuid.uuid4().hex[:10]
        moment = now()
        with Session(engine, expire_on_commit=False) as db:
            self.people = {label: User(name=f'Atleta {label}', username=f'{label}_{tag}',
                                       email=f'{label}-{tag}@example.com', birth_date=date(1990, 1, 1),
                                       password_hash='x') for label in ('owner', 'reserved', 'refused', 'review')}
            db.add_all(self.people.values())
            db.flush()
            self.event = Event(organizer_user_id=self.people['owner'].id, name='Corrida Concorrente', sport='corrida',
                               distance_km=5, capacity=50, city_id=CITY, venue='Parque da Cidade',
                               starts_at=moment + timedelta(days=10), registration_closes_at=moment + timedelta(days=7),
                               price_cents=5000, pix_beneficiary='Rafa Nunes', pix_key_type='email',
                               pix_key='a@pix.com', state='publicado', published_at=moment)
            db.add(self.event)
            db.flush()
            self.entries = {}
            for label, state in (('reserved', 'reservada'), ('refused', 'rejeitada'), ('review', 'em_analise')):
                item = EventEntry(event_id=self.event.id, user_id=self.people[label].id, state=state,
                                  registered_by_id=self.people[label].id, price_cents=5000,
                                  reserved_until=moment + timedelta(hours=40), created_at=moment - timedelta(hours=1))
                db.add(item)
                db.flush()
                self.entries[label] = item
            self.receipt(db, 'refused', decision='recusado', reason_code='valor_diferente', decided_at=moment,
                         decided_by_id=self.people['owner'].id)
            self.pending = self.receipt(db, 'review')
            db.commit()

    def receipt(self, db, label, **decision):
        media = MediaObject(id=uuid.uuid4(), user_id=self.people[label].id, bucket='arena-media',
                            object_key=f'receipts/{uuid.uuid4()}.pdf', content_type='application/pdf', size_bytes=9)
        db.add(media)
        db.flush()
        row = EntryReceipt(entry_id=self.entries[label].id, kind='pagamento', media_id=media.id,
                           uploaded_by_id=self.people[label].id, created_at=now() - timedelta(minutes=30), **decision)
        db.add(row)
        db.flush()
        return row

    def id_of(self, label):
        return self.people[label].id

    def upload(self, label, pids=None):
        def run():
            with Session(self.engine, expire_on_commit=False) as db:
                if pids is not None:
                    pids[label] = db.scalar(text('SELECT pg_backend_pid()'))
                user = db.get(User, self.id_of(label))
                entries.store_payment_receipt(db, user, self.entries[label].id, media_service.prepare_receipt(PDF))
        return run

    def decide(self):
        with Session(self.engine, expire_on_commit=False) as db:
            events.decide_receipt(db, db.get(User, self.id_of('owner')), self.pending.id,
                                  ReceiptDecisionInput(decision='aprovar'))

    def cancel(self):
        with Session(self.engine, expire_on_commit=False) as db:
            events.cancel_owned_event(db, db.get(User, self.id_of('owner')), self.event.id, CANCEL_REASON)

    def state(self, label):
        with Session(self.engine) as db:
            item = db.get(EventEntry, self.entries[label].id)
            payments = db.scalars(select(EntryReceipt).where(EntryReceipt.entry_id == item.id)
                                  .order_by(EntryReceipt.id)).all()
            return item.state, [receipt.decision for receipt in payments]

    def notified(self, label, type_):
        with Session(self.engine) as db:
            return db.scalar(select(func.count()).select_from(Notification).where(
                Notification.user_id == self.id_of(label), Notification.type == type_))

    def cleanup(self):
        with Session(self.engine) as db:
            ids = [person.id for person in self.people.values()]
            entry_ids = select(EventEntry.id).where(EventEntry.event_id == self.event.id)
            receipt_ids = select(EntryReceipt.id).where(EntryReceipt.entry_id.in_(entry_ids))
            db.execute(delete(AuditLog).where(or_(
                AuditLog.actor_id.in_(ids),
                and_(AuditLog.target_type == 'event', AuditLog.target_id == self.event.id),
                and_(AuditLog.target_type == 'event_entry', AuditLog.target_id.in_(entry_ids)),
                and_(AuditLog.target_type == 'entry_receipt', AuditLog.target_id.in_(receipt_ids)))))
            db.execute(delete(EntryReceipt).where(EntryReceipt.id.in_(receipt_ids)))
            db.execute(delete(Event).where(Event.id == self.event.id))
            db.execute(delete(User).where(User.id.in_(ids)))
            db.commit()


def run_all(*actions):
    """Starts every action at once (barrier) on its own connection; returns 200, the HTTP status or the error."""
    barrier, results = threading.Barrier(len(actions)), [None] * len(actions)

    def worker(index, action):
        barrier.wait()
        try:
            action()
            results[index] = 200
        except HTTPException as error:
            results[index] = (error.status_code, error.detail)
        except Exception as error:  # a deadlock (or any other failure) surfaces in the assertion
            results[index] = repr(error)

    threads = [threading.Thread(target=worker, args=item) for item in enumerate(actions)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(30)
    assert not any(thread.is_alive() for thread in threads), 'a transaction never finished'
    return results


def waits_on(engine, pid):
    """Relation whose row lock the backend `pid` is queued on (the tuple lock it holds while waiting), or None."""
    with engine.connect() as connection:
        return connection.execute(text(
            "SELECT c.relname FROM pg_locks l JOIN pg_class c ON c.oid = l.relation "
            "JOIN pg_stat_activity a ON a.pid = l.pid "
            "WHERE l.pid = :pid AND l.locktype = 'tuple' AND a.wait_event_type = 'Lock'"), {'pid': pid}).scalar()


def wait_for(condition, timeout=10):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = condition()
        if value:
            return value
        time.sleep(0.05)
    return None


def test_receipts_racing_a_decision_and_the_cancellation_never_deadlock(test_engine, monkeypatch):
    """Several rounds with everything started at once: no deadlock and a consistent outcome for each entry."""
    for _ in range(4):
        storage = GatedStorage(gated=False)
        monkeypatch.setattr(media_service, 'storage_client', lambda storage=storage: storage)
        scene = Scene(test_engine)
        try:
            uploads = (scene.upload('reserved'), scene.upload('refused'))
            reserved, refused, decided, cancelled = run_all(*uploads, scene.decide, scene.cancel)
            assert cancelled == 200
            for label, outcome, previous in (('reserved', reserved, []), ('refused', refused, ['recusado'])):
                if outcome == 200:
                    # The receipt committed first: the participant declared the payment, so a refund is due.
                    assert scene.state(label) == ('devolucao_pendente', [*previous, None])
                else:
                    assert outcome == (409, NOT_WAITING)
                    assert scene.state(label) == ('cancelada', previous)
            if decided == 200:
                assert scene.state('review') == ('devolucao_pendente', ['aprovado'])
            else:
                assert decided == (409, 'Esta inscrição não está em análise.')
                assert scene.state('review') == ('devolucao_pendente', [None])
            # A refused race stops before the upload: only the receipts that committed have an object.
            assert len(storage.objects) == [reserved, refused].count(200)
            for label in ('reserved', 'refused', 'review'):
                assert scene.notified(label, 'evento_cancelado') == 1
        finally:
            scene.cleanup()


def test_cancellation_waits_for_a_receipt_holding_the_event(test_engine, monkeypatch):
    """The receipt locks the event (FOR SHARE) before the entry; the cancellation queues on the event and then
    finds the receipt committed: the entry under analysis waits for the refund."""
    storage = GatedStorage(gated=True)
    monkeypatch.setattr(media_service, 'storage_client', lambda: storage)
    scene = Scene(test_engine)
    pids: dict[str, int] = {}
    results: dict[str, object] = {}

    def keep(name, action):
        def run():
            try:
                action()
                results[name] = 200
            except HTTPException as error:
                results[name] = (error.status_code, error.detail)
            except Exception as error:
                results[name] = repr(error)
        return run

    def cancel():
        with Session(test_engine, expire_on_commit=False) as db:
            pids['cancel'] = db.scalar(text('SELECT pg_backend_pid()'))
            events.cancel_owned_event(db, db.get(User, scene.id_of('owner')), scene.event.id, CANCEL_REASON)

    try:
        upload = threading.Thread(target=keep('upload', scene.upload('reserved')))
        upload.start()
        assert storage.entered.wait(10), 'the upload never reached the storage'
        canceller = threading.Thread(target=keep('cancel', cancel))
        canceller.start()
        # The cancellation is queued on the event row, which the receipt holds FOR SHARE.
        assert wait_for(lambda: 'cancel' in pids and waits_on(test_engine, pids['cancel'])) == 'events'
        storage.release.set()
        upload.join(15)
        canceller.join(15)
        assert results == {'upload': 200, 'cancel': 200}
        assert scene.state('reserved') == ('devolucao_pendente', [None])
        assert len(storage.objects) == 1
    finally:
        storage.release.set()
        scene.cleanup()


def test_receipt_waits_on_the_event_while_the_cancellation_holds_it(test_engine, monkeypatch):
    """With the cancellation open (event and entries locked), the receipt queues on the event row, never on the
    entry after taking the event, and then answers 409 without uploading anything."""
    storage = GatedStorage(gated=False)
    monkeypatch.setattr(media_service, 'storage_client', lambda: storage)
    scene = Scene(test_engine)
    pids: dict[str, int] = {}
    results: dict[str, object] = {}

    def upload():
        try:
            scene.upload('reserved', pids)()
            results['upload'] = 200
        except HTTPException as error:
            results['upload'] = (error.status_code, error.detail)
        except Exception as error:
            results['upload'] = repr(error)

    try:
        with Session(test_engine, expire_on_commit=False) as db:
            event = events.lock_event(db, scene.event.id)
            events.cancel_event(db, event, actor_id=scene.id_of('owner'), reason=CANCEL_REASON, now=now())
            worker = threading.Thread(target=upload)
            worker.start()
            assert wait_for(lambda: 'reserved' in pids and waits_on(test_engine, pids['reserved'])) == 'events'
            assert not storage.entered.is_set()
            db.commit()
        worker.join(15)
        assert results == {'upload': (409, NOT_WAITING)}
        assert scene.state('reserved') == ('cancelada', [])
        assert storage.objects == {}
    finally:
        scene.cleanup()
