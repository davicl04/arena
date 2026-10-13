import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { Share } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import { linkShareContent } from '../src/components/teams/TeamLinkPanel'
import TeamInviteScreen from '../src/screens/TeamInviteScreen'
import { byLabel, enableAct, hardwareBack, press, textOf, type } from './support/native'
import { toastText } from './support/toast'
import { answer, candidate, fakeNavigation, me, team, TOKEN } from './support/teams'
import type { Handler } from './support/teams'
import { playContext } from './support/play'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('react-native-qrcode-svg', async () => {
  const ReactModule = await import('react')
  return { default: (props: Record<string, unknown>) => ReactModule.createElement('QRCode', props) }
})
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))

const h = React.createElement
type Params = React.ComponentProps<typeof TeamInviteScreen>['params']
const URL_ONE = 'https://arena.example.com/entrar/tokenUm_123'
const URL_TWO = 'https://arena.example.com/entrar/tokenDois_456'

const ana = candidate(5, 'Ana Lima')
const page = (items: unknown[], next: string | null = null) => ({ items, next_cursor: next })

function serve(extra: Handler = () => undefined) {
  vi.mocked(request).mockImplementation(answer(async (path, method, body) => {
    const custom = await extra(path, method, body)
    if (custom !== undefined) return custom
    if (path === '/teams/10') return team(10, { name: 'Ferrugem FC' })
    if (path === '/teams/10/invite-candidates') return page([ana, candidate(6, 'Bruno Dias', 'membro'), candidate(7, 'Caio Reis', 'convite_pendente'), candidate(8, 'Duda Melo', 'pedido_pendente')])
    if (path === '/teams/10/invite-link' && !method) return { url: URL_ONE, token: 'tokenUm_123', generated_at: '2026-10-01T10:00:00Z' }
    if (path === '/teams/10/invite-link' && method === 'POST') return { url: URL_TWO, token: 'tokenDois_456', generated_at: '2026-10-12T10:00:00Z' }
    return undefined
  }))
}
const calls = () => vi.mocked(request).mock.calls
const callsTo = (path: string) => calls().filter(call => call[0] === path)

const onExpired = vi.fn()
let navigation = fakeNavigation()
async function mount(params: Params = { teamId: 10 }): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  navigation = fakeNavigation()
  await act(async () => { tree = create(h(TeamInviteScreen, { user: me, navigation, onUser: vi.fn(), onLogout: vi.fn(), ...playContext(), onExpired, params, title: 'Convidar' })) })
  return tree
}
/** O gerador de QR é carregado sob demanda (lazy): espera a montagem fora do act, que seguraria a renderização. */
const until = (check: () => void) => vi.waitFor(async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)) }); check() }, { timeout: 12000 })
const mountLink = async () => {
  const tree = await mount({ teamId: 10, link: true })
  await until(() => expect(tree.root.findAllByType('QRCode' as never)).toHaveLength(1))
  return tree
}

beforeEach(() => {
  enableAct()
  onExpired.mockReset()
  hardwareBack.handlers.length = 0
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue(TOKEN)
  vi.mocked(request).mockReset()
  vi.mocked(Share.share).mockReset().mockResolvedValue({ action: 'sharedAction' } as never)
})
afterEach(() => { vi.useRealTimers() })

