import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Location from 'expo-location'
import * as SecureStore from 'expo-secure-store'
import { ApiError, request } from '../src/api/client'
import type { City, Position, Profile, ProfileInput, Sport, User } from '../src/api/client'
import { LAST_KNOWN_MAX_AGE_MS, LOCATION_TIMEOUT_MS } from '../src/hooks/useCityLocation'
import SportsScreen from '../src/screens/SportsScreen'
import { byLabel, enableAct, press, textOf } from './support/native'
import { playContext } from './support/play'
import { fakeNavigation } from './support/teams'
import { brasiliaCity, goianiaCity, searchCity, searchPath, valparaisoCity } from './support/cities'
import { denied, granted } from './support/location'

vi.mock('react-native', async () => {
  const base = (await import('./support/native')).reactNativeMock()
  return { ...base, AccessibilityInfo: { ...base.AccessibilityInfo, setAccessibilityFocus: vi.fn() }, findNodeHandle: () => null }
})
vi.mock('react-native-safe-area-context', async () => (await import('./support/native')).safeAreaMock())
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: vi.fn() }))
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/components/ui', async () => (await import('./support/native')).uiMock())
vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  getToken: vi.fn().mockResolvedValue('test-token'), clearToken: vi.fn(), request: vi.fn(),
}))

/*
 * Cidade pela localização no passo da cidade da tela de modalidades do Expo (Suas modalidades), com `expo-location` e a API simulados:
 * permissão não decidida (pedida só no toque), já concedida (perfil novo vai direto para a sugestão; perfil existente
 * mantém a cidade salva), negada, falha, tempo esgotado e 404; o corpo de `POST /cities/nearest`; "Não, escolher outra
 * cidade"; e salvar com a cidade sugerida. O transporte (Bearer, URL fixa) está em api-cities-nearest.test.ts.
 */

const me: User = { id: 1, name: 'Eu Mesmo', username: 'eu.atleta', email: 'eu@example.com', birth_date: '1995-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
const emptyPage = { items: [], next_cursor: null }
const trees: ReactTestRenderer[] = []
const ids: Record<Sport, number> = { futebol: 11, tenis: 12, corrida: 13 }
const catalog = [brasiliaCity, goianiaCity, valparaisoCity]
const profile = (sport: Sport, city: City, position: Position | null, looking: boolean): Profile =>
  ({ id: ids[sport], sport, city_id: city.id, city, position, looking_for: looking, is_public: false, level: null })
/** Uma leitura do aparelho no centro de Goiânia (6 casas, como o GPS entrega). */
const goianiaFix = { coords: { latitude: -16.686891, longitude: -49.264794, altitude: null, accuracy: 3000, altitudeAccuracy: null, heading: null, speed: null }, timestamp: 0 }

let stored: Profile[] = []
/** Resposta de `POST /cities/nearest`: cidade, erro ou uma promessa controlada pelo teste. */
let nearest: () => Promise<City> = async () => goianiaCity
function serve() {
  vi.mocked(request).mockImplementation((async (path: string, method?: string, body?: unknown) => {
    if (path === '/me/sports-profiles') return stored
    if (path === '/cities/nearest' && method === 'POST') return nearest()
    const put = /^\/me\/sports-profiles\/(\w+)$/.exec(path)
    if (put && method === 'PUT') {
      const input = body as ProfileInput
      const saved = profile(put[1] as Sport, catalog.find(item => item.id === input.city_id)!, input.position, input.looking_for)
      stored = [...stored.filter(item => item.sport !== saved.sport), saved]
      return saved
    }
    if (path === searchPath('valpa')) return [valparaisoCity]
    if (path === '/users/1') return { id: 1, follower_count: 0, following_count: 0 }
    return emptyPage
  }) as never)
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
async function mount(onExpired = vi.fn()) {
  let tree!: ReactTestRenderer
  const props = { user: me, navigation: fakeNavigation(), onUser: vi.fn(), onLogout: vi.fn(), ...playContext(), onExpired, params: undefined, title: 'Suas modalidades' }
  await act(async () => { tree = create(React.createElement(SportsScreen, props)) })
  trees.push(tree)
  return { tree, onExpired }
}
const nearestCalls = () => vi.mocked(request).mock.calls.filter(call => call[0] === '/cities/nearest')
const puts = () => vi.mocked(request).mock.calls.filter(call => call[1] === 'PUT').map(call => [call[0], call[2]])
const pressable = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType('Pressable' as never).filter(entry => entry.props.accessibilityLabel === label).pop() as ReactTestInstance
const disabled = (tree: ReactTestRenderer, label: string) => Boolean(pressable(tree, label).props.disabled)
const has = (tree: ReactTestRenderer, label: string) => byLabel(tree, label).length > 0
const searchField = (tree: ReactTestRenderer) => tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === 'Buscar cidade').length > 0
const suggestionCard = (tree: ReactTestRenderer) => tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'city-suggested').length > 0
const flush = () => act(async () => { await Promise.resolve() })

