import { afterEach, describe, expect, it } from 'vitest'
import { cleanup } from '@testing-library/react'
import { ApiError } from '../src/api/client'
import {
  confirmBracket, decideResult, drawBracket, getBracket, listEventMatches, scheduleConflict, scheduleMatch, swapBracket,
} from '../src/api/brackets'
import { apiError, mockApi } from './teams-fixtures'

/*
 * Cliente do chaveamento, da agenda e da decisão (0003, seção 21.4): caminhos, métodos e corpos JSON (`{}` quando a ação não
 * tem parâmetros) e a leitura do `409 { detail, conflict }` da agenda.
 */

afterEach(cleanup)

describe('rotas do campeonato', () => {
  it('sorteia, troca, confirma e lê o chaveamento com os corpos do contrato', async () => {
    const { calls } = mockApi({
      'POST /organizer/events/5/bracket': { state: 'sorteado' },
      'PATCH /organizer/events/5/bracket': { state: 'sorteado' },
      'POST /organizer/events/5/bracket/confirm': { state: 'confirmado' },
      'GET /events/5/bracket': { state: 'confirmado' },
    })
    await drawBracket(5)
    await swapBracket(5, 0, 7)
    await confirmBracket(5)
    await getBracket(5)
    expect(calls.map(call => `${call.method} ${call.path} ${JSON.stringify(call.body ?? null)}`)).toEqual([
      'POST /organizer/events/5/bracket {}',
      'PATCH /organizer/events/5/bracket {"a":0,"b":7}',
      'POST /organizer/events/5/bracket/confirm {}',
      'GET /events/5/bracket null',
    ])
  })

  it('lista as partidas, agenda (data e quadra ou sugestão) e decide (placar ou W.O.)', async () => {
    const { calls } = mockApi({
      'GET /organizer/events/5/matches': { items: [], counts: {} },
      'PUT /organizer/matches/11/schedule': { label: 'J1' },
      'POST /organizer/matches/11/result-decision': { id: 11 },
    })
    await listEventMatches(5)
    await scheduleMatch(11, { starts_at: '2026-10-20T19:30:00.000Z', court_id: 7 })
    await scheduleMatch(11, { starts_at: '2026-10-20T19:30:00.000Z', court_suggestion: { name: 'Ginásio do Guará', address: null } })
    await decideResult(11, { score: { goals_a: 2, goals_b: 1 }, justification: 'Vídeo confirma.' })
    await decideResult(11, { walkover_absent_side: 'b', justification: 'Ausente.' })
    expect(calls.map(call => `${call.method} ${call.path} ${JSON.stringify(call.body ?? null)}`)).toEqual([
      'GET /organizer/events/5/matches null',
      'PUT /organizer/matches/11/schedule {"starts_at":"2026-10-20T19:30:00.000Z","court_id":7}',
      'PUT /organizer/matches/11/schedule {"starts_at":"2026-10-20T19:30:00.000Z","court_suggestion":{"name":"Ginásio do Guará","address":null}}',
      'POST /organizer/matches/11/result-decision {"score":{"goals_a":2,"goals_b":1},"justification":"Vídeo confirma."}',
      'POST /organizer/matches/11/result-decision {"walkover_absent_side":"b","justification":"Ausente."}',
    ])
  })
})

describe('scheduleConflict', () => {
  const conflict = { kind: 'quadra', match_id: 12, label: 'J2', stage: 'Quartas de final', starts_at: '2026-10-20T19:00:00Z', court_name: 'Quadra Central' }

  it('lê o conflict do 409 de agenda, de quadra ou de time', async () => {
    mockApi({ 'PUT /organizer/matches/11/schedule': { __reply: true, status: 409, body: { detail: 'A quadra já tem o J2.', conflict } } })
    const error = await scheduleMatch(11, { starts_at: '2026-10-20T19:30:00.000Z', court_id: 7 }).catch(cause => cause)
    expect(error).toBeInstanceOf(ApiError)
    expect(scheduleConflict(error)).toEqual(conflict)
    expect(scheduleConflict(new ApiError('x', 409, [], { conflict: { ...conflict, kind: 'time', court_name: null } }))?.court_name).toBeNull()
  })

  it('devolve null quando o erro não é o conflito de agenda', () => {
    expect(scheduleConflict(new Error('x'))).toBeNull()
    expect(scheduleConflict(new ApiError('Fora do prazo.', 422))).toBeNull()
    expect(scheduleConflict(new ApiError('Estado.', 409))).toBeNull()
    expect(scheduleConflict(new ApiError('Estado.', 409, [], { detail: 'Sem conflict' }))).toBeNull()
    expect(scheduleConflict(new ApiError('Mal formado.', 409, [], { conflict: 'texto' }))).toBeNull()
    expect(scheduleConflict(new ApiError('Tipo inválido.', 409, [], { conflict: { kind: 'outro', label: 'J1' } }))).toBeNull()
    expect(scheduleConflict(new ApiError('Sem rótulo.', 409, [], { conflict: { kind: 'quadra' } }))).toBeNull()
    expect(scheduleConflict(new ApiError('Campos ausentes.', 409, [], { conflict: { kind: 'quadra', label: 'J1', match_id: 3 } }))).toEqual({
      kind: 'quadra', match_id: 3, label: 'J1', stage: '', starts_at: '', court_name: null,
    })
  })

  it('o erro comum da API continua sendo ApiError sem conflito', async () => {
    mockApi({ 'PUT /organizer/matches/11/schedule': apiError(409, 'A partida já começou.') })
    const error = await scheduleMatch(11, { starts_at: '2026-10-20T19:30:00.000Z', court_id: 7 }).catch(cause => cause)
    expect(scheduleConflict(error)).toBeNull()
    expect(error.message).toBe('A partida já começou.')
  })
})
