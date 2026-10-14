import React from 'react'
import { act } from 'react-test-renderer'
import * as SecureStore from 'expo-secure-store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { AdminReport } from '../src/api/moderation'
import ArenaShell from '../src/screens/ArenaShell'
import ModerationScreen from '../src/screens/ModerationScreen'
import { enableAct, press, textOf } from './support/native'
import type { Call } from './support/review'
import { admin, allText, byId, callsTo, findButton, hasField, labelled, lastBodyOf, me, page, pressButton, pressPrefix, render, report, serve, typeInto } from './support/review'
import { toastText } from './support/toast'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
// O shell só precisa das telas de outras áreas como elementos; a Moderação é a real.
vi.mock('../src/screens/CommunityScreen', async () => (await import('./support/review')).hostScreen('CommunityScreen'))
vi.mock('../src/screens/ProfileScreen', async () => (await import('./support/review')).hostScreen('ProfileScreen'))

const h = React.createElement
const PENDING = '/admin/reports?status=pending'
const RESOLVED = '/admin/reports?status=resolved'
const JUSTIFICATION = 'Justificativa obrigatória'

const comment = report()
const post = report({ id: 12, target_type: 'post', target_id: 60, reason: 'spam', description: null, target_preview: { caption: 'Compre seguidores já', author: 'Loja X', image_url: '/api/v1/admin/reports/12/image' }, target_user_id: 78 })
const account = report({ id: 13, target_type: 'user', target_id: 79, reason: 'outro', description: null, target_preview: { name: 'Perfil Falso', social_public: false }, target_user_id: 79 })
const message = report({ id: 14, target_type: 'match_message', target_id: 8, reason: 'conteudo_inadequado', description: null, target_preview: { body: 'Mensagem agressiva no chat', author: 'Beto' }, target_user_id: 80 })

function world(initial: { pending?: AdminReport[]; resolved?: AdminReport[] } = {}, extra: Record<string, unknown> = {}) {
  const state = { pending: initial.pending ?? [comment, post, account, message], resolved: initial.resolved ?? [] }
  serve({
    [PENDING]: () => page(state.pending),
    [RESOLVED]: () => page(state.resolved),
    'POST /admin/reports/11/decision': ({ body }: Call) => {
      state.pending = state.pending.filter(item => item.id !== 11)
      return { report_id: 11, status: 'resolved', action: (body as { action: string }).action }
    },
    ...extra,
  })
  return state
}
const mount = (onExpired = vi.fn()) => render(h(ModerationScreen, { user: admin, onExpired }))

beforeEach(() => {
  enableAct()
  vi.mocked(request).mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-token')
})

