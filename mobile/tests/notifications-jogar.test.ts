import { describe, expect, it, vi } from 'vitest'
import type { ArenaNotification } from '../src/api/notifications'
import { notificationView } from '../src/data/notifications'
import { caio, person } from './support/play'

vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))

/*
 * Notificações das etapas 3 e 4 (0002-jogar, seção 13, e 0003, seção 21.6): texto e destino de cada tipo. A tela de
 * Notificações abre o destino por `openTarget` (frente das notificações); aqui só o mapeamento de dados.
 */

const rafa = person(2, 'Rafa Nunes')
let nextId = 1
const note = (type: string, payload: Record<string, unknown>, actor: ArenaNotification['actor'] = null): ArenaNotification =>
  ({ id: nextId++, type, payload, actor, created_at: new Date(Date.now() - 60e3).toISOString(), read_at: null })
const view = (type: string, payload: Record<string, unknown> = {}, actor: ArenaNotification['actor'] = null, isAdmin = false) =>
  notificationView(note(type, { match_id: 12, ...payload }, actor), { isAdmin })
/** 20/10/2026 às 16:00 no fuso do aparelho. */
const kickoff = new Date(2026, 9, 20, 16, 0).toISOString()

describe('texto e destino dos tipos da etapa 3', () => {
  it('proposta, aceite e encerramento levam à placa do Jogar (ou à partida, com o aceite dos dois lados)', () => {
    const toBoard = { screen: 'play', matchId: 12 }
    const proposal = view('proposta_partida', { sport: 'futebol', format: 'society', opponent_name: 'Tigres do Lago', expires_at: kickoff })
    expect(proposal).toMatchObject({ kind: 'match', teamName: null, target: toBoard })
    expect(proposal.text).toMatch(/^Partida encontrada contra Tigres do Lago\. Responda até \w{3}, 20 out · 16:00$/)
    expect(view('proposta_partida', { opponent_name: 'Tigres do Lago' }).text).toBe('Partida encontrada contra Tigres do Lago. Responda em até 2 h')
    expect(view('proposta_partida').text).toBe('Partida encontrada contra um adversário. Responda em até 2 h')
    expect(view('proposta_aceita', { opponent_name: 'Tigres do Lago', complete: false })).toMatchObject({ text: 'Tigres do Lago aceitou a proposta', target: toBoard })
    expect(view('proposta_aceita', {}, caio).text).toBe('Caio Ramos aceitou a proposta')
    expect(view('proposta_aceita').text).toBe('O adversário aceitou a proposta')
    expect(view('proposta_aceita', { opponent_name: 'Tigres do Lago', complete: true })).toMatchObject({ text: 'Partida confirmada contra Tigres do Lago. Combinem no chat', target: { screen: 'match', matchId: 12 } })
    expect(view('proposta_aceita', { complete: true }).text).toBe('Partida confirmada contra um adversário. Combinem no chat')
    expect(view('proposta_encerrada', { opponent_name: 'Tigres do Lago', reason: 'recusada', requeued: true })).toMatchObject({ text: 'A proposta contra Tigres do Lago foi recusada. Sua busca continua', target: toBoard })
    expect(view('proposta_encerrada', { opponent_name: 'Tigres do Lago', reason: 'expirada', requeued: false }).text).toBe('A proposta contra Tigres do Lago expirou')
    expect(view('proposta_encerrada').text).toBe('A proposta contra um adversário foi recusada')
  })

  it('vaga encontrada abre a placa; preenchida e removido seguem a partida (removido, sem destino)', () => {
    const offer = view('vaga_encontrada', { slot_id: 4, position: 'meio_campo', format: 'society', team_name: 'Ferrugem FC', starts_at: kickoff, expires_at: kickoff })
    expect(offer).toMatchObject({ kind: 'match', target: { screen: 'play', matchId: 12 } })
    expect(offer.text).toMatch(/^Vaga de meio de campo no Ferrugem FC\. Responda até \w{3}, 20 out · 16:00$/)
    expect(view('vaga_encontrada', { position: 'goleiro', team_name: 'Ferrugem FC' }).text).toBe('Vaga de goleiro no Ferrugem FC. Responda em até 2 h')
    expect(view('vaga_encontrada', { position: 'ponta' }).text).toBe('Vaga de posição no time. Responda em até 2 h')
    expect(view('vaga_preenchida', { slot_id: 4, position: 'goleiro' }, caio)).toMatchObject({ text: 'Caio Ramos entrou como goleiro', kind: 'match', target: { screen: 'match', matchId: 12 } })
    expect(view('vaga_preenchida', { position: 'atacante' }).text).toBe('Um avulso entrou como atacante')
    expect(view('removido_da_partida', { team_name: 'Ferrugem FC' })).toMatchObject({ text: 'Você foi removido da partida do Ferrugem FC', kind: 'match', target: null })
    expect(view('oferta_retirada', { slot_id: 4, position: 'goleiro', team_name: 'Ferrugem FC', reason: 'vagas_reduzidas', requeued: true })).toMatchObject({
      text: 'A vaga de goleiro no Ferrugem FC foi retirada. Sua busca continua', kind: 'match', target: { screen: 'play', matchId: 12 },
    })
    expect(view('oferta_retirada', { position: 'defesa', team_name: 'Ferrugem FC', reason: 'partida_cancelada', requeued: false }).text).toBe('A vaga de defesa no Ferrugem FC foi retirada')
  })

  it('condições, agenda e cancelamento levam à partida', () => {
    const toMatch = { screen: 'match', matchId: 12 }
    const proposed = view('condicoes_propostas', { terms_id: 3, starts_at: kickoff, court_name: 'Quadra do Lago' }, rafa)
    expect(proposed).toMatchObject({ kind: 'schedule', target: toMatch })
    expect(proposed.text).toMatch(/^Rafa Nunes propôs novas condições: \w{3}, 20 out · 16:00 em Quadra do Lago$/)
    expect(view('condicoes_propostas', { terms_id: 3 }).text).toBe('O outro lado propôs novas condições')
    expect(view('partida_agendada', { terms_id: 3, starts_at: kickoff, court_name: 'Quadra do Lago', changed: false }, rafa).text).toMatch(/^Partida agendada: \w{3}, 20 out · 16:00 em Quadra do Lago$/)
    expect(view('partida_agendada', { terms_id: 3, starts_at: kickoff, court_name: 'Quadra do Lago', changed: true })).toMatchObject({ kind: 'schedule', target: toMatch })
    expect(view('partida_agendada', { changed: true }).text).toBe('Partida alterada')
    expect(view('partida_cancelada', { starts_at: kickoff, reason: 'Chuva forte.' }, rafa).text).toMatch(/^Rafa Nunes cancelou a partida de \w{3}, 20 out · 16:00: Chuva forte$/)
    expect(view('partida_cancelada', { starts_at: kickoff, reason: null }).text).toMatch(/^A partida de \w{3}, 20 out · 16:00 foi cancelada$/)
    expect(view('partida_cancelada', { starts_at: null, reason: null })).toMatchObject({ text: 'A partida foi cancelada', target: toMatch })
  })

  it('W.O.: registro, contestação e decisão levam à partida; a contestação, para a administração, à fila', () => {
    const toMatch = { screen: 'match', matchId: 12 }
    const registered = view('wo_registrado', { opponent_name: 'Ferrugem FC', contest_until: kickoff }, rafa)
    expect(registered).toMatchObject({ kind: 'walkover', target: toMatch })
    expect(registered.text).toMatch(/^Ferrugem FC registrou W\.O\. Conteste até \w{3}, 20 out · 16:00 se vocês compareceram$/)
    expect(view('wo_registrado').text).toBe('O adversário registrou W.O. Conteste se vocês compareceram')
    expect(view('wo_contestado', { reason: 'Estávamos lá.' }, caio)).toMatchObject({ text: 'Caio Ramos contestou o W.O.', kind: 'walkover', target: toMatch })
    expect(view('wo_contestado', { reason: 'Estávamos lá.' }, caio, true)).toMatchObject({ text: 'Caio Ramos contestou o W.O.', target: { screen: 'admin-walkover-disputes' } })
    expect(view('wo_contestado').text).toBe('O outro lado contestou o W.O.')
    expect(view('wo_decidido', { decision: 'mantido', reason: 'Vale o registro.' })).toMatchObject({ text: 'A administração manteve o W.O.: Vale o registro', target: toMatch })
    expect(view('wo_decidido', { decision: 'anulado' }).text).toBe('A administração anulou o W.O.')
  })

  it('resultado, divergência e estatística contestada levam à partida', () => {
    const toMatch = { screen: 'match', matchId: 12 }
    expect(view('resultado_partida', { outcome: 'confirmado', score_a: 3, score_b: 1 })).toMatchObject({ text: 'Resultado confirmado: 3 × 1', kind: 'result', target: toMatch })
    expect(view('resultado_partida', { outcome: 'confirmado' }).text).toBe('Resultado confirmado')
    expect(view('resultado_partida', { outcome: 'wo', score_a: 3, score_b: 0, absent_side: 'b' })).toMatchObject({ text: 'Resultado definido: vale o W.O.', target: toMatch })
    expect(view('resultado_partida', { outcome: 'sem_resultado' })).toMatchObject({ text: 'A partida ficou sem resultado', target: toMatch })
    expect(view('resultado_divergente', { deadline: kickoff }).text).toMatch(/^Os placares não batem\. Corrijam até \w{3}, 20 out · 16:00$/)
    expect(view('resultado_divergente', { deadline: null })).toMatchObject({ text: 'Os placares não batem. Corrijam antes do fim do prazo', target: toMatch })
    expect(view('estatistica_contestada', { stat_id: 5, fields: ['gols', 'assistencias'], reason: 'Foram dois.' }, caio)).toMatchObject({
      text: 'Caio Ramos contestou estatísticas da partida (gols e assistências)', kind: 'result', target: toMatch,
    })
    expect(view('estatistica_contestada', { stat_id: 5, fields: ['gols', 'assistencias', 'estatistica_posicao'] }, caio).text)
      .toBe('Caio Ramos contestou estatísticas da partida (gols, assistências e estatística da posição)')
    expect(view('estatistica_contestada', { stat_id: 5, fields: [] }).text).toBe('O adversário contestou estatísticas da partida')
    expect(view('estatistica_contestada', {}).text).toBe('O adversário contestou estatísticas da partida')
  })

  it('quadra decidida mostra o resultado e não tem destino', () => {
    expect(view('quadra_decidida', { court_id: 8, court_name: 'Arena Sul', decision: 'publicada' })).toMatchObject({ text: 'Arena Sul entrou no catálogo', kind: 'court', target: null })
    expect(view('quadra_decidida', { court_id: 8, court_name: 'Arena Sul', decision: 'rejeitada', reason: 'Endereço inexistente.' }).text).toBe('Arena Sul foi recusada: Endereço inexistente')
    expect(view('quadra_decidida', { court_id: 8, court_name: 'Arena Sul', decision: 'rejeitada', duplicate_of_id: 3 }).text).toBe('Arena Sul foi recusada: já existe no catálogo')
    expect(view('quadra_decidida', { court_id: 8, court_name: 'Arena Sul', decision: 'rejeitada' }).text).toBe('Arena Sul foi recusada')
    expect(view('quadra_decidida', { decision: 'publicada' }).text).toBe('A quadra sugerida entrou no catálogo')
  })

  it('sem o id da partida, mostra o texto sem destino (a placa continua servindo propostas)', () => {
    expect(notificationView(note('partida_agendada', { starts_at: kickoff, court_name: 'Quadra do Lago', changed: false }))).toMatchObject({ target: null })
    expect(notificationView(note('proposta_partida', { opponent_name: 'Tigres do Lago' }))).toMatchObject({ target: { screen: 'play' } })
    expect(notificationView(note('resultado_partida', { match_id: 'x', outcome: 'confirmado' })).target).toBeNull()
  })

  it('todos os tipos do contrato têm texto próprio e ícone, e nenhum cai no texto genérico', () => {
    const types = ['proposta_partida', 'proposta_aceita', 'proposta_encerrada', 'vaga_encontrada', 'oferta_retirada', 'condicoes_propostas', 'partida_agendada',
      'partida_cancelada', 'wo_registrado', 'wo_contestado', 'wo_decidido', 'resultado_partida', 'resultado_divergente', 'estatistica_contestada',
      'vaga_preenchida', 'removido_da_partida', 'quadra_decidida', 'tabela_publicada', 'adversario_definido', 'divergencia_para_decidir', 'decisao_registrada', 'evento_encerrado']
    for (const type of types) {
      const result = view(type, { decision: 'publicada', outcome: 'confirmado', court_name: 'Arena Sul', event_id: 5 })
      expect(result.text, type).not.toBe('Nova atividade na sua conta')
      expect(result.kind, type).not.toBe('other')
    }
  })
})

