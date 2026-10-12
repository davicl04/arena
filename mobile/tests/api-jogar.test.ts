import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import * as admin from '../src/api/admin'
import * as brackets from '../src/api/brackets'
import * as matches from '../src/api/matches'
import * as matchmaking from '../src/api/matchmaking'
import * as play from '../src/api/play'
import * as results from '../src/api/results'
import * as runs from '../src/api/runs'
import { matchCard, playBoard, search } from './support/play'

vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(),
}))

beforeEach(() => { vi.mocked(request).mockReset().mockResolvedValue(undefined as never) })
const calls = () => vi.mocked(request).mock.calls

describe('cliente da partida (contrato 0002, seções 10, 11.1 e 11.2)', () => {
  it('usa os métodos, caminhos e corpos do contrato', async () => {
    await matches.getMatch(1)
    await matches.proposeTerms(1, { starts_at: '2026-10-20T22:00:00.000Z', court_id: 7, booking_side: 'a' })
    await matches.acceptTerms(1, 31)
    await matches.setBooking(1, true)
    await matches.cancelMatch(1, '  Chuva  ')
    await matches.registerWalkover(1)
    await matches.withdrawWalkover(1)
    await matches.contestWalkover(1, '  Estávamos lá.  ')
    await matches.updateSlots(1, { defesa: 1 })
    await matches.removeGuest(1, 5)
    await matches.sendMessage(1, '  Oi  ')
    await matches.suggestCourt({ match_id: 1, name: 'Quadra Nova', address: null })
    expect(calls()).toEqual([
      ['/matches/1'],
      ['/matches/1/terms', 'POST', { starts_at: '2026-10-20T22:00:00.000Z', court_id: 7, booking_side: 'a' }],
      ['/matches/1/terms/31/accept', 'PUT', {}],
      ['/matches/1/booking', 'PUT', { confirmed: true }],
      ['/matches/1/cancel', 'POST', { reason: 'Chuva' }],
      ['/matches/1/walkover', 'POST', {}],
      ['/matches/1/walkover', 'DELETE'],
      ['/matches/1/walkover/contest', 'POST', { reason: 'Estávamos lá.' }],
      ['/matches/1/slots', 'PUT', { open_slots: { defesa: 1 } }],
      ['/matches/1/guests/5', 'DELETE'],
      ['/matches/1/messages', 'POST', { body: 'Oi' }],
      ['/courts/suggestions', 'POST', { match_id: 1, name: 'Quadra Nova', address: null }],
    ])
  })

  it('o cancelamento sem motivo envia reason nulo', async () => {
    await matches.cancelMatch(1)
    await matches.cancelMatch(1, '   ')
    expect(calls().map(call => call[2])).toEqual([{ reason: null }, { reason: null }])
  })

  it('monta a consulta do catálogo de quadras e a das mensagens', async () => {
    await matches.listCourts({ cityId: 5300108 })
    await matches.listCourts({ cityId: 5300108, kind: 'tenis', q: ' clube de tênis ', matchId: 3 })
    await matches.listCourts({ cityId: 5300108, q: '   ' })
    await matches.getMessages(1)
    await matches.getMessages(1, { after: 9, limit: 50 })
    await matches.getMessages(1, { before: 4 })
    expect(calls().map(call => call[0])).toEqual([
      '/courts?city_id=5300108', '/courts?city_id=5300108&kind=tenis&q=clube+de+t%C3%AAnis&match_id=3', '/courts?city_id=5300108', '/matches/1/messages',
      '/matches/1/messages?after=9&limit=50', '/matches/1/messages?before=4',
    ])
    expect(matches.CHAT_POLL_MS).toBe(4000)
    expect(matches.MESSAGE_MAX).toBe(1000)
  })
})