beforeEach(() => {
  enableAct()
  vi.mocked(request).mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null)
  stored = []
  nearest = async () => goianiaCity
  serve()
})
afterEach(async () => { vi.useRealTimers(); for (const tree of trees.splice(0)) await act(async () => { tree.unmount() }) })

describe('Localização: permissão não decidida', () => {
  it('mostra "Usar minha localização", "ou" e a busca, e só pede a permissão no toque', async () => {
    const { tree } = await mount()
    await press(tree, 'Futebol, ativar')
    expect(has(tree, 'Usar minha localização')).toBe(true)
    expect(textOf(tree)).toContain('ou')
    expect(searchField(tree)).toBe(true)
    expect(Location.getForegroundPermissionsAsync).toHaveBeenCalledOnce()
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled()
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled()
    expect(nearestCalls()).toEqual([])
    expect(disabled(tree, 'Continuar')).toBe(true)
  })

  it('ao conceder: "Buscando sua localização…" em região viva, depois a sugestão; corpo arredondado e salvar com a cidade sugerida', async () => {
    vi.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue(granted as never)
    vi.mocked(Location.getCurrentPositionAsync).mockResolvedValue(goianiaFix as never)
    const answer = deferred<City>()
    nearest = () => answer.promise
    const { tree } = await mount()
    await press(tree, 'Futebol, ativar')
    await press(tree, 'Usar minha localização')
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledOnce()
    const seeking = tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLiveRegion === 'polite' && textOf({ root: node } as never).includes('Buscando sua localização…'))
    expect(seeking.length).toBeGreaterThan(0)
    expect(Location.getLastKnownPositionAsync).toHaveBeenCalledWith({ maxAge: LAST_KNOWN_MAX_AGE_MS })
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: Location.Accuracy.Low })

    await act(async () => { answer.resolve(goianiaCity) })
    expect(nearestCalls()).toEqual([['/cities/nearest', 'POST', { latitude: -16.69, longitude: -49.26 }, { background: true }]])
    expect(vi.mocked(request).mock.calls.every(call => !/-?16\.|-?49\.|latitude|longitude/.test(String(call[0])))).toBe(true)
    expect(suggestionCard(tree)).toBe(true)
    const text = textOf(tree)
    expect(text).toContain('Pela sua localização')
    expect(text).toContain('Goiânia')
    expect(text).toContain('GO')
    expect(has(tree, 'Pela sua localização: Goiânia, GO')).toBe(true)
    expect(has(tree, 'Não, escolher outra cidade')).toBe(true)
    expect(has(tree, 'Usar minha localização')).toBe(false)
    expect(disabled(tree, 'Continuar')).toBe(false)

    await press(tree, 'Continuar')
    await press(tree, 'Continuar')
    expect(textOf(tree)).toContain('Goiânia · GO')
    await press(tree, 'Ativar futebol')
    expect(puts()).toEqual([['/me/sports-profiles/futebol', { city_id: 5208707, position: null, looking_for: false }]])
    // Nada da posição fica gravado no aparelho.
    expect(SecureStore.setItemAsync).not.toHaveBeenCalledWith(expect.anything(), expect.stringMatching(/16\.|49\./))
  })
  it('mantém a escolha manual na revisão quando a localização solicitada chega depois', async () => {
    vi.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue(granted as never)
    vi.mocked(Location.getCurrentPositionAsync).mockResolvedValue(goianiaFix as never)
    const answer = deferred<City>()
    nearest = () => answer.promise
    const { tree } = await mount()
    await press(tree, 'Tênis, ativar')
    await press(tree, 'Usar minha localização')
    expect(nearestCalls()).toHaveLength(1)
    await searchCity(tree, 'valpa')
    await press(tree, 'Valparaíso de Goiás, GO')
    await press(tree, 'Continuar')

    await act(async () => { answer.resolve(goianiaCity) })
    expect(textOf(tree)).toContain('Valparaíso de Goiás · GO')
    await press(tree, 'Ativar tênis')
    expect(puts()).toEqual([['/me/sports-profiles/tenis', { city_id: valparaisoCity.id, position: null, looking_for: false }]])
  })
})