describe('texto e destino dos tipos da etapa 4 (campeonatos)', () => {
  it('tabela_publicada, adversario_definido, divergencia_para_decidir, decisao_registrada e evento_encerrado', () => {
    expect(view('tabela_publicada', { event_id: 5, event_name: 'Copa' })).toMatchObject({ text: 'A tabela de Copa saiu', kind: 'event', target: { screen: 'event', eventId: 5, section: 'tabela' } })
    expect(view('adversario_definido', { match_id: 7, event_id: 5, event_name: 'Copa', opponent_name: 'Leões' })).toMatchObject({ text: 'Seu próximo jogo: Leões em Copa', kind: 'match', target: { screen: 'match', matchId: 7 } })
    expect(view('adversario_definido', { match_id: 7 }).text).toBe('Seu próximo jogo está definido')
    expect(view('divergencia_para_decidir', { match_id: 7, event_id: 5, event_name: 'Copa', deadline: null })).toMatchObject({
      text: 'Os placares de uma partida de Copa não batem. Decida', kind: 'result', target: { screen: 'result-decision', matchId: 7 },
    })
    expect(view('divergencia_para_decidir', { match_id: 7, event_name: 'Copa', deadline: kickoff }).text).toMatch(/^Os placares de uma partida de Copa não batem\. Decida \(prazo dos times: \w{3}, 20 out · 16:00\)$/)
    expect(notificationView(note('divergencia_para_decidir', { event_name: 'Copa' })).target).toBeNull()
    expect(view('decisao_registrada', { match_id: 7, kind: 'divergencia', score_a: 2, score_b: 1 })).toMatchObject({ text: 'O organizador decidiu o resultado: 2 × 1', target: { screen: 'match', matchId: 7 } })
    expect(view('decisao_registrada', { match_id: 7, kind: 'wo', score_a: 3, score_b: 0 }).text).toBe('O organizador decidiu o resultado por W.O. (3 × 0)')
    expect(view('decisao_registrada', { match_id: 7, kind: 'wo' }).text).toBe('O organizador decidiu o resultado por W.O.')
    expect(view('decisao_registrada', { match_id: 7, kind: 'divergencia' }).text).toBe('O organizador decidiu o resultado')
    expect(view('evento_encerrado', { event_id: 5, event_name: 'Copa', champion: 'Ferrugem FC' })).toMatchObject({ text: 'Copa terminou: campeão Ferrugem FC', target: { screen: 'event', eventId: 5, section: 'tabela' } })
    expect(view('evento_encerrado', { event_id: 5 }).text).toBe('Um evento terminou')
  })

  it('sem o id do evento, a tabela não tem destino', () => {
    expect(notificationView(note('tabela_publicada', {}))).toMatchObject({ text: 'A tabela de um evento saiu', target: null })
    expect(notificationView(note('evento_encerrado', { event_name: 'Copa' })).target).toBeNull()
  })
})
