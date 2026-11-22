import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { City, Profile, User } from '../src/api/client'
import ArenaPage from '../src/pages/ArenaPage'
import { playBoard, standings } from './matchmaking-fixtures'
import { summaryOf } from './notifications-fixtures'
import { apiError, goiania, mockApi } from './teams-fixtures'
import type { Call } from './teams-fixtures'
import { findToast } from './toast-utils'

/*
 * Passo da cidade com a localização do navegador (ticket 05): `navigator.geolocation` e a Permissions API simulados nos
 * estados não decidida, concedida (perfil novo e existente), negada, erro/tempo esgotado, contexto não seguro, falha de
 * rede, 404 e 401, com o corpo de `POST /cities/nearest` conferido (números arredondados, só no corpo, sem query).
 */

const me: User = { id: 1, name: 'Ricardo Moura', username: 'ricardo', email: 'r@example.com', birth_date: '1990-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
const valparaiso: City = { id: 5221858, name: 'Valparaíso de Goiás', state: 'GO' }
const profile = (overrides: Partial<Profile> & Pick<Profile, 'sport'>): Profile =>
  ({ id: 7, city_id: goiania.id, city: goiania, position: null, looking_for: false, is_public: false, level: null, ...overrides })
const saved = (sport: Profile['sport']) => (call: Call) => {
  const body = call.body as { city_id: number; position: Profile['position']; looking_for: boolean }
  return profile({ sport, ...body, city: [goiania, valparaiso].find(item => item.id === body.city_id) ?? goiania })
}
/** Ponto em Goiânia com mais casas do que o cliente envia. */
const GOIANIA_POINT = { latitude: -16.686_891, longitude: -49.264_794 }

type Position = { coords: { latitude: number; longitude: number } }
type Outcome = { coords: { latitude: number; longitude: number } } | { code: number } | 'pending'
interface GeoMock {
  getCurrentPosition: Mock
  query: Mock
  /** Conclui um pedido pendente (`outcome: 'pending'`). */
  settle: (outcome: Exclude<Outcome, 'pending'>) => void
}

/**
 * Simula a geolocalização. `permission`: o que a Permissions API responde (`'missing'` = sem a API, `'throws'` = a
 * consulta falha). `outcome`: a posição, um erro com `code` (1 negada, 2 indisponível, 3 tempo esgotado) ou pendente.
 */
function mockLocation({ permission = 'prompt', outcome = { coords: GOIANIA_POINT } }: {
  permission?: PermissionState | 'missing' | 'throws'
  outcome?: Outcome
} = {}): GeoMock {
  let pending: { ok: (position: Position) => void; fail: (error: { code: number; message: string }) => void } | null = null
  const finish = (result: Exclude<Outcome, 'pending'>, ok: (position: Position) => void, fail: (error: { code: number; message: string }) => void) => {
    if ('coords' in result) ok({ coords: result.coords })
    else fail({ code: result.code, message: 'erro de geolocalização' })
  }
  const getCurrentPosition = vi.fn((ok: (position: Position) => void, fail: (error: { code: number; message: string }) => void) => {
    if (outcome === 'pending') pending = { ok, fail }
    else finish(outcome, ok, fail)
  })
  const query = vi.fn(async () => {
    if (permission === 'throws') throw new TypeError('geolocation não suportado')
    return { state: permission }
  })
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } })
  if (permission !== 'missing') Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query } })
  return {
    getCurrentPosition,
    query,
    settle: result => { if (pending) finish(result, pending.ok, pending.fail); pending = null },
  }
}

