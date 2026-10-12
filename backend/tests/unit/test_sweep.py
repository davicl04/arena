from datetime import datetime, timezone

import pytest

from app import admin_cli
from app.services import sweep
from app.services.sweep import TASKS, SweepTask, run_sweep

NOW = datetime(2026, 10, 12, 15, 0, tzinfo=timezone.utc)


class Db:
    def __init__(self):
        self.calls = []

    def commit(self):
        self.calls.append('commit')

    def rollback(self):
        self.calls.append('rollback')


def test_stage_two_and_three_tasks_are_registered_in_order():
    # Expiries run before pairing again, so requeued searches and reopened slots get a new chance in the same run.
    assert [task.name for task in TASKS] == ['reservas_expiradas', 'devolucoes_recebidas', 'buscas_expiradas',
                                             'propostas_expiradas', 'ofertas_expiradas', 'pareamento',
                                             'resultados_vencidos', 'campeonatos_encerrados', 'rankings_janela']
    # Inline expiry with nothing to expire does not touch the database.
    assert sweep.expire_entries(None, [], NOW) == 0


def test_rematch_task_commits_bucket_by_bucket(monkeypatch):
    calls = []
    monkeypatch.setattr(sweep.queue, 'rematch', lambda db, now, commit: calls.append((db, now, commit)) or 4)
    db = Db()
    assert sweep.rematch_waiting(db, NOW) == 4
    assert calls == [(db, NOW, db.commit)]


def test_window_task_delegates_to_the_ranking_recalculation(monkeypatch):
    calls = []
    monkeypatch.setattr(sweep, 'recalculate_outside_window', lambda db, now: calls.append((db, now)) or 5)
    db = Db()
    assert sweep.rankings_outside_window(db, NOW) == 5
    assert calls == [(db, NOW)]


def test_each_task_commits_and_a_failing_task_does_not_stop_the_others(caplog):
    seen = []

    def ok(db, now):
        seen.append(now)
        return 3

    def broken(db, now):
        raise RuntimeError('detalhe interno')

    db = Db()
    report = run_sweep(db, NOW, [SweepTask('primeira', ok), SweepTask('quebrada', broken), SweepTask('ultima', ok)])
    assert report == {'primeira': 3, 'quebrada': None, 'ultima': 3}
    assert db.calls == ['commit', 'rollback', 'commit'] and seen == [NOW, NOW]
    assert 'quebrada' in caplog.text and 'detalhe interno' not in caplog.text


def test_default_moment_is_now(monkeypatch):
    monkeypatch.setattr(sweep, 'utcnow', lambda: NOW)
    moments = []
    run_sweep(Db(), tasks=[SweepTask('t', lambda db, now: moments.append(now) or 0)])
    assert moments == [NOW]


class Session:
    def __enter__(self):
        return 'db'

    def __exit__(self, *_):
        return False


def test_cli_sweep_runs_once_and_prints_a_summary(monkeypatch, capsys):
    monkeypatch.setattr(admin_cli, 'SessionLocal', Session)
    monkeypatch.setattr(admin_cli, 'run_sweep', lambda db: {'reservas_expiradas': 2, 'devolucoes_recebidas': None})
    admin_cli.main(['sweep'])
    output = capsys.readouterr().out
    assert 'reservas_expiradas=2' in output and 'devolucoes_recebidas=falhou' in output


def test_cli_sweep_loops_until_interrupted(monkeypatch, capsys):
    runs, pauses = [], []
    monkeypatch.setattr(admin_cli, 'SessionLocal', Session)
    monkeypatch.setattr(admin_cli, 'run_sweep', lambda db: runs.append(db) or {'reservas_expiradas': 0})

    def sleep(seconds):
        pauses.append(seconds)
        if len(pauses) == 2:
            raise KeyboardInterrupt

    admin_cli.sweep(60, sleep=sleep)
    assert len(runs) == 2 and pauses == [60, 60]
    assert 'Varredura encerrada.' in capsys.readouterr().out


def test_cli_rejects_a_loop_shorter_than_one_second():
    with pytest.raises(SystemExit):
        admin_cli.main(['sweep', '--loop', '0'])


def test_cli_still_promotes_and_demotes_admins(monkeypatch, capsys):
    from types import SimpleNamespace

    user = SimpleNamespace(id=4, is_admin=False)

    class AdminSession:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def scalar(self, _):
            return user

        def commit(self):
            pass

    monkeypatch.setattr(admin_cli, 'SessionLocal', AdminSession)
    admin_cli.main(['promote-admin', 'Ana@Example.com'])
    assert user.is_admin and 'conta 4' in capsys.readouterr().out
    admin_cli.main(['remove-admin', 'ana@example.com'])
    assert not user.is_admin
    user = None
    with pytest.raises(SystemExit):
        admin_cli.main(['promote-admin', 'ninguem@example.com'])
