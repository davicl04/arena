import React from 'react'
import { act } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/api/client'
import { serverFieldErrors } from '../src/components/organizer/OrganizerRequestForm'
import OrganizerRequestScreen from '../src/screens/OrganizerRequestScreen'
import { byLabel, enableAct, press, textOf, type } from './support/native'
import { approved, calls, city, mount, navigationMock, organizerRequest, otherCity, routeRequest, status } from './support/organizer'
import { textWithin, toastText, toasts } from './support/toast'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))

const h = React.createElement
const onExpired = vi.fn()
let navigation = navigationMock()
const profiles = [{ id: 1, sport: 'futebol', city_id: 7, position: null, looking_for: false, is_public: false, level: null }]
const baseRoutes = (over: Record<string, unknown> = {}) => ({ '/me/organizer-request': status(), '/cities': [city, otherCity], '/me/sports-profiles': profiles, ...over })
const screen = () => mount(h(OrganizerRequestScreen, { navigation: navigation as never, onExpired, params: undefined, title: 'Seja organizador' } as never))
/** Toca no botão (sem rótulo de acessibilidade) cujo texto é exatamente `text`, como o "Tentar novamente" do `LoadError`. */
const pressText = async (tree: ReactTestRenderer, text: string) => {
  const target = tree.root.findAllByType('Pressable' as never).find(entry => textWithin(entry) === text)
  expect(target, `Pressable "${text}"`).toBeTruthy()
  await act(async () => { target!.props.onPress() })
}
const state = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType('Pressable' as never).find(entry => entry.props.accessibilityLabel === label)!.props.accessibilityState
const fill = async (tree: ReactTestRenderer) => {
  await type(tree, 'Nome do organizador', '  Liga Candanga ')
  await press(tree, 'Corrida')
  await press(tree, 'Futebol')
  await type(tree, 'Contato', 'liga@example.com')
  await press(tree, 'Aceito as responsabilidades do organizador')
}

beforeEach(() => {
  enableAct()
  onExpired.mockClear()
  navigation = navigationMock()
})

