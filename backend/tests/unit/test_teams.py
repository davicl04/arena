"""Team rules without a database: names and messages, minimum representative, statuses, races and the crest."""
import io
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from PIL import Image
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

from app.models.identity import MediaObject
from app.models.teams import Team, TeamMember
from app.schemas.teams import (
    InviteCreateInput,
    InviteDecisionInput,
    JoinRequestDecisionInput,
    MemberUpdateInput,
    TeamCreateInput,
    TeamUpdateInput,
)
from app.services import media as media_service
from app.services import team_links
from app.services.team_invites import insert_pending, status_for
from app.services.teams import (
    LAST_REPRESENTATIVE_LEAVE,
    TeamContext,
    actor_person,
    ensure_closable,
    ensure_representative_remains,
    first_name,
    representative_count,
    roster_key,
    visible_person,
)

BASE = datetime(2026, 10, 12, tzinfo=timezone.utc)


def member(member_id, role='membro', minutes=0, user_id=None):
    return TeamMember(id=member_id, user_id=user_id or member_id, team_id=1, role=role, joined_via='convite',
                      joined_at=BASE + timedelta(minutes=minutes))


@pytest.mark.parametrize(('raw', 'expected'), [
    ('  Leões   do  Cerrado ', 'Leões do Cerrado'), ('abc', 'abc'), ('x' * 40, 'x' * 40), ('a\tb\nc', 'a b c'),
])
def test_team_name_is_trimmed_and_collapsed(raw, expected):
    assert TeamCreateInput(name=raw, city_id=1).name == expected


@pytest.mark.parametrize('raw', ['ab', '  a   ', ' x  ', 'x' * 41, '   '])
def test_team_name_needs_3_to_40_characters(raw):
    with pytest.raises(ValidationError) as error:
        TeamCreateInput(name=raw, city_id=1)
    assert 'Use de 3 a 40 caracteres no nome do time.' in str(error.value)


def test_team_inputs_reject_unknown_fields_and_require_a_change():
    with pytest.raises(ValidationError):
        TeamCreateInput(name='Ferrugem', city_id=1, state='encerrado')
    with pytest.raises(ValidationError):
        TeamCreateInput(name='Ferrugem', city_id=0)
    with pytest.raises(ValidationError):
        TeamUpdateInput()
    with pytest.raises(ValidationError):
        TeamUpdateInput(name='ab')
    assert TeamUpdateInput(city_id=7).name is None
    assert TeamUpdateInput(name=' Real   Cerrado ').name == 'Real Cerrado'


@pytest.mark.parametrize(('raw', 'expected'), [
    (None, None), ('', None), ('   ', None), ('  Bora jogar  ', 'Bora jogar'), ('x' * 140, 'x' * 140),
])
def test_invite_message_is_trimmed_and_empty_becomes_null(raw, expected):
    assert InviteCreateInput(user_id=3, message=raw).message == expected


def test_invite_message_has_at_most_140_characters():
    with pytest.raises(ValidationError) as error:
        InviteCreateInput(user_id=3, message='x' * 141)
    assert 'A mensagem pode ter até 140 caracteres.' in str(error.value)
    with pytest.raises(ValidationError):
        InviteCreateInput(user_id=0)


def test_member_update_applies_only_sent_fields():
    assert MemberUpdateInput(position=None).model_fields_set == {'position'}
    assert MemberUpdateInput(role='representante').position is None
    for body in ({}, {'role': None}, {'role': 'capitao'}, {'position': 'lateral'}, {'role': 'membro', 'extra': 1}):
        with pytest.raises(ValidationError):
            MemberUpdateInput(**body)


def test_decisions_accept_only_their_words():
    assert InviteDecisionInput(decision='aceitar').decision == 'aceitar'
    assert JoinRequestDecisionInput(decision='recusar').decision == 'recusar'
    with pytest.raises(ValidationError):
        InviteDecisionInput(decision='aprovar')
    with pytest.raises(ValidationError):
        JoinRequestDecisionInput(decision='aceitar')


def test_last_representative_cannot_step_down_or_leave():
    captain, player = member(1, 'representante'), member(2)
    with pytest.raises(HTTPException) as error:
        ensure_representative_remains([captain, player], captain, LAST_REPRESENTATIVE_LEAVE)
    assert error.value.status_code == 409 and error.value.detail == LAST_REPRESENTATIVE_LEAVE
    ensure_representative_remains([captain, player], player, LAST_REPRESENTATIVE_LEAVE)
    second = member(3, 'representante')
    ensure_representative_remains([captain, player, second], captain, LAST_REPRESENTATIVE_LEAVE)
    assert representative_count([captain, player, second]) == 2


