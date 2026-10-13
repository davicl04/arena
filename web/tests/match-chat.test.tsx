import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminReports from '../src/components/AdminReports'
import MatchPage from '../src/pages/MatchPage'
import { chatRows } from '../src/components/match/chatRows'
import { mergeMessages } from '../src/hooks/useMatchChat'
import { apiError, mockApi } from './teams-fixtures'
import { arranging, caio, event, fromNow, marcos, matchDetail, message, mine, noPermissions, page, scheduled, tiago } from './match-fixtures'
import { findToast, renderWithToaster } from './toast-utils'

/*
 * Chat da partida (C1): lados, agrupamento, braçadeira, faixas de evento, mensagens removidas, leitura periódica com
 * `after`, anteriores com `before`, envio com Enter e denúncia pelo formulário de denúncias.
 */

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  Reflect.deleteProperty(document, 'hidden')
})

type Routes = Parameters<typeof mockApi>[0]
function renderChat(detail: ReturnType<typeof matchDetail>, routes: Routes = {}) {
  const api = mockApi({ 'GET /matches/1': detail, ...routes })
  const onExpired = vi.fn()
  renderWithToaster(<MatchPage matchId={1} viewerId={1} onBack={vi.fn()} onExpired={onExpired} />)
  return { ...api, onExpired }
}
const log = () => screen.findByRole('log', { name: 'Mensagens da partida' })
const groups = () => Array.from(document.querySelectorAll<HTMLElement>('[data-slot="chat-group"]'))
const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('lados, agrupamento e braçadeira', () => {
  it('acesso histórico mostra a restrição e não lê mensagens', async () => {
    const api = renderChat(matchDetail({ my_role: 'historico', state: 'encerrada', permissions: { ...noPermissions } }))
    expect(await screen.findByText('Chat indisponível no histórico')).not.toBeNull()
    expect(screen.queryByRole('log', { name: 'Mensagens da partida' })).toBeNull()
    expect(api.calls.filter(call => call.path.includes('/messages'))).toHaveLength(0)
  })
  const conversation = [
    message(1, { body: 'Boa tarde!', author: caio, side: 'b', author_role: 'representante' }),
    message(2, { body: 'Sábado fica bom?', author: caio, side: 'b', author_role: 'representante' }),
    mine(3, 'Fica sim, depois das 15h.'),
    message(4, { body: 'Sábado eu consigo.', author: tiago, side: 'a', author_role: 'membro' }),
    message(5, { body: 'Levo os coletes.', author: marcos, side: 'a', author_role: 'avulso' }),
  ]

  it('o meu time à direita (eu em verde-escuro, colegas em verde-claro) e o adversário à esquerda, em branco', async () => {
    renderChat(matchDetail(), { 'GET /matches/1/messages': page(conversation) })
    await log()
    const [opponent, me, teammate, guest] = await waitFor(() => {
      const found = groups()
      expect(found).toHaveLength(4)
      return found
    })
    // Adversário: à esquerda, bolhas brancas.
    expect(opponent.className).toContain('self-start')
    expect(opponent.dataset.side).toBe('b')
    expect(Array.from(opponent.querySelectorAll('p')).every(bubble => bubble.className.includes('bg-surface'))).toBe(true)
    // Eu: à direita, verde-escuro com o nome "Você".
    expect(me.className).toContain('self-end')
    expect(me.dataset.mine).toBe('true')
    expect(within(me).getByText('Você')).not.toBeNull()
    expect(me.querySelector('p')!.className).toContain('bg-brand')
    // Colegas de time e avulso do meu lado: à direita, em verde-claro.
    for (const group of [teammate, guest]) {
      expect(group.className).toContain('self-end')
      expect(group.querySelector('p')!.className).toContain('bg-[#d5e9dc]')
    }
    expect(within(teammate).getByText('Tiago Melo')).not.toBeNull()
  })

  it('agrupa mensagens seguidas da mesma pessoa: nome, time e hora uma vez só; um evento quebra o grupo', async () => {
    renderChat(matchDetail(), {
      'GET /matches/1/messages': page([
        message(1, { body: 'Primeira' }), message(2, { body: 'Segunda' }),
        event(3, 'reserva_atualizada', 'Leões do Cerrado confirmou a reserva da quadra.', { side: 'b' }),
        message(4, { body: 'Terceira' }),
      ]),
    })
    await log()
    await waitFor(() => expect(groups()).toHaveLength(2))
    const [first, second] = groups()
    expect(within(first).getAllByText('Caio Ramos')).toHaveLength(1)
    expect(Array.from(first.querySelectorAll('p')).map(bubble => bubble.textContent)).toEqual(['Primeira', 'Segunda'])
    expect(within(first).getByText('Leões')).not.toBeNull()
    expect(first.querySelector('time')).not.toBeNull()
    expect(Array.from(second.querySelectorAll('p')).map(bubble => bubble.textContent)).toEqual(['Terceira'])
  })

  it('mostra a braçadeira "C" só para representantes, com o rótulo "Representante"', async () => {
    renderChat(matchDetail(), { 'GET /matches/1/messages': page(conversation) })
    await log()
    await waitFor(() => expect(groups()).toHaveLength(4))
    const [opponent, me, teammate, guest] = groups()
    expect(within(opponent).getByRole('img', { name: 'Representante' })).not.toBeNull()
    expect(within(me).getByRole('img', { name: 'Representante' })).not.toBeNull()
    expect(within(teammate).queryByRole('img', { name: 'Representante' })).toBeNull()
    expect(within(guest).queryByRole('img', { name: 'Representante' })).toBeNull()
  })

  it('mostra os eventos da partida como faixas com o brasão e a data no fuso do aparelho', async () => {
    renderChat(matchDetail(), {
      'GET /matches/1/messages': page([
        event(1, 'partida_combinando', 'Proposta aceita pelos dois lados. Combinem dia, horário e quadra.'),
        event(2, 'condicoes_propostas', 'Leões do Cerrado propôs condições na quadra Arena Sudoeste.', { side: 'b', payload: { starts_at: '2026-10-20T22:00:00Z' } }),
      ]),
    })
    await log()
    const strips = await waitFor(() => {
      const found = Array.from(document.querySelectorAll<HTMLElement>('[data-slot="chat-event"]'))
      expect(found).toHaveLength(2)
      return found
    })
    expect(strips[0].dataset.event).toBe('partida_combinando')
    expect(within(strips[0]).queryByRole('img')).toBeNull()
    expect(within(strips[1]).getByRole('img', { name: 'Brasão de Leões do Cerrado' })).not.toBeNull()
    // A data vem de payload.starts_at (texto do evento não traz datas).
    expect(strips[1].querySelector('b')!.textContent).toMatch(/^ter, 20 out · \d\d:\d\d · $/)
    expect(strips[1].textContent).toContain('Leões do Cerrado propôs condições na quadra Arena Sudoeste.')
  })

  it('mensagens removidas aparecem como "Mensagem removida", sem texto e sem denúncia', async () => {
    renderChat(matchDetail(), {
      'GET /matches/1/messages': page([message(1, { body: null, removed: true }), message(2, { body: 'Visível' })]),
    })
    await log()
    expect(await screen.findByText('Mensagem removida')).not.toBeNull()
    expect(screen.getAllByRole('button', { name: /^Denunciar mensagem de/ })).toHaveLength(1)
  })

  it('chat vazio e erro ao carregar', async () => {
    renderChat(matchDetail(), { 'GET /matches/1/messages': page([]) })
    expect(await screen.findByText('Nenhuma mensagem ainda. Combinem dia, horário e quadra por aqui.')).not.toBeNull()
    cleanup()
    renderChat(matchDetail(), { 'GET /matches/1/messages': apiError(403, 'O chat abre quando os dois lados aceitam a proposta.') })
    const alert = (await screen.findAllByRole('alert'))[0]
    expect(alert.textContent).toContain('O chat abre quando os dois lados aceitam a proposta.')
    expect(within(alert).getByRole('button', { name: 'Tentar novamente' })).not.toBeNull()
  })

  it('falha de conexão no carregamento fala em conexão e "Tentar novamente" lê de novo', async () => {
    const user = userEvent.setup()
    let reads = 0
    const { find } = renderChat(matchDetail(), {
      'GET /matches/1/messages': () => (++reads === 1 ? apiError(503, 'Serviço indisponível.') : page([message(1, { body: 'Chegou' })])),
    })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Sem conexão com a ARENA')
    await user.click(within(alert).getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('Chegou')).not.toBeNull()
    expect(find('GET', '/matches/1/messages')).toHaveLength(2)
  })

  it('separa os dias com "Hoje" e "Ontem" e agrupa pelo lado', () => {
    const now = new Date(2026, 9, 12, 15, 0)
    const rows = chatRows([
      message(1, { created_at: new Date(2026, 9, 10, 10, 0).toISOString() }),
      message(2, { created_at: new Date(2026, 9, 11, 10, 0).toISOString() }),
      message(3, { created_at: new Date(2026, 9, 12, 10, 0).toISOString() }),
      message(4, { created_at: new Date(2026, 9, 12, 10, 1).toISOString(), side: 'a' }),
    ], now)
    expect(rows.filter(row => row.kind === 'day').map(row => (row as { label: string }).label)).toEqual(['sáb, 10 out', 'Ontem', 'Hoje'])
    // O mesmo autor em outro lado não entra no grupo anterior.
    expect(rows.filter(row => row.kind === 'group')).toHaveLength(4)
  })

  it('junta mensagens sem repetir ids e em ordem', () => {
    const merged = mergeMessages([message(1), message(3)], [message(2), message(3, { body: 'editada' })])
    expect(merged.map(item => item.id)).toEqual([1, 2, 3])
    expect(merged[2].body).toBe('editada')
    const same = [message(1)]
    expect(mergeMessages(same, [])).toBe(same)
  })
})

