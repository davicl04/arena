import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  acceptProposal, acceptSlotOffer, cancelSearch, createSearch, declineProposal, declineSlotOffer, getMyProposals, getMySearches,
  getMySlotOffers, getPlayBoard, MY_MATCHES_HISTORY_PATH,
} from '../src/api/matchmaking'
import { mockApi, reply } from './teams-fixtures'
import { playBoard, proposal, search, slotOffer } from './matchmaking-fixtures'

/* Cliente da busca, da proposta e da oferta de vaga: método, caminho e corpo de cada rota de docs/decisoes/0002-jogar.md (seções 9 e 11.2). */

afterEach(() => vi.unstubAllGlobals())

describe('cliente de busca, proposta e oferta (0002, seções 9 e 11.2)', () => {
  it('cria, lista e cancela buscas', async () => {
    const open = search()
    const created = { search: open, proposal: null, offer: null }
    const api = mockApi({
      'POST /matchmaking/searches': reply(201, created),
      'GET /me/searches': { items: [open] },
      'DELETE /matchmaking/searches/55': undefined,
    })
    expect(await createSearch({ sport: 'futebol', team_id: 10, format: 'society', team_complete: false, open_slots: { goleiro: 1 } })).toEqual(created)
    expect(await getMySearches()).toEqual({ items: [open] })
    await cancelSearch(55)
    expect(api.calls.map(call => `${call.method} ${call.path}`)).toEqual(['POST /matchmaking/searches', 'GET /me/searches', 'DELETE /matchmaking/searches/55'])
    expect(api.calls[0].body).toEqual({ sport: 'futebol', team_id: 10, format: 'society', team_complete: false, open_slots: { goleiro: 1 } })
    expect(api.calls[2].body).toBeUndefined()
  })

  it('responde às propostas com JSON vazio e lê as pendentes', async () => {
    const api = mockApi({
      'GET /me/proposals': { items: [proposal()] },
      'PUT /matches/50/accept': proposal({ state: 'combinando' }),
      'PUT /matches/50/decline': proposal({ state: 'recusada' }),
    })
    expect((await getMyProposals()).items).toHaveLength(1)
    expect((await acceptProposal(50)).state).toBe('combinando')
    expect((await declineProposal(50)).state).toBe('recusada')
    expect(api.calls.filter(call => call.method === 'PUT').map(call => call.body)).toEqual([{}, {}])
  })

  it('lê a placa e as ofertas, e responde à oferta de vaga', async () => {
    const api = mockApi({
      'GET /me/play': playBoard({ offers: [slotOffer()] }),
      'GET /me/slot-offers': { items: [slotOffer()] },
      'PUT /match-slots/9/accept': { id: 60 },
      'PUT /match-slots/9/decline': undefined,
    })
    expect((await getPlayBoard()).offers).toHaveLength(1)
    expect((await getMySlotOffers()).items[0].slot_id).toBe(9)
    expect(await acceptSlotOffer(9)).toEqual({ id: 60 })
    await declineSlotOffer(9)
    expect(api.find('PUT', '/match-slots/9/accept')[0].body).toEqual({})
    expect(api.find('PUT', '/match-slots/9/decline')[0].body).toEqual({})
    expect(MY_MATCHES_HISTORY_PATH).toBe('/me/matches?scope=historico')
  })
})