def test_roster_order_puts_representatives_first_then_oldest_stay():
    late_captain, early_player, early_captain = member(5, 'representante', 30), member(2, minutes=0), member(9, 'representante', 10)
    tie = member(1, minutes=0)
    ordered = sorted([early_player, late_captain, tie, early_captain], key=roster_key)
    assert [item.id for item in ordered] == [9, 5, 1, 2]


@pytest.mark.parametrize(('name', 'expected'), [('Caio Ramos', 'Caio'), ('  Lia ', 'Lia'), ('', '')])
def test_first_name(name, expected):
    assert first_name(name) == expected


def test_team_status_priority():
    members, invites, requests = {1}, {1: 10, 2: 20}, {2: 30, 3: 40}
    assert [status_for(user_id, members, invites, requests) for user_id in (1, 2, 3, 4)] == [
        'membro', 'convite_pendente', 'pedido_pendente', 'disponivel']


def test_context_requires_the_representative_role():
    captain, player = member(1, 'representante'), member(2)
    context = TeamContext(Team(id=1, name='Ferrugem'), {1: captain, 2: player}, player)
    with pytest.raises(HTTPException) as error:
        context.require_representative('Só representantes.')
    assert error.value.status_code == 403
    with pytest.raises(HTTPException):
        TeamContext(context.team, context.roster, None).require_representative('Só representantes.')
    TeamContext(context.team, context.roster, captain).require_representative('Só representantes.')
    assert context.representative_ids() == [1]


def test_closing_needs_an_active_team_without_entries_in_play():
    no_entry = SimpleNamespace(scalar=lambda statement: None)
    ensure_closable(no_entry, Team(id=1, name='Ativo', state='ativo'))
    with pytest.raises(HTTPException) as error:
        ensure_closable(no_entry, Team(id=1, name='Fechado', state='encerrado'))
    assert error.value.status_code == 409
    with pytest.raises(HTTPException) as entered:
        ensure_closable(SimpleNamespace(scalar=lambda statement: 7), Team(id=1, name='Inscrito', state='ativo'))
    assert (entered.value.status_code, entered.value.detail) == (
        409, 'Encerre ou cancele as partidas agendadas e as inscrições ativas antes de encerrar o time.')


def test_people_hide_avatar_or_actor_for_blocks_and_inactive_accounts():
    media_id = uuid.uuid4()
    active = SimpleNamespace(id=4, name='Ana', username='ana', avatar_media_id=media_id, active=True)
    inactive = SimpleNamespace(id=5, name='Bia', username='bia', avatar_media_id=media_id, active=False)
    assert visible_person(active, set()).avatar_url == f'/api/v1/users/4/avatar?v={media_id}'
    assert visible_person(active, {4}).avatar_url is None
    assert visible_person(inactive, set()).avatar_url is None
    assert actor_person(active, set()).id == 4
    assert actor_person(active, {4}) is None and actor_person(inactive, set()) is None and actor_person(None, set()) is None


class SavepointDb:
    def __init__(self, fail):
        self.fail = fail
        self.added = []

    @contextmanager
    def begin_nested(self):
        yield

    def add(self, row):
        self.added.append(row)

    def flush(self):
        if self.fail:
            raise IntegrityError('INSERT', {}, Exception('uq_team_invites_pending'))


def test_insert_pending_turns_a_duplicate_race_into_a_resend():
    row, existing = object(), object()
    assert insert_pending(SavepointDb(False), row, lambda: existing) == (row, True)
    assert insert_pending(SavepointDb(True), row, lambda: existing) == (existing, False)
    with pytest.raises(HTTPException) as error:
        insert_pending(SavepointDb(True), row, lambda: None)
    assert error.value.status_code == 409


def test_regenerated_link_replaces_the_token_and_its_hash():
    team = Team(id=12, name='Link FC', state='ativo')
    first = team_links.issue(team)
    first_hash = team.link_token_hash
    second = team_links.issue(team)
    assert second != first and team.link_token_hash == team_links.token_hash(second) != first_hash

    class Db:
        def scalar(self, _):
            return team

    assert team_links.find_team(Db(), first) is None and team_links.find_team(Db(), second) is team


def image(mode, color, image_format='PNG', size=(120, 80), **save):
    stream = io.BytesIO()
    Image.new(mode, size, color).save(stream, format=image_format, **save)
    return stream.getvalue()