describe('Moderação (Denúncias)', () => {
  it('quem não é administrador vê o aviso e nenhuma requisição é feita', async () => {
    serve({})
    const tree = await render(h(ModerationScreen, { user: me, onExpired: vi.fn() }))
    expect(byId(tree, 'admin-denied')).toHaveLength(1)
    expect(vi.mocked(request)).not.toHaveBeenCalled()
  })

  it('o atalho Denúncias do Início abre a fila pelo shell, com o título e a aba Perfil acesa', async () => {
    world({}, { '/me/notifications/unread-count': { unread_count: 0 } })
    const tree = await render(h(ArenaShell, { user: admin, onUser: vi.fn(), onLogout: vi.fn(), onExpired: vi.fn() }))
    await press(tree, 'Denúncias')
    expect(textOf(tree)).toContain('Comentário · #55')
    const nav = ['Início', 'Ranking', 'JOGAR', 'Comunidade', 'Perfil']
    expect(tree.root.findAllByType('Pressable' as never).filter(item => nav.includes(item.props.accessibilityLabel) && item.props.accessibilityState?.selected).map(item => item.props.accessibilityLabel)).toEqual(['Perfil'])
    await press(tree, 'Voltar')
    expect(textOf(tree)).toContain('Bora jogar, Ana?')
  })

  it('lista as denúncias pendentes com tipo, motivo e trecho, inclusive a mensagem da partida', async () => {
    world()
    const tree = await mount()
    const text = allText(tree)
    expect(text).toContain('Comentário · #55')
    expect(text).toContain('Assédio · há 4 horas · Zeca Souza: Texto ofensivo do comentário.')
    expect(text).toContain('Publicação · #60')
    expect(text).toContain('Spam · há 4 horas · Loja X: Compre seguidores já')
    expect(text).toContain('Conta · #79')
    expect(text).toContain('Outro motivo · há 4 horas · Perfil Falso: Conta privada')
    expect(text).toContain('Mensagem da partida · #8')
    expect(text).toContain('Conteúdo inadequado · há 4 horas · Beto: Mensagem agressiva no chat')
    expect(findButton(tree, 'Pendentes')?.props.accessibilityState).toEqual({ selected: true })
    expect(callsTo('GET', PENDING)).toHaveLength(1)
  })

  it('decide com justificativa: dispensar é o padrão, remover é escolha explícita e a denúncia sai da fila', async () => {
    world()
    const tree = await mount()
    await pressPrefix(tree, 'Comentário número 55')
    const sheet = allText(tree)
    expect(sheet).toContain('Assédio · ')
    expect(sheet).toContain('Detalhes de quem denunciou')
    expect(sheet).toContain('Ofensas repetidas.')
    expect(sheet).toContain('Conteúdo denunciado')
    expect(sheet).toContain('Zeca Souza')
    expect(sheet).toContain('Texto ofensivo do comentário.')
    for (const option of ['Dispensar denúncia', 'Remover conteúdo', 'Suspender conta responsável']) expect(findButton(tree, option)).toBeTruthy()
    expect(findButton(tree, 'Reativar conta')).toBeUndefined()
    expect(findButton(tree, 'Dispensar denúncia')?.props.accessibilityState).toEqual({ checked: true, disabled: false })
    // Sem justificativa não envia.
    await pressButton(tree, 'Registrar decisão')
    expect(allText(tree)).toContain('Informe uma justificativa de pelo menos 5 caracteres.')
    expect(callsTo('POST', '/admin/reports/11/decision')).toHaveLength(0)
    await pressButton(tree, 'Remover conteúdo')
    expect(findButton(tree, 'Remover conteúdo')?.props.accessibilityState).toEqual({ checked: true, disabled: false })
    await typeInto(tree, JUSTIFICATION, '  Ofensa clara ao autor  ')
    await pressButton(tree, 'Registrar decisão')
    expect(lastBodyOf('POST', '/admin/reports/11/decision')).toEqual({ action: 'remove', justification: 'Ofensa clara ao autor' })
    expect(toastText()).toContain('Conteúdo removido e denúncia resolvida.')
    expect(allText(tree)).not.toContain('Comentário · #55')
    expect(findButton(tree, 'Registrar decisão')).toBeUndefined()
  })

  it.each([
    ['dispensar', 'Dispensar denúncia', 'dismiss', 'Denúncia dispensada.'],
    ['suspender', 'Suspender conta responsável', 'suspend', 'Conta responsável suspensa e denúncia resolvida.'],
  ] as const)('%s a denúncia', async (_name, label, action, message) => {
    world()
    const tree = await mount()
    await pressPrefix(tree, 'Comentário número 55')
    await pressButton(tree, label)
    await typeInto(tree, JUSTIFICATION, 'Decisão da equipe')
    await pressButton(tree, 'Registrar decisão')
    expect(lastBodyOf('POST', '/admin/reports/11/decision')).toEqual({ action, justification: 'Decisão da equipe' })
    expect(toastText()).toContain(message)
  })

  it('denúncia de mensagem da partida: mostra a partida e o texto, remove com o aviso próprio e a removida mostra o aviso', async () => {
    const chat = report({ id: 14, target_type: 'match_message', target_id: 8, reason: 'assedio', description: null, target_user_id: 80,
      target_preview: { body: 'Mensagem agressiva no chat', author: 'Beto', removed: false, match_id: 31, match: 'Ferrugem FC × Leões' } })
    const gone = report({ id: 15, target_type: 'match_message', target_id: 9, reason: 'spam', description: null, target_user_id: 81,
      target_preview: { body: null, author: 'Cida', removed: true, match_id: 32, match: 'Tigres × Real' } })
    world({ pending: [chat, gone] }, { 'POST /admin/reports/14/decision': { report_id: 14, status: 'resolved', action: 'remove' } })
    const tree = await mount()
    await pressPrefix(tree, 'Mensagem da partida número 9')
    expect(allText(tree)).toContain('Partida #32 · Tigres × Real')
    expect(allText(tree)).toContain('Mensagem já removida')
    await pressButton(tree, 'Fechar')
    await pressPrefix(tree, 'Mensagem da partida número 8')
    expect(allText(tree)).toContain('Partida #31 · Ferrugem FC × Leões')
    expect(allText(tree)).toContain('Mensagem agressiva no chat')
    expect(findButton(tree, 'Remover conteúdo')).toBeUndefined()
    await pressButton(tree, 'Remover mensagem')
    await typeInto(tree, JUSTIFICATION, 'Ofensa a outro atleta')
    await pressButton(tree, 'Registrar decisão')
    expect(lastBodyOf('POST', '/admin/reports/14/decision')).toEqual({ action: 'remove', justification: 'Ofensa a outro atleta' })
    expect(toastText()).toContain('Mensagem removida: o texto some para todos na partida e o registro fica guardado.')
  })

  it('a denúncia de uma conta oferece reativar e não remover', async () => {
    world({}, { 'POST /admin/reports/13/decision': { report_id: 13, status: 'resolved', action: 'reactivate' } })
    const tree = await mount()
    await pressPrefix(tree, 'Conta número 79')
    expect(allText(tree)).toContain('Conta privada')
    expect(findButton(tree, 'Remover conteúdo')).toBeUndefined()
    await pressButton(tree, 'Reativar conta')
    await typeInto(tree, JUSTIFICATION, 'Conta verificada')
    await pressButton(tree, 'Registrar decisão')
    expect(lastBodyOf('POST', '/admin/reports/13/decision')).toEqual({ action: 'reactivate', justification: 'Conta verificada' })
    expect(toastText()).toContain('Conta reativada e denúncia resolvida.')
  })

  it('a mensagem da partida mostra a prévia de texto e pode ser removida', async () => {
    world({}, { 'POST /admin/reports/14/decision': { report_id: 14, status: 'resolved', action: 'remove' } })
    const tree = await mount()
    await pressPrefix(tree, 'Mensagem da partida número 8')
    const sheet = allText(tree)
    expect(sheet).toContain('Mensagem da partida · #8')
    expect(sheet).toContain('Beto')
    expect(sheet).toContain('Mensagem agressiva no chat')
    // Sem contexto da partida (prévia antiga), o botão é "Remover mensagem" do mesmo jeito.
    expect(findButton(tree, 'Remover mensagem')).toBeTruthy()
    await pressButton(tree, 'Remover mensagem')
    await typeInto(tree, JUSTIFICATION, 'Assédio no chat')
    await pressButton(tree, 'Registrar decisão')
    expect(lastBodyOf('POST', '/admin/reports/14/decision')).toEqual({ action: 'remove', justification: 'Assédio no chat' })
  })

  it('a imagem da publicação vem da rota da administração com o Bearer, e a falha é avisada', async () => {
    world()
    const tree = await mount()
    await pressPrefix(tree, 'Publicação número 60')
    const [image] = labelled(tree, 'Imagem da publicação denunciada')
    expect(image.props.source).toEqual({ uri: 'http://10.0.2.2:8000/api/v1/admin/reports/12/image', headers: { Authorization: 'Bearer test-token' } })
    await act(async () => { image.props.onError() })
    expect(allText(tree)).toContain('Imagem indisponível.')
    expect(labelled(tree, 'Imagem da publicação denunciada')).toHaveLength(0)
  })

  it('depois da decisão a rota não serve mais a imagem: a denúncia resolvida mostra só o texto', async () => {
    world({ pending: [], resolved: [report({ id: 31, status: 'resolved', target_type: 'post', target_id: 62, target_user_active: true, target_preview: { caption: 'Legenda', author: 'Loja X', image_url: '/api/v1/admin/reports/31/image' } })] })
    const tree = await mount()
    await pressButton(tree, 'Resolvidas')
    await pressPrefix(tree, 'Publicação número 62')
    expect(allText(tree)).toContain('Legenda')
    expect(labelled(tree, 'Imagem da publicação denunciada')).toHaveLength(0)
    expect(allText(tree)).not.toContain('Imagem indisponível.')
  })

  it('erro do servidor fica na folha e o 401 volta ao login', async () => {
    const expired = vi.fn()
    world({}, { 'POST /admin/reports/11/decision': new ApiError('Denúncia pendente não encontrada.', 404) })
    const tree = await mount(expired)
    await pressPrefix(tree, 'Comentário número 55')
    await typeInto(tree, JUSTIFICATION, 'Decisão da equipe')
    await pressButton(tree, 'Registrar decisão')
    expect(allText(tree)).toContain('Denúncia pendente não encontrada.')
    expect(findButton(tree, 'Registrar decisão')).toBeTruthy()
    world({}, { 'POST /admin/reports/11/decision': new ApiError('Sessão expirada.', 401) })
    await pressButton(tree, 'Registrar decisão')
    expect(expired).toHaveBeenCalled()
  })

  it('estados vazios das duas abas, erro de leitura e carregar mais', async () => {
    world({ pending: [], resolved: [] })
    const tree = await mount()
    expect(allText(tree)).toContain('Nenhuma denúncia pendente')
    await pressButton(tree, 'Resolvidas')
    expect(callsTo('GET', RESOLVED)).toHaveLength(1)
    expect(allText(tree)).toContain('Nenhuma denúncia resolvida')
    world({}, { [RESOLVED]: new ApiError('Acesso administrativo necessário.', 403) })
    await pressButton(tree, 'Pendentes')
    await pressButton(tree, 'Resolvidas')
    expect(allText(tree)).toContain('Acesso administrativo necessário.')
    world({}, { [PENDING]: () => page([comment], 'c2'), [`${PENDING}&cursor=c2`]: page([post]) })
    await pressButton(tree, 'Pendentes')
    await pressButton(tree, 'Carregar mais denúncias')
    expect(allText(tree)).toContain('Publicação · #60')
  })
})