describe('Localização: permissão já concedida', () => {
  beforeEach(() => {
    vi.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(granted as never)
    vi.mocked(Location.getLastKnownPositionAsync).mockResolvedValue(goianiaFix as never)
  })

  it('perfil novo entra direto na sugestão, sem novo pedido, e salva a cidade sugerida', async () => {
    const { tree } = await mount()
    await press(tree, 'Tênis, ativar')
    await flush()
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled()
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled()
    expect(nearestCalls()).toEqual([['/cities/nearest', 'POST', { latitude: -16.69, longitude: -49.26 }, { background: true }]])
    expect(suggestionCard(tree)).toBe(true)
    expect(disabled(tree, 'Continuar')).toBe(false)
    await press(tree, 'Continuar')
    await press(tree, 'Ativar tênis')
    expect(puts()).toEqual([['/me/sports-profiles/tenis', { city_id: 5208707, position: null, looking_for: false }]])
  })

  it('perfil existente mantém a cidade salva; a localização só entra por "Trocar" e "Usar minha localização"', async () => {
    vi.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue(granted as never)
    stored = [profile('corrida', brasiliaCity, null, true)]
    const { tree } = await mount()
    await press(tree, 'Corrida, ativa, editar')
    await flush()
    expect(nearestCalls()).toEqual([])
    expect(Location.getLastKnownPositionAsync).not.toHaveBeenCalled()
    expect(textOf(tree)).toContain('Escolhida por você')
    expect(textOf(tree)).toContain('Brasília · DF')
    expect(suggestionCard(tree)).toBe(false)

    await press(tree, 'Trocar cidade')
    expect(has(tree, 'Usar minha localização')).toBe(true)
    await press(tree, 'Usar minha localização')
    expect(nearestCalls()).toHaveLength(1)
    expect(suggestionCard(tree)).toBe(true)
    await press(tree, 'Continuar')
    await press(tree, 'Salvar')
    expect(puts()).toEqual([['/me/sports-profiles/corrida', { city_id: 5208707, position: null, looking_for: true }]])
  })

  it('a sugestão automática não troca uma cidade escolhida pela busca antes da resposta', async () => {
    const answer = deferred<City>()
    nearest = () => answer.promise
    const { tree } = await mount()
    await press(tree, 'Corrida, ativar')
    await flush()
    expect(textOf(tree)).toContain('Buscando sua localização…')
    await searchCity(tree, 'valpa')
    await press(tree, 'Valparaíso de Goiás, GO')
    await act(async () => { answer.resolve(goianiaCity) })
    expect(suggestionCard(tree)).toBe(false)
    expect(textOf(tree)).toContain('Escolhida por você')
    expect(textOf(tree)).toContain('Valparaíso de Goiás · GO')
    await press(tree, 'Trocar cidade')
    expect(has(tree, 'Usar a cidade pela sua localização: Goiânia, GO')).toBe(true)
  })
})

