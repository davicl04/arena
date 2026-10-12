import { beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from '../src/api/client'
import * as teams from '../src/api/teams'

vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(),
}))

beforeEach(() => { vi.mocked(request).mockReset().mockResolvedValue({ items: [] } as never) })

describe('cliente de Meus times (contrato 0003, seções 3 a 5)', () => {
  it('usa os métodos, caminhos e corpos do contrato', async () => {
    await teams.createTeam({ name: 'Leões', city_id: 7 })
    expect(await teams.myTeams()).toEqual([])
    await teams.getTeam(10)
    await teams.updateTeam(10, { city_id: 7 })
    await teams.removeCrest(10)
    await teams.closeTeam(10)
    expect(await teams.teamMembers(10)).toEqual([])
    await teams.updateMember(10, 1, { position: 'goleiro' })
    await teams.removeMember(10, 2)
    expect(vi.mocked(request).mock.calls).toEqual([
      ['/teams', 'POST', { name: 'Leões', city_id: 7 }],
      ['/me/teams'],
      ['/teams/10'],
      ['/teams/10', 'PATCH', { city_id: 7 }],
      ['/teams/10/crest', 'DELETE'],
      ['/teams/10/close', 'POST', {}],
      ['/teams/10/members'],
      ['/teams/10/members/1', 'PATCH', { position: 'goleiro' }],
      ['/teams/10/members/2', 'DELETE'],
    ])
  })

  it('envia o brasão em multipart a partir do arquivo local do aparelho', async () => {
    const parts: unknown[][] = []
    vi.stubGlobal('FormData', class { append(...args: unknown[]) { parts.push(args) } })
    await teams.uploadCrest(10, { uri: 'file:///cache/brasao.jpg', name: 'brasao.jpg', type: 'image/jpeg', size: 4000 })
    const [path, method, body] = vi.mocked(request).mock.calls[0]
    expect([path, method]).toEqual(['/teams/10/crest', 'PUT'])
    expect(body).toBeInstanceOf(FormData)
    expect(parts).toEqual([['file', { uri: 'file:///cache/brasao.jpg', name: 'brasao.jpg', type: 'image/jpeg' }]])
    vi.unstubAllGlobals()
  })

  it('busca candidatos, convida, cancela e decide convites', async () => {
    expect(teams.inviteCandidatesPath(10)).toBe('/teams/10/invite-candidates')
    expect(teams.inviteCandidatesPath(10, '  ')).toBe('/teams/10/invite-candidates')
    expect(teams.inviteCandidatesPath(10, ' @ana lima ')).toBe('/teams/10/invite-candidates?q=%40ana%20lima')
    await teams.inviteCandidates(10, ' @ana lima ')
    await teams.sendInvite(10, 4, 'Vem pro time')
    expect(await teams.sentInvites(10)).toEqual([])
    await teams.cancelInvite(8)
    expect(await teams.myInvites()).toEqual([])
    await teams.decideInvite(8, 'aceitar')
    expect(vi.mocked(request).mock.calls).toEqual([
      ['/teams/10/invite-candidates?q=%40ana%20lima'],
      ['/teams/10/invites', 'POST', { user_id: 4, message: 'Vem pro time' }],
      ['/teams/10/invites'],
      ['/team-invites/8', 'DELETE'],
      ['/me/team-invites'],
      ['/team-invites/8', 'PUT', { decision: 'aceitar' }],
    ])
  })

  it('gera o link, mostra a prévia pelo token e trata os pedidos de entrada', async () => {
    await teams.teamLink(10)
    await teams.regenerateLink(10)
    await teams.joinPreview('tok/en+1')
    await teams.requestJoin('tok/en+1')
    await teams.cancelJoinRequest(7)
    expect(await teams.joinRequests(10)).toEqual([])
    await teams.decideJoinRequest(7, 'aprovar')
    expect(vi.mocked(request).mock.calls).toEqual([
      ['/teams/10/invite-link'],
      ['/teams/10/invite-link', 'POST', {}],
      ['/join/tok%2Fen%2B1'],
      ['/join/tok%2Fen%2B1', 'POST', {}],
      ['/team-join-requests/7', 'DELETE'],
      ['/teams/10/join-requests'],
      ['/team-join-requests/7', 'PUT', { decision: 'aprovar' }],
    ])
  })
})
