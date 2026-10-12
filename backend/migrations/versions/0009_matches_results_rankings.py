"""Stage 3: matchmaking queue, matches, terms, courts, walk-in slots, chat, results, football stats and records.

Jogar, fases 2 a 5. Contracts in docs/decisoes/0002-jogar.md (sections 7 to 14). The court catalog starts empty:
courts enter only through suggestions published by the administration (RN07). `standings` gains the record of
wins, draws, losses and goals (team tie-breaks, RN14) and an index for the general rankings. Championship matches
(stage 4) already fit: origin, event, round, bracket position and next match.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None

POSITIONS = "('goleiro', 'defesa', 'meio_campo', 'atacante')"
TIERS = "('bronze', 'prata', 'ouro', 'diamante', 'lendario')"
OPEN_SEARCH = "state IN ('ativa', 'pareada')"


def _timestamps(updated=True):
    columns = [sa.Column('created_at', sa.DateTime(timezone=True), nullable=False)]
    if updated:
        columns.append(sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False))
    return columns


def _user(name, ondelete='SET NULL', nullable=True):
    return sa.Column(name, sa.Integer(), sa.ForeignKey('users.id', ondelete=ondelete), nullable=nullable)


def _moment(name):
    return sa.Column(name, sa.DateTime(timezone=True), nullable=True)


def _side(name='side', nullable=False):
    return sa.Column(name, sa.String(1), nullable=nullable)


def upgrade():
    op.create_table('courts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('city_id', sa.Integer(), sa.ForeignKey('cities.id'), nullable=False),
        sa.Column('name', sa.String(80), nullable=False),
        sa.Column('name_key', sa.String(80), nullable=False),
        sa.Column('address', sa.String(160), nullable=True),
        sa.Column('kind', sa.String(10), nullable=False),
        sa.Column('state', sa.String(12), nullable=False),
        _user('suggested_by_id'),
        # FK to matches added after that table exists (circular reference).
        sa.Column('origin_match_id', sa.Integer(), nullable=True),
        _user('reviewed_by_id'),
        _moment('reviewed_at'),
        sa.Column('review_reason', sa.String(300), nullable=True),
        sa.Column('duplicate_of_id', sa.Integer(), sa.ForeignKey('courts.id', ondelete='SET NULL'), nullable=True),
        _moment('published_at'),
        *_timestamps(),
        sa.CheckConstraint("kind IN ('futsal', 'society', 'campo', 'tenis')", name='ck_courts_kind'),
        sa.CheckConstraint("state IN ('publicada', 'em_revisao', 'rejeitada')", name='ck_courts_state'),
        sa.CheckConstraint('char_length(name) BETWEEN 2 AND 80', name='ck_courts_name_length'),
        sa.CheckConstraint("(state = 'publicada') = (published_at IS NOT NULL)", name='ck_courts_published'),
        sa.CheckConstraint("(state = 'em_revisao') = (reviewed_at IS NULL)", name='ck_courts_reviewed'),
        sa.CheckConstraint("state <> 'rejeitada' OR review_reason IS NOT NULL OR duplicate_of_id IS NOT NULL",
                           name='ck_courts_rejection'),
        sa.CheckConstraint("duplicate_of_id IS NULL OR state = 'rejeitada'", name='ck_courts_duplicate'),
    )
    op.create_index('ix_courts_city_state', 'courts', ['city_id', 'state', 'name_key'])
    op.create_index('ix_courts_origin_match_id', 'courts', ['origin_match_id'])
    op.create_index('ix_courts_review_queue', 'courts', ['created_at', 'id'],
                    postgresql_where=sa.text("state = 'em_revisao'"))
    op.create_index('uq_courts_published_name', 'courts', ['city_id', 'kind', 'name_key'], unique=True,
                    postgresql_where=sa.text("state = 'publicada'"))

    op.create_table('matches',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('sport', sa.String(10), nullable=False),
        sa.Column('format', sa.String(10), nullable=True),
        sa.Column('city_id', sa.Integer(), sa.ForeignKey('cities.id'), nullable=False),
        sa.Column('origin', sa.String(12), nullable=False),
        sa.Column('event_id', sa.Integer(), sa.ForeignKey('events.id', ondelete='RESTRICT'), nullable=True),
        sa.Column('round_number', sa.SmallInteger(), nullable=True),
        sa.Column('bracket_position', sa.SmallInteger(), nullable=True),
        sa.Column('next_match_id', sa.Integer(), sa.ForeignKey('matches.id', ondelete='SET NULL'), nullable=True),
        _side('next_match_side', nullable=True),
        sa.Column('state', sa.String(15), nullable=False),
        _moment('proposal_expires_at'),
        _moment('starts_at'),
        sa.Column('court_id', sa.Integer(), sa.ForeignKey('courts.id', ondelete='SET NULL'), nullable=True),
        _side('booking_side', nullable=True),
        _moment('booking_confirmed_at'),
        _user('booking_confirmed_by_id'),
        sa.Column('super_tiebreak', sa.Boolean(), nullable=True),
        _moment('result_deadline'),
        sa.Column('score_a', sa.SmallInteger(), nullable=True),
        sa.Column('score_b', sa.SmallInteger(), nullable=True),
        sa.Column('sets', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        _side('winner_side', nullable=True),
        sa.Column('result_source', sa.String(15), nullable=True),
        _moment('result_confirmed_at'),
        _user('result_decided_by_id'),
        _moment('result_decided_at'),
        sa.Column('result_decision_reason', sa.String(500), nullable=True),
        _side('walkover_absent_side', nullable=True),
        _user('walkover_registered_by_id'),
        _moment('walkover_registered_at'),
        _user('walkover_contested_by_id'),
        _moment('walkover_contested_at'),
        sa.Column('walkover_contest_reason', sa.String(500), nullable=True),
        sa.Column('walkover_decision', sa.String(10), nullable=True),
        _user('walkover_decided_by_id'),
        _moment('walkover_decided_at'),
        sa.Column('walkover_decision_reason', sa.String(500), nullable=True),
        _moment('cancelled_at'),
        _user('cancelled_by_id'),
        sa.Column('cancel_reason', sa.String(300), nullable=True),
        _moment('closed_at'),
        *_timestamps(),
        sa.CheckConstraint("sport IN ('futebol', 'tenis')", name='ck_matches_sport'),
        sa.CheckConstraint("format IS NULL OR format IN ('futsal', 'society', 'campo')", name='ck_matches_format'),
        sa.CheckConstraint("(sport = 'futebol') = (format IS NOT NULL)", name='ck_matches_category'),
        sa.CheckConstraint("origin IN ('amistoso', 'campeonato')", name='ck_matches_origin'),
        sa.CheckConstraint("state IN ('proposta', 'recusada', 'expirada', 'combinando', 'agendada', 'realizada', "
                           "'encerrada', 'sem_resultado', 'cancelada')", name='ck_matches_state'),
        sa.CheckConstraint("(origin = 'campeonato') = (event_id IS NOT NULL) AND (origin = 'campeonato' OR "
                           "(round_number IS NULL AND bracket_position IS NULL AND next_match_id IS NULL))",
                           name='ck_matches_event'),
        sa.CheckConstraint("next_match_side IS NULL OR (next_match_id IS NOT NULL AND next_match_side IN ('a', 'b'))",
                           name='ck_matches_next'),
        sa.CheckConstraint("(state <> 'proposta' OR proposal_expires_at IS NOT NULL) AND "
                           "(proposal_expires_at IS NULL OR origin = 'amistoso')", name='ck_matches_proposal'),
        sa.CheckConstraint("state NOT IN ('agendada', 'realizada', 'encerrada', 'sem_resultado') OR "
                           "starts_at IS NOT NULL", name='ck_matches_scheduled'),
        sa.CheckConstraint('(starts_at IS NULL) = (result_deadline IS NULL) AND '
                           '(result_deadline IS NULL OR result_deadline > starts_at)', name='ck_matches_deadline'),
        sa.CheckConstraint("booking_side IS NULL OR booking_side IN ('a', 'b')", name='ck_matches_booking_side'),
        sa.CheckConstraint('booking_confirmed_at IS NULL OR booking_side IS NOT NULL', name='ck_matches_booking'),
        sa.CheckConstraint("super_tiebreak IS NULL OR sport = 'tenis'", name='ck_matches_super_tiebreak'),
        sa.CheckConstraint("(result_confirmed_at IS NOT NULL) = (state IN ('realizada', 'encerrada')) AND "
                           "(result_confirmed_at IS NULL) = (score_a IS NULL) AND (score_a IS NULL) = (score_b IS NULL) "
                           "AND (score_a IS NULL) = (result_source IS NULL)", name='ck_matches_result'),
        sa.CheckConstraint('score_a IS NULL OR (score_a BETWEEN 0 AND 99 AND score_b BETWEEN 0 AND 99)',
                           name='ck_matches_score_range'),
        sa.CheckConstraint("result_source IS NULL OR result_source IN ('confirmacao', 'wo', 'organizador', "
                           "'administracao')", name='ck_matches_result_source'),
        sa.CheckConstraint("winner_side IS NULL OR winner_side IN ('a', 'b')", name='ck_matches_winner'),
        sa.CheckConstraint("sport <> 'tenis' OR score_a IS NULL OR (winner_side IS NOT NULL AND sets IS NOT NULL)",
                           name='ck_matches_tennis_result'),
        sa.CheckConstraint("result_source IS NULL OR result_source NOT IN ('organizador', 'administracao') OR "
                           "(result_decided_at IS NOT NULL AND result_decision_reason IS NOT NULL)",
                           name='ck_matches_result_decision'),
        sa.CheckConstraint("walkover_absent_side IS NULL OR walkover_absent_side IN ('a', 'b')",
                           name='ck_matches_walkover_side'),
        sa.CheckConstraint('(walkover_absent_side IS NULL) = (walkover_registered_at IS NULL) AND '
                           '(walkover_contested_at IS NULL OR walkover_registered_at IS NOT NULL) AND '
                           '(walkover_contested_at IS NULL) = (walkover_contest_reason IS NULL) AND '
                           '(walkover_decision IS NULL OR walkover_contested_at IS NOT NULL) AND '
                           '(walkover_decision IS NULL) = (walkover_decided_at IS NULL) AND '
                           '(walkover_decision IS NULL) = (walkover_decision_reason IS NULL)', name='ck_matches_walkover'),
        sa.CheckConstraint("walkover_decision IS NULL OR walkover_decision IN ('mantido', 'anulado')",
                           name='ck_matches_walkover_decision'),
        sa.CheckConstraint("(state = 'cancelada') = (cancelled_at IS NOT NULL)", name='ck_matches_cancelled'),
        sa.CheckConstraint("(closed_at IS NOT NULL) = (state IN ('recusada', 'expirada', 'encerrada', "
                           "'sem_resultado', 'cancelada'))", name='ck_matches_closed'),
    )
    op.create_index('ix_matches_city_state_start', 'matches', ['city_id', 'state', 'starts_at'])
    op.create_index('ix_matches_court_start', 'matches', ['court_id', 'starts_at'],
                    postgresql_where=sa.text("state IN ('agendada', 'realizada', 'encerrada')"))
    op.create_index('ix_matches_event', 'matches', ['event_id', 'round_number', 'bracket_position'],
                    postgresql_where=sa.text('event_id IS NOT NULL'))
    op.create_index('ix_matches_proposals_due', 'matches', ['proposal_expires_at'],
                    postgresql_where=sa.text("state = 'proposta'"))
    op.create_index('ix_matches_results_due', 'matches', ['result_deadline'],
                    postgresql_where=sa.text("state IN ('agendada', 'realizada')"))
    op.create_foreign_key('fk_courts_origin_match_id_matches', 'courts', 'matches', ['origin_match_id'], ['id'],
                          ondelete='SET NULL')

    op.create_table('match_slots',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('match_id', sa.Integer(), sa.ForeignKey('matches.id', ondelete='CASCADE'), nullable=False),
        _side(),
        sa.Column('position', sa.String(20), nullable=False),
        sa.Column('state', sa.String(10), nullable=False),
        sa.Column('opened_at', sa.DateTime(timezone=True), nullable=False),
        _user('filled_by_id', 'CASCADE'),
        _moment('filled_at'),
        _moment('removed_at'),
        _user('removed_by_id'),
        _moment('closed_at'),
        *_timestamps(updated=False),
        sa.CheckConstraint("side IN ('a', 'b')", name='ck_match_slots_side'),
        sa.CheckConstraint(f'position IN {POSITIONS}', name='ck_match_slots_position'),
        sa.CheckConstraint("state IN ('aberta', 'oferecida', 'preenchida', 'fechada')", name='ck_match_slots_state'),
        sa.CheckConstraint("(filled_by_id IS NULL) = (filled_at IS NULL) AND "
                           "(state <> 'preenchida' OR (filled_by_id IS NOT NULL AND removed_at IS NULL)) AND "
                           "(state NOT IN ('aberta', 'oferecida') OR filled_by_id IS NULL)", name='ck_match_slots_filled'),
        sa.CheckConstraint("removed_at IS NULL OR (filled_by_id IS NOT NULL AND state = 'fechada')",
                           name='ck_match_slots_removed'),
        sa.CheckConstraint("(state = 'fechada') = (closed_at IS NOT NULL)", name='ck_match_slots_closed'),
    )
    op.create_index('ix_match_slots_match_side', 'match_slots', ['match_id', 'side', 'state'])
    op.create_index('ix_match_slots_open', 'match_slots', ['position', 'opened_at', 'id'],
                    postgresql_where=sa.text("state = 'aberta'"))
    op.create_index('uq_match_slots_filled_user', 'match_slots', ['match_id', 'filled_by_id'], unique=True,
                    postgresql_where=sa.text("state = 'preenchida'"))

    op.create_table('match_searches',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('sport', sa.String(10), nullable=False),
        sa.Column('kind', sa.String(10), nullable=False),
        sa.Column('city_id', sa.Integer(), sa.ForeignKey('cities.id'), nullable=False),
        sa.Column('format', sa.String(10), nullable=True),
        sa.Column('position', sa.String(20), nullable=True),
        sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id', ondelete='CASCADE'), nullable=True),
        _user('user_id', 'CASCADE'),
        _user('created_by_id'),
        sa.Column('tier', sa.String(10), nullable=True),
        sa.Column('open_slots', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('state', sa.String(15), nullable=False),
        sa.Column('match_id', sa.Integer(), sa.ForeignKey('matches.id'), nullable=True),
        sa.Column('slot_id', sa.Integer(), sa.ForeignKey('match_slots.id'), nullable=True),
        _moment('offer_expires_at'),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        _moment('ended_at'),
        *_timestamps(),
        sa.CheckConstraint("sport IN ('futebol', 'tenis')", name='ck_match_searches_sport'),
        sa.CheckConstraint("kind IN ('time', 'tenis', 'avulso')", name='ck_match_searches_kind'),
        sa.CheckConstraint("state IN ('ativa', 'pareada', 'concluida', 'cancelada', 'expirada', 'recusada', "
                           "'sem_resposta')", name='ck_match_searches_state'),
        sa.CheckConstraint('(team_id IS NULL) <> (user_id IS NULL)', name='ck_match_searches_subject'),
        sa.CheckConstraint("format IS NULL OR format IN ('futsal', 'society', 'campo')",
                           name='ck_match_searches_format'),
        sa.CheckConstraint(f'position IS NULL OR position IN {POSITIONS}', name='ck_match_searches_position'),
        sa.CheckConstraint(f'tier IS NULL OR tier IN {TIERS}', name='ck_match_searches_tier'),
        sa.CheckConstraint(
            "(kind = 'time' AND sport = 'futebol' AND team_id IS NOT NULL AND format IS NOT NULL AND position IS NULL "
            "AND open_slots IS NOT NULL) OR "
            "(kind = 'tenis' AND sport = 'tenis' AND user_id IS NOT NULL AND format IS NULL AND position IS NULL "
            "AND open_slots IS NULL) OR "
            "(kind = 'avulso' AND sport = 'futebol' AND user_id IS NOT NULL AND format IS NULL AND open_slots IS NULL "
            "AND tier IS NULL)", name='ck_match_searches_category'),
        sa.CheckConstraint('expires_at > started_at', name='ck_match_searches_window'),
        sa.CheckConstraint(f'(ended_at IS NULL) = ({OPEN_SEARCH})', name='ck_match_searches_ended'),
        sa.CheckConstraint("state <> 'pareada' OR (kind <> 'avulso' AND match_id IS NOT NULL) OR "
                           "(kind = 'avulso' AND slot_id IS NOT NULL AND offer_expires_at IS NOT NULL)",
                           name='ck_match_searches_paired'),
        sa.CheckConstraint("(slot_id IS NULL OR kind = 'avulso') AND (offer_expires_at IS NULL OR slot_id IS NOT NULL)",
                           name='ck_match_searches_offer'),
    )
    op.create_index('ix_match_searches_team_id', 'match_searches', ['team_id'])
    op.create_index('ix_match_searches_user_id', 'match_searches', ['user_id'])
    op.create_index('ix_match_searches_match_id', 'match_searches', ['match_id'])
    op.create_index('ix_match_searches_queue', 'match_searches', ['kind', 'city_id', 'format', 'started_at', 'id'],
                    postgresql_where=sa.text("state = 'ativa'"))
    op.create_index('ix_match_searches_due', 'match_searches', ['expires_at'],
                    postgresql_where=sa.text("state = 'ativa'"))
    op.create_index('ix_match_searches_offers_due', 'match_searches', ['offer_expires_at'],
                    postgresql_where=sa.text("state = 'pareada' AND offer_expires_at IS NOT NULL"))
    op.create_index('uq_match_searches_slot_offer', 'match_searches', ['slot_id'], unique=True,
                    postgresql_where=sa.text("state = 'pareada'"))
    op.create_index('uq_match_searches_team_open', 'match_searches', ['team_id', 'sport'], unique=True,
                    postgresql_where=sa.text(f'team_id IS NOT NULL AND {OPEN_SEARCH}'))
    op.create_index('uq_match_searches_user_open', 'match_searches', ['user_id', 'sport'], unique=True,
                    postgresql_where=sa.text(f'user_id IS NOT NULL AND {OPEN_SEARCH}'))

    op.create_table('match_sides',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('match_id', sa.Integer(), sa.ForeignKey('matches.id', ondelete='CASCADE'), nullable=False),
        _side(),
        sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id', ondelete='CASCADE'), nullable=True),
        _user('user_id', 'CASCADE'),
        sa.Column('search_id', sa.Integer(), sa.ForeignKey('match_searches.id', ondelete='SET NULL'), nullable=True),
        sa.Column('tier', sa.String(10), nullable=True),
        sa.Column('declared_slots', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        _moment('accepted_at'),
        _user('accepted_by_id'),
        _moment('declined_at'),
        _user('declined_by_id'),
        *_timestamps(updated=False),
        sa.CheckConstraint("side IN ('a', 'b')", name='ck_match_sides_side'),
        sa.CheckConstraint('(team_id IS NULL) <> (user_id IS NULL)', name='ck_match_sides_subject'),
        sa.CheckConstraint(f'tier IS NULL OR tier IN {TIERS}', name='ck_match_sides_tier'),
        sa.CheckConstraint('accepted_at IS NULL OR declined_at IS NULL', name='ck_match_sides_answer'),
        sa.UniqueConstraint('match_id', 'side', name='uq_match_sides_side'),
    )
    op.create_index('ix_match_sides_team_id', 'match_sides', ['team_id'])
    op.create_index('ix_match_sides_user_id', 'match_sides', ['user_id'])
    op.create_index('uq_match_sides_team', 'match_sides', ['match_id', 'team_id'], unique=True,
                    postgresql_where=sa.text('team_id IS NOT NULL'))
    op.create_index('uq_match_sides_user', 'match_sides', ['match_id', 'user_id'], unique=True,
                    postgresql_where=sa.text('user_id IS NOT NULL'))

    op.create_table('match_terms',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('match_id', sa.Integer(), sa.ForeignKey('matches.id', ondelete='CASCADE'), nullable=False),
        _user('proposed_by_id'),
        _side('proposed_by_side', nullable=True),
        sa.Column('starts_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('court_id', sa.Integer(), sa.ForeignKey('courts.id', ondelete='RESTRICT'), nullable=False),
        _side('booking_side'),
        sa.Column('super_tiebreak', sa.Boolean(), nullable=True),
        sa.Column('state', sa.String(12), nullable=False),
        _moment('accepted_a_at'),
        _user('accepted_a_by_id'),
        _moment('accepted_b_at'),
        _user('accepted_b_by_id'),
        _moment('decided_at'),
        *_timestamps(updated=False),
        sa.CheckConstraint("state IN ('pendente', 'aceita', 'substituida', 'cancelada')", name='ck_match_terms_state'),
        sa.CheckConstraint("proposed_by_side IS NULL OR proposed_by_side IN ('a', 'b')", name='ck_match_terms_side'),
        sa.CheckConstraint("booking_side IN ('a', 'b')", name='ck_match_terms_booking_side'),
        sa.CheckConstraint("(proposed_by_side IS DISTINCT FROM 'a' OR accepted_a_at IS NOT NULL) AND "
                           "(proposed_by_side IS DISTINCT FROM 'b' OR accepted_b_at IS NOT NULL)",
                           name='ck_match_terms_proposer'),
        sa.CheckConstraint("state <> 'aceita' OR proposed_by_side IS NULL OR "
                           "(accepted_a_at IS NOT NULL AND accepted_b_at IS NOT NULL)", name='ck_match_terms_accepted'),
        sa.CheckConstraint("(state = 'pendente') = (decided_at IS NULL)", name='ck_match_terms_decided'),
    )
    op.create_index('ix_match_terms_court_id', 'match_terms', ['court_id'])
    op.create_index('ix_match_terms_match_created', 'match_terms', ['match_id', 'created_at', 'id'])
    op.create_index('uq_match_terms_pending', 'match_terms', ['match_id'], unique=True,
                    postgresql_where=sa.text("state = 'pendente'"))
    op.create_index('uq_match_terms_accepted', 'match_terms', ['match_id'], unique=True,
                    postgresql_where=sa.text("state = 'aceita'"))

    op.create_table('match_lineups',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('match_id', sa.Integer(), sa.ForeignKey('matches.id', ondelete='CASCADE'), nullable=False),
        _side(),
        _user('user_id', 'CASCADE', nullable=False),
        sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id', ondelete='SET NULL'), nullable=True),
        sa.Column('guest', sa.Boolean(), nullable=False),
        sa.Column('slot_id', sa.Integer(), sa.ForeignKey('match_slots.id', ondelete='SET NULL'), nullable=True),
        sa.Column('position', sa.String(20), nullable=True),
        sa.Column('present', sa.Boolean(), nullable=True),
        _user('present_marked_by_id'),
        _moment('removed_at'),
        *_timestamps(),
        sa.CheckConstraint("side IN ('a', 'b')", name='ck_match_lineups_side'),
        sa.CheckConstraint(f'position IS NULL OR position IN {POSITIONS}', name='ck_match_lineups_position'),
        sa.CheckConstraint('removed_at IS NULL OR guest', name='ck_match_lineups_removed'),
        sa.UniqueConstraint('match_id', 'user_id', name='uq_match_lineups_user'),
    )
    op.create_index('ix_match_lineups_match_side', 'match_lineups', ['match_id', 'side'])
    op.create_index('ix_match_lineups_user_id', 'match_lineups', ['user_id'])

    op.create_table('match_messages',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('match_id', sa.Integer(), sa.ForeignKey('matches.id', ondelete='CASCADE'), nullable=False),
        _user('author_id'),
        _side(nullable=True),
        sa.Column('kind', sa.String(10), nullable=False),
        sa.Column('event_type', sa.String(30), nullable=True),
        sa.Column('body', sa.String(1000), nullable=False),
        sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        _moment('removed_at'),
        _user('removed_by_id'),
        *_timestamps(updated=False),
        sa.CheckConstraint("kind IN ('texto', 'evento')", name='ck_match_messages_kind'),
        sa.CheckConstraint("side IS NULL OR side IN ('a', 'b')", name='ck_match_messages_side'),
        sa.CheckConstraint('char_length(body) BETWEEN 1 AND 1000', name='ck_match_messages_body'),
        sa.CheckConstraint("(kind = 'evento') = (event_type IS NOT NULL)", name='ck_match_messages_event'),
        sa.CheckConstraint("removed_at IS NULL OR kind = 'texto'", name='ck_match_messages_removed'),
    )
    op.create_index('ix_match_messages_match_id', 'match_messages', ['match_id', 'id'])

    op.create_table('match_results',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('match_id', sa.Integer(), sa.ForeignKey('matches.id', ondelete='CASCADE'), nullable=False),
        _side(),
        _user('reported_by_id'),
        sa.Column('score_a', sa.SmallInteger(), nullable=False),
        sa.Column('score_b', sa.SmallInteger(), nullable=False),
        sa.Column('sets', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        *_timestamps(),
        sa.CheckConstraint("side IN ('a', 'b')", name='ck_match_results_side'),
        sa.CheckConstraint('score_a BETWEEN 0 AND 99 AND score_b BETWEEN 0 AND 99', name='ck_match_results_score'),
        sa.UniqueConstraint('match_id', 'side', name='uq_match_results_side'),
    )

    op.create_table('football_stats',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('lineup_id', sa.Integer(), sa.ForeignKey('match_lineups.id', ondelete='CASCADE'), nullable=False),
        sa.Column('match_id', sa.Integer(), sa.ForeignKey('matches.id', ondelete='CASCADE'), nullable=False),
        _user('user_id', 'CASCADE', nullable=False),
        sa.Column('goals', sa.SmallInteger(), nullable=True),
        sa.Column('assists', sa.SmallInteger(), nullable=True),
        sa.Column('position_stat', sa.SmallInteger(), nullable=True),
        sa.Column('state', sa.String(12), nullable=False),
        sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=False),
        _moment('reviewed_at'),
        _user('reviewed_by_id'),
        _moment('contested_at'),
        _user('contested_by_id'),
        sa.Column('contest_reason', sa.String(300), nullable=True),
        sa.Column('contested_fields', postgresql.ARRAY(sa.String(20)), nullable=True),
        *_timestamps(),
        sa.CheckConstraint("state IN ('enviada', 'revisada', 'contestada')", name='ck_football_stats_state'),
        sa.CheckConstraint('(goals IS NULL OR goals BETWEEN 0 AND 50) AND (assists IS NULL OR assists BETWEEN 0 AND 50) '
                           'AND (position_stat IS NULL OR position_stat BETWEEN 0 AND 50)', name='ck_football_stats_range'),
        sa.CheckConstraint("state <> 'revisada' OR reviewed_at IS NOT NULL", name='ck_football_stats_reviewed'),
        sa.CheckConstraint("(contested_at IS NULL) = (contest_reason IS NULL) AND (contested_at IS NULL) = "
                           "(contested_fields IS NULL) AND (state <> 'contestada' OR contested_at IS NOT NULL)",
                           name='ck_football_stats_contest'),
        sa.CheckConstraint("contested_fields IS NULL OR (cardinality(contested_fields) >= 1 AND contested_fields <@ "
                           "ARRAY['gols', 'assistencias', 'estatistica_posicao']::varchar[])",
                           name='ck_football_stats_fields'),
        sa.UniqueConstraint('lineup_id', name='uq_football_stats_lineup'),
        sa.UniqueConstraint('match_id', 'user_id', name='uq_football_stats_match_user'),
    )
    op.create_index('ix_football_stats_user_id', 'football_stats', ['user_id'])

    for column in ('wins', 'draws', 'losses', 'goals_for', 'goals_against'):
        op.add_column('standings', sa.Column(column, sa.Integer(), server_default=sa.text('0'), nullable=False))
    op.create_check_constraint('ck_standings_record', 'standings',
                               'wins >= 0 AND draws >= 0 AND losses >= 0 AND goals_for >= 0 AND goals_against >= 0')
    op.create_index('ix_standings_ranking', 'standings', ['sport', 'format', 'position', 'distance_km', 'rank_position'],
                    postgresql_where=sa.text('rank_position IS NOT NULL'))


def downgrade():
    # Dropping a table drops its indexes and constraints; the circular FK of courts goes first.
    op.drop_index('ix_standings_ranking', table_name='standings')
    op.drop_constraint('ck_standings_record', 'standings', type_='check')
    for column in ('goals_against', 'goals_for', 'losses', 'draws', 'wins'):
        op.drop_column('standings', column)
    op.drop_constraint('fk_courts_origin_match_id_matches', 'courts', type_='foreignkey')
    for table in ('football_stats', 'match_results', 'match_messages', 'match_lineups', 'match_terms', 'match_sides',
                  'match_searches', 'match_slots', 'matches', 'courts'):
        op.drop_table(table)