describe('Localização: "Não, escolher outra cidade"', () => {
  it('leva à busca mantendo a sugestão disponível; outra cidade é "Escolhida por você" e a sugestão volta com o rótulo "Pela sua localização"', async () => {
    vi.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(granted as never)
    vi.mocked(Location.getLastKnownPositionAsync).mockResolvedValue(goianiaFix as never)
    const { tree } = await mount()
    await press(tree, 'Tênis, ativar')
    await flush()
    await press(tree, 'Não, escolher outra cidade')
    expect(suggestionCard(tree)).toBe(false)
    expect(searchField(tree)).toBe(true)
    expect(byLabel(tree, 'Goiânia, GO')[0].props.accessibilityState).toMatchObject({ selected: true })
    expect(disabled(tree, 'Continuar')).toBe(false)

    await searchCity(tree, 'valpa')
    await press(tree, 'Valparaíso de Goiás, GO')
    expect(textOf(tree)).toContain('Escolhida por você')
    expect(textOf(tree)).toContain('Valparaíso de Goiás · GO')

    await press(tree, 'Trocar cidade')
    await press(tree, 'Usar a cidade pela sua localização: Goiânia, GO')
    expect(textOf(tree)).toContain('Pela sua localização')
    expect(textOf(tree)).toContain('Goiânia · GO')
    expect(textOf(tree)).not.toContain('Escolhida por você')
    expect(nearestCalls()).toHaveLength(1)
    await press(tree, 'Continuar')
    await press(tree, 'Ativar tênis')
    expect(puts()).toEqual([['/me/sports-profiles/tenis', { city_id: 5208707, position: null, looking_for: false }]])
  })
})

describe('Localização: negada, falha e fora da cobertura', () => {
  const deniedText = 'Sem acesso à localização. Busque sua cidade abaixo.'
  const failedText = 'Não foi possível obter sua localização.'

  it('negada antes (sem poder perguntar): aviso e busca, sem o botão nem pedido', async () => {
    vi.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(denied as never)
    const { tree } = await mount()
    await press(tree, 'Futebol, ativar')
    expect(textOf(tree)).toContain(deniedText)
    expect(has(tree, 'Usar minha localização')).toBe(false)
    expect(searchField(tree)).toBe(true)
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled()
    await searchCity(tree, 'valpa')
    await press(tree, 'Valparaíso de Goiás, GO')
    expect(disabled(tree, 'Continuar')).toBe(false)
  })

  it('negada agora: aviso e busca, o botão some e nada é lido do aparelho nem enviado', async () => {
    vi.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ ...denied, canAskAgain: true } as never)
    const { tree } = await mount()
    await press(tree, 'Futebol, ativar')
    await press(tree, 'Usar minha localização')
    expect(textOf(tree)).toContain(deniedText)
    expect(has(tree, 'Usar minha localização')).toBe(false)
    expect(searchField(tree)).toBe(true)
    expect(Location.getLastKnownPositionAsync).not.toHaveBeenCalled()
    expect(nearestCalls()).toEqual([])
  })

  it('negada uma vez no Android (ainda pode perguntar) conta como não decidida', async () => {
    vi.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({ ...denied, canAskAgain: true } as never)
    const { tree } = await mount()
    await press(tree, 'Futebol, ativar')
    expect(has(tree, 'Usar minha localização')).toBe(true)
    expect(textOf(tree)).not.toContain(deniedText)
  })

  it('posição indisponível ou localização desligada: aviso de falha e a busca', async () => {
    vi.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue(granted as never)
    vi.mocked(Location.getCurrentPositionAsync).mockRejectedValue(new Error('Location services are disabled'))
    const { tree } = await mount()
    await press(tree, 'Futebol, ativar')
    await press(tree, 'Usar minha localização')
    expect(textOf(tree)).toContain(failedText)
    expect(searchField(tree)).toBe(true)
    expect(nearestCalls()).toEqual([])
  })

  it('tempo esgotado: aviso de falha depois do limite', async () => {
    vi.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(granted as never)
    vi.mocked(Location.getCurrentPositionAsync).mockReturnValue(new Promise(() => undefined) as never)
    const { tree } = await mount()
    vi.useFakeTimers()
    await press(tree, 'Tênis, ativar')
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(textOf(tree)).toContain('Buscando sua localização…')
    await act(async () => { await vi.advanceTimersByTimeAsync(LOCATION_TIMEOUT_MS) })
    expect(textOf(tree)).toContain(failedText)
    expect(textOf(tree)).not.toContain('Buscando sua localização…')
    expect(nearestCalls()).toEqual([])
  })

  it('erro de conexão no servidor: aviso de falha; 404: "Não encontramos um município perto de você."', async () => {
    vi.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(granted as never)
    vi.mocked(Location.getLastKnownPositionAsync).mockResolvedValue(goianiaFix as never)
    nearest = async () => { throw new ApiError('Não foi possível conectar ao Arena.', 0) }
    const offline = await mount()
    await press(offline.tree, 'Futebol, ativar')
    await flush()
    expect(textOf(offline.tree)).toContain(failedText)
    expect(textOf(offline.tree)).not.toContain('Não foi possível conectar ao Arena.')

    nearest = async () => { throw new ApiError('Não encontramos um município perto de você.', 404) }
    const outside = await mount()
    await press(outside.tree, 'Futebol, ativar')
    await flush()
    expect(textOf(outside.tree)).toContain('Não encontramos um município perto de você.')
    expect(searchField(outside.tree)).toBe(true)
    expect(suggestionCard(outside.tree)).toBe(false)
    expect(disabled(outside.tree, 'Continuar')).toBe(true)
  })

  it('401 ao buscar a cidade chama onExpired', async () => {
    vi.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(granted as never)
    vi.mocked(Location.getLastKnownPositionAsync).mockResolvedValue(goianiaFix as never)
    nearest = async () => { throw new ApiError('Sessão expirada.', 401) }
    const { tree, onExpired } = await mount()
    await press(tree, 'Futebol, ativar')
    await flush()
    expect(onExpired).toHaveBeenCalledOnce()
  })
})