describe('Seja organizador (P5): regras e formulário', () => {
  it('mostra as regras antes do formulário, com a cidade do perfil de futebol já escolhida', async () => {
    routeRequest(baseRoutes())
    const tree = await screen()
    const text = textOf(tree)
    expect(text).toContain('Campeonatos e provas')
    expect(text.indexOf('Como funciona')).toBeLessThan(text.indexOf('Seu pedido'))
    for (const rule of ['Pagamento fora do Arena', 'Você analisa os comprovantes', 'Você resolve divergências', 'Eventos pagos passam pela administração']) expect(text).toContain(rule)
    expect(byLabel(tree, 'Regras do organizador')).toHaveLength(1)
    expect(byLabel(tree, 'Cidade: Brasília, DF').length).toBeGreaterThan(0)
    for (const label of ['Nome do organizador', 'Experiência (opcional)', 'Contato', 'Link (opcional)']) expect(byLabel(tree, label).length).toBeGreaterThan(0)
    expect(text).toContain('A administração do Arena analisa o pedido.')
  })

  it('sem perfil esportivo a cidade começa vazia', async () => {
    routeRequest(baseRoutes({ '/me/sports-profiles': [] }))
    const tree = await screen()
    expect(byLabel(tree, 'Cidade: não escolhida').length).toBeGreaterThan(0)
  })

  it('enviar vazio mostra os erros do servidor por campo, sem chamar a API', async () => {
    routeRequest(baseRoutes({ '/me/sports-profiles': [] }))
    const tree = await screen()
    expect(textOf(tree)).not.toContain('Revise os campos destacados.')
    await press(tree, 'Enviar pedido')
    const text = textOf(tree)
    expect(text).toContain('Revise os campos destacados.')
    expect(text).toContain('Informe o nome do organizador, de 3 a 80 caracteres.')
    expect(text).toContain('Selecione uma cidade do catálogo.')
    expect(text).toContain('Escolha ao menos uma modalidade.')
    expect(text).toContain('Informe um contato (telefone, e-mail ou perfil), de 5 a 120 caracteres.')
    expect(text).toContain('Aceite as responsabilidades do organizador para enviar o pedido.')
    expect(text).not.toContain('Informe um endereço que comece com')
    expect(calls('POST', '/me/organizer-request')).toHaveLength(0)
  })

  it('o link precisa começar com http:// ou https://; corrigir limpa o erro', async () => {
    routeRequest(baseRoutes())
    const tree = await screen()
    await fill(tree)
    await type(tree, 'Link (opcional)', 'liga.com')
    await press(tree, 'Enviar pedido')
    expect(textOf(tree)).toContain('Informe um endereço que comece com http:// ou https://')
    expect(calls('POST', '/me/organizer-request')).toHaveLength(0)
    await type(tree, 'Link (opcional)', 'https://liga.example.com')
    expect(textOf(tree)).not.toContain('Informe um endereço que comece com')
    expect(textOf(tree)).not.toContain('Revise os campos destacados.')
  })

  it('envia o pedido aparado, com as modalidades na ordem do catálogo, e confirma com a situação', async () => {
    const sent = organizerRequest({ display_name: 'Liga Candanga' })
    routeRequest(baseRoutes({ 'POST /me/organizer-request': sent }))
    const tree = await screen()
    await fill(tree)
    await type(tree, 'Experiência (opcional)', '  Três campeonatos  ')
    await press(tree, 'Enviar pedido')
    expect(calls('POST', '/me/organizer-request')[0][2]).toEqual({
      display_name: 'Liga Candanga', city_id: 7, sports: ['futebol', 'corrida'], experience: 'Três campeonatos', contact: 'liga@example.com', link: null, accept_terms: true,
    })
    expect(textOf(tree)).toContain('Pedido enviado')
    expect(textOf(tree)).toContain('O pedido de Liga Candanga está em análise. A resposta chega nas notificações.')
    expect(byLabel(tree, 'Pedido de organizador')).toHaveLength(0)
    await press(tree, 'Voltar')
    expect(navigation.back).toHaveBeenCalledTimes(1)
  })

  it('alternar uma modalidade marca e desmarca; trocar a cidade pela folha com busca', async () => {
    routeRequest(baseRoutes())
    const tree = await screen()
    await press(tree, 'Tênis')
    expect(state(tree, 'Tênis')).toMatchObject({ checked: true })
    await press(tree, 'Tênis')
    expect(state(tree, 'Tênis')).toMatchObject({ checked: false })
    await press(tree, 'Cidade: Brasília, DF')
    expect(byLabel(tree, 'Cidades do catálogo')).toHaveLength(1)
    await type(tree, 'Buscar cidade', 'goi')
    expect(byLabel(tree, 'Brasília, DF')).toHaveLength(0)
    expect(byLabel(tree, 'Goiânia, GO').length).toBeGreaterThan(0)
    await type(tree, 'Buscar cidade', 'zzz')
    expect(textOf(tree)).toContain('Nenhuma cidade do catálogo com esse nome.')
    await type(tree, 'Buscar cidade', 'goi')
    await press(tree, 'Goiânia, GO')
    expect(byLabel(tree, 'Cidade: Goiânia, GO').length).toBeGreaterThan(0)
    expect(byLabel(tree, 'Cidades do catálogo')).toHaveLength(0)
  })

  it('erro do servidor por campo (422) aparece no campo e some quando o campo é editado', async () => {
    routeRequest(baseRoutes({
      'POST /me/organizer-request': () => { throw new ApiError('Revise os campos informados.', 422, [{ field: 'contact', message: 'Value error, Contato já usado por outro pedido.' }, { field: 'sports.0', message: 'Modalidade inválida.' }]) },
    }))
    const tree = await screen()
    await fill(tree)
    await press(tree, 'Enviar pedido')
    expect(textOf(tree)).toContain('Contato já usado por outro pedido.')
    expect(textOf(tree)).toContain('Modalidade inválida.')
    expect(textOf(tree)).toContain('Revise os campos destacados.')
    await type(tree, 'Contato', 'outro@example.com')
    expect(textOf(tree)).not.toContain('Contato já usado por outro pedido.')
    expect(textOf(tree)).toContain('Modalidade inválida.')
  })

  it('erro geral (409) e queda de conexão aparecem sob o formulário; 401 expira a sessão', async () => {
    routeRequest(baseRoutes({ 'POST /me/organizer-request': () => { throw new ApiError('Você já tem um pedido em análise.', 409) } }))
    const tree = await screen()
    await fill(tree)
    await press(tree, 'Enviar pedido')
    expect(toastText()).toContain('Você já tem um pedido em análise.')
    expect(toasts().map(item => item.tone)).toEqual(['warning'])
    expect(textOf(tree)).not.toContain('Revise os campos destacados.')
    routeRequest(baseRoutes({ 'POST /me/organizer-request': () => { throw new ApiError('Sessão expirada', 401) } }))
    await press(tree, 'Enviar pedido')
    expect(onExpired).toHaveBeenCalledTimes(1)
    routeRequest(baseRoutes({ 'POST /me/organizer-request': () => { throw new Error('') } }))
    await press(tree, 'Enviar pedido')
    expect(toastText()).toContain('Não foi possível enviar o pedido.')
  })

  it('erros 422 sem lista de campos que citam o aceite ou a cidade vão para o campo', () => {
    expect(serverFieldErrors(new ApiError('Aceite as responsabilidades do organizador para enviar o pedido.', 422))).toEqual({ accept_terms: 'Aceite as responsabilidades do organizador para enviar o pedido.' })
    expect(serverFieldErrors(new ApiError('Selecione uma cidade do catálogo.', 422))).toEqual({ city_id: 'Selecione uma cidade do catálogo.' })
    expect(serverFieldErrors(new ApiError('Outra coisa.', 422))).toEqual({})
    expect(serverFieldErrors(new ApiError('Conflito.', 409))).toEqual({})
    expect(serverFieldErrors(new Error('x'))).toEqual({})
    expect(serverFieldErrors(new ApiError('Revise.', 422, [{ field: 'link', message: 'A' }, { field: 'link', message: 'B' }, { field: 'desconhecido', message: 'C' }]))).toEqual({ link: 'A' })
  })
})

