import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { City, Position, Profile, ProfileInput, Sport, User } from '../src/api/client'
import { connection } from '../src/api/connection'
import SportsScreen from '../src/screens/SportsScreen'
import { byLabel, enableAct, press, textOf } from './support/native'
import { playContext } from './support/play'
import { fakeNavigation } from './support/teams'
import { brasiliaCity, searchCity, searchPath, valparaisoCity } from './support/cities'
import { toasts } from './support/toast'

/**
 * Foco de acessibilidade: `setAccessibilityFocus` recebe o nó simulado do título do passo e registra o título que está na
 * tela naquele momento (`read`, ligado à árvore montada).
 */
const focus = vi.hoisted(() => ({ titles: [] as unknown[], read: (): unknown => undefined }))
vi.mock('react-native', async () => {
  const base = (await import('./support/native')).reactNativeMock()
  return {
    ...base,
    AccessibilityInfo: { ...base.AccessibilityInfo, setAccessibilityFocus: (node: unknown) => { if (node) focus.titles.push(focus.read()) } },
    findNodeHandle: (ref: unknown) => ref ?? null,
  }
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
 * Tela de modalidades do Expo (Suas modalidades, aberta pela linha "Minhas modalidades" do perfil), com a API simulada: faixas e contador, a folha passo a passo por
 * modalidade (Cidade → Posição → Revisão no futebol; Cidade → Revisão no tênis e na corrida), "Alterar", o corpo do `PUT`,
 * o toast de sucesso, o 422 na folha, os demais erros por `reportActionError`, fechar sem salvar e o perfil existente.
 */

const me: User = { id: 1, name: 'Eu Mesmo', username: 'eu.atleta', email: 'eu@example.com', birth_date: '1995-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
const emptyPage = { items: [], next_cursor: null }
const trees: ReactTestRenderer[] = []
const ids: Record<Sport, number> = { futebol: 11, tenis: 12, corrida: 13 }
const profile = (sport: Sport, city: City, position: Position | null, looking: boolean): Profile =>
  ({ id: ids[sport], sport, city_id: city.id, city, position, looking_for: looking, is_public: false, level: null })

/** Perfis "no servidor": o `GET` lê daqui e o `PUT` grava aqui (como o banco), salvo quando `putFailure` responde. */
let stored: Profile[] = []
let putFailure: Error | null = null
function serve() {
  vi.mocked(request).mockImplementation((async (path: string, method?: string, body?: unknown) => {
    if (path === '/me/sports-profiles') return stored
    const put = /^\/me\/sports-profiles\/(\w+)$/.exec(path)
    if (put && method === 'PUT') {
      if (putFailure) throw putFailure
      const sport = put[1] as Sport
      const input = body as ProfileInput
      const city = [brasiliaCity, valparaisoCity].find(item => item.id === input.city_id)!
      const saved = profile(sport, city, input.position, input.looking_for)
      stored = [...stored.filter(item => item.sport !== sport), saved]
      return saved
    }
    if (path === searchPath('valpa')) return [valparaisoCity]
    if (path === '/users/1') return { id: 1, follower_count: 0, following_count: 0 }
    return emptyPage
  }) as never)
}
async function mount(onExpired = vi.fn()) {
  let tree!: ReactTestRenderer
  // Só o título do passo ganha um nó nativo simulado (os demais refs seguem nulos, como no renderizador de teste).
  const createNodeMock = (element: React.ReactElement<{ accessibilityLabel?: string }>) => String(element.props.accessibilityLabel).includes(' Passo ') ? { stepTitle: true } : null
  const props = { user: me, navigation: fakeNavigation(), onUser: vi.fn(), onLogout: vi.fn(), ...playContext(), onExpired, params: undefined, title: 'Suas modalidades' }
  await act(async () => { tree = create(React.createElement(SportsScreen, props), { createNodeMock }) })
  trees.push(tree)
  focus.read = () => stepHeader(tree)
  return { tree, onExpired }
}
const puts = () => vi.mocked(request).mock.calls.filter(call => call[1] === 'PUT').map(call => [call[0], call[2]])
const sheetOpen = (tree: ReactTestRenderer) => tree.root.findAllByType('Modal' as never).length > 0
const pressable = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType('Pressable' as never).filter(entry => entry.props.accessibilityLabel === label).pop() as ReactTestInstance
const disabled = (tree: ReactTestRenderer, label: string) => Boolean(pressable(tree, label).props.disabled)
const radio = (tree: ReactTestRenderer, label: string) => tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === label)[0]
const stepHeader = (tree: ReactTestRenderer) => tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'header' && String(node.props.accessibilityLabel).includes('Passo'))[0]?.props.accessibilityLabel
const lookingSwitch = (tree: ReactTestRenderer) => tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'switch')[0]
/** Fecha a folha pelo botão voltar do Android (o `onRequestClose` do `Modal`). */
async function androidBack(tree: ReactTestRenderer) {
  const modal = tree.root.findAllByType('Modal' as never)[0]
  await act(async () => { modal.props.onRequestClose() })
}
async function pickValparaiso(tree: ReactTestRenderer) {
  await searchCity(tree, 'valpa')
  await press(tree, 'Valparaíso de Goiás, GO')
}