describe('leitura periódica', () => {
  it('substitui o texto já carregado ao receber a remoção em uma página incremental', async () => {
    vi.useFakeTimers()
    renderChat(matchDetail(), {
      'GET /matches/1/messages': page([message(1, { body: 'Texto moderado' })]),
      'GET /matches/1/messages?after=1': page([event(2, 'mensagem_removida', 'Uma mensagem foi removida pela administração.', { payload: { message_id: 1 } })]),
      'GET /matches/1/messages?after=2': page([], { last_id: 2 }),
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    expect(screen.getByText('Texto moderado')).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(screen.queryByText('Texto moderado')).toBeNull()
    expect(screen.getByText('Mensagem removida')).toBeTruthy()
  })

  it('uma página antiga tardia não restaura o texto removido', () => {
    const removal = event(2, 'mensagem_removida', 'Removida', { payload: { message_id: 1 } })
    const merged = mergeMessages([removal], [message(1, { body: 'Resposta antiga' })])
    expect(merged[0].body).toBeNull()
    expect(merged[0].removed).toBe(true)
  })
  it('lê só as novas com after a cada 4 s, sem recarregar a tela', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    let reads = 0
    const { find } = renderChat(matchDetail(), {
      'GET /matches/1/messages': page([message(1), message(2, { body: 'Segunda' })]),
      'GET /matches/1/messages?after=2': () => (++reads === 1 ? page([message(3, { body: 'Chegou sozinha' })]) : page([], { last_id: 3 })),
      'GET /matches/1/messages?after=3': page([], { last_id: 3 }),
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    expect(screen.getByText('Segunda')).not.toBeNull()
    expect(find('GET', '/matches/1/messages')).toHaveLength(1)
    expect(screen.queryByText('Chegou sozinha')).toBeNull()

    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(find('GET', '/matches/1/messages?after=2')).toHaveLength(1)
    expect(screen.getByText('Chegou sozinha')).not.toBeNull()
    // O cursor avança: a próxima leitura usa o último id recebido.
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(find('GET', '/matches/1/messages?after=3').length).toBeGreaterThan(0)
    await act(async () => { await vi.advanceTimersByTimeAsync(8000) })
    expect(find('GET', '/matches/1/messages?after=3').length).toBeGreaterThan(1)
  })

  it('para de ler com a aba oculta e lê na hora ao voltar', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    const { find } = renderChat(matchDetail(), {
      'GET /matches/1/messages': page([message(1)]),
      'GET /matches/1/messages?after=1': page([], { last_id: 1 }),
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    const before = find('GET', '/matches/1/messages?after=1').length
    expect(before).toBeGreaterThan(0)

    await act(async () => { setHidden(true) })
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
    expect(find('GET', '/matches/1/messages?after=1')).toHaveLength(before)

    await act(async () => { setHidden(false) })
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    expect(find('GET', '/matches/1/messages?after=1')).toHaveLength(before + 1)
  })

  it('partida encerrada: continua recebendo remoções a cada 30 s e ao voltar à aba', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    const { find } = renderChat(matchDetail({ state: 'encerrada', phase: 'encerrada', permissions: { ...noPermissions, read_chat: true } }), {
      'GET /matches/1/messages': page([message(1, { body: 'Foi um jogão' })]),
      'GET /matches/1/messages?after=1': page([event(2, 'mensagem_removida', 'Uma mensagem foi removida pela administração.', { payload: { message_id: 1 } })]),
      'GET /matches/1/messages?after=2': page([], { last_id: 2 }),
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    expect(screen.getByText('Foi um jogão')).not.toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(screen.queryByText('Foi um jogão')).toBeNull()
    expect(screen.getByText('Mensagem removida')).not.toBeNull()
    await act(async () => { setHidden(true) })
    await act(async () => { setHidden(false) })
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    expect(find('GET', '/matches/1/messages')).toHaveLength(1)
    expect(find('GET', '/matches/1/messages?after=1')).toHaveLength(1)
    expect(find('GET', '/matches/1/messages?after=2')).toHaveLength(1)
  })

  it('com mais mensagens novas do que cabem numa página, lê de novo na hora', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    const { find } = renderChat(matchDetail(), {
      'GET /matches/1/messages': page([message(1)]),
      'GET /matches/1/messages?after=1': page([message(2)], { has_more: true }),
      'GET /matches/1/messages?after=2': page([message(3)]),
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(find('GET', '/matches/1/messages?after=2')).toHaveLength(1)
    expect(screen.getByText('Mensagem 3')).not.toBeNull()
  })

  it('falha de rede avisa "Sem conexão" e a leitura seguinte recupera', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    let reads = 0
    renderChat(matchDetail(), {
      'GET /matches/1/messages': page([message(1)]),
      'GET /matches/1/messages?after=1': () => (++reads === 1 ? apiError(500, 'Falha.') : page([message(2, { body: 'Voltou' })])),
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(screen.queryByText('Voltou')).toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(screen.getByText('Voltou')).not.toBeNull()
    expect(screen.queryByText(/Sem conexão/)).toBeNull()
  })

  it('sessão expirada durante a leitura chama onExpired', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    const { onExpired } = renderChat(matchDetail(), { 'GET /matches/1/messages': apiError(401, 'Sessão expirada.') })
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    expect(onExpired).toHaveBeenCalled()
  })

  it('rolando para cima, as mensagens novas só avisam e o botão leva ao fim da conversa', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    renderChat(matchDetail(), {
      'GET /matches/1/messages': page([message(1)]),
      'GET /matches/1/messages?after=1': page([message(2, { body: 'Nova' })]),
      'GET /matches/1/messages?after=2': page([], { last_id: 2 }),
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    const scroller = screen.getByRole('log', { name: 'Mensagens da partida' })
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 300 })
    scroller.scrollTop = 0
    fireEvent.scroll(scroller)
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(screen.getByText('Nova')).not.toBeNull()
    expect(scroller.scrollTop).toBe(0)
    const pill = screen.getByRole('button', { name: '1 nova mensagem' })
    fireEvent.click(pill)
    expect(scroller.scrollTop).toBe(1000)
    expect(screen.queryByRole('button', { name: /nova mensagem/ })).toBeNull()
  })

  it('carrega as anteriores com before e as coloca no topo', async () => {
    const user = userEvent.setup()
    const { find } = renderChat(matchDetail(), {
      'GET /matches/1/messages': page([message(11, { body: 'Décima primeira' })], { has_more: true }),
      'GET /matches/1/messages?before=11': page([message(9, { body: 'Nona' }), message(10, { body: 'Décima' })]),
    })
    await user.click(await screen.findByRole('button', { name: 'Carregar anteriores' }))
    expect(await screen.findByText('Nona')).not.toBeNull()
    expect(find('GET', '/matches/1/messages?before=11')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Carregar anteriores' })).toBeNull()
    const order = Array.from(document.querySelectorAll('[data-slot="chat-group"] p')).map(bubble => bubble.textContent)
    expect(order).toEqual(['Nona', 'Décima', 'Décima primeira'])
  })
})

describe('envio', () => {
  it('Enter envia, Shift+Enter quebra a linha, o campo limpa e a mensagem entra no meu lado', async () => {
    const user = userEvent.setup()
    const { find } = renderChat(matchDetail(), {
      'GET /matches/1/messages': page([message(1)]),
      'POST /matches/1/messages': call => ({ ...mine(2, (call.body as { body: string }).body) }),
    })
    const field = await screen.findByLabelText('Mensagem')
    await user.type(field, 'Primeira linha')
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    await user.type(field, 'Segunda linha')
    expect((field as HTMLTextAreaElement).value).toBe('Primeira linha\nSegunda linha')
    expect(find('POST', '/matches/1/messages')).toHaveLength(0)
    await user.keyboard('{Enter}')
    await waitFor(() => expect(find('POST', '/matches/1/messages')).toHaveLength(1))
    expect(find('POST', '/matches/1/messages')[0].body).toEqual({ body: 'Primeira linha\nSegunda linha' })
    await waitFor(() => expect((field as HTMLTextAreaElement).value).toBe(''))
    const sent = await screen.findByText(/Primeira linha/)
    expect(sent.closest('[data-slot="chat-group"]')!.getAttribute('data-mine')).toBe('true')
    expect(document.activeElement).toBe(field)
  })

  it('o botão Enviar só vale com texto e anuncia o envio e os erros em uma região aria-live', async () => {
    const user = userEvent.setup()
    renderChat(matchDetail(), {
      'GET /matches/1/messages': page([]),
      'POST /matches/1/messages': apiError(409, 'O chat desta partida está fechado.'),
    })
    const send = await screen.findByRole('button', { name: 'Enviar mensagem' }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    const field = screen.getByLabelText('Mensagem')
    const live = field.getAttribute('aria-describedby')!
    expect(document.getElementById(live)!.getAttribute('aria-live')).toBe('polite')
    await user.type(field, '   ')
    expect(send.disabled).toBe(true)
    await user.type(field, 'Oi')
    expect(send.disabled).toBe(false)
    await user.click(send)
    await waitFor(() => expect(document.getElementById(live)!.textContent).toBe('O chat desta partida está fechado.'))
    // O texto digitado fica para tentar de novo.
    expect((field as HTMLTextAreaElement).value.trim()).toBe('Oi')
  })

  it('falha de conexão ao enviar não escreve mensagem no campo e guarda o texto para tentar de novo', async () => {
    const user = userEvent.setup()
    renderChat(matchDetail(), {
      'GET /matches/1/messages': page([]),
      'POST /matches/1/messages': apiError(503, 'Serviço indisponível.'),
    })
    const field = await screen.findByLabelText('Mensagem')
    const live = field.getAttribute('aria-describedby')!
    await user.type(field, 'Oi')
    await user.click(screen.getByRole('button', { name: 'Enviar mensagem' }))
    await waitFor(() => expect((screen.getByRole('button', { name: 'Enviar mensagem' }) as HTMLButtonElement).disabled).toBe(false))
    expect(document.getElementById(live)!.textContent).toBe('')
    expect((field as HTMLTextAreaElement).value).toBe('Oi')
  })

  it('o campo respeita o limite de 1000 caracteres', async () => {
    renderChat(matchDetail(), { 'GET /matches/1/messages': page([]) })
    expect((await screen.findByLabelText('Mensagem')).getAttribute('maxlength')).toBe('1000')
  })

  it('depois do fim da partida o campo some e fica o aviso de leitura', async () => {
    renderChat(matchDetail({ permissions: { ...noPermissions, read_chat: true }, state: 'encerrada', phase: 'encerrada' }), { 'GET /matches/1/messages': page([message(1)]) })
    expect(await screen.findByText('O chat desta partida está fechado.')).not.toBeNull()
    expect(screen.queryByLabelText('Mensagem')).toBeNull()
  })
})

describe('denúncia', () => {
  it('denuncia a mensagem de outra pessoa com target_type match_message pelo formulário de denúncias', async () => {
    const user = userEvent.setup()
    const { find } = renderChat(matchDetail(), {
      'GET /matches/1/messages': page([mine(1, 'Minha mensagem'), message(12, { body: 'Mensagem ofensiva', author: marcos, side: 'a', author_role: 'avulso' })]),
      'POST /reports': { id: 1, status: 'open' },
    })
    await log()
    // Sem botão para a minha própria mensagem.
    await screen.findByText('Mensagem ofensiva')
    expect(screen.getAllByRole('button', { name: /^Denunciar mensagem de/ }).map(item => item.getAttribute('aria-label'))).toEqual(['Denunciar mensagem de Marcos Ribeiro'])
    await user.click(screen.getByRole('button', { name: 'Denunciar mensagem de Marcos Ribeiro' }))
    const glass = await screen.findByRole('dialog', { name: 'Denunciar mensagem' })
    expect(within(glass).getByText('Mensagem ofensiva')).not.toBeNull()
    const sendReport = within(glass).getByRole('button', { name: 'Enviar denúncia' }) as HTMLButtonElement
    expect(sendReport.disabled).toBe(true)
    await user.click(within(glass).getByRole('radio', { name: /Spam/ }))
    await user.click(sendReport)
    expect(find('POST', '/reports')[0].body).toEqual({ target_type: 'match_message', target_id: 12, reason: 'spam' })
    expect(await findToast('Denúncia enviada para análise.')).not.toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Denunciar mensagem' })).toBeNull()
  })

  it('o erro da denúncia vira aviso e o formulário continua aberto', async () => {
    const user = userEvent.setup()
    renderChat(matchDetail(), {
      'GET /matches/1/messages': page([message(12, { body: 'Mensagem' })]),
      'POST /reports': apiError(404, 'Conteúdo não encontrado.'),
    })
    await user.click(await screen.findByRole('button', { name: 'Denunciar mensagem de Caio Ramos' }))
    const glass = await screen.findByRole('dialog', { name: 'Denunciar mensagem' })
    await user.click(within(glass).getByRole('radio', { name: /Assédio/ }))
    await user.click(within(glass).getByRole('button', { name: 'Enviar denúncia' }))
    expect(await findToast('Conteúdo não encontrado.')).not.toBeNull()
    expect(screen.getByRole('dialog', { name: 'Denunciar mensagem' })).toBeTruthy()
    await user.click(within(glass).getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog', { name: 'Denunciar mensagem' })).toBeNull()
  })
})

describe('avulso na partida', () => {
  it('o avulso escalado conversa, vê o cartão sem ações e não ajusta vagas', async () => {
    renderChat(scheduled(72, { my_role: 'avulso', permissions: { ...noPermissions, read_chat: true, write_chat: true } }), {
      'GET /matches/1/messages': page([event(1, 'avulso_entrou', 'Marcos Ribeiro entrou como avulso (Atacante).', { side: 'a' })]),
    })
    expect(await screen.findByText('Marcos Ribeiro entrou como avulso (Atacante).')).not.toBeNull()
    expect(screen.getByLabelText('Mensagem')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Alterar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ajustar' })).toBeNull()
    const trigger = screen.getByRole('button', { name: /Partida agendada/ })
    await userEvent.setup().click(trigger)
    expect(await screen.findByText('Só os representantes alteram a partida.')).not.toBeNull()
  })

  it('a hora dos eventos usa o horário local do aparelho', async () => {
    renderChat(matchDetail(), { 'GET /matches/1/messages': page([message(1, { created_at: fromNow(-1) })]) })
    await log()
    await waitFor(() => expect(document.querySelector('[data-slot="chat-group"] time')!.textContent).toMatch(/^\d\d:\d\d$/))
  })

  it('o campo do chat tem o aviso de envio e o atalho de propor só para quem pode', async () => {
    renderChat(matchDetail({ permissions: { ...arranging, propose_terms: false } }), { 'GET /matches/1/messages': page([]) })
    await screen.findByLabelText('Mensagem')
    expect(screen.queryByRole('button', { name: 'Propor dia, horário e quadra' })).toBeNull()
  })
})

describe('fila de denúncias da administração', () => {
  it('mostra a mensagem denunciada com a partida e o autor, rotulada como mensagem da partida', async () => {
    mockApi({
      'GET /admin/reports?status=pending': { next_cursor: null, items: [{ id: 3, target_type: 'match_message', target_id: 12, reason: 'spam', description: null, status: 'pending',
        created_at: '2026-10-12T14:00:00Z', target_user_id: 5, target_user_active: true,
        target_preview: { body: 'Mensagem ofensiva', removed: false, author: 'Marcos Ribeiro', match_id: 1, match: 'Ferrugem FC × Leões do Cerrado' } }] },
    })
    renderWithToaster(<AdminReports onExpired={vi.fn()} />)
    expect(await screen.findByText('Mensagem da partida · #12')).not.toBeNull()
    expect(screen.getByText('Mensagem ofensiva')).not.toBeNull()
    expect(screen.getByText('Marcos Ribeiro')).not.toBeNull()
    expect(within(screen.getByRole('group', { name: 'Mensagem denunciada' })).getByText('Partida #1 · Ferrugem FC × Leões do Cerrado')).not.toBeNull()
    // Remover conteúdo esconde o texto para todos (contrato 11.1).
    expect(within(screen.getByLabelText('Decisão')).getByRole('option', { name: 'Remover mensagem' })).not.toBeNull()
  })
})
