import { describe, expect, it } from 'vitest'
import type { ArenaNotification } from '../src/api/notifications'
import { formatTimeLeft, groupByDay, notificationView, pendingDeadline, pendingTitle, pendingView } from '../src/data/notifications'
import { relativeTime } from '../src/utils/relativeTime'
import { noteOf } from './notifications-fixtures'

const caio = { id: 30, name: 'Caio Ramos', username: 'caio', avatar_url: null }
const note = (id: number, type: string, payload: Record<string, unknown>, extra: Partial<ArenaNotification> = {}) => noteOf(id, type, payload, extra)

describe('textos e destinos das notificações', () => {
  it.each([
    [note(1, 'convite_time', { team_id: 9, team_name: 'Leões' }), 'Um representante convidou você para o Leões', { screen: 'teams', teamId: 9, invites: true }],
    [note(1, 'convite_aceito', { team_id: 9, team_name: 'Leões' }), 'Um atleta aceitou o convite e entrou no Leões', { screen: 'teams', teamId: 9 }],
    [note(1, 'pedido_entrada', { team_id: 9, team_name: 'Leões' }, { actor: caio }), 'Caio Ramos pediu para entrar no Leões', { screen: 'teams', teamId: 9, requests: true }],
    [note(1, 'pedido_entrada_decidido', { team_id: 9, team_name: 'Leões', decision: 'aprovado' }), 'Seu pedido para entrar no Leões foi aprovado', { screen: 'teams', teamId: 9 }],
    [note(1, 'pedido_entrada_decidido', { team_id: 9, team_name: 'Leões', decision: 'recusado' }), 'Seu pedido para entrar no Leões foi recusado', null],
    [note(1, 'time_encerrado', { team_name: 'Leões' }), 'O Leões foi encerrado', null],
    [note(1, 'pedido_organizador_decidido', { decision: 'aprovado' }), 'Seu pedido de organizador foi aprovado', { screen: 'menu' }],
    [note(1, 'pedido_organizador_decidido', { decision: 'recusado', reason_code: 'outro', reason_detail: 'Sem eventos' }), 'Seu pedido de organizador foi recusado: Sem eventos', { screen: 'menu' }],
    [note(1, 'organizador_revogado', { reason: 'Eventos sem resposta' }), 'Sua permissão de organizador foi revogada: Eventos sem resposta', { screen: 'menu' }],
    [note(1, 'marca_corrida_registrada', {}), 'Nova atividade na sua conta', null],
    [note(1, 'convite_time', {}), 'Um representante convidou você para o time', { screen: 'teams', invites: true }],
  ])('%#: monta o texto e o destino', (item, text, target) => {
    const view = notificationView(item)
    expect(view.text).toBe(text)
    expect(view.target).toEqual(target)
  })

  it('formata o tempo relativo', () => {
    const now = Date.parse('2026-10-12T12:00:00Z')
    expect(relativeTime('2026-10-12T11:59:40Z', now)).toBe('agora')
    expect(relativeTime('2026-10-12T11:15:00Z', now)).toBe('há 45 min')
    expect(relativeTime('2026-10-11T10:00:00Z', now)).toBe('ontem')
    expect(relativeTime('2026-10-08T12:00:00Z', now)).toBe('há 4 dias')
    expect(relativeTime('2026-09-01T12:00:00Z', now)).toMatch(/1.*set/)
    expect(relativeTime('2025-09-01T12:00:00Z', now)).toMatch(/2025/)
    expect(relativeTime('inválida', now)).toBe('')
  })
})

const HOUR = 3600_000
const NOW = new Date(2026, 9, 13, 12, 0, 0).getTime()