beforeEach(() => { enableAct(); vi.mocked(request).mockReset(); stored = []; putFailure = null; focus.titles.length = 0; serve() })
afterEach(async () => { vi.useRealTimers(); for (const tree of trees.splice(0)) await act(async () => { tree.unmount() }) })

describe('Tela de modalidades: faixas', () => {
  it('conta nova vê "0 de 3 ativas", "Onde você joga?", três faixas para ativar e o aviso de privacidade, sem elo ou pontos', async () => {
    const { tree } = await mount()
    const text = textOf(tree)
    expect(text).toContain('0 de 3 ativas')
    expect(text).toContain('Onde você joga?')
    for (const label of ['Futebol, ativar', 'Tênis, ativar', 'Corrida, ativar']) expect(byLabel(tree, label)).toHaveLength(1)
    expect(text.match(/Toque para ativar/g)).toHaveLength(3)
    expect(text).toContain('Seu lugar dentro de campo.')
    expect(text).toContain('Seus perfis começam privados.')
    expect(text).not.toMatch(/Bronze|Prata|Ouro|Diamante|Lendário|pontos|Sem classificação/)
    expect(sheetOpen(tree)).toBe(false)
  })

  it('a falha ao ler os perfis é um erro de seção com "Tentar novamente", sem fingir "0 de 3 ativas"; a leitura é refeita', async () => {
    let fail = true
    const base = vi.mocked(request).getMockImplementation()!
    vi.mocked(request).mockImplementation(async (...args) => {
      if (args[0] === '/me/sports-profiles' && fail) throw new ApiError('Perfis fora do ar.', 500)
      return base(...args)
    })
    const { tree } = await mount()
    const loadErrors = () => tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'load-error-section')
    expect(loadErrors()).toHaveLength(1)
    expect(textOf(tree)).toContain('Não foi possível carregar suas modalidades')
    expect(textOf(tree)).toContain('Perfis fora do ar.')
    expect(textOf(tree)).not.toContain('de 3 ativas')
    expect(toasts()).toEqual([])
    fail = false
    await press(tree, 'Tentar novamente')
    expect(loadErrors()).toHaveLength(0)
    expect(textOf(tree)).toContain('0 de 3 ativas')
  })
})