describe('Seja organizador (P5): quem já tem pedido ou permissão', () => {
  it('em análise e aprovado mostram a situação no lugar do formulário', async () => {
    routeRequest(baseRoutes({ '/me/organizer-request': status({ state: 'em_analise', request: organizerRequest() }) }))
    const pending = await screen()
    expect(textOf(pending)).toContain('Você já tem um pedido em análise.')
    expect(byLabel(pending, 'Pedido de organizador')).toHaveLength(0)
    expect(textOf(pending)).not.toContain('Como funciona')
    routeRequest(baseRoutes({ '/me/organizer-request': approved() }))
    const ok = await screen()
    expect(textOf(ok)).toContain('Você é organizador')
    expect(textOf(ok)).toContain('A seção Organizador já aparece no Menu do Perfil.')
    await press(ok, 'Voltar')
    expect(navigation.back).toHaveBeenCalled()
  })

  it('recusado e revogado explicam o motivo e deixam enviar um novo pedido', async () => {
    routeRequest(baseRoutes({ '/me/organizer-request': status({ state: 'recusado', request: organizerRequest({ state: 'recusado', reason_code: 'contato_nao_funciona', reason_detail: null }) }) }))
    const refused = await screen()
    expect(textOf(refused)).toContain('Seu pedido anterior foi recusado. Motivo: Contato não funciona.')
    expect(byLabel(refused, 'Pedido de organizador')).toHaveLength(1)
    routeRequest(baseRoutes({ '/me/organizer-request': status({ state: 'revogado', revocation: { revoked_at: '2026-10-08T12:00:00.000Z', reason: 'Conduta inadequada' } }) }))
    const revoked = await screen()
    expect(textOf(revoked)).toContain('Sua permissão foi revogada. Motivo: Conduta inadequada.')
    expect(byLabel(revoked, 'Pedido de organizador')).toHaveLength(1)
  })

  it('falha ao conferir o pedido mostra o erro e não oferece o formulário; tentar de novo recarrega', async () => {
    routeRequest(baseRoutes({ '/me/organizer-request': () => { throw new ApiError('Servidor com problema', 500) } }))
    const tree = await screen()
    expect(textOf(tree)).toContain('Servidor com problema')
    expect(byLabel(tree, 'Pedido de organizador')).toHaveLength(0)
    routeRequest(baseRoutes())
    await pressText(tree, 'Tentar novamente')
    expect(byLabel(tree, 'Pedido de organizador')).toHaveLength(1)
  })

  it('falha ao carregar as cidades avisa e deixa o campo da cidade desabilitado', async () => {
    routeRequest(baseRoutes({ '/cities': () => { throw new ApiError('Catálogo fora do ar', 500) } }))
    const tree = await screen()
    expect(textOf(tree)).toContain('Catálogo fora do ar')
    const field = tree.root.findAllByType('Pressable' as never).find(entry => String(entry.props.accessibilityLabel).startsWith('Cidade:'))!
    expect(field.props.disabled).toBe(true)
  })
})
