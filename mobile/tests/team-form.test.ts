import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import * as ImagePicker from 'expo-image-picker'
import * as SecureStore from 'expo-secure-store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { Entry } from '../src/navigation/routes'
import TeamFormScreen, { CREST_TYPE_ERROR } from '../src/screens/TeamFormScreen'
import { byLabel, enableAct, press, textOf, type } from './support/native'
import { toastText, toasts } from './support/toast'
import { answer, city, fakeNavigation, me, team, TOKEN } from './support/teams'
import type { FakeNavigation, Handler } from './support/teams'
import { playContext } from './support/play'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('react-native-safe-area-context', async () => (await import('./support/native')).safeAreaMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))

const h = React.createElement
type Params = React.ComponentProps<typeof TeamFormScreen>['params']

const cities = [city, { id: 2, name: 'Goiânia', state: 'GO' }, { id: 3, name: 'Anápolis', state: 'GO' }]
const football = { id: 1, sport: 'futebol', city_id: 1, position: 'goleiro', looking_for: false, is_public: false, level: null }
const existing = team(10, { name: 'Ferrugem FC', initials: 'FF', member_count: 4 })

function serve(extra: Handler = () => undefined, profiles: unknown[] = [football]) {
  vi.mocked(request).mockImplementation(answer(async (path, method, body) => {
    const custom = await extra(path, method, body)
    if (custom !== undefined) return custom
    if (path === '/me/sports-profiles') return profiles
    if (path === '/cities') return cities
    if (path === '/teams/10') return existing
    if (path === '/teams' && method === 'POST') return team(50, { name: (body as { name: string }).name, city: cities.find(item => item.id === (body as { city_id: number }).city_id) })
    return undefined
  }))
}
const calls = () => vi.mocked(request).mock.calls
const picked = (extra: Record<string, unknown> = {}) => ({ canceled: false, assets: [{ uri: 'file:///recorte.jpg', width: 800, height: 800, fileName: 'recorte.jpg', mimeType: 'image/jpeg', fileSize: 4000, ...extra }] }) as unknown as ImagePicker.ImagePickerResult

let navigation: FakeNavigation
const onExpired = vi.fn()
async function mount(params: Params = undefined): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(h(TeamFormScreen, { user: me, navigation, onUser: vi.fn(), onLogout: vi.fn(), ...playContext(), onExpired, params, title: 'Criar time' })) })
  return tree
}
/** A galeria é carregada sob demanda: espera o fim do trabalho assíncrono do toque. */
const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) }) }
const submitState = (tree: ReactTestRenderer, label: string) => byLabel(tree, label)[0].props.accessibilityState.disabled as boolean
/** Última chamada de `navigation.replace`: a entrada nova e se `same` reconhece Meus times logo abaixo. */
const replaced = () => {
  const [entry, same] = navigation.replace.mock.calls.at(-1) as [Entry, (below: Entry) => boolean]
  return { entry, replacesTeams: same({ screen: 'teams' } as Entry), keepsOthers: !same({ screen: 'home' } as Entry) }
}

beforeEach(() => {
  enableAct()
  navigation = fakeNavigation()
  onExpired.mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue(TOKEN)
  vi.mocked(request).mockReset()
  vi.mocked(ImagePicker.launchImageLibraryAsync).mockReset()
})
afterEach(() => { vi.unstubAllGlobals() })