describe('Tela de modalidades: folha passo a passo', () => {
  it('futebol: Cidade → Posição → Revisão; ativa com o corpo do PUT, fecha a folha, deixa a faixa ativa e mostra o toast', async () => {
    const { tree } = await mount()
    await press(tree, 'Futebol, ativar')
    expect(stepHeader(tree)).toBe('Em que cidade você joga? Passo 1 de 3.')
    expect(textOf(tree)).toContain('1 de 3')
    // O ícone da folha é o selo no ladrilho redondo de 24 pt, decorativo.
    const sheetIcon = tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'selo-tile-futebol')
    expect(sheetIcon).toHaveLength(1)
    expect(sheetIcon[0].props).toMatchObject({ accessible: false, importantForAccessibility: 'no-hide-descendants', style: { width: 24, borderRadius: 12 } })
    expect(sheetIcon[0].findAllByType('Circle' as never)).toHaveLength(1)
    expect(tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'profile-step-done')).toHaveLength(1)
    expect(disabled(tree, 'Continuar')).toBe(true)
    expect(byLabel(tree, 'Voltar')).toHaveLength(0)
    await pickValparaiso(tree)
    expect(textOf(tree)).toContain('Escolhida por você')
    expect(textOf(tree)).toContain('Valparaíso de Goiás · GO')
    expect(disabled(tree, 'Continuar')).toBe(false)

    await press(tree, 'Continuar')
    expect(stepHeader(tree)).toBe('Onde você gosta de jogar? Passo 2 de 3.')
    expect(tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'radiogroup' && node.props.accessibilityLabel === 'Posição preferida')).toHaveLength(1)
    for (const [label, hint] of [['Goleiro', 'Defende a meta'], ['Defesa', 'Segura a linha de trás'], ['Meio de campo', 'Arma as jogadas'], ['Atacante', 'Busca o gol'], ['Ainda não sei', 'Você define depois, no perfil.']]) {
      expect(radio(tree, label).props.accessibilityHint).toBe(hint)
    }
    expect(radio(tree, 'Ainda não sei').props.accessibilityState).toEqual({ checked: true })
    await press(tree, 'Atacante')
    expect(radio(tree, 'Atacante').props.accessibilityState).toEqual({ checked: true })
    expect(radio(tree, 'Ainda não sei').props.accessibilityState).toEqual({ checked: false })

    await press(tree, 'Continuar')
    expect(stepHeader(tree)).toBe('Tudo certo? Passo 3 de 3.')
    expect(textOf(tree)).toContain('Aparece no seu perfil esportivo.')
    expect(lookingSwitch(tree).props.accessibilityState).toMatchObject({ checked: false })
    await press(tree, 'Procurando oportunidades')
    expect(lookingSwitch(tree).props.accessibilityState).toMatchObject({ checked: true })
    await press(tree, 'Ativar futebol')

    expect(puts()).toEqual([['/me/sports-profiles/futebol', { city_id: 5221858, position: 'atacante', looking_for: true }]])
    expect(sheetOpen(tree)).toBe(false)
    expect(byLabel(tree, 'Futebol, ativa, editar')).toHaveLength(1)
    expect(textOf(tree)).toContain('1 de 3 ativas')
    expect(textOf(tree)).toContain('● Ativa')
    expect(textOf(tree)).toContain('Valparaíso de Goiás · GO · Atacante · Procurando')
    expect(toasts().map(item => [item.tone, item.title, item.description])).toEqual([['success', 'Futebol ativado.', 'Valparaíso de Goiás · GO · Atacante · Procurando']])

    // Reabrir o perfil (recarregar) mostra o que foi persistido.
    const { tree: reloaded } = await mount()
    expect(byLabel(reloaded, 'Futebol, ativa, editar')).toHaveLength(1)
    expect(textOf(reloaded)).toContain('1 de 3 ativas')
  })

  it('tênis tem só Cidade → Revisão, sem posição; "Alterar" volta ao passo e "Ainda não sei" grava position null no futebol', async () => {
    const { tree } = await mount()
    await press(tree, 'Tênis, ativar')
    expect(stepHeader(tree)).toBe('Em que cidade você joga? Passo 1 de 2.')
    await pickValparaiso(tree)
    await press(tree, 'Continuar')
    expect(stepHeader(tree)).toBe('Tudo certo? Passo 2 de 2.')
    expect(byLabel(tree, 'Alterar cidade')).toHaveLength(1)
    expect(byLabel(tree, 'Alterar posição')).toHaveLength(0)
    await press(tree, 'Alterar cidade')
    expect(stepHeader(tree)).toBe('Em que cidade você joga? Passo 1 de 2.')
    await press(tree, 'Continuar')
    await press(tree, 'Ativar tênis')
    expect(puts()).toEqual([['/me/sports-profiles/tenis', { city_id: 5221858, position: null, looking_for: false }]])
    expect(toasts().map(item => [item.title, item.description])).toEqual([['Tênis ativado.', 'Valparaíso de Goiás · GO · Sem procura']])

    await press(tree, 'Futebol, ativar')
    await pickValparaiso(tree)
    await press(tree, 'Continuar')
    await press(tree, 'Goleiro')
    await press(tree, 'Continuar')
    expect(textOf(tree)).toContain('Goleiro')
    await press(tree, 'Alterar posição')
    expect(stepHeader(tree)).toBe('Onde você gosta de jogar? Passo 2 de 3.')
    await press(tree, 'Ainda não sei')
    await press(tree, 'Continuar')
    expect(textOf(tree)).toContain('Ainda não sei')
    await press(tree, 'Voltar')
    expect(stepHeader(tree)).toBe('Onde você gosta de jogar? Passo 2 de 3.')
    await press(tree, 'Continuar')
    await press(tree, 'Ativar futebol')
    expect(puts()[1]).toEqual(['/me/sports-profiles/futebol', { city_id: 5221858, position: null, looking_for: false }])
    expect(textOf(tree)).toContain('2 de 3 ativas')
  })

  it('perfil existente abre no passo 1 com os valores atuais, "Trocar" mantém a cidade até outra ser escolhida e "Salvar" avisa "Perfil salvo."', async () => {
    stored = [profile('futebol', brasiliaCity, 'meio_campo', true)]
    const { tree } = await mount()
    expect(textOf(tree)).toContain('1 de 3 ativas')
    expect(textOf(tree)).toContain('Brasília · DF · Meio de campo · Procurando')
    await press(tree, 'Futebol, ativa, editar')
    expect(stepHeader(tree)).toBe('Em que cidade você joga? Passo 1 de 3.')
    expect(textOf(tree)).toContain('Brasília · DF')
    await press(tree, 'Trocar cidade')
    expect(byLabel(tree, 'Brasília, DF')[0].props.accessibilityState).toMatchObject({ selected: true })
    expect(disabled(tree, 'Continuar')).toBe(false)
    await pickValparaiso(tree)
    expect(textOf(tree)).toContain('Valparaíso de Goiás · GO')
    await press(tree, 'Continuar')
    expect(radio(tree, 'Meio de campo').props.accessibilityState).toEqual({ checked: true })
    await press(tree, 'Continuar')
    expect(lookingSwitch(tree).props.accessibilityState).toMatchObject({ checked: true })
    expect(byLabel(tree, 'Ativar futebol')).toHaveLength(0)
    await press(tree, 'Salvar')
    expect(puts()).toEqual([['/me/sports-profiles/futebol', { city_id: 5221858, position: 'meio_campo', looking_for: true }]])
    expect(sheetOpen(tree)).toBe(false)
    expect(toasts().map(item => [item.tone, item.title, item.description])).toEqual([['success', 'Perfil salvo.', 'Valparaíso de Goiás · GO · Meio de campo · Procurando']])
    expect(textOf(tree)).toContain('Valparaíso de Goiás · GO · Meio de campo · Procurando')
  })

  it('o voltar do Android e o toque fora fecham a folha sem salvar; reabrir recomeça do passo 1', async () => {
    const { tree } = await mount()
    await press(tree, 'Corrida, ativar')
    await pickValparaiso(tree)
    await press(tree, 'Continuar')
    await androidBack(tree)
    expect(sheetOpen(tree)).toBe(false)
    expect(puts()).toEqual([])
    expect(byLabel(tree, 'Corrida, ativar')).toHaveLength(1)
    await press(tree, 'Corrida, ativar')
    expect(stepHeader(tree)).toBe('Em que cidade você joga? Passo 1 de 2.')
    expect(disabled(tree, 'Continuar')).toBe(true)
    await press(tree, 'Fechar folha')
    expect(sheetOpen(tree)).toBe(false)
    expect(puts()).toEqual([])
    expect(toasts()).toEqual([])
  })
})

