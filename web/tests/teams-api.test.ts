import { afterEach, describe, expect, it, vi } from 'vitest'
import * as api from '../src/api/teams'
import { formatGrid, normalizeTeamName, playedFormats, roleLine } from '../src/components/teams/teamView'
import { monthYear, relativeTime } from '../src/utils/relativeTime'
import { brasilia, formats, mockApi, team } from './teams-fixtures'

afterEach(() => { vi.unstubAllGlobals() })

describe('cliente de Meus times (contrato 0003)', () => {
  it('usa os métodos, caminhos e corpos do contrato', async () => {
    const calls = mockApi({
      'GET /teams/10': team(), 'PATCH /teams/10': team(), 'DELETE /teams/10/crest': undefined, 'PATCH /teams/10/members/1': {},
      'GET /teams/10/invite-candidates?q=%40ana%20lima': { items: [], next_cursor: null }, 'GET /teams/10/invites': { items: [] },
      'GET /teams/10/join-requests': { items: [] }, 'DELETE /team-join-requests/7': undefined, 'POST /teams/10/close': undefined,
    })
    await api.getTeam(10)
    await api.updateTeam(10, { city_id: brasilia.id })
    await api.removeCrest(10)
    await api.updateMember(10, 1, { position: 'goleiro' })
    await api.inviteCandidates(10, ' @ana lima ')
    expect(await api.sentInvites(10)).toEqual([])
    expect(await api.joinRequests(10)).toEqual([])
    await api.cancelJoinRequest(7)
    await api.closeTeam(10)
    expect(calls.calls.map(call => `${call.method} ${call.path}`)).toEqual([
      'GET /teams/10', 'PATCH /teams/10', 'DELETE /teams/10/crest', 'PATCH /teams/10/members/1', 'GET /teams/10/invite-candidates?q=%40ana%20lima',
      'GET /teams/10/invites', 'GET /teams/10/join-requests', 'DELETE /team-join-requests/7', 'POST /teams/10/close',
    ])
    expect(calls.find('PATCH', '/teams/10')[0].body).toEqual({ city_id: brasilia.id })
    expect(calls.find('DELETE', '/teams/10/crest')[0].body).toBeUndefined()
    expect(calls.find('POST', '/teams/10/close')[0].body).toEqual({})
    expect(api.inviteCandidatesPath(10)).toBe('/teams/10/invite-candidates')
  })
})

describe('carteirinha e tempo relativo', () => {
  it('monta a grade na ordem do contrato e as pílulas só dos formatos jogados', () => {
    expect(formatGrid([]).map(cell => `${cell.format}:${cell.state}`)).toEqual(['futsal:sem_jogos', 'society:sem_jogos', 'campo:sem_jogos'])
    const cells = formats({ campo: { state: 'ranqueado', tier: 'ouro', played: 4 }, futsal: { state: 'classificacao', played: 2 } })
    expect(playedFormats([...cells].reverse()).map(cell => cell.format)).toEqual(['futsal', 'campo'])
    expect(roleLine(team({ my_role: 'membro' }))).toBe('Brasília · você é membro')
    expect(roleLine(team({ my_role: null }))).toBe('Brasília · DF')
    expect(normalizeTeamName('  Leões   do  Cerrado ')).toBe('Leões do Cerrado')
  })

  it('escreve o tempo de convites e pedidos e o mês de entrada', () => {
    // Os demais casos de `relativeTime` (agora, min, ontem, dias, data) estão em notifications-feed.test.tsx.
    const now = Date.parse('2026-10-12T12:00:00Z')
    const at = (ms: number) => new Date(now - ms).toISOString()
    expect(relativeTime(at(3600e3), now)).toBe('há 1 hora')
    expect(relativeTime(at(3 * 3600e3), now)).toBe('há 3 horas')
    expect(relativeTime(at(30 * 3600e3), now)).toBe('ontem')
    expect(monthYear('2025-03-10T12:00:00Z')).toMatch(/mar.*2025/)
    expect(monthYear('data inválida')).toBe('')
  })
})