describe('cliente da busca, da proposta e da placa (contrato 0002, seções 9 e 11.2)', () => {
  it('usa os métodos, caminhos e corpos do contrato', async () => {
    await matchmaking.createSearch({ sport: 'futebol', team_id: 10, format: 'society', team_complete: false, open_slots: { goleiro: 1 } })
    await matchmaking.getMySearches()
    await matchmaking.cancelSearch(55)
    await matchmaking.getMyProposals()
    await matchmaking.acceptProposal(50)
    await matchmaking.declineProposal(50)
    await matchmaking.getPlayBoard()
    await matchmaking.getMySlotOffers()
    await matchmaking.acceptSlotOffer(9)
    await matchmaking.declineSlotOffer(9)
    expect(calls()).toEqual([
      ['/matchmaking/searches', 'POST', { sport: 'futebol', team_id: 10, format: 'society', team_complete: false, open_slots: { goleiro: 1 } }],
      ['/me/searches'],
      ['/matchmaking/searches/55', 'DELETE'],
      ['/me/proposals'],
      ['/matches/50/accept', 'PUT', {}],
      ['/matches/50/decline', 'PUT', {}],
      ['/me/play'],
      ['/me/slot-offers'],
      ['/match-slots/9/accept', 'PUT', {}],
      ['/match-slots/9/decline', 'PUT', {}],
    ])
    expect(matchmaking.MY_MATCHES_HISTORY_PATH).toBe('/me/matches?scope=historico')
  })

  it('a placa chega com as listas sempre presentes, mesmo numa resposta incompleta', () => {
    expect(matchmaking.normalizeBoard(undefined)).toEqual({ attention: false, searches: [], proposals: [], offers: [], matches: [] })
    expect(matchmaking.normalizeBoard(null)).toEqual({ attention: false, searches: [], proposals: [], offers: [], matches: [] })
    const active = search()
    expect(matchmaking.normalizeBoard({ attention: true, searches: [active] })).toEqual({ attention: true, searches: [active], proposals: [], offers: [], matches: [] })
    const full = playBoard({ matches: [matchCard()] })
    expect(matchmaking.normalizeBoard(full)).toEqual(full)
  })
})

describe('cliente do resultado, das estatísticas e do Ranking (contrato 0002, seção 12)', () => {
  it('usa os métodos, caminhos e corpos do contrato', async () => {
    await results.reportResult(7, { goals_a: 3, goals_b: 1 })
    await results.reportResult(8, { sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }] })
    await results.putAttendance(7, [{ user_id: 2, present: true, position: 'defesa' }])
    await results.getStats(7)
    await results.putMyStats(7, { position: 'atacante', goals: 2, assists: 1, position_stat: 4 })
    await results.reviewStat(7, 70, { goals: 1 })
    await results.contestStat(7, 70, { fields: ['gols'], reason: 'Foi um gol contra.' })
    expect(calls()).toEqual([
      ['/matches/7/result', 'PUT', { goals_a: 3, goals_b: 1 }],
      ['/matches/8/result', 'PUT', { sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }] }],
      ['/matches/7/attendance', 'PUT', { athletes: [{ user_id: 2, present: true, position: 'defesa' }] }],
      ['/matches/7/stats'],
      ['/matches/7/my-stats', 'PUT', { position: 'atacante', goals: 2, assists: 1, position_stat: 4 }],
      ['/matches/7/stats/70/review', 'PUT', { goals: 1 }],
      ['/matches/7/stats/70/contest', 'POST', { fields: ['gols'], reason: 'Foi um gol contra.' }],
    ])
  })

  it('monta o caminho do Ranking com os parâmetros presentes, em ordem fixa', async () => {
    expect(results.rankingPath({ sport: 'tenis' })).toBe('/rankings?sport=tenis')
    expect(results.rankingPath({ sport: 'futebol', kind: 'individual', format: 'society', position: 'atacante', limit: 20 }))
      .toBe('/rankings?sport=futebol&kind=individual&format=society&position=atacante&limit=20')
    expect(results.rankingPath({ sport: 'corrida', distance_km: 5, cursor: 'a b' })).toBe('/rankings?sport=corrida&distance_km=5&cursor=a+b')
    await results.getRankings({ sport: 'futebol', kind: 'time', format: 'futsal' })
    expect(calls()).toEqual([['/rankings?sport=futebol&kind=time&format=futsal']])
  })

  it('lê as classificações do titular (GET /me/standings)', async () => {
    await play.getMyStandings()
    expect(calls()).toEqual([['/me/standings']])
  })
})