describe('Moderação: denúncias resolvidas', () => {
  const suspended = report({ id: 21, status: 'resolved', target_user_id: 77, target_user_active: false })
  const sameAccount = report({ id: 22, status: 'resolved', target_type: 'post', target_id: 61, target_user_id: 77, target_user_active: false, target_preview: null })
  const closed = report({ id: 23, status: 'resolved', target_user_id: 90, target_user_active: true, description: null })

  it('mostra a prévia ou a falta dela e reativa a conta suspensa com justificativa', async () => {
    world({ resolved: [suspended, sameAccount, closed] }, { 'PUT /admin/users/77/status?active=true&justification=Revis%C3%A3o%20feita': { active: true } })
    const tree = await mount()
    await pressButton(tree, 'Resolvidas')
    expect(findButton(tree, 'Resolvidas')?.props.accessibilityState).toEqual({ selected: true })
    // Resolvida e conta ativa: nada mais a decidir.
    await pressPrefix(tree, 'Comentário número 55: Assédio')
    expect(findButton(tree, 'Registrar decisão')).toBeUndefined()
    expect(allText(tree)).toContain('Denúncia resolvida: nada mais a decidir.')
    await pressButton(tree, 'Fechar')
    // Resolvida com a conta suspensa: reativar.
    await pressPrefix(tree, 'Publicação número 61')
    expect(allText(tree)).toContain('Prévia indisponível.')
    await pressButton(tree, 'Fechar')
    const rows = tree.root.findAllByType('Pressable' as never).filter(item => typeof item.props.accessibilityLabel === 'string' && item.props.accessibilityLabel.startsWith('Comentário número 55'))
    expect(rows.length).toBe(2)
    await act(async () => { rows[0].props.onPress() })
    expect(allText(tree)).toContain('Conta responsável suspensa · #77')
    expect(hasField(tree, 'Justificativa para reativação')).toBe(true)
    await pressButton(tree, 'Reativar conta')
    expect(allText(tree)).toContain('Informe uma justificativa de pelo menos 5 caracteres.')
    expect(callsTo('PUT', '/admin/users/77/status?active=true&justification=Revis%C3%A3o%20feita')).toHaveLength(0)
    await typeInto(tree, 'Justificativa para reativação', 'Revisão feita')
    await pressButton(tree, 'Reativar conta')
    expect(callsTo('PUT', '/admin/users/77/status?active=true&justification=Revis%C3%A3o%20feita')).toHaveLength(1)
    expect(toastText()).toContain('Conta reativada.')
    // As outras denúncias da mesma conta deixam de oferecer a reativação.
    await pressPrefix(tree, 'Publicação número 61')
    expect(findButton(tree, 'Reativar conta')).toBeUndefined()
  })

  it('erro ao reativar fica na folha', async () => {
    world({ resolved: [suspended] }, { 'PUT /admin/users/77/status?active=true&justification=Revis%C3%A3o%20feita': new ApiError('Conta não encontrada.', 404) })
    const tree = await mount()
    await pressButton(tree, 'Resolvidas')
    await pressPrefix(tree, 'Comentário número 55')
    await typeInto(tree, 'Justificativa para reativação', 'Revisão feita')
    await pressButton(tree, 'Reativar conta')
    expect(allText(tree)).toContain('Conta não encontrada.')
    expect(findButton(tree, 'Reativar conta')).toBeTruthy()
  })
})