describe('Criar time (F2)', () => {
  it('traz a cidade do perfil de futebol, mostra a prévia ao vivo e cria o time com o nome normalizado', async () => {
    serve()
    const tree = await mount()
    expect(textOf(tree)).toContain('Prévia da carteirinha')
    expect(textOf(tree)).toContain('Seu time')
    // A barra escura da tela fecha e volta (o shell não desenha o cabeçalho).
    expect(textOf(tree)).toContain('Meus times')
    await press(tree, 'Fechar')
    expect(navigation.back).toHaveBeenCalledOnce()
    expect(textOf(tree)).toContain('Brasília · DF')
    expect(textOf(tree)).toContain('Vem do seu perfil de futebol.')
    expect(textOf(tree)).toContain('1 atleta')
    expect(submitState(tree, 'Criar time')).toBe(true)
    await type(tree, 'Nome do time', '  Leões   do  Cerrado ')
    // A carteirinha muda ao vivo: nome normalizado, iniciais do escudo e a linha de papel.
    expect(textOf(tree)).toContain('Leões do Cerrado')
    expect(tree.root.findAllByType('SvgText' as never).map(node => node.props.children)).toContain('LC')
    expect(textOf(tree)).toContain('Brasília · você representa')
    expect(submitState(tree, 'Criar time')).toBe(false)
    await press(tree, 'Criar time')
    expect(calls()).toContainEqual(['/teams', 'POST', { name: 'Leões do Cerrado', city_id: 1 }])
    expect(calls().some(call => String(call[0]).endsWith('/crest'))).toBe(false)
    expect(replaced()).toMatchObject({ entry: { screen: 'teams', params: { teamId: 50, invites: false } }, replacesTeams: true, keepsOthers: true })
    await act(async () => { tree.unmount() })
  })

  it('valida de 3 a 40 caracteres e mostra a contagem', async () => {
    serve()
    const tree = await mount()
    await type(tree, 'Nome do time', 'Ab')
    expect(textOf(tree)).toContain('2/40 · pelo menos 3 letras')
    expect(submitState(tree, 'Criar time')).toBe(true)
    const input = tree.root.findAllByType('TextInput' as never).find(entry => entry.props.accessibilityLabel === 'Nome do time')!
    expect(input.props.maxLength).toBe(40)
    await act(async () => { input.props.onBlur() })
    expect(input.props.style.borderColor).not.toBe('rgba(255,255,255,0.18)')
    await type(tree, 'Nome do time', '   Zé   ')
    expect(submitState(tree, 'Criar time')).toBe(true)
    await type(tree, 'Nome do time', 'Zéu')
    expect(submitState(tree, 'Criar time')).toBe(false)
    await act(async () => { tree.unmount() })
  })

  it('troca a cidade pela folha de busca do catálogo', async () => {
    serve()
    const tree = await mount()
    await type(tree, 'Nome do time', 'Leões')
    await press(tree, 'Trocar cidade')
    expect(textOf(tree)).toContain('Cidade do time')
    await type(tree, 'Buscar cidade', 'goi')
    expect(byLabel(tree, 'Goiânia, GO')).toHaveLength(1)
    expect(byLabel(tree, 'Anápolis, GO')).toHaveLength(0)
    await type(tree, 'Buscar cidade', 'xyz')
    expect(textOf(tree)).toContain('Nenhuma cidade do catálogo com esse nome.')
    await type(tree, 'Buscar cidade', '')
    await press(tree, 'Goiânia, GO')
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(0)
    expect(textOf(tree)).toContain('Goiânia · GO')
    expect(textOf(tree)).not.toContain('Vem do seu perfil de futebol.')
    await press(tree, 'Criar time')
    expect(calls()).toContainEqual(['/teams', 'POST', { name: 'Leões', city_id: 2 }])
    await act(async () => { tree.unmount() })
  })

  it('sem perfil de futebol a cidade fica por escolher', async () => {
    serve(() => undefined, [])
    const tree = await mount()
    expect(textOf(tree)).toContain('Escolha a cidade do time')
    await type(tree, 'Nome do time', 'Leões')
    expect(submitState(tree, 'Criar time')).toBe(true)
    await press(tree, 'Escolher cidade')
    await press(tree, 'Anápolis, GO')
    expect(submitState(tree, 'Criar time')).toBe(false)
    await act(async () => { tree.unmount() })
  })

  it('escolhe o brasão no recorte 1:1 do seletor nativo, mostra a prévia e envia depois de criar', async () => {
    const parts: unknown[][] = []
    vi.stubGlobal('FormData', class { append(...args: unknown[]) { parts.push(args) } })
    serve((path, method) => path === '/teams/50/crest' && method === 'PUT' ? team(50, { name: 'Leões', crest_url: '/api/v1/teams/50/crest?v=1' }) : undefined)
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(picked())
    const tree = await mount()
    await type(tree, 'Nome do time', 'Leões')
    await press(tree, 'Enviar brasão')
    await vi.waitFor(async () => { await flush(); expect(byLabel(tree, 'Trocar imagem do brasão')).toHaveLength(1) }, { timeout: 8000 })
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ allowsEditing: true, aspect: [1, 1], mediaTypes: ['images'] }))
    // A prévia local aparece na carteirinha e no seletor do brasão.
    const previews = tree.root.findAllByType('Image' as never).filter(image => image.props.source?.uri === 'file:///recorte.jpg')
    expect(previews.length).toBeGreaterThanOrEqual(2)
    await press(tree, 'Criar time')
    expect(calls()[calls().findIndex(call => call[0] === '/teams')]).toEqual(['/teams', 'POST', { name: 'Leões', city_id: 1 }])
    const upload = calls().find(call => call[0] === '/teams/50/crest')!
    expect(upload[1]).toBe('PUT')
    expect(upload[2]).toBeInstanceOf(FormData)
    expect(parts).toEqual([['file', { uri: 'file:///recorte.jpg', name: 'recorte.jpg', type: 'image/jpeg' }]])
    expect(replaced().entry).toMatchObject({ screen: 'teams', params: { teamId: 50 } })
    await act(async () => { tree.unmount() })
  })

  it('recusa imagem grande ou de tipo não aceito, e cancelar o seletor não muda nada', async () => {
    serve()
    const tree = await mount()
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce(picked({ fileSize: 6 * 1024 * 1024 }))
    await press(tree, 'Enviar brasão')
    await vi.waitFor(async () => { await flush(); expect(textOf(tree)).toContain('A imagem deve ter até 5 MiB.') }, { timeout: 8000 })
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce(picked({ mimeType: 'image/gif' }))
    await press(tree, 'Enviar brasão')
    await flush()
    expect(textOf(tree)).toContain(CREST_TYPE_ERROR)
    expect(textOf(tree)).not.toContain('A imagem deve ter até 5 MiB.')
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({ canceled: true, assets: null } as unknown as ImagePicker.ImagePickerResult)
    await press(tree, 'Enviar brasão')
    await flush()
    expect(byLabel(tree, 'Remover brasão')).toHaveLength(0)
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockRejectedValueOnce(new Error('Sem permissão para abrir as fotos.'))
    await press(tree, 'Enviar brasão')
    await flush()
    expect(textOf(tree)).toContain('Sem permissão para abrir as fotos.')
    await act(async () => { tree.unmount() })
  })

  it('mostra o erro do servidor e, se só o brasão falhar, mantém o time criado e tenta só o brasão de novo', async () => {
    serve((path, method) => { if (path === '/teams/50/crest' && method === 'PUT') throw new ApiError('A imagem deve ter até 5 MiB.', 413); return undefined })
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(picked())
    const tree = await mount()
    await type(tree, 'Nome do time', 'Leões')
    await press(tree, 'Enviar brasão')
    await vi.waitFor(async () => { await flush(); expect(byLabel(tree, 'Trocar imagem do brasão')).toHaveLength(1) }, { timeout: 8000 })
    await press(tree, 'Criar time')
    expect(toastText()).toContain('Time criado, mas o brasão não foi salvo: A imagem deve ter até 5 MiB.')
    expect(navigation.replace).not.toHaveBeenCalled()
    // Agora o time existe: a tela passa a editá-lo e não cria outro.
    expect(textOf(tree)).toContain('Salvar alterações')
    serve((path, method) => path === '/teams/50/crest' && method === 'PUT' ? team(50, { name: 'Leões', crest_url: '/api/v1/teams/50/crest?v=2' }) : undefined)
    await press(tree, 'Salvar alterações')
    expect(calls().filter(call => call[0] === '/teams' && call[1] === 'POST')).toHaveLength(1)
    expect(replaced().entry).toMatchObject({ screen: 'teams', params: { teamId: 50 } })
    await act(async () => { tree.unmount() })
  })

  it('401 ao criar expira a sessão sem toast, e as cidades têm nova tentativa', async () => {
    serve((path, method) => { if (path === '/teams' && method === 'POST') throw new ApiError('Sessão expirada.', 401); return undefined })
    const tree = await mount()
    await type(tree, 'Nome do time', 'Leões')
    await press(tree, 'Criar time')
    expect(onExpired).toHaveBeenCalledOnce()
    expect(toasts()).toEqual([])
    await act(async () => { tree.unmount() })
    serve(path => { if (path === '/cities') throw new ApiError('Catálogo indisponível.', 500); return undefined })
    const failing = await mount()
    expect(textOf(failing)).toContain('Catálogo indisponível.')
    expect(byLabel(failing, 'Escolher cidade').length + byLabel(failing, 'Trocar cidade').length).toBe(1)
    serve()
    await press(failing, 'Tentar novamente')
    expect(textOf(failing)).toContain('Brasília · DF')
    await act(async () => { failing.unmount() })
  })
})