function renderSports(profiles: Profile[], routes: Record<string, unknown> = {}) {
  const api = mockApi({
    'GET /me/sports-profiles': profiles,
    'GET /me/notifications/summary': summaryOf({ unread_count: 0 }),
    'GET /me/standings': standings([]),
    'GET /me/play': playBoard(),
    'GET /me/run-bests': { items: [] },
    'GET /cities?q=valpa': [valparaiso],
    'POST /cities/nearest': goiania,
    ...routes,
  })
  const ui = userEvent.setup()
  const onExpired = vi.fn()
  render(<ArenaPage user={me} onUser={vi.fn()} onLogout={vi.fn()} onExpired={onExpired} />)
  const openSport = async (name: string) => {
    await ui.click(await screen.findByRole('button', { name: /Complete seu perfil esportivo/ }))
    await ui.click(await screen.findByRole('button', { name }))
  }
  return { api, ui, onExpired, openSport }
}

const sheet = () => screen.getByRole('dialog')
/** Texto visível na folha (fora da região viva só para leitores de tela). */
const visible = (text: string) => within(sheet()).queryByText(text, { ignore: 'script, style, .sr-only' })
const liveRegion = () => sheet().querySelector<HTMLElement>('p.sr-only[role="status"]')
const useButton = () => within(sheet()).queryByRole('button', { name: 'Usar minha localização' })
const nearestCalls = (calls: Call[]) => calls.filter(call => call.path.startsWith('/cities/nearest'))

const storageWrites: string[] = []
beforeEach(() => {
  Element.prototype.scrollTo = () => {}
  storageWrites.length = 0
  const setItem = Storage.prototype.setItem
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
    storageWrites.push(`${key}=${value}`)
    setItem.call(this, key, value)
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  for (const key of ['geolocation', 'permissions'] as const) Reflect.deleteProperty(navigator, key)
  Reflect.deleteProperty(window, 'isSecureContext')
})