def test_crest_keeps_transparency_and_opaque_images_stay_rgb():
    transparent = media_service.normalize_crest(image('RGBA', (0, 0, 0, 0)))
    with Image.open(io.BytesIO(transparent)) as crest:
        assert crest.format == 'WEBP' and crest.mode == 'RGBA' and crest.size == (80, 80)
        assert crest.getpixel((10, 10))[3] == 0
    palette = Image.new('P', (40, 40), 0)
    palette.info['transparency'] = 0
    stream = io.BytesIO()
    palette.save(stream, format='PNG', transparency=0)
    with Image.open(io.BytesIO(media_service.normalize_crest(stream.getvalue()))) as crest:
        assert crest.mode == 'RGBA' and crest.getpixel((5, 5))[3] == 0
    with Image.open(io.BytesIO(media_service.normalize_crest(image('RGB', '#28764d', 'JPEG')))) as crest:
        assert crest.mode == 'RGB'
    # The avatar keeps its previous behaviour (flattened RGB).
    with Image.open(io.BytesIO(media_service.normalize_avatar(image('RGBA', (0, 0, 0, 0))))) as avatar:
        assert avatar.mode == 'RGB'
    with pytest.raises(HTTPException) as error:
        media_service.normalize_crest(b'not an image')
    assert error.value.status_code == 422


class Storage:
    def __init__(self, fail_put=False):
        self.objects, self.fail_put = {}, fail_put

    def put_object(self, Bucket, Key, Body, **_):
        self.objects[Key] = Body

    def delete_object(self, Bucket, Key):
        self.objects.pop(Key, None)

    def get_object(self, Bucket, Key):
        return {'Body': io.BytesIO(self.objects[Key])}


class CrestDb:
    def __init__(self, existing=None, fail_commit=False):
        self.rows = {row.id: row for row in existing or []}
        self.deleted, self.commits, self.rollbacks, self.fail_commit = [], 0, 0, fail_commit

    def add(self, row):
        self.rows[row.id] = row

    def flush(self):
        pass

    def get(self, _, key):
        return self.rows.get(key)

    def delete(self, row):
        self.deleted.append(row.id)

    def commit(self):
        if self.fail_commit:
            raise RuntimeError('commit failed')
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


def test_store_crest_links_new_media_then_removes_the_previous(monkeypatch):
    storage = Storage()
    monkeypatch.setattr(media_service, 'storage_client', lambda: storage)
    old = MediaObject(id=uuid.uuid4(), user_id=1, bucket='arena-media', object_key='crests/old.webp',
                      content_type='image/webp', size_bytes=1, width=1, height=1)
    storage.objects['crests/old.webp'] = b'old'
    team = Team(id=3, name='Brasão FC', state='ativo', crest_media_id=old.id)
    db = CrestDb([old])
    normalized = media_service.normalize_crest(image('RGBA', (0, 0, 0, 0)))
    media = media_service.store_team_crest(db, team, normalized, uploader_id=7)
    assert team.crest_media_id == media.id and media.user_id == 7 and media.object_key == f'crests/{media.id}.webp'
    assert list(storage.objects) == [media.object_key] and db.deleted == [old.id]
    assert media_service.read_object(media) == normalized

    media_service.clear_team_crest(db, team)
    assert team.crest_media_id is None and storage.objects == {} and db.deleted == [old.id, media.id]
    media_service.clear_team_crest(db, team)
    assert db.deleted == [old.id, media.id]


def test_failed_crest_commit_removes_the_uploaded_object(monkeypatch):
    storage = Storage()
    monkeypatch.setattr(media_service, 'storage_client', lambda: storage)
    team = Team(id=3, name='Brasão FC', state='ativo')
    db = CrestDb(fail_commit=True)
    with pytest.raises(RuntimeError):
        media_service.store_team_crest(db, team, media_service.normalize_crest(image('RGB', 'white')), uploader_id=7)
    assert storage.objects == {} and db.rollbacks == 1


def test_old_crest_cleanup_failure_is_deferred(monkeypatch):
    storage = Storage()
    monkeypatch.setattr(media_service, 'storage_client', lambda: storage)
    old = MediaObject(id=uuid.uuid4(), user_id=1, bucket='arena-media', object_key='crests/old.webp',
                      content_type='image/webp', size_bytes=1, width=1, height=1)
    team = Team(id=3, name='Brasão FC', state='ativo', crest_media_id=old.id)

    class FlakyDb(CrestDb):
        def delete(self, row):
            raise RuntimeError('delete failed')

    db = FlakyDb([old])
    media = media_service.store_team_crest(db, team, media_service.normalize_crest(image('RGB', 'white')), 7)
    assert team.crest_media_id == media.id and db.rollbacks == 1
    media_service._discard_media(db, uuid.uuid4(), 'crest')