describe('Editar time (F2)', () => {
  it('carrega o time, só habilita Salvar com mudança e envia só o que mudou', async () => {
    serve((path, method) => path === '/teams/10' && method === 'PATCH' ? team(10, { name: 'Ferrugem Azul' }) : undefined)
    const tree = await mount({ teamId: 10 })
    expect(textOf(tree)).toContain('Editar time')
    expect(textOf(tree)).toContain('Ferrugem FC')
    expect(textOf(tree)).toContain('Salvar alterações')
    expect(textOf(tree)).not.toContain('Você será o representante')
    expect(submitState(tree, 'Salvar alterações')).toBe(true)
    await type(tree, 'Nome do time', 'Ferrugem Azul')
    expect(submitState(tree, 'Salvar alterações')).toBe(false)
    await press(tree, 'Salvar alterações')
    expect(calls()).toContainEqual(['/teams/10', 'PATCH', { name: 'Ferrugem Azul' }])
    expect(replaced().entry).toMatchObject({ screen: 'teams', params: { teamId: 10 } })
    await act(async () => { tree.unmount() })
  })

  it('troca o brasão (envia o novo) e remove o brasão existente', async () => {
    const withCrest = team(10, { name: 'Ferrugem FC', crest_url: '/api/v1/teams/10/crest?v=1' })
    serve((path, method) => {
      if (path === '/teams/10' && !method) return withCrest
      if (path === '/teams/10/crest' && method === 'PUT') return { ...withCrest, crest_url: '/api/v1/teams/10/crest?v=2' }
      return undefined
    })
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(picked())
    const tree = await mount({ teamId: 10 })
    await press(tree, 'Trocar imagem do brasão')
    await vi.waitFor(async () => { await flush(); expect(submitState(tree, 'Salvar alterações')).toBe(false) }, { timeout: 8000 })
    await press(tree, 'Salvar alterações')
    expect(calls().some(call => call[0] === '/teams/10/crest' && call[1] === 'PUT')).toBe(true)
    expect(calls().some(call => call[0] === '/teams/10' && call[1] === 'PATCH')).toBe(false)
    await act(async () => { tree.unmount() })

    navigation = fakeNavigation()
    vi.mocked(request).mockClear()
    const removing = await mount({ teamId: 10 })
    await press(removing, 'Remover brasão')
    await press(removing, 'Salvar alterações')
    expect(calls()).toContainEqual(['/teams/10/crest', 'DELETE'])
    await act(async () => { removing.unmount() })
  })

  it('só representantes editam; erro de carga aparece', async () => {
    serve((path, method) => path === '/teams/10' && !method ? team(10, { my_role: 'membro' }) : undefined)
    const tree = await mount({ teamId: 10 })
    expect(textOf(tree)).toContain('Só representantes podem editar o time.')
    expect(byLabel(tree, 'Salvar alterações')).toHaveLength(0)
    await act(async () => { tree.unmount() })
    serve((path, method) => { if (path === '/teams/10' && !method) throw new ApiError('Time não encontrado.', 404); return undefined })
    const missing = await mount({ teamId: 10 })
    expect(textOf(missing)).toContain('Time não encontrado.')
    await act(async () => { missing.unmount() })
  })

  it('Encerrar time só acontece depois da confirmação e volta a Meus times sem time selecionado', async () => {
    serve((path, method) => path === '/teams/10/close' && method === 'POST' ? null : undefined)
    const tree = await mount({ teamId: 10 })
    await press(tree, 'Encerrar time')
    expect(textOf(tree)).toContain('Encerrar o Ferrugem FC?')
    expect(textOf(tree)).toContain('Os 4 atletas deixam o elenco')
    expect(calls().some(call => call[0] === '/teams/10/close')).toBe(false)
    await press(tree, 'Cancelar')
    expect(textOf(tree)).not.toContain('Encerrar o Ferrugem FC?')
    await press(tree, 'Encerrar time')
    serve((path, method) => { if (path === '/teams/10/close' && method === 'POST') throw new ApiError('Encerre ou cancele as partidas agendadas antes de encerrar o time.', 409); return path === '/teams/10' ? existing : undefined })
    await press(tree, 'Encerrar time')
    expect(textOf(tree)).toContain('Encerre ou cancele as partidas agendadas antes de encerrar o time.')
    expect(navigation.replace).not.toHaveBeenCalled()
    serve((path, method) => path === '/teams/10/close' && method === 'POST' ? null : path === '/teams/10' ? existing : undefined)
    await press(tree, 'Encerrar time')
    expect(calls()).toContainEqual(['/teams/10/close', 'POST', {}])
    expect(replaced()).toMatchObject({ entry: { screen: 'teams', params: { teamId: undefined, invites: false } }, replacesTeams: true })
    await act(async () => { tree.unmount() })
  })
})
