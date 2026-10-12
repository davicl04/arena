"""Helpers of the athlete-side event tests: accounts, events written straight to the database and fake storage.

Events are created in the database because the organizer routes belong to another front; the tests only use the
athlete, receipt and refund routes over HTTP.
"""
import io
from datetime import timedelta

from PIL import Image
from sqlalchemy import select

from app.models.events import EntryReceipt, Event
from app.models.identity import User, utcnow
from app.models.organizers import Organizer
from app.models.rankings import Standing
from tests.integration.team_helpers import CITY, register

PDF = b'%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n'


class FakeStorage:
    def __init__(self):
        self.objects = {}

    def put_object(self, Bucket, Key, Body, **_):
        self.objects[(Bucket, Key)] = Body

    def get_object(self, Bucket, Key):
        return {'Body': io.BytesIO(self.objects[(Bucket, Key)])}

    def delete_object(self, Bucket, Key):
        self.objects.pop((Bucket, Key), None)


def png(color='green'):
    data = io.BytesIO()
    Image.new('RGB', (60, 40), color).save(data, format='PNG')
    return data.getvalue()


def gif():
    data = io.BytesIO()
    Image.new('RGB', (20, 20), 'orange').save(data, format='GIF')
    return data.getvalue()


def image_file(content=None):
    return {'file': ('comprovante.png', content or png(), 'image/png')}


def pdf_file():
    return {'file': ('comprovante.pdf', PDF, 'application/pdf')}


def account(http, db, label, *, admin=False):
    headers, user_id = register(http, f'{label}@example.com', name=f'Atleta {label.title()}')
    if admin:
        db.get(User, user_id).is_admin = True
        db.flush()
    return headers, user_id


def organizer(http, db, label='organiza', display_name='Rafa Eventos'):
    headers, user_id = account(http, db, label)
    permission = Organizer(user_id=user_id, display_name=display_name, approved_at=utcnow())
    db.add(permission)
    db.flush()
    return headers, user_id, permission.id


def make_event(db, owner_id, organizer_id=None, **values):
    now = utcnow()
    base = dict(organizer_user_id=owner_id, organizer_id=organizer_id, name='Copa Sudoeste Society', sport='futebol',
                format='society', competition_type='eliminacao_simples', capacity=8, city_id=CITY,
                venue='Arena Sudoeste', starts_at=now + timedelta(days=10),
                registration_closes_at=now + timedelta(days=7), price_cents=24000, pix_beneficiary='Rafa Nunes',
                pix_key_type='email', pix_key='copa@pix.com', pix_copy_paste='00020126copa', state='publicado',
                published_at=now - timedelta(days=2))
    base.update(values)
    if not base['price_cents']:
        base.update(pix_beneficiary=None, pix_key_type=None, pix_key=None, pix_copy_paste=None)
    event = Event(**base)
    db.add(event)
    db.flush()
    return event


def tennis_event(db, owner_id, organizer_id=None, **values):
    return make_event(db, owner_id, organizer_id, **{
        'name': 'Torneio do Lago', 'sport': 'tenis', 'format': None, 'competition_type': 'todos_contra_todos',
        'capacity': 8, 'price_cents': 0, **values})


def race_event(db, owner_id, organizer_id=None, **values):
    return make_event(db, owner_id, organizer_id, **{
        'name': 'Corrida do Lago', 'sport': 'corrida', 'format': None, 'competition_type': None, 'distance_km': 10,
        'capacity': 150, 'price_cents': 6000, 'course_notes': 'Largada no deck norte.', **values})


def standing(db, *, tier, user_id=None, team_id=None, **category):
    row = Standing(user_id=user_id, team_id=team_id, tier=tier, rank_position=5 if tier else None, metric_value=0,
                   matches_played=3, calc_version=1, **category)
    db.add(row)
    db.flush()
    return row


def receipts_of(db, entry_id):
    return db.scalars(select(EntryReceipt).where(EntryReceipt.entry_id == entry_id).order_by(EntryReceipt.id)).all()