describe('Localização: fechar no meio', () => {
  it('fechar a folha durante a busca descarta a resposta; reabrir começa de novo, sem pedido automático', async () => {
    vi.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue(granted as never)
    vi.mocked(Location.getLastKnownPositionAsync).mockResolvedValue(goianiaFix as never)
    const answer = deferred<City>()
    nearest = () => answer.promise
    const { tree } = await mount()
    await press(tree, 'Corrida, ativar')
    await press(tree, 'Usar minha localização')
    expect(textOf(tree)).toContain('Buscando sua localização…')
    await press(tree, 'Fechar folha')
    await act(async () => { answer.resolve(goianiaCity) })
    expect(puts()).toEqual([])
    await press(tree, 'Corrida, ativar')
    expect(has(tree, 'Usar minha localização')).toBe(true)
    expect(suggestionCard(tree)).toBe(false)
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledOnce()
  })

  it('erro ao pedir a permissão vira o aviso de falha', async () => {
    vi.mocked(Location.requestForegroundPermissionsAsync).mockRejectedValue(new Error('Sem atividade.'))
    const { tree } = await mount()
    await press(tree, 'Futebol, ativar')
    await press(tree, 'Usar minha localização')
    expect(textOf(tree)).toContain('Não foi possível obter sua localização.')
  })
})

describe('Localização: volta ao passo', () => {
  it('a sugestão sobrevive a "Voltar" sem nova leitura do aparelho', async () => {
    vi.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(granted as never)
    vi.mocked(Location.getLastKnownPositionAsync).mockResolvedValue(goianiaFix as never)
    const { tree } = await mount()
    await press(tree, 'Futebol, ativar')
    await flush()
    await press(tree, 'Continuar')
    await press(tree, 'Voltar')
    expect(suggestionCard(tree)).toBe(true)
    expect(nearestCalls()).toHaveLength(1)
    expect(Location.getLastKnownPositionAsync).toHaveBeenCalledOnce()
  })
})
