import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { City, Profile } from '../src/api/client'
import { citiesByIds, CITY_SEARCH_LIMIT, cityLabel, searchCities } from '../src/api/cities'
import { CityField, CitySearch } from '../src/components/arena/CitySearch'
import SportCard from '../src/components/SportCard'
import { CITY_SEARCH_DEBOUNCE_MS } from '../src/hooks/useCities'
import { byLabel, click, enableAct, press, textOf, type } from './support/native'
import { brasiliaCity, goianiaCity, searchCity, searchPath, valparaisoCity } from './support/cities'
import { toasts } from './support/toast'

vi.mock('react-native', async () => {
  const native = await import('./support/native')
  return { ...native.reactNativeMock(), Switch: (props: Record<string, unknown>) => React.createElement('Switch', props) }
})
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/components/ui', async () => (await import('./support/native')).uiMock())
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))

/*
 * Busca de cidade no catálogo nacional (Expo): o cliente da API, os estados da busca (mínimo de 2 caracteres, atraso de
 * digitação, vazio, erro com "Tentar novamente", resposta antiga descartada), o nome por `city`/`ids=` e o perfil esportivo
 * salvo com um município fora dos 100 primeiros.
 */

const h = React.createElement
const trees: ReactTestRenderer[] = []
async function mount(element: React.ReactElement) {
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(element) })
  trees.push(tree)
  return tree
}
type Route = unknown | ((path: string) => unknown)
function serve(routes: Record<string, Route>) {
  vi.mocked(request).mockReset().mockImplementation(async (path: string) => {
    if (!(path in routes)) throw new ApiError(`Rota sem simulação: ${path}`, 404)
    const route = routes[path]
    return (typeof route === 'function' ? await (route as (path: string) => unknown)(path) : route) as never
  })
}
const paths = () => vi.mocked(request).mock.calls.map(call => call[0])

beforeEach(() => { enableAct(); vi.mocked(request).mockReset() })
afterEach(async () => { vi.useRealTimers(); for (const tree of trees.splice(0)) await act(async () => { tree.unmount() }) })

describe('cliente do catálogo de cidades', () => {
  it('busca com q aparado e codificado, até 20 resultados; termo curto não chama a API', async () => {
    const many = Array.from({ length: 25 }, (_, index) => ({ id: index + 1, name: `Cidade ${index + 1}`, state: 'GO' }))
    serve({ '/cities?q=s%C3%A3o%20paulo%20sp': many })
    await expect(searchCities('  são paulo sp ')).resolves.toHaveLength(CITY_SEARCH_LIMIT)
    await expect(searchCities(' g ')).resolves.toEqual([])
    expect(paths()).toEqual(['/cities?q=s%C3%A3o%20paulo%20sp'])
  })

  it('nomeia por ids= sem repetir nem enviar IDs inválidos; sem IDs não chama a API', async () => {
    serve({ '/cities?ids=5221858,5300108': [valparaisoCity, brasiliaCity] })
    await expect(citiesByIds([5221858, 5300108, 5221858, 0, 1.5])).resolves.toEqual([valparaisoCity, brasiliaCity])
    await expect(citiesByIds([])).resolves.toEqual([])
    expect(paths()).toEqual(['/cities?ids=5221858,5300108'])
    expect(cityLabel(valparaisoCity)).toBe('Valparaíso de Goiás · GO')
  })
})