describe('cliente do chaveamento, da agenda e da decisão (contrato 0003, seção 21.4)', () => {
  it('sorteia, troca, confirma e lê o chaveamento com os corpos do contrato (JSON vazio quando não há parâmetros)', async () => {
    await brackets.drawBracket(5)
    await brackets.swapBracket(5, 0, 7)
    await brackets.confirmBracket(5)
    await brackets.getBracket(5)
    expect(calls()).toEqual([
      ['/organizer/events/5/bracket', 'POST', {}],
      ['/organizer/events/5/bracket', 'PATCH', { a: 0, b: 7 }],
      ['/organizer/events/5/bracket/confirm', 'POST', {}],
      ['/events/5/bracket'],
    ])
  })

  it('lista as partidas, agenda (quadra ou sugestão) e decide (placar ou W.O.)', async () => {
    await brackets.listEventMatches(5)
    await brackets.scheduleMatch(11, { starts_at: '2026-10-20T19:30:00.000Z', court_id: 7 })
    await brackets.scheduleMatch(11, { starts_at: '2026-10-20T19:30:00.000Z', court_suggestion: { name: 'Ginásio do Guará', address: null } })
    await brackets.decideResult(11, { score: { goals_a: 2, goals_b: 1 }, justification: 'Vídeo confirma.' })
    await brackets.decideResult(11, { walkover_absent_side: 'b', justification: 'Ausente.' })
    expect(calls()).toEqual([
      ['/organizer/events/5/matches'],
      ['/organizer/matches/11/schedule', 'PUT', { starts_at: '2026-10-20T19:30:00.000Z', court_id: 7 }],
      ['/organizer/matches/11/schedule', 'PUT', { starts_at: '2026-10-20T19:30:00.000Z', court_suggestion: { name: 'Ginásio do Guará', address: null } }],
      ['/organizer/matches/11/result-decision', 'POST', { score: { goals_a: 2, goals_b: 1 }, justification: 'Vídeo confirma.' }],
      ['/organizer/matches/11/result-decision', 'POST', { walkover_absent_side: 'b', justification: 'Ausente.' }],
    ])
    expect([brackets.JUSTIFICATION_MIN, brackets.JUSTIFICATION_MAX]).toEqual([5, 500])
  })

  describe('scheduleConflict: o 409 { detail, conflict } da agenda', () => {
    const conflict = { kind: 'quadra', match_id: 12, label: 'J2', stage: 'Quartas de final', starts_at: '2026-10-20T19:00:00Z', court_name: 'Quadra Central' }

    it('lê o conflict do 409, de quadra ou de time', () => {
      expect(brackets.scheduleConflict(new ApiError('A quadra já tem o J2.', 409, [], { detail: 'A quadra já tem o J2.', conflict }))).toEqual(conflict)
      expect(brackets.scheduleConflict(new ApiError('x', 409, [], { conflict: { ...conflict, kind: 'time', court_name: null } }))?.court_name).toBeNull()
    })

    it('devolve null quando o erro não é o conflito de agenda', () => {
      expect(brackets.scheduleConflict(new Error('x'))).toBeNull()
      expect(brackets.scheduleConflict(new ApiError('Fora do prazo.', 422))).toBeNull()
      expect(brackets.scheduleConflict(new ApiError('Estado.', 409))).toBeNull()
      expect(brackets.scheduleConflict(new ApiError('Estado.', 409, [], { detail: 'Sem conflict' }))).toBeNull()
      expect(brackets.scheduleConflict(new ApiError('Mal formado.', 409, [], { conflict: 'texto' }))).toBeNull()
      expect(brackets.scheduleConflict(new ApiError('Tipo inválido.', 409, [], { conflict: { kind: 'outro', label: 'J1' } }))).toBeNull()
      expect(brackets.scheduleConflict(new ApiError('Sem rótulo.', 409, [], { conflict: { kind: 'quadra' } }))).toBeNull()
      expect(brackets.scheduleConflict(new ApiError('Campos ausentes.', 409, [], { conflict: { kind: 'quadra', label: 'J1', match_id: 3 } }))).toEqual({
        kind: 'quadra', match_id: 3, label: 'J1', stage: '', starts_at: '', court_name: null,
      })
    })

    it('o erro de uma chamada de agenda recusada com conflito é lido pelo mesmo caminho', async () => {
      vi.mocked(request).mockRejectedValue(new ApiError('A quadra já tem o J2.', 409, [], { conflict }))
      const caught = await brackets.scheduleMatch(11, { starts_at: '2026-10-20T19:30:00.000Z', court_id: 7 }).catch(cause => cause)
      expect(brackets.scheduleConflict(caught)).toEqual(conflict)
    })
  })
})