describe('pendingView: rótulo, linha secundária e botão dos 14 tipos com pendência', () => {
  const at = new Date(2026, 9, 20, 16, 0).toISOString()
  it.each([
    ['convite_time', { team_name: 'Leões do Cerrado' }, 'CONVITE DE TIME', 'Ver convite', 'Caio Ramos · Leões do Cerrado'],
    ['pedido_entrada', { team_name: 'Leões do Cerrado' }, 'PEDIDO PARA ENTRAR', 'Ver pedido', 'Caio Ramos · Leões do Cerrado'],
    ['proposta_partida', { opponent_name: 'Tigres do Lago', format: 'society' }, 'PARTIDA ENCONTRADA', 'Responder proposta', 'Tigres do Lago · society 7'],
    ['vaga_encontrada', { position: 'goleiro', team_name: 'Ferrugem FC' }, 'VAGA ENCONTRADA', 'Responder vaga', 'Vaga de goleiro · Ferrugem FC'],
    ['condicoes_propostas', { starts_at: at, court_name: 'Quadra do Lago' }, 'CONDIÇÕES PROPOSTAS', 'Ver condições', expect.stringMatching(/^Caio Ramos · .*16:00 · Quadra do Lago$/)],
    ['wo_registrado', { opponent_name: 'Atlético Norte', contest_until: at }, 'W.O. REGISTRADO', 'Contestar W.O.', expect.stringMatching(/^Atlético Norte · conteste até .*16:00$/)],
    ['resultado_divergente', { deadline: at }, 'RESULTADO DIVERGENTE', 'Revisar resultado', expect.stringMatching(/^Corrijam até .*16:00$/)],
    ['comprovante_decidido', { event_name: 'Copa Sudoeste', reserved_until: at }, 'COMPROVANTE RECUSADO', 'Enviar comprovante', expect.stringMatching(/^Copa Sudoeste · envie outro até .*16:00$/)],
    ['devolucao_enviada', { event_name: 'Copa Sudoeste' }, 'DEVOLUÇÃO ENVIADA', 'Confirmar devolução', 'Copa Sudoeste · confirme o recebimento'],
    ['comprovante_recebido', { event_name: 'Copa Sudoeste' }, 'COMPROVANTE RECEBIDO', 'Analisar comprovante', 'Copa Sudoeste · Caio Ramos'],
    ['divergencia_para_decidir', { event_name: 'Copa Sudoeste', deadline: at }, 'DIVERGÊNCIA PARA DECIDIR', 'Decidir resultado', expect.stringMatching(/^Copa Sudoeste · prazo dos times: .*16:00$/)],
    ['evento_para_aprovar', { event_name: 'Copa Sudoeste' }, 'EVENTO PARA APROVAR', 'Analisar evento', 'Copa Sudoeste · Caio Ramos'],
    ['devolucao_contestada', { event_name: 'Copa Sudoeste' }, 'DEVOLUÇÃO CONTESTADA', 'Decidir devolução', 'Copa Sudoeste · Caio Ramos'],
    ['wo_contestado', {}, 'W.O. CONTESTADO', 'Decidir W.O.', 'Caio Ramos · contestou o W.O.'],
  ])('%s', (type, payload, label, action, secondary) => {
    expect(pendingView(note(1, type, payload, { actor: caio }))).toEqual({ label, action, secondary })
  })

  it('tipo desconhecido ganha o rótulo genérico e o botão "Abrir"', () => {
    expect(pendingView(note(1, 'tipo_futuro', {}))).toEqual({ label: 'PEDE SUA RESPOSTA', action: 'Abrir', secondary: 'Nova atividade na sua conta' })
  })

  it('o título em caixa de frase preserva "W.O."', () => {
    expect(pendingTitle(pendingView(note(1, 'wo_registrado', {})))).toBe('W.O. registrado')
    expect(pendingTitle(pendingView(note(1, 'proposta_partida', {})))).toBe('Partida encontrada')
  })
})

describe('prazo da pendência', () => {
  it.each([
    [20_000, 'menos de 1 min'], [45 * 60_000, '45 min'], [HOUR, '1 h'], [112 * 60_000, '1 h 52'], [21 * HOUR + 5 * 60_000, '21 h 05'],
    [24 * HOUR, '1 d'], [51 * HOUR, '2 d 3 h'],
  ])('formatTimeLeft(%i) → %s', (ms, text) => { expect(formatTimeLeft(ms)).toBe(text) })

  const withDeadline = (created: number, until: number | null) => note(1, 'proposta_partida', {}, {
    created_at: new Date(NOW + created).toISOString(), action_until: until === null ? null : new Date(NOW + until).toISOString() })
  it('calcula o que falta, a fração restante e o alerta', () => {
    expect(pendingDeadline(withDeadline(-10 * HOUR, 2 * HOUR), NOW)).toEqual({ left: '2 h', remaining: 2 / 12, warn: true })
    expect(pendingDeadline(withDeadline(-1 * HOUR, 10 * HOUR), NOW)).toEqual({ left: '10 h', remaining: 10 / 11, warn: false })
    // Menos de 25% do tempo, ainda com mais de 3 h.
    expect(pendingDeadline(withDeadline(-72 * HOUR, 12 * HOUR), NOW)).toMatchObject({ left: '12 h', warn: true })
    expect(pendingDeadline(withDeadline(-1 * HOUR, null), NOW)).toEqual({ left: null, remaining: null, warn: false })
  })
  it('prazo vencido ou sem duração não passa de 0% nem de 100%', () => {
    expect(pendingDeadline(withDeadline(-3 * HOUR, -HOUR), NOW)).toEqual({ left: 'menos de 1 min', remaining: 0, warn: true })
    expect(pendingDeadline(withDeadline(HOUR, 2 * HOUR), NOW)).toMatchObject({ remaining: 1 })
  })
})

describe('groupByDay', () => {
  const at = (days: number, hour = 9) => ({ created_at: new Date(2026, 9, 13 - days, hour).toISOString(), days })
  it('agrupa em Hoje, Ontem, Esta semana e Anteriores, na ordem recebida', () => {
    const items = [at(0, 11), at(0, 1), at(1, 23), at(2), at(6), at(7), at(30)]
    expect(groupByDay(items, NOW).map(group => [group.label, group.items.map(item => item.days)])).toEqual([
      ['Hoje', [0, 0]], ['Ontem', [1]], ['Esta semana', [2, 6]], ['Anteriores', [7, 30]],
    ])
  })
  it('omite grupos vazios e trata data inválida como anterior', () => {
    expect(groupByDay([at(1)], NOW).map(group => group.label)).toEqual(['Ontem'])
    expect(groupByDay([{ created_at: 'inválida' }], NOW).map(group => group.label)).toEqual(['Anteriores'])
    expect(groupByDay([], NOW)).toEqual([])
  })
})