describe('CitySearch', () => {
  const search = (selected: City | null = null, onSelect = vi.fn(), onExpired = vi.fn()) => mount(h(CitySearch, { selected, onSelect, onExpired }))

  it('só consulta com 2 ou mais caracteres, depois do atraso de digitação, e mostra "Nome · UF"', async () => {
    serve({ [searchPath('go')]: [goianiaCity, valparaisoCity] })
    const onSelect = vi.fn()
    const tree = await search(null, onSelect)
    expect(textOf(tree)).toContain('Digite pelo menos 2 letras do nome da cidade ou a UF.')
    vi.useFakeTimers()
    await type(tree, 'Buscar cidade', 'g')
    await act(async () => { await vi.advanceTimersByTimeAsync(CITY_SEARCH_DEBOUNCE_MS) })
    expect(request).not.toHaveBeenCalled()
    await type(tree, 'Buscar cidade', 'go')
    expect(textOf(tree)).toContain('Buscando cidades…')
    await act(async () => { await vi.advanceTimersByTimeAsync(CITY_SEARCH_DEBOUNCE_MS - 10) })
    expect(request).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    vi.useRealTimers()
    expect(paths()).toEqual([searchPath('go')])
    expect(textOf(tree)).toContain('Goiânia · GO')
    expect(textOf(tree)).toContain('Valparaíso de Goiás · GO')
    await press(tree, 'Valparaíso de Goiás, GO')
    expect(onSelect).toHaveBeenCalledWith(valparaisoCity)
  })

  it('resultado vazio mostra "Nenhuma cidade encontrada."; erro mostra "Tentar novamente", que busca de novo', async () => {
    let fail = true
    serve({ [searchPath('xyz')]: [], [searchPath('goi')]: () => { if (fail) throw new ApiError('Busca fora do ar', 500); return [goianiaCity] } })
    const tree = await search()
    await searchCity(tree, 'xyz')
    expect(textOf(tree)).toContain('Nenhuma cidade encontrada.')
    await searchCity(tree, 'goi')
    expect(textOf(tree)).toContain('Busca fora do ar')
    expect(byLabel(tree, 'Tentar novamente')).toHaveLength(1)
    fail = false
    vi.useFakeTimers()
    await press(tree, 'Tentar novamente')
    await act(async () => { await vi.advanceTimersByTimeAsync(CITY_SEARCH_DEBOUNCE_MS) })
    vi.useRealTimers()
    expect(textOf(tree)).toContain('Goiânia · GO')
    expect(textOf(tree)).not.toContain('Busca fora do ar')
  })

  it('falha sem mensagem usa o texto padrão; 401 vai para onExpired', async () => {
    serve({ [searchPath('go')]: () => { throw new Error('') }, [searchPath('df')]: () => { throw new ApiError('Sessão expirada', 401) } })
    const onExpired = vi.fn()
    const tree = await search(null, vi.fn(), onExpired)
    await searchCity(tree, 'go')
    expect(textOf(tree)).toContain('Não foi possível buscar as cidades.')
    await searchCity(tree, 'df')
    expect(onExpired).toHaveBeenCalledOnce()
  })

  it('a resposta de um termo anterior não sobrescreve a do termo atual', async () => {
    let releaseOld: (value: City[]) => void = () => undefined
    serve({ [searchPath('go')]: () => new Promise<City[]>(resolve => { releaseOld = resolve }), [searchPath('goi')]: [goianiaCity] })
    const tree = await search()
    await searchCity(tree, 'go')
    await searchCity(tree, 'goi')
    expect(textOf(tree)).toContain('Goiânia · GO')
    await act(async () => { releaseOld([valparaisoCity]) })
    expect(textOf(tree)).toContain('Goiânia · GO')
    expect(textOf(tree)).not.toContain('Valparaíso')
  })

  it('a cidade escolhida aparece marcada mesmo fora dos resultados, sem repetir quando está neles', async () => {
    serve({ [searchPath('goi')]: [goianiaCity], [searchPath('valp')]: [valparaisoCity] })
    const onSelect = vi.fn()
    const tree = await search(valparaisoCity, onSelect)
    await searchCity(tree, 'goi')
    expect(byLabel(tree, 'Cidade escolhida')).toHaveLength(1)
    expect(byLabel(tree, 'Valparaíso de Goiás, GO')[0].props.accessibilityState).toMatchObject({ selected: true })
    expect(byLabel(tree, 'Goiânia, GO')[0].props.accessibilityState).toMatchObject({ selected: false })
    await searchCity(tree, 'valp')
    expect(byLabel(tree, 'Valparaíso de Goiás, GO')).toHaveLength(1)
    await press(tree, 'Valparaíso de Goiás, GO')
    expect(onSelect).toHaveBeenCalledWith(valparaisoCity)
  })
})