describe('Convidar: escolher atleta (I5)', () => {
  it('abre no passo 1 com quem o representante segue e o estado de cada pessoa', async () => {
    serve()
    const tree = await mount()
    expect(textOf(tree)).toContain('Passo 1 de 2')
    expect(textOf(tree)).toContain('Quem você quer convidar?')
    expect(textOf(tree)).toContain('Para o Ferrugem FC')
    expect(textOf(tree)).toContain('Quem você segue')
    expect(callsTo('/teams/10/invite-candidates')).toHaveLength(1)
    expect(byLabel(tree, 'Escolher Ana Lima')).toHaveLength(1)
    expect(byLabel(tree, 'Bruno Dias: No elenco')).toHaveLength(1)
    expect(byLabel(tree, 'Caio Reis: Pendente')).toHaveLength(1)
    expect(byLabel(tree, 'Duda Melo: Pendente')).toHaveLength(1)
    expect(byLabel(tree, 'Escolher Bruno Dias')).toHaveLength(0)
    // As abas têm papel, rótulo e estado.
    const tabs = tree.root.findAll(node => String(node.type) === 'Pressable' && node.props.accessibilityRole === 'tab')
    expect(tabs.map(entry => [entry.props.accessibilityLabel, entry.props.accessibilityState.selected])).toEqual([['Escolher atleta', true], ['Link e QR', false]])
    await act(async () => { tree.unmount() })
  })

  it('busca com espera de 300 ms; o teclado busca na hora; sem resultados mostra a dica', async () => {
    serve((path, method) => {
      if (path === '/teams/10/invite-candidates?q=ana') return page([ana])
      if (path === '/teams/10/invite-candidates?q=zzz') return page([])
      return undefined
    })
    const tree = await mount()
    vi.useFakeTimers()
    await type(tree, 'Buscar atleta por nome ou @usuário', 'ana')
    await act(async () => { await vi.advanceTimersByTimeAsync(299) })
    expect(callsTo('/teams/10/invite-candidates?q=ana')).toHaveLength(0)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(callsTo('/teams/10/invite-candidates?q=ana')).toHaveLength(1)
    expect(textOf(tree)).toContain('Resultados')
    await type(tree, 'Buscar atleta por nome ou @usuário', '@zzz')
    const input = tree.root.findAllByType('TextInput' as never).find(entry => entry.props.accessibilityLabel === 'Buscar atleta por nome ou @usuário')!
    await act(async () => { input.props.onSubmitEditing() })
    expect(callsTo('/teams/10/invite-candidates?q=%40zzz')).toHaveLength(1)
    vi.useRealTimers()
    await act(async () => { tree.unmount() })
  })

  it('carrega mais candidatos pelo cursor e mostra o erro da busca com nova tentativa', async () => {
    serve((path) => {
      if (path === '/teams/10/invite-candidates') return page([ana], 'c1')
      if (path === '/teams/10/invite-candidates?cursor=c1') return page([candidate(9, 'Eva Costa')])
      return undefined
    })
    const tree = await mount()
    await press(tree, 'Carregar mais atletas')
    expect(textOf(tree)).toContain('Eva Costa')
    expect(byLabel(tree, 'Carregar mais atletas')).toHaveLength(0)
    await act(async () => { tree.unmount() })
    let fail = true
    serve(path => { if (path === '/teams/10/invite-candidates' && fail) throw new ApiError('Busca indisponível.', 500); return undefined })
    const failing = await mount()
    expect(textOf(failing)).toContain('Busca indisponível.')
    fail = false
    await press(failing, 'Tentar novamente')
    expect(textOf(failing)).toContain('Ana Lima')
    expect(textOf(failing)).not.toContain('Busca indisponível.')
    await act(async () => { failing.unmount() })
  })

  it('passo 2: mostra a carteirinha como o convidado vê e envia o convite com a mensagem', async () => {
    serve((path, method) => path === '/teams/10/invites' && method === 'POST' ? { id: 1, invitee: ana.person, inviter: null, message: 'x', state: 'pendente', created_at: '2026-10-12T10:00:00Z' } : undefined)
    const tree = await mount()
    await press(tree, 'Escolher Ana Lima')
    expect(textOf(tree)).toContain('Passo 2 de 2')
    expect(textOf(tree)).toContain('Revisar convite')
    expect(textOf(tree)).toContain('Como Ana vai ver')
    // Prévia C5 do convite: selo, linha do convidante e os botões Aceitar | Recusar sem ação.
    expect(textOf(tree)).toContain('Convite')
    expect(textOf(tree)).toContain('Você, representante, convidou')
    expect(textOf(tree)).toContain('Aceitar')
    expect(byLabel(tree, 'Aceitar')[0].props.accessibilityState.disabled).toBe(true)
    expect(byLabel(tree, 'Recusar')[0].props.accessibilityState.disabled).toBe(true)
    expect(textOf(tree)).toContain('0/140')
    await type(tree, 'Mensagem (opcional)', '  Jogamos society às quintas.  ')
    expect(byLabel(tree, '31 de 140 caracteres')).toHaveLength(1)
    const field = tree.root.findAllByType('TextInput' as never).find(entry => entry.props.accessibilityLabel === 'Mensagem (opcional)')!
    expect(field.props.maxLength).toBe(140)
    await press(tree, 'Enviar convite')
    expect(callsTo('/teams/10/invites')[0]).toEqual(['/teams/10/invites', 'POST', { user_id: 5, message: 'Jogamos society às quintas.' }])
    // Volta ao passo 1 com o aviso e a pessoa já como Pendente.
    expect(textOf(tree)).toContain('Passo 1 de 2')
    expect(toastText()).toContain('Convite enviado para Ana Lima.')
    expect(byLabel(tree, 'Ana Lima: Pendente')).toHaveLength(1)
    await act(async () => { tree.unmount() })
  })

  it('sem mensagem envia null; o erro do servidor fica no passo 2; o botão do Android volta ao passo 1', async () => {
    serve((path, method) => { if (path === '/teams/10/invites' && method === 'POST') throw new ApiError('Este atleta já está no elenco.', 409); return undefined })
    const tree = await mount()
    expect(hardwareBack.press()).toBe(false)
    // O passo 1 fecha a tela; o passo 2 só volta ao passo 1 (barra escura própria, sem o cabeçalho do shell).
    await press(tree, 'Fechar')
    expect(navigation.back).toHaveBeenCalledOnce()
    await press(tree, 'Escolher Ana Lima')
    await press(tree, 'Enviar convite')
    expect(callsTo('/teams/10/invites')[0]).toEqual(['/teams/10/invites', 'POST', { user_id: 5, message: null }])
    expect(toastText()).toContain('Este atleta já está no elenco.')
    expect(textOf(tree)).toContain('Passo 2 de 2')
    let handled = false
    await act(async () => { handled = hardwareBack.press() })
    expect(handled).toBe(true)
    expect(textOf(tree)).toContain('Passo 1 de 2')
    await press(tree, 'Escolher Ana Lima')
    expect(textOf(tree)).not.toContain('Este atleta já está no elenco.')
    await press(tree, 'Voltar para escolher atleta')
    expect(textOf(tree)).toContain('Passo 1 de 2')
    await act(async () => { tree.unmount() })
  })

  it('401 ao enviar expira a sessão', async () => {
    serve((path, method) => { if (path === '/teams/10/invites' && method === 'POST') throw new ApiError('Sessão expirada.', 401); return undefined })
    const tree = await mount()
    await press(tree, 'Escolher Ana Lima')
    await press(tree, 'Enviar convite')
    expect(onExpired).toHaveBeenCalledOnce()
    await act(async () => { tree.unmount() })
  })
})