describe('Passo da cidade: localização do navegador', () => {
  it('sem permissão decidida, só pede ao tocar; mostra "Buscando…", sugere, envia as coordenadas arredondadas no corpo e salva a sugestão', async () => {
    const geo = mockLocation({ outcome: 'pending' })
    const { api, ui, openSport } = renderSports([], { 'PUT /me/sports-profiles/tenis': saved('tenis') })
    await openSport('Tênis, ativar')

    // Não decidida: botão, divisor "ou" e a busca; nenhum pedido ao abrir.
    expect(await within(sheet()).findByRole('button', { name: 'Usar minha localização' })).toBeTruthy()
    expect(visible('ou')).toBeTruthy()
    expect(within(sheet()).getByLabelText('Buscar cidade')).toBeTruthy()
    expect(geo.query).toHaveBeenCalledWith({ name: 'geolocation' })
    expect(geo.getCurrentPosition).not.toHaveBeenCalled()

    await ui.click(useButton()!)
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(geo.getCurrentPosition.mock.calls[0][2]).toEqual({ enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 })
    // Buscando: indicador visível (com o foco, já que o botão some) e anúncio na região viva educada.
    expect(visible('Buscando sua localização…')).toBeTruthy()
    expect(liveRegion()?.textContent).toBe('Buscando sua localização…')
    expect(liveRegion()?.getAttribute('aria-live')).toBe('polite')
    expect(document.activeElement?.textContent).toBe('Buscando sua localização…')
    expect(useButton()).toBeNull()
    // A busca continua disponível enquanto o navegador responde.
    expect(within(sheet()).getByLabelText('Buscar cidade')).toBeTruthy()

    geo.settle({ coords: GOIANIA_POINT })
    expect(await within(sheet()).findByText('Pela sua localização')).toBeTruthy()
    const suggestion = sheet().querySelector('[data-slot="city-suggested"]') as HTMLElement
    expect(within(suggestion).getByText('Goiânia')).toBeTruthy()
    expect(within(suggestion).getByText('GO').getAttribute('data-slot')).toBe('badge')
    expect(liveRegion()?.textContent).toBe('Pela sua localização: Goiânia · GO.')
    expect(suggestion.contains(document.activeElement)).toBe(true)

    // Coordenadas arredondadas para 2 casas, como números, só no corpo de POST /cities/nearest (sem query).
    expect(nearestCalls(api.calls)).toEqual([{ method: 'POST', path: '/cities/nearest', body: { latitude: -16.69, longitude: -49.26 } }])
    const [url, init] = api.fetch.mock.calls.find(([input]) => String(input).includes('/cities/nearest'))!
    expect(new URL(String(url)).search).toBe('')
    expect(init?.body).toBe('{"latitude":-16.69,"longitude":-49.26}')
    expect(init?.credentials).toBe('include')
    expect(api.calls.filter(call => call.path !== '/cities/nearest').some(call => /16[.,]6|49[.,]2/.test(call.path))).toBe(false)
    expect(storageWrites.some(entry => /16[.,]6|49[.,]2/.test(entry))).toBe(false)

    // Com a sugestão escolhida, "Continuar" já funciona e o PUT leva a cidade sugerida.
    await ui.click(within(sheet()).getByRole('button', { name: 'Continuar' }))
    expect(within(sheet()).getByText('Goiânia · GO')).toBeTruthy()
    await ui.click(within(sheet()).getByRole('button', { name: 'Ativar tênis' }))
    expect(await findToast('Tênis ativado.')).toBeTruthy()
    expect(api.find('PUT', '/me/sports-profiles/tenis')[0].body).toEqual({ city_id: goiania.id, position: null, looking_for: false })
  })

  it('"Não, escolher outra cidade" leva à busca mantendo a sugestão, que volta com o rótulo "Pela sua localização"', async () => {
    mockLocation()
    const { api, ui, openSport } = renderSports([], { 'PUT /me/sports-profiles/corrida': saved('corrida') })
    await openSport('Corrida, ativar')
    await ui.click(await within(sheet()).findByRole('button', { name: 'Usar minha localização' }))
    await ui.click(await within(sheet()).findByRole('button', { name: 'Não, escolher outra cidade' }))

    // Na busca, com o foco no campo; a sugestão segue escolhida (marcada no topo da lista).
    const search = within(sheet()).getByLabelText('Buscar cidade')
    expect(document.activeElement).toBe(search)
    expect(within(sheet()).getByRole('button', { name: 'Goiânia · GO', pressed: true })).toBeTruthy()
    await ui.type(search, 'valpa')
    await ui.click(await within(sheet()).findByRole('button', { name: 'Valparaíso de Goiás · GO' }))
    expect(visible('Escolhida por você')).toBeTruthy()

    // "Trocar" volta à busca sem perder a sugestão, oferecida acima do campo.
    await ui.click(within(sheet()).getByRole('button', { name: 'Trocar cidade: Valparaíso de Goiás · GO' }))
    await ui.click(within(sheet()).getByRole('button', { name: 'Usar a cidade pela sua localização: Goiânia · GO' }))
    expect(visible('Pela sua localização')).toBeTruthy()
    expect(within(sheet()).getByRole('button', { name: 'Trocar cidade: Goiânia · GO' })).toBeTruthy()
    expect(nearestCalls(api.calls)).toHaveLength(1)

    await ui.click(within(sheet()).getByRole('button', { name: 'Continuar' }))
    await ui.click(within(sheet()).getByRole('button', { name: 'Ativar corrida' }))
    await waitFor(() => expect(api.find('PUT', '/me/sports-profiles/corrida').map(call => call.body))
      .toEqual([{ city_id: goiania.id, position: null, looking_for: false }]))
  })

  it('com a permissão já concedida, um perfil novo entra direto na sugestão, sem tocar no botão', async () => {
    const geo = mockLocation({ permission: 'granted' })
    const { api, ui, openSport } = renderSports([], { 'PUT /me/sports-profiles/futebol': saved('futebol') })
    await openSport('Futebol, ativar')
    expect(await within(sheet()).findByText('Pela sua localização')).toBeTruthy()
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(useButton()).toBeNull()
    // O foco fica no título do passo (sem toque, nada é movido).
    expect(document.activeElement).toBe(within(sheet()).getByRole('heading', { level: 3 }))
    await ui.click(within(sheet()).getByRole('button', { name: 'Continuar' }))
    await ui.click(within(sheet()).getByRole('button', { name: 'Continuar' }))
    await ui.click(within(sheet()).getByRole('button', { name: 'Ativar futebol' }))
    await waitFor(() => expect(api.find('PUT', '/me/sports-profiles/futebol').map(call => call.body))
      .toEqual([{ city_id: goiania.id, position: null, looking_for: false }]))
    expect(nearestCalls(api.calls)).toHaveLength(1)
  })

  it('com a permissão concedida, num perfil existente a cidade salva prevalece; a localização só depois de "Trocar"', async () => {
    const geo = mockLocation({ permission: 'granted' })
    const football = profile({ sport: 'futebol', city: valparaiso, city_id: valparaiso.id, position: 'goleiro' })
    const { api, ui, openSport } = renderSports([football], { 'PUT /me/sports-profiles/futebol': saved('futebol') })
    await openSport('Futebol, ativa, editar')
    expect(within(sheet()).getByRole('button', { name: 'Trocar cidade: Valparaíso de Goiás · GO' })).toBeTruthy()
    await waitFor(() => expect(geo.query).toHaveBeenCalled())
    expect(geo.getCurrentPosition).not.toHaveBeenCalled()
    expect(visible('Escolhida por você')).toBeTruthy()

    await ui.click(within(sheet()).getByRole('button', { name: 'Trocar cidade: Valparaíso de Goiás · GO' }))
    await ui.click(await within(sheet()).findByRole('button', { name: 'Usar minha localização' }))
    expect(await within(sheet()).findByText('Pela sua localização')).toBeTruthy()
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1)
    await ui.click(within(sheet()).getByRole('button', { name: 'Continuar' }))
    await ui.click(within(sheet()).getByRole('button', { name: 'Continuar' }))
    await ui.click(within(sheet()).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.find('PUT', '/me/sports-profiles/futebol').map(call => call.body))
      .toEqual([{ city_id: goiania.id, position: 'goleiro', looking_for: false }]))
  })

  it('permissão negada antes (Permissions API): aviso e a busca, sem o botão e sem pedido', async () => {
    const geo = mockLocation({ permission: 'denied' })
    const { ui, openSport } = renderSports([])
    await openSport('Tênis, ativar')
    await waitFor(() => expect(visible('Sem acesso à localização. Busque sua cidade abaixo.')).toBeTruthy())
    expect(useButton()).toBeNull()
    expect(geo.getCurrentPosition).not.toHaveBeenCalled()
    // O fluxo segue pela busca.
    await ui.type(within(sheet()).getByLabelText('Buscar cidade'), 'valpa')
    await ui.click(await within(sheet()).findByRole('button', { name: 'Valparaíso de Goiás · GO' }))
    expect((within(sheet()).getByRole('button', { name: 'Continuar' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('permissão negada agora (erro 1): aviso, foco na busca e o botão some', async () => {
    mockLocation({ outcome: { code: 1 } })
    const { api, ui, openSport } = renderSports([])
    await openSport('Tênis, ativar')
    await ui.click(await within(sheet()).findByRole('button', { name: 'Usar minha localização' }))
    expect(await within(sheet()).findByText('Sem acesso à localização. Busque sua cidade abaixo.', { ignore: 'script, style, .sr-only' })).toBeTruthy()
    expect(liveRegion()?.textContent).toBe('Sem acesso à localização. Busque sua cidade abaixo.')
    expect(useButton()).toBeNull()
    expect(document.activeElement).toBe(within(sheet()).getByLabelText('Buscar cidade'))
    expect(nearestCalls(api.calls)).toEqual([])
  })

  it.each([
    ['tempo esgotado', 3],
    ['posição indisponível', 2],
  ])('%s: "Não foi possível obter sua localização." e a busca, sem chamar o servidor', async (_, code) => {
    mockLocation({ outcome: { code } })
    const { api, ui, openSport } = renderSports([])
    await openSport('Corrida, ativar')
    await ui.click(await within(sheet()).findByRole('button', { name: 'Usar minha localização' }))
    expect(await within(sheet()).findByText('Não foi possível obter sua localização.', { ignore: 'script, style, .sr-only' })).toBeTruthy()
    expect(within(sheet()).getByLabelText('Buscar cidade')).toBeTruthy()
    expect(nearestCalls(api.calls)).toEqual([])
  })

  it('contexto não seguro ou navegador sem geolocalização: aviso de falha, sem pedir a posição', async () => {
    const geo = mockLocation()
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false })
    const first = renderSports([])
    await first.openSport('Tênis, ativar')
    await first.ui.click(await within(sheet()).findByRole('button', { name: 'Usar minha localização' }))
    expect(await within(sheet()).findByText('Não foi possível obter sua localização.', { ignore: 'script, style, .sr-only' })).toBeTruthy()
    expect(geo.getCurrentPosition).not.toHaveBeenCalled()
    cleanup()

    Reflect.deleteProperty(window, 'isSecureContext')
    Reflect.deleteProperty(navigator, 'geolocation')
    const second = renderSports([])
    await second.openSport('Tênis, ativar')
    await second.ui.click(await within(sheet()).findByRole('button', { name: 'Usar minha localização' }))
    expect(await within(sheet()).findByText('Não foi possível obter sua localização.', { ignore: 'script, style, .sr-only' })).toBeTruthy()
    expect(nearestCalls(second.api.calls)).toEqual([])
  })

  it('fora da cobertura (404): "Não encontramos um município perto de você." e a busca', async () => {
    mockLocation({ outcome: { coords: { latitude: -20.5, longitude: -30.2 } } })
    const { api, ui, openSport } = renderSports([], { 'POST /cities/nearest': apiError(404, 'Não encontramos um município perto de você.') })
    await openSport('Tênis, ativar')
    await ui.click(await within(sheet()).findByRole('button', { name: 'Usar minha localização' }))
    expect(await within(sheet()).findByText('Não encontramos um município perto de você.', { ignore: 'script, style, .sr-only' })).toBeTruthy()
    expect(liveRegion()?.textContent).toBe('Não encontramos um município perto de você.')
    expect(nearestCalls(api.calls).map(call => call.body)).toEqual([{ latitude: -20.5, longitude: -30.2 }])
    expect(within(sheet()).getByLabelText('Buscar cidade')).toBeTruthy()
  })

  it('erro de rede: aviso de falha, sem abrir a folha "Sem conexão"; 401 segue o fluxo de sessão expirada', async () => {
    mockLocation()
    const offline = renderSports([], { 'POST /cities/nearest': () => { throw new TypeError('Failed to fetch') } })
    await offline.openSport('Tênis, ativar')
    await offline.ui.click(await within(sheet()).findByRole('button', { name: 'Usar minha localização' }))
    expect(await within(sheet()).findByText('Não foi possível obter sua localização.', { ignore: 'script, style, .sr-only' })).toBeTruthy()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    cleanup()

    const expired = renderSports([], { 'POST /cities/nearest': apiError(401, 'Sessão expirada.') })
    await expired.openSport('Tênis, ativar')
    await expired.ui.click(await within(sheet()).findByRole('button', { name: 'Usar minha localização' }))
    await waitFor(() => expect(expired.onExpired).toHaveBeenCalled())
  })

  it.each(['missing', 'throws'] as const)('Permissions API %s: tratada como não decidida (botão, sem pedido automático)', async permission => {
    const geo = mockLocation({ permission })
    const { openSport } = renderSports([])
    await openSport('Futebol, ativar')
    expect(await within(sheet()).findByRole('button', { name: 'Usar minha localização' })).toBeTruthy()
    expect(geo.getCurrentPosition).not.toHaveBeenCalled()
  })
})