describe('CityField', () => {
  const field = (value: number | null, city?: City | null, onChange = vi.fn(), onExpired = vi.fn()) =>
    mount(h(CityField, { value, city, onChange, onExpired, label: 'Cidade', title: 'Cidade do evento' }))

  it('nomeia pelo objeto city da resposta, sem consultar o catálogo', async () => {
    serve({})
    const tree = await field(valparaisoCity.id, valparaisoCity)
    expect(byLabel(tree, 'Cidade: Valparaíso de Goiás, GO')).toHaveLength(1)
    expect(request).not.toHaveBeenCalled()
  })

  it('sem o objeto city, nomeia por ids=; falha avisa e 401 expira', async () => {
    let release: (value: City[]) => void = () => undefined
    serve({ '/cities?ids=5221858': () => new Promise<City[]>(resolve => { release = resolve }) })
    const tree = await field(5221858)
    expect(byLabel(tree, 'Cidade: Carregando cidade…')).toHaveLength(1)
    await act(async () => { release([valparaisoCity]) })
    expect(textOf(tree)).toContain('Valparaíso de Goiás · GO')
    expect(paths()).toEqual(['/cities?ids=5221858'])
    serve({ '/cities?ids=99': [] })
    expect(byLabel(await field(99), 'Cidade: Cidade indisponível')).toHaveLength(1)
    const onExpired = vi.fn()
    serve({ '/cities?ids=98': () => { throw new ApiError('Sessão expirada', 401) } })
    const expired = await field(98, null, vi.fn(), onExpired)
    expect(onExpired).toHaveBeenCalledOnce()
    expect(textOf(expired)).toContain('Cidade indisponível')
  })

  it('abre a busca, escolhe um município fora dos 100 primeiros e passa a nomeá-lo', async () => {
    serve({ [searchPath('valpa')]: [valparaisoCity] })
    const onChange = vi.fn()
    let tree = await field(null, null, onChange)
    expect(textOf(tree)).toContain('Escolher a cidade')
    await press(tree, 'Cidade: não escolhida')
    expect(textOf(tree)).toContain('Cidade do evento')
    await searchCity(tree, 'valpa')
    await press(tree, 'Valparaíso de Goiás, GO')
    expect(onChange).toHaveBeenCalledWith(valparaisoCity)
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(0)
    // O pai grava o ID; o campo já conhece a cidade escolhida e não consulta ids=.
    await act(async () => { tree.update(h(CityField, { value: valparaisoCity.id, city: null, onChange, label: 'Cidade', title: 'Cidade do evento' })) })
    expect(byLabel(tree, 'Cidade: Valparaíso de Goiás, GO')).toHaveLength(1)
    expect(paths().some(path => path.startsWith('/cities?ids='))).toBe(false)
    tree = await field(null, null, onChange)
    expect(textOf(tree)).toContain('Escolher')
  })
})

describe('SportCard (perfil esportivo)', () => {
  const tennis = (city: City): Profile => ({ id: 3, sport: 'tenis', city_id: city.id, city, position: null, looking_for: true, is_public: false, level: null })

  it('mostra a cidade do objeto city e salva um município fora dos 100 primeiros escolhido pela busca', async () => {
    serve({ [searchPath('valpa')]: [valparaisoCity] })
    const onSave = vi.fn().mockResolvedValue(undefined)
    const tree = await mount(h(SportCard, { sport: 'tenis', label: 'Tênis', profile: tennis(brasiliaCity), onSave, onExpired: vi.fn() }))
    expect(textOf(tree)).toContain('Brasília · DF')
    await click(tree, 'Editar perfil')
    expect(byLabel(tree, 'Brasília, DF')[0].props.accessibilityState).toMatchObject({ selected: true })
    await searchCity(tree, 'valpa')
    await press(tree, 'Valparaíso de Goiás, GO')
    expect(byLabel(tree, 'Valparaíso de Goiás, GO')[0].props.accessibilityState).toMatchObject({ selected: true })
    await click(tree, 'Salvar perfil')
    expect(onSave).toHaveBeenCalledWith('tenis', { city_id: 5221858, position: null, looking_for: true })
    expect(toasts().map(item => item.title)).toEqual(['Perfil salvo.'])
    // A tela troca o perfil pela resposta do PUT (com `city`): o cartão nomeia a nova cidade.
    await act(async () => { tree.update(h(SportCard, { sport: 'tenis', label: 'Tênis', profile: tennis(valparaisoCity), onSave, onExpired: vi.fn() })) })
    expect(textOf(tree)).toContain('Valparaíso de Goiás · GO')
    expect(paths().every(path => path.startsWith('/cities?q='))).toBe(true)
  })
})