describe('Convidar: Link e QR (Q2/Q5)', { timeout: 20000 }, () => {
  it('mostra o QR do link, o link selecionável e a orientação; a aba também abre pelo toque', async () => {
    serve()
    const tree = await mountLink()
    expect(tree.root.findAllByType('QRCode' as never)[0].props.value).toBe(URL_ONE)
    expect(byLabel(tree, 'Código QR para entrar no Ferrugem FC')).toHaveLength(1)
    const link = tree.root.findAll(node => String(node.type) === 'Text' && node.props.selectable === true)[0]
    expect(link.props.children).toBe(URL_ONE)
    expect(textOf(tree)).toContain('Quem escanear ou abrir o link pede para entrar, e um representante aprova.')
    expect(tree.root.findAll(node => String(node.type) === 'Pressable' && node.props.accessibilityLabel === 'Link e QR')[0].props.accessibilityState.selected).toBe(true)
    await press(tree, 'Escolher atleta')
    expect(tree.root.findAllByType('QRCode' as never)).toHaveLength(0)
    expect(textOf(tree)).toContain('Quem você segue')
    await act(async () => { tree.unmount() })
  })

  it('Compartilhar abre a folha do sistema com o link; falha do sistema vira orientação', async () => {
    serve()
    const tree = await mountLink()
    await press(tree, 'Compartilhar link do time')
    expect(Share.share).toHaveBeenCalledWith({ title: 'Entrar no Ferrugem FC', message: `Peça para entrar no Ferrugem FC no Arena. ${URL_ONE}` })
    expect(toastText()).not.toContain('Não foi possível compartilhar')
    vi.mocked(Share.share).mockRejectedValueOnce(new Error('indisponível'))
    await press(tree, 'Compartilhar link do time')
    expect(toastText()).toContain('Não foi possível compartilhar. Toque e segure o link para copiá-lo.')
    await act(async () => { tree.unmount() })
  })

  it('no iOS o endereço vai à parte, em url', () => {
    expect(linkShareContent('Ferrugem FC', URL_ONE, 'ios')).toEqual({ title: 'Entrar no Ferrugem FC', message: 'Peça para entrar no Ferrugem FC no Arena.', url: URL_ONE })
    expect(linkShareContent('Ferrugem FC', URL_ONE, 'android').message).toContain(URL_ONE)
  })

  it('Gerar outro link pede confirmação, troca o QR e avisa que o anterior não vale mais', async () => {
    serve()
    const tree = await mountLink()
    await press(tree, 'Gerar outro link')
    expect(textOf(tree)).toContain('O link e o QR atuais deixam de valer na hora.')
    expect(callsTo('/teams/10/invite-link').some(call => call[1] === 'POST')).toBe(false)
    await press(tree, 'Cancelar')
    expect(textOf(tree)).not.toContain('O link e o QR atuais deixam de valer na hora.')
    await press(tree, 'Gerar outro link')
    await press(tree, 'Gerar outro link')
    expect(callsTo('/teams/10/invite-link')).toContainEqual(['/teams/10/invite-link', 'POST', {}])
    expect(tree.root.findAllByType('QRCode' as never)[0].props.value).toBe(URL_TWO)
    expect(toastText()).toContain('Novo link gerado. O anterior não vale mais.')
    expect(textOf(tree)).not.toContain('O link e o QR atuais deixam de valer na hora.')
    await act(async () => { tree.unmount() })
  })

  it('erro ao gerar outro link vira toast; erro ao carregar oferece tentar de novo', async () => {
    serve((path, method) => { if (path === '/teams/10/invite-link' && method === 'POST') throw new ApiError('Só representantes podem ver ou gerar o link do time.', 403); return undefined })
    const tree = await mountLink()
    await press(tree, 'Gerar outro link')
    await press(tree, 'Gerar outro link')
    expect(toastText()).toContain('Só representantes podem ver ou gerar o link do time.')
    expect(tree.root.findAllByType('QRCode' as never)[0].props.value).toBe(URL_ONE)
    await act(async () => { tree.unmount() })

    let fail = true
    serve(path => { if (path === '/teams/10/invite-link' && fail) throw new ApiError('Link indisponível.', 500); return undefined })
    const failing = await mount({ teamId: 10, link: true })
    await until(() => expect(textOf(failing)).toContain('Link indisponível.'))
    fail = false
    await press(failing, 'Tentar novamente')
    await until(() => expect(failing.root.findAllByType('QRCode' as never)).toHaveLength(1))
    await act(async () => { failing.unmount() })
  })
})