describe('Tela de modalidades: foco no título do passo', () => {
  it('o foco vai para o título ao abrir, ao continuar, em "Alterar", em "Voltar" e ao reabrir', async () => {
    const { tree } = await mount()
    await press(tree, 'Futebol, ativar')
    await pickValparaiso(tree)
    await press(tree, 'Continuar')
    await press(tree, 'Continuar')
    await press(tree, 'Alterar posição')
    await press(tree, 'Voltar')
    await press(tree, 'Fechar')
    await press(tree, 'Futebol, ativar')
    const [city, position, review] = ['Em que cidade você joga? Passo 1 de 3.', 'Onde você gosta de jogar? Passo 2 de 3.', 'Tudo certo? Passo 3 de 3.']
    expect(focus.titles).toEqual([city, position, review, position, city, city])
  })
})

describe('Tela de modalidades: falhas ao salvar', () => {
  async function reachReview(tree: ReactTestRenderer) {
    await press(tree, 'Tênis, ativar')
    await pickValparaiso(tree)
    await press(tree, 'Continuar')
  }

  it('422 aparece na folha, no passo de revisão, sem toast; a faixa continua inativa', async () => {
    putFailure = new ApiError('Selecione uma cidade do catálogo.', 422, [], { detail: 'Selecione uma cidade do catálogo.' })
    const { tree } = await mount()
    await reachReview(tree)
    await press(tree, 'Ativar tênis')
    expect(sheetOpen(tree)).toBe(true)
    expect(stepHeader(tree)).toBe('Tudo certo? Passo 2 de 2.')
    expect(textOf(tree)).toContain('Selecione uma cidade do catálogo.')
    expect(toasts()).toEqual([])
    expect(byLabel(tree, 'Tênis, ativar')).toHaveLength(1)
    expect(disabled(tree, 'Ativar tênis')).toBe(false)
  })

  it('erro comum vira toast de erro e a folha continua aberta; 401 chama onExpired; sem conexão, o aviso de conexão', async () => {
    putFailure = new ApiError('Falhou no servidor.', 500, [], { detail: 'Falhou no servidor.' })
    const { tree } = await mount()
    await reachReview(tree)
    await press(tree, 'Ativar tênis')
    expect(toasts().map(item => [item.tone, item.title])).toEqual([['error', 'Falhou no servidor.']])
    expect(sheetOpen(tree)).toBe(true)

    putFailure = new ApiError('Sessão expirada.', 401)
    const expired = await mount()
    await reachReview(expired.tree)
    await press(expired.tree, 'Ativar tênis')
    expect(expired.onExpired).toHaveBeenCalledOnce()

    const attempted = vi.spyOn(connection, 'attempted')
    putFailure = new ApiError('Servidor fora do ar.', 503)
    const offline = await mount()
    await reachReview(offline.tree)
    await press(offline.tree, 'Ativar tênis')
    expect(attempted).toHaveBeenCalledOnce()
    expect(textOf(offline.tree)).not.toContain('Servidor fora do ar.')
  })
})
