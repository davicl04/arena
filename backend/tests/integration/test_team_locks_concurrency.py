"""Team locks on real connections: authorization comes before the lock, and the lock still serializes writes.

Who cannot see the team (404) or is not a representative (403) gets the answer while another transaction holds
the team row, instead of waiting for it; reading an existing link takes no lock; and two representatives stepping
down at once still leave one representative (the rule is decided on the locked roster). These tests commit on
separate connections, so they create their own rows and remove them at the end.
"""
import threading
import uuid
from datetime import date

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.models.identity import User
from app.models.teams import Team, TeamInvite, TeamJoinRequest, TeamMember
from app.schemas.teams import TeamUpdateInput
from app.services import team_invites, team_links, teams
from tests.integration.team_helpers import CITY

WAIT = 5


class Scene:
    def __init__(self, engine):
        self.engine = engine
        tag = uuid.uuid4().hex[:10]
        with Session(engine, expire_on_commit=False) as db:
            self.people = {label: User(name=f'Atleta {label}', username=f'{label}_{tag}',
                                       email=f'{label}-{tag}@example.com', birth_date=date(1990, 1, 1),
                                       password_hash='x')
                           for label in ('owner', 'second', 'member', 'outsider', 'guest', 'asker')}
            db.add_all(self.people.values())
            db.flush()
            team = Team(name='Travas FC', city_id=CITY, state='ativo', created_by_id=self.id_of('owner'))
            db.add(team)
            db.flush()
            team_links.issue(team)
            for label, role in (('owner', 'representante'), ('second', 'representante'), ('member', 'membro')):
                db.add(TeamMember(team_id=team.id, user_id=self.id_of(label), role=role, joined_via='criacao'))
            self.invite = TeamInvite(team_id=team.id, invitee_id=self.id_of('guest'), inviter_id=self.id_of('owner'),
                                     state='pendente')
            self.request = TeamJoinRequest(team_id=team.id, user_id=self.id_of('asker'), state='pendente')
            db.add_all([self.invite, self.request])
            db.commit()
            self.team = team

    def id_of(self, label):
        return self.people[label].id

    def call(self, label, action):
        """Runs `action(db, user)` in its own session; returns the HTTP status (200 when it succeeds)."""
        with Session(self.engine, expire_on_commit=False) as db:
            try:
                action(db, db.get(User, self.id_of(label)))
                return 200
            except HTTPException as error:
                return error.status_code

    def cleanup(self):
        with Session(self.engine) as db:
            ids = [person.id for person in self.people.values()]
            db.execute(delete(AuditLog).where(AuditLog.actor_id.in_(ids)))
            db.execute(delete(Team).where(Team.id == self.team.id))
            db.execute(delete(User).where(User.id.in_(ids)))
            db.commit()


def run_in_thread(function):
    result: dict[str, object] = {}
    thread = threading.Thread(target=lambda: result.setdefault('value', function()))
    thread.start()
    return thread, result


def test_refusals_and_link_reads_do_not_wait_for_the_team_lock(test_engine):
    scene = Scene(test_engine)
    team_id = scene.team.id
    rename = lambda db, user: teams.update_team(db, user, team_id, TeamUpdateInput(name='Travas Novas'))  # noqa: E731
    cancel = lambda db, user: team_invites.cancel_invite(db, user, scene.invite.id)  # noqa: E731
    decide = lambda db, user: team_invites.decide_request(db, user, scene.request.id, 'aprovar')  # noqa: E731
    link = lambda db, user: team_invites.team_link(db, user, team_id, regenerate=False)  # noqa: E731
    try:
        with Session(test_engine) as holder:
            # Another transaction holds the team row, as a representative's change would.
            holder.execute(select(Team.id).where(Team.id == team_id).with_for_update())
            expected = [(rename, 'outsider', 404), (rename, 'member', 403), (cancel, 'outsider', 404),
                        (cancel, 'member', 403), (decide, 'outsider', 404), (decide, 'member', 403),
                        (link, 'outsider', 404), (link, 'member', 403), (link, 'owner', 200)]
            for action, label, status in expected:
                thread, result = run_in_thread(lambda action=action, label=label: scene.call(label, action))
                thread.join(WAIT)
                assert not thread.is_alive(), f'{label} waited for the team lock'
                assert result['value'] == status, (label, result['value'])
            # A representative's change still takes the lock: it waits until the holder finishes.
            writer, written = run_in_thread(lambda: scene.call('owner', rename))
            writer.join(0.5)
            assert writer.is_alive()
            holder.rollback()
        writer.join(WAIT)
        assert written['value'] == 200
        with Session(test_engine) as db:
            assert db.get(Team, team_id).name == 'Travas Novas'
            assert db.get(TeamInvite, scene.invite.id).state == 'pendente'
            assert db.get(TeamJoinRequest, scene.request.id).state == 'pendente'
    finally:
        scene.cleanup()


def test_two_representatives_stepping_down_at_once_leave_one(test_engine):
    scene = Scene(test_engine)
    team_id = scene.team.id
    barrier = threading.Barrier(2)

    def step_down(label):
        def action(db, user):
            barrier.wait()
            teams.update_member(db, user, team_id, user.id, fields={'role'}, role='membro', position=None)
        return lambda: scene.call(label, action)

    try:
        threads = [run_in_thread(step_down(label)) for label in ('owner', 'second')]
        for thread, _ in threads:
            thread.join(WAIT * 2)
        assert sorted(result['value'] for _, result in threads) == [200, 409]
        with Session(test_engine) as db:
            roles = db.scalars(select(TeamMember.role).where(TeamMember.team_id == team_id,
                                                             TeamMember.left_at.is_(None))).all()
            assert sorted(roles) == ['membro', 'membro', 'representante']
    finally:
        scene.cleanup()