describe('cliente da corrida (contrato 0002, seção 18)', () => {
  const input = { distance_m: 5000, duration_s: 1452, source: 'treino' as const }

  it('usa os métodos, caminhos e corpos do contrato', async () => {
    await runs.previewRun(input)
    await runs.createRun({ ...input, date: '2026-10-12' })
    await runs.deleteRun(4)
    await runs.getRunBests()
    await runs.getRunRaces()
    expect(calls()).toEqual([
      ['/me/runs/preview', 'POST', input],
      ['/me/runs', 'POST', { ...input, date: '2026-10-12' }],
      ['/me/runs/4', 'DELETE'],
      ['/me/run-bests'],
      ['/me/run-races'],
    ])
  })

  it('monta o caminho do histórico por distância, com o limite padrão ou o dado', () => {
    expect(runs.runsPath('5')).toBe('/me/runs?distance=5&limit=20')
    expect(runs.runsPath('outra', 10)).toBe('/me/runs?distance=outra&limit=10')
  })
})

describe('filas da administração do Jogar (contrato 0002, seções 10.4 e 10.7)', () => {
  it('usa os métodos, caminhos e corpos do contrato', async () => {
    await admin.getQueueCounts()
    await admin.decideCourt(41, { decision: 'publicar', name: 'Arena Sul' })
    await admin.decideCourt(41, { decision: 'rejeitar', duplicate_of_id: 7 })
    await admin.decideWalkover(12, 'manter', '  Estavam presentes.  ')
    expect(calls()).toEqual([
      ['/admin/queue-counts'],
      ['/admin/court-suggestions/41/decision', 'POST', { decision: 'publicar', name: 'Arena Sul' }],
      ['/admin/court-suggestions/41/decision', 'POST', { decision: 'rejeitar', duplicate_of_id: 7 }],
      ['/admin/matches/12/walkover-decision', 'POST', { decision: 'manter', reason: 'Estavam presentes.' }],
    ])
    expect([admin.courtSuggestionsPath('em_revisao'), admin.courtSuggestionsPath('decididas'), admin.WALKOVER_DISPUTES_PATH])
      .toEqual(['/admin/court-suggestions?state=em_revisao', '/admin/court-suggestions?state=decididas', '/admin/walkover-disputes'])
    expect(admin.courtKindLabel).toEqual({ futsal: 'Futsal', society: 'Society', campo: 'Campo', tenis: 'Tênis' })
    expect(admin.WALKOVER_REASON_MESSAGE).toBe('Descreva a decisão, de 5 a 500 caracteres.')
  })

  it('publicar exige nome de 2 a 80 e endereço de até 160 caracteres, como no servidor', () => {
    expect(admin.courtPublishError('Arena Sul', 'SGAS 910')).toEqual({})
    expect(admin.courtPublishError('A', '')).toEqual({ name: 'O nome da quadra precisa ter de 2 a 80 caracteres.' })
    expect(admin.courtPublishError('x'.repeat(81), '')).toEqual({ name: 'O nome da quadra precisa ter de 2 a 80 caracteres.' })
    expect(admin.courtPublishError('Arena Sul', 'x'.repeat(161))).toEqual({ address: 'Use até 160 caracteres no endereço.' })
    expect(admin.COURT_LIMITS).toEqual({ nameMin: 2, nameMax: 80, addressMax: 160, reasonMin: 5, reasonMax: 300 })
  })

  it('rejeitar exige o motivo (5 a 300), dispensado quando há a quadra duplicada do catálogo', () => {
    expect(admin.courtRejectError('Endereço inexistente', false)).toBeNull()
    expect(admin.courtRejectError('', false)).toBe('Descreva o motivo da recusa, de 5 a 300 caracteres.')
    expect(admin.courtRejectError('abc', false)).toBe('Descreva o motivo da recusa, de 5 a 300 caracteres.')
    expect(admin.courtRejectError('x'.repeat(301), false)).toBe('Use até 300 caracteres no motivo.')
    expect(admin.courtRejectError('', true)).toBeNull()
    expect(admin.courtRejectError('abc', true)).toBe('O motivo, se informado, tem de 5 a 300 caracteres.')
    expect(admin.courtRejectError('Mesmo endereço', true)).toBeNull()
  })
})
