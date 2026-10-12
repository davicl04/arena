import { afterEach, describe, expect, it, vi } from 'vitest'
import * as api from '../src/api/matches'
import { eventWhen, whenText } from '../src/data/match'
import { mockApi } from './teams-fixtures'
import { matchDetail } from './match-fixtures'

afterEach(() => { vi.unstubAllGlobals() })

describe('cliente da partida (contrato 0002, seções 10, 11.1 e 11.2)', () => {
  it('usa os métodos, caminhos e corpos do contrato', async () => {
    const calls = mockApi({
      'GET /matches/1': matchDetail(), 'POST /matches/1/terms': matchDetail(), 'PUT /matches/1/terms/31/accept': matchDetail(),
      'PUT /matches/1/booking': matchDetail(), 'POST /matches/1/cancel': matchDetail(), 'POST /matches/1/walkover': matchDetail(),
      'DELETE /matches/1/walkover': undefined, 'POST /matches/1/walkover/contest': matchDetail(),
      'PUT /matches/1/slots': matchDetail(), 'DELETE /matches/1/guests/5': undefined,
      'POST /matches/1/messages': {}, 'POST /courts/suggestions': { court: {}, existing: false },
    })
    await api.getMatch(1)
    await api.proposeTerms(1, { starts_at: '2026-10-20T22:00:00.000Z', court_id: 7, booking_side: 'a' })
    await api.acceptTerms(1, 31)
    await api.setBooking(1, true)
    await api.cancelMatch(1, '  Chuva  ')
    await api.registerWalkover(1)
    await api.withdrawWalkover(1)
    await api.contestWalkover(1, '  Estávamos lá.  ')
    await api.updateSlots(1, { defesa: 1 })
    await api.removeGuest(1, 5)
    await api.sendMessage(1, '  Oi  ')
    await api.suggestCourt({ match_id: 1, name: 'Quadra Nova', address: null })
    expect(calls.calls.map(call => `${call.method} ${call.path}`)).toEqual([
      'GET /matches/1', 'POST /matches/1/terms', 'PUT /matches/1/terms/31/accept', 'PUT /matches/1/booking', 'POST /matches/1/cancel',
      'POST /matches/1/walkover', 'DELETE /matches/1/walkover', 'POST /matches/1/walkover/contest', 'PUT /matches/1/slots',
      'DELETE /matches/1/guests/5', 'POST /matches/1/messages', 'POST /courts/suggestions',
    ])
    const body = (method: string, path: string) => calls.find(method, path)[0].body
    expect(body('POST', '/matches/1/terms')).toEqual({ starts_at: '2026-10-20T22:00:00.000Z', court_id: 7, booking_side: 'a' })
    // Ações sem dados enviam JSON vazio; DELETE não tem corpo.
    expect(body('PUT', '/matches/1/terms/31/accept')).toEqual({})
    expect(body('POST', '/matches/1/walkover')).toEqual({})
    expect(body('DELETE', '/matches/1/walkover')).toBeUndefined()
    expect(body('DELETE', '/matches/1/guests/5')).toBeUndefined()
    expect(body('PUT', '/matches/1/booking')).toEqual({ confirmed: true })
    expect(body('POST', '/matches/1/cancel')).toEqual({ reason: 'Chuva' })
    expect(body('POST', '/matches/1/walkover/contest')).toEqual({ reason: 'Estávamos lá.' })
    expect(body('PUT', '/matches/1/slots')).toEqual({ open_slots: { defesa: 1 } })
    expect(body('POST', '/matches/1/messages')).toEqual({ body: 'Oi' })
  })

  it('o cancelamento sem motivo envia reason nulo', async () => {
    const calls = mockApi({ 'POST /matches/1/cancel': matchDetail() })
    await api.cancelMatch(1)
    await api.cancelMatch(1, '   ')
    expect(calls.calls.map(call => call.body)).toEqual([{ reason: null }, { reason: null }])
  })

  it('monta a consulta do catálogo de quadras e a das mensagens', async () => {
    const calls = mockApi({
      'GET /courts?city_id=5300108': { items: [] },
      'GET /courts?city_id=5300108&kind=tenis&q=clube+de+t%C3%AAnis&match_id=3': { items: [] },
      'GET /matches/1/messages': { items: [], has_more: false, last_id: null },
      'GET /matches/1/messages?after=9&limit=50': { items: [], has_more: false, last_id: 9 },
      'GET /matches/1/messages?before=4': { items: [], has_more: false, last_id: null },
    })
    await api.listCourts({ cityId: 5300108 })
    await api.listCourts({ cityId: 5300108, kind: 'tenis', q: ' clube de tênis ', matchId: 3 })
    await api.getMessages(1)
    await api.getMessages(1, { after: 9, limit: 50 })
    await api.getMessages(1, { before: 4 })
    expect(calls.calls.map(call => call.path)).toEqual([
      '/courts?city_id=5300108', '/courts?city_id=5300108&kind=tenis&q=clube+de+t%C3%AAnis&match_id=3', '/matches/1/messages',
      '/matches/1/messages?after=9&limit=50', '/matches/1/messages?before=4',
    ])
    expect(api.CHAT_POLL_MS).toBe(4000)
    expect(api.MESSAGE_MAX).toBe(1000)
  })
})

describe('textos da partida', () => {
  it('formata dia e hora no fuso do aparelho e ignora datas inválidas', () => {
    expect(whenText('2026-10-20T22:00:00Z')).toMatch(/^ter, 20 out · \d\d:\d\d$/)
    expect(whenText(null)).toBe('')
    expect(whenText('nada')).toBe('')
    expect(eventWhen({ starts_at: '2026-10-20T22:00:00Z' })).toMatch(/^ter, 20 out/)
    expect(eventWhen({ starts_at: 5 })).toBe('')
    expect(eventWhen(null)).toBe('')
  })

})
