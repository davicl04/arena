import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import type { Profile } from '../src/api/client'
import type { PlayBoard, SearchCreated } from '../src/api/matchmaking'
import type { OpenSlots } from '../src/api/matches'
import { normalizeBoard } from '../src/api/matchmaking'
import { sideName } from '../src/data/match'
import { PrepareSearchSheet } from '../src/components/play/PrepareSearchSheet'
import { SlotSteppers } from '../src/components/play/SlotSteppers'
import { emptySlots, slotsSummary } from '../src/components/play/slots'
import { maxSlots, slotTotal } from '../src/data/match'
import { usePlayBoard } from '../src/hooks/usePlayBoard'
import PlayPage from '../src/pages/PlayPage'
import { formatCountdown, formatElapsed, spokenDuration } from '../src/utils/clock'
import { apiError, mockApi, reply } from './teams-fixtures'
import {
  athleteSide, brasilia, football, HOUR, inFuture, leoes, matchCard, playBoard, proposal, search, slotOffer, standings, teamSide, tennis, tigres,
} from './matchmaking-fixtures'
import { findToast, renderWithToaster } from './toast-utils'

const toneOf = (toast: HTMLElement) => toast.closest('[data-tone]')?.getAttribute('data-tone')

/**
 * A janela volta a ter foco. Com `relatedTarget` o `Toast.Viewport` do Base UI ignora o evento: no jsdom, um `focus` sem
 * ele, enquanto há um toast aberto, quebra o ouvinte do viewport (`contains` recebe a janela). Nossos ouvintes (placa) não leem o campo.
 */
const focusWindow = () => window.dispatchEvent(new FocusEvent('focus', { relatedTarget: document.body }))

/*
 * Busca, proposta e oferta de vaga na placa do Jogar (etapa 3, frente J1). `fetch` simulado como nos demais testes:
 * cada chamada fica registrada (método, caminho e corpo) para conferir o contrato de docs/decisoes/0002-jogar.md.
 */

beforeEach(() => { Element.prototype.scrollTo = () => {} })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })

/** A placa como o ArenaPage a monta: `usePlayBoard` + `PlayPage`. */
function Harness({ go, onExpired, profiles, openMatch }: { go: (screen: string, context?: unknown) => void; onExpired: () => void; profiles: Profile[]; openMatch?: number }) {
  const board = usePlayBoard(onExpired, true)
  return <PlayPage profiles={profiles} cities={[brasilia]} loading={false} board={board} openMatch={openMatch}
    go={go as never} onExpired={onExpired} />
}

/** Mundo simulado: a placa muda quando a ação responde, como o servidor faria. */
function world(initial: PlayBoard = playBoard(), extra: Record<string, unknown> = {}, teams?: Parameters<typeof standings>[0]) {
  const state = { board: initial }
  const api = mockApi({
    'GET /me/standings': standings(teams),
    'GET /me/play': () => state.board,
    ...extra,
  })
  return { state, api }
}
function renderPlay(profiles: Profile[] = [football, tennis], openMatch?: number) {
  const go = vi.fn()
  const onExpired = vi.fn()
  renderWithToaster(<Harness go={go} onExpired={onExpired} profiles={profiles} openMatch={openMatch} />)
  return { go, onExpired, ui: userEvent.setup() }
}
const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement
/** Os itens do ToggleGroup (Base UI) ficam focáveis e marcam o estado com `aria-disabled`/`data-disabled`. */
const isDisabled = (element: HTMLElement) => element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true' || element.hasAttribute('data-disabled')
const findButton = (name: string | RegExp) => screen.findByRole('button', { name }) as Promise<HTMLButtonElement>
const created = (overrides: Partial<SearchCreated> = {}): SearchCreated => ({ search: search(), proposal: null, offer: null, ...overrides })

describe('utilitários da placa', () => {
  it('formata o tempo decorrido e a contagem regressiva', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(135_000)).toBe('02:15')
    expect(formatElapsed(3_725_000)).toBe('1:02:05')
    expect(formatElapsed(-5)).toBe('00:00')
    expect(formatCountdown(2 * HOUR)).toBe('2:00:00')
    expect(formatCountdown(2 * HOUR - 18_000)).toBe('1:59:42')
    expect(formatCountdown(-1)).toBe('0:00:00')
    expect(spokenDuration(5 * 60_000 + 3_000)).toBe('5 minutos')
    expect(spokenDuration(HOUR + 60_000)).toBe('1 hora e 1 minuto')
    expect(spokenDuration(2 * HOUR)).toBe('2 horas')
    expect(spokenDuration(30_000)).toBe('menos de 1 minuto')
  })

  it('resume as vagas e respeita os limites do servidor (um goleiro; formato menos um)', () => {
    expect(slotsSummary(null)).toBe('Time completo, sem vagas para avulsos')
    expect(slotsSummary(emptySlots)).toBe('Time completo, sem vagas para avulsos')
    expect(slotsSummary({ goleiro: 1, defesa: 0, meio_campo: 0, atacante: 2 })).toBe('3 vagas para avulsos: goleiro, 2 atacante')
    expect(slotsSummary({ goleiro: 0, defesa: 0, meio_campo: 1, atacante: 0 })).toBe('1 vaga para avulsos: meio de campo')
    expect([maxSlots('futsal'), maxSlots('society'), maxSlots('campo')]).toEqual([4, 6, 10])
    expect(slotTotal(undefined)).toBe(0)
  })

  it('lê a placa com as listas sempre presentes e nomeia os lados', () => {
    expect(normalizeBoard(undefined)).toEqual({ attention: false, searches: [], proposals: [], offers: [], matches: [] })
    expect(normalizeBoard({ attention: true } as never).searches).toEqual([])
    expect(sideName(teamSide('a', leoes))).toBe('Leões J1')
    expect(sideName(athleteSide('b', 2, 'Beatriz Lima'))).toBe('Beatriz Lima')
    expect(sideName(undefined)).toBe('Adversário')
  })
})

describe('contadores de vagas (V2)', () => {
  function Stepper({ format = 'society', error, start = emptySlots }: { format?: 'futsal' | 'society' | 'campo'; error?: string; start?: OpenSlots }) {
    const [value, setValue] = useState<OpenSlots>(start)
    return <SlotSteppers format={format} value={value} onChange={setValue} error={error} />
  }
  const spin = (label: string) => screen.getByRole('spinbutton', { name: `Vagas de ${label}` })

  it('anda pelas setas, Home e End, com no máximo um goleiro', async () => {
    const ui = userEvent.setup()
    renderWithToaster(<Stepper />)
    spin('goleiro').focus()
    await ui.keyboard('{ArrowUp}{ArrowUp}')
    expect(spin('goleiro').getAttribute('aria-valuenow')).toBe('1')
    expect(spin('goleiro').getAttribute('aria-valuemax')).toBe('1')
    expect(spin('goleiro').getAttribute('aria-valuetext')).toBe('1 vaga')
    spin('atacante').focus()
    await ui.keyboard('{ArrowRight}{ArrowRight}{ArrowUp}')
    expect(spin('atacante').getAttribute('aria-valuenow')).toBe('3')
    await ui.keyboard('{ArrowDown}{ArrowLeft}')
    expect(spin('atacante').getAttribute('aria-valuenow')).toBe('1')
    await ui.keyboard('{End}')
    expect(spin('atacante').getAttribute('aria-valuenow')).toBe('5') // 6 vagas no society, uma já é do goleiro
    await ui.keyboard('{Home}')
    expect(spin('atacante').getAttribute('aria-valuenow')).toBe('0')
    expect(screen.getByText('1 de 6 vagas · no máximo 1 de goleiro')).not.toBeNull()
  })

  it('trava os botões nos limites e mostra o erro do servidor no campo', async () => {
    const ui = userEvent.setup()
    renderWithToaster(<Stepper format="futsal" error="No futsal cabem até 4 vagas para avulsos." />)
    expect(button('Menos uma vaga de defesa').disabled).toBe(true)
    for (let step = 0; step < 4; step++) await ui.click(button('Mais uma vaga de defesa'))
    expect(spin('defesa').getAttribute('aria-valuenow')).toBe('4')
    expect(button('Mais uma vaga de defesa').disabled).toBe(true)
    expect(button('Mais uma vaga de atacante').disabled).toBe(true) // o total chegou ao formato menos um
    await ui.click(button('Menos uma vaga de defesa'))
    expect(button('Mais uma vaga de goleiro').disabled).toBe(false)
    expect(within(screen.getByRole('alert')).queryByText('No futsal cabem até 4 vagas para avulsos.')).not.toBeNull()
  })
})

describe('folha Preparar busca (V2)', () => {
  function renderSheet(overrides: Partial<Parameters<typeof PrepareSearchSheet>[0]> = {}) {
    const props = { team: { id: 10, name: 'Leões J1' }, eyebrow: 'Leões J1 · Prata', format: 'society' as const, onFormat: vi.fn(), hint: 'Times de Brasília Prata e Ouro',
      onCreated: vi.fn(), onClose: vi.fn(), onExpired: vi.fn(), ...overrides }
    renderWithToaster(<PrepareSearchSheet {...props} />)
    return { props, ui: userEvent.setup() }
  }

  it('com o time completo, busca sem vagas e entrega a resposta ao chamador', async () => {
    const result = created()
    const api = mockApi({ 'POST /matchmaking/searches': reply(201, result) })
    const { props, ui } = renderSheet()
    expect(screen.getByRole('dialog', { name: 'Preparar busca' })).not.toBeNull()
    expect(screen.getByText('Leões J1 · Prata')).not.toBeNull()
    expect(screen.getByRole('switch', { name: 'O time está completo?' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByRole('spinbutton')).toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Futsal 5 contra 5' }))
    expect(props.onFormat).toHaveBeenCalledWith('futsal')
    await ui.click(button('Buscar adversário'))
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith(result))
    expect(api.find('POST', '/matchmaking/searches')[0].body).toEqual({ sport: 'futebol', team_id: 10, format: 'society', team_complete: true, open_slots: null })
  })

  it('abre vagas por posição, exige ao menos uma e mostra o erro 422 no campo', async () => {
    let attempt = 0
    const api = mockApi({
      'POST /matchmaking/searches': () => ++attempt === 1
        ? reply(422, { detail: 'No society cabem até 6 vagas para avulsos.', fields: [{ field: 'open_slots', message: 'No society cabem até 6 vagas para avulsos.' }] })
        : reply(201, created()),
    })
    const { props, ui } = renderSheet()
    await ui.click(screen.getByRole('switch', { name: 'O time está completo?' }))
    expect(screen.getAllByRole('spinbutton')).toHaveLength(4)
    expect(button(/^Buscar adversário/).disabled).toBe(true)
    expect(screen.getByText('Abra ao menos uma vaga ou marque o time como completo.')).not.toBeNull()
    await ui.click(button('Mais uma vaga de goleiro'))
    await ui.click(button('Mais uma vaga de atacante'))
    await ui.click(button('Mais uma vaga de atacante'))
    expect(screen.getByText(/As vagas abrem para avulsos assim que a partida for agendada/)).not.toBeNull()
    await ui.click(button('Buscar adversário · 3 vagas'))
    const field = screen.getByRole('group', { name: 'Atacante' }).closest('[data-slot=slot-steppers]') as HTMLElement
    expect((await within(field).findByRole('alert')).textContent).toBe('No society cabem até 6 vagas para avulsos.')
    expect(props.onCreated).not.toHaveBeenCalled()
    expect(api.find('POST', '/matchmaking/searches')[0].body).toEqual({
      sport: 'futebol', team_id: 10, format: 'society', team_complete: false, open_slots: { goleiro: 1, defesa: 0, meio_campo: 0, atacante: 2 },
    })
    await ui.click(button('Buscar adversário · 3 vagas'))
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('uma recusa do servidor sem campo conhecido (422) fica na folha, acima do botão', async () => {
    mockApi({ 'POST /matchmaking/searches': () => reply(422, { detail: 'O perfil de futebol está incompleto.', fields: [{ field: 'profile', message: 'Complete o perfil.' }] }) })
    const { ui } = renderSheet()
    await ui.click(button('Buscar adversário'))
    const sheet = screen.getByRole('dialog', { name: 'Preparar busca' })
    expect((await within(sheet).findByRole('alert')).textContent).toBe('O perfil de futebol está incompleto.')
  })

  it('mostra erros gerais do servidor em toast e a sessão expirada', async () => {
    mockApi({ 'POST /matchmaking/searches': () => apiError(403, 'Só representantes buscam partida para o time.') })
    const { props, ui } = renderSheet()
    await ui.click(button('Buscar adversário'))
    const toast = await findToast('Só representantes buscam partida para o time.')
    expect(toneOf(toast)).toBe('error')
    // A folha segue aberta e sem bloco de erro: a falha de ação é do toast.
    expect(within(screen.getByRole('dialog', { name: 'Preparar busca' })).queryByRole('alert')).toBeNull()
    mockApi({ 'POST /matchmaking/searches': () => apiError(401, 'Sessão expirada.') })
    await ui.click(button('Buscar adversário'))
    await waitFor(() => expect(props.onExpired).toHaveBeenCalled())
  })

  it('fecha pelo Esc e pelo botão, e prende o foco na folha', async () => {
    mockApi({})
    const { props, ui } = renderSheet()
    expect(screen.getByRole('dialog', { name: 'Preparar busca' })).not.toBeNull()
    await ui.keyboard('{Escape}')
    expect(props.onClose).toHaveBeenCalledTimes(1)
    await ui.click(button('Fechar'))
    expect(props.onClose).toHaveBeenCalledTimes(2)
  })
})

describe('placa: buscar e cancelar', () => {
  it('prepara a busca com vagas, passa a buscar com o cronômetro e cancela com confirmação', async () => {
    const { state, api } = world(playBoard(), {
      'POST /matchmaking/searches': () => { state.board = playBoard({ searches: [search()] }); return reply(201, created()) },
      'DELETE /matchmaking/searches/55': () => { state.board = playBoard(); return undefined },
    })
    const { ui } = renderPlay()
    const start = await findButton('Encontrar partida')
    await waitFor(() => expect(start.disabled).toBe(false))
    expect(screen.getByText('Times de Brasília de qualquer nível.')).not.toBeNull()
    await ui.click(start)

    const sheet = screen.getByRole('dialog', { name: 'Preparar busca' })
    expect(within(sheet).getByText('Leões J1 · Em classificação')).not.toBeNull()
    await ui.click(within(sheet).getByRole('switch', { name: 'O time está completo?' }))
    await ui.click(within(sheet).getByRole('button', { name: 'Mais uma vaga de goleiro' }))
    await ui.click(within(sheet).getByRole('button', { name: 'Mais uma vaga de atacante' }))
    await ui.click(within(sheet).getByRole('button', { name: 'Buscar adversário · 2 vagas' }))

    // Buscando: o botão pulsa, conta o tempo e ainda não deixa mudar o formato.
    const searching = await findButton('Buscando, toque para cancelar a busca')
    expect(screen.queryByRole('dialog', { name: 'Preparar busca' })).toBeNull()
    expect(api.find('POST', '/matchmaking/searches')[0].body).toMatchObject({ team_id: 10, format: 'society', team_complete: false })
    expect(searching.getAttribute('data-searching')).toBe('')
    expect(within(searching).getByText(/^0\d:\d\d$/)).not.toBeNull()
    expect(screen.getAllByRole('status').some(node => /^Buscando há /.test(node.textContent ?? ''))).toBe(true)
    expect(document.querySelectorAll('[data-slot=play-ripple]')).toHaveLength(2)
    expect(screen.getByText('Times de Brasília de qualquer nível · Society. 2 vagas para avulsos: goleiro, atacante.')).not.toBeNull()
    expect(isDisabled(screen.getByRole('button', { name: 'Society 7 contra 7' }))).toBe(true)
    expect(isDisabled(screen.getByRole('button', { name: 'Avulso' }))).toBe(false) // outra chave, outra busca

    // Tocar cancela, mas pede confirmação; "Continuar buscando" mantém a busca.
    await ui.click(searching)
    const confirm = screen.getByRole('dialog', { name: 'Cancelar a busca?' })
    expect(document.activeElement).toBe(within(confirm).getByRole('button', { name: 'Continuar buscando' }))
    await ui.click(within(confirm).getByRole('button', { name: 'Continuar buscando' }))
    expect(screen.queryByRole('dialog', { name: 'Cancelar a busca?' })).toBeNull()
    expect(api.find('DELETE', '/matchmaking/searches/55')).toHaveLength(0)

    await ui.click(screen.getByRole('button', { name: 'Cancelar busca' }))
    await ui.click(within(screen.getByRole('dialog', { name: 'Cancelar a busca?' })).getByRole('button', { name: 'Cancelar busca' }))
    expect(await findButton('Encontrar partida')).not.toBeNull()
    expect(api.find('DELETE', '/matchmaking/searches/55')).toHaveLength(1)
    expect(toneOf(await findToast('Busca cancelada.'))).toBe('success')
    expect(screen.queryByRole('button', { name: /toque para cancelar/ })).toBeNull()
  })

  it('cancelar com Esc na confirmação mantém a busca; um 409 mostra o motivo e segue a placa', async () => {
    const { state, api } = world(playBoard({ searches: [search()] }), {
      'DELETE /matchmaking/searches/55': () => {
        state.board = playBoard({ searches: [search({ state: 'pareada', match_id: 50 })], proposals: [proposal({ can_respond: false, sides: [teamSide('a', leoes, { is_mine: true, accepted_at: '2026-10-12T12:00:00Z' }), teamSide('b', tigres)] })] })
        return apiError(409, 'A busca já encontrou uma partida. Responda à proposta.')
      },
    })
    const { ui } = renderPlay()
    await ui.click(await findButton('Buscando, toque para cancelar a busca'))
    await ui.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Cancelar a busca?' })).toBeNull()
    expect(api.find('DELETE', '/matchmaking/searches/55')).toHaveLength(0)

    await ui.click(button('Cancelar busca'))
    await ui.click(within(screen.getByRole('dialog', { name: 'Cancelar a busca?' })).getByRole('button', { name: 'Cancelar busca' }))
    // A busca já estava pareada: a confirmação some e a placa passa a pedir a resposta à proposta.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Cancelar a busca?' })).toBeNull())
    expect(await findToast(/A busca já encontrou uma partida\. Responda à proposta\./)).toBeTruthy()
    expect(await findButton('Ver a proposta, que aguarda o adversário')).not.toBeNull()
  })

  it('uma falha ao cancelar a busca vira toast de erro e a confirmação continua aberta para tentar de novo', async () => {
    const { api } = world(playBoard({ searches: [search()] }), {
      'DELETE /matchmaking/searches/55': () => apiError(500, 'Não foi possível cancelar agora.'),
    })
    const { ui } = renderPlay()
    await ui.click(await findButton('Buscando, toque para cancelar a busca'))
    const confirm = screen.getByRole('dialog', { name: 'Cancelar a busca?' })
    await ui.click(within(confirm).getByRole('button', { name: 'Cancelar busca' }))
    expect(toneOf(await findToast('Não foi possível cancelar agora.'))).toBe('error')
    expect(api.find('DELETE', '/matchmaking/searches/55')).toHaveLength(1)
    expect(within(confirm).queryByRole('alert')).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Cancelar a busca?' })).not.toBeNull()
  })

  it('a placa que não carregou mostra o erro de carga, escuro, com "Tentar novamente"', async () => {
    let fails = true
    const { api } = world(playBoard(), { 'GET /me/play': () => (fails ? apiError(500, 'Erro ao ler a placa.') : playBoard()) })
    const { ui } = renderPlay()
    const alert = await screen.findByRole('alert')
    expect(alert.getAttribute('data-slot')).toBe('load-error')
    expect(alert.getAttribute('data-tone')).toBe('dark')
    expect(alert.textContent).toContain('Erro ao ler a placa.')
    fails = false
    await ui.click(within(alert).getByRole('button', { name: 'Tentar novamente' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(api.find('GET', '/me/play')).toHaveLength(2)
  })

  it('tênis busca direto, sem a folha, e mostra o erro da cidade do perfil', async () => {
    let attempt = 0
    const { state, api } = world(playBoard(), {
      'POST /matchmaking/searches': () => {
        if (++attempt === 1) return apiError(409, 'Complete seu perfil de tênis com a cidade para buscar partidas.')
        state.board = playBoard({ searches: [search({ id: 56, kind: 'tenis', sport: 'tenis', team: null, format: null, open_slots: null })] })
        return reply(201, created({ search: search({ id: 56, kind: 'tenis', sport: 'tenis', team: null, format: null, open_slots: null }) }))
      },
    })
    const { ui } = renderPlay()
    await ui.click(await screen.findByRole('tab', { name: 'Tênis' }))
    expect(screen.getByText('Tenistas de Brasília de qualquer nível.')).not.toBeNull()
    await ui.click(await findButton('Encontrar partida'))
    expect(await findToast('Complete seu perfil de tênis com a cidade para buscar partidas.')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    await ui.click(button('Encontrar partida'))
    expect(await findButton('Buscando, toque para cancelar a busca')).not.toBeNull()
    expect(api.find('POST', '/matchmaking/searches').map(call => call.body)).toEqual([{ sport: 'tenis' }, { sport: 'tenis' }])
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('Tenistas de Brasília de qualquer nível.')).not.toBeNull()
  })

  it('avulso busca uma posição ou qualquer posição, em qualquer formato', async () => {
    const { api } = world(playBoard(), { 'POST /matchmaking/searches': () => reply(201, created({ search: search({ kind: 'avulso', team: null, format: null, position: 'atacante', open_slots: null }) })) })
    const { ui } = renderPlay()
    await ui.click(await screen.findByRole('button', { name: 'Avulso' }))
    expect(screen.getByText('Vagas de atacante em partidas de Brasília.')).not.toBeNull()
    await ui.click(await findButton('Encontrar vaga'))
    await ui.click(screen.getByRole('button', { name: 'Qualquer posição' }))
    expect(screen.getByText('Vagas em partidas de Brasília.')).not.toBeNull()
    await ui.click(button('Encontrar vaga'))
    await waitFor(() => expect(api.find('POST', '/matchmaking/searches')).toHaveLength(2))
    expect(api.find('POST', '/matchmaking/searches').map(call => call.body)).toEqual([
      { sport: 'futebol', position: 'atacante' }, { sport: 'futebol', position: null },
    ])
  })

  it('só representa quem quer buscar; quem só é membro lê que o time busca e não vê o botão de busca', async () => {
    world(playBoard({ searches: [search({ can_cancel: false })] }), {}, [{ team: leoes, role: 'membro' }])
    const { ui } = renderPlay()
    expect(await screen.findByRole('button', { name: 'Crie ou represente um time' })).not.toBeNull()
    expect(await screen.findByText('Leões J1 está buscando partida. Só os representantes respondem.')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Encontrar partida' })).toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Avulso' }))
    expect(screen.queryByText(/Leões J1 está buscando/)).not.toBeNull()
  })

  it('corrida não busca partida: o botão registra a marca e a placa não lista partidas', async () => {
    world(playBoard(), { 'GET /me/run-bests': { items: [] } })
    const { ui } = renderPlay([football, { ...tennis, id: 3, sport: 'corrida' }])
    await ui.click(await screen.findByRole('tab', { name: 'Corrida' }))
    const register = button('Registrar treino ou prova')
    expect(register.disabled).toBe(false)
    expect(screen.queryByRole('region', { name: 'Minhas partidas' })).toBeNull()
    expect(screen.queryByText(/Encontrar|buscando/i)).toBeNull()
    await ui.click(register)
    expect(await screen.findByRole('dialog', { name: 'Registrar corrida' })).not.toBeNull()
  })
})

describe('placa: proposta (P2)', () => {
  const accepted = (overrides = {}) => proposal({
    can_respond: false, sides: [teamSide('a', leoes, { is_mine: true, accepted_at: '2026-10-12T12:00:00Z' }), teamSide('b', tigres, { tier: 'prata' })], ...overrides,
  })

  it('abre em tela cheia com os dois lados, o elo só de quem tem e a contagem de 2 h', async () => {
    world(playBoard({ proposals: [proposal()], searches: [search({ state: 'pareada', match_id: 50 })] }))
    renderPlay()
    const dialog = await screen.findByRole('dialog', { name: 'Adversário encontrado · Society' })
    await waitFor(() => expect(document.activeElement).toBe(dialog))
    expect(within(dialog).getByText('Leões J1')).not.toBeNull()
    expect(within(dialog).getByText('Tigres J1')).not.toBeNull()
    expect(within(dialog).getByText('Prata')).not.toBeNull() // o Tigres tem elo
    expect(dialog.querySelectorAll('[data-slot=tier-emblem]')).toHaveLength(1)
    expect(dialog.querySelector('[data-slot=tier-emblem]')?.getAttribute('src')).toBe('/images/brand/prata.svg')
    expect(within(dialog).getByText('Em classificação')).not.toBeNull() // o Leões, sem elo
    expect(within(dialog).getByRole('timer').textContent).toMatch(/1:59:\d\d.*1 hora e 59 minutos restantes/)
    expect(within(dialog).getByText('para os representantes aceitarem')).not.toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Recusar' })).not.toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Aceitar partida' })).not.toBeNull()
    // Foco preso no diálogo: Tab circula entre os botões.
    const ui = userEvent.setup()
    await ui.tab()
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('aceitar quando o outro lado já aceitou leva à partida', async () => {
    const { state, api } = world(playBoard({ proposals: [proposal()], searches: [search({ state: 'pareada', match_id: 50 })] }), {
      'PUT /matches/50/accept': () => {
        state.board = playBoard({ matches: [matchCard()] })
        return proposal({ state: 'combinando', can_respond: false })
      },
    })
    const { go, ui } = renderPlay()
    const dialog = await screen.findByRole('dialog', { name: 'Adversário encontrado · Society' })
    await ui.click(within(dialog).getByRole('button', { name: 'Aceitar partida' }))
    await waitFor(() => expect(go).toHaveBeenCalledWith('match', { matchId: 50 }))
    expect(api.find('PUT', '/matches/50/accept')[0].body).toEqual({})
    expect(screen.queryByRole('dialog', { name: /Adversário encontrado/ })).toBeNull()
  })

  it('aceitar primeiro espera o outro lado e vai à partida quando os dois aceitaram', async () => {
    const { state } = world(playBoard({ proposals: [proposal()], searches: [search({ state: 'pareada', match_id: 50 })] }), {
      'PUT /matches/50/accept': () => {
        state.board = playBoard({ proposals: [accepted()], searches: [search({ state: 'pareada', match_id: 50 })] })
        return accepted()
      },
    })
    const { go, ui } = renderPlay()
    const dialog = await screen.findByRole('dialog', { name: 'Adversário encontrado · Society' })
    await ui.click(within(dialog).getByRole('button', { name: 'Aceitar partida' }))
    expect(await within(dialog).findByText('Você aceitou')).not.toBeNull()
    expect(within(dialog).getByText('Aguardando Tigres J1')).not.toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Aceitar partida' })).toBeNull()
    expect(go).not.toHaveBeenCalled()

    // O outro lado aceita: a próxima leitura da placa traz a partida combinando e a proposta some.
    state.board = playBoard({ matches: [matchCard()] })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 20_000)
    focusWindow()
    vi.useRealTimers()
    await waitFor(() => expect(go).toHaveBeenCalledWith('match', { matchId: 50 }))
  })

  it('recusar chama a API, fecha a proposta e avisa', async () => {
    const { state, api } = world(playBoard({ proposals: [proposal()], searches: [search({ state: 'pareada', match_id: 50 })] }), {
      'PUT /matches/50/decline': () => { state.board = playBoard(); return proposal({ state: 'recusada', can_respond: false }) },
    })
    const { go, ui } = renderPlay()
    const dialog = await screen.findByRole('dialog', { name: 'Adversário encontrado · Society' })
    await ui.click(within(dialog).getByRole('button', { name: 'Recusar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Adversário encontrado/ })).toBeNull())
    expect(api.find('PUT', '/matches/50/decline')).toHaveLength(1)
    expect(toneOf(await findToast('Proposta recusada.'))).toBe('success')
    expect(screen.queryByText('Adversário encontrado')).toBeNull()
    expect(await findButton('Encontrar partida')).not.toBeNull()
    expect(go).not.toHaveBeenCalled()
  })

  it('"Responder depois" (e Esc) mantém a proposta na placa e não chama a API nem reabre sozinha', async () => {
    const { state, api } = world(playBoard({ proposals: [proposal()], searches: [search({ state: 'pareada', match_id: 50 })] }))
    const { ui } = renderPlay()
    const dialog = await screen.findByRole('dialog', { name: 'Adversário encontrado · Society' })
    await ui.click(within(dialog).getByRole('button', { name: 'Responder depois' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Adversário encontrado/ })).toBeNull())
    expect(api.calls.filter(call => call.method === 'PUT')).toHaveLength(0)
    expect(toneOf(await findToast('A proposta continua na placa e nas notificações até o prazo.'))).toBe('info')
    const card = screen.getByRole('article', { name: 'Proposta contra Tigres J1' })
    expect(within(card).getByText('Os dois lados precisam aceitar em até 2 h. A proposta expira se ninguém responder.')).not.toBeNull()
    // Uma nova leitura da placa não reabre a proposta adiada.
    state.board = playBoard({ proposals: [proposal()], searches: [search({ state: 'pareada', match_id: 50 })] })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 20_000)
    focusWindow()
    vi.useRealTimers()
    await waitFor(() => expect(api.find('GET', '/me/play').length).toBeGreaterThan(1))
    expect(screen.queryByRole('dialog', { name: /Adversário encontrado/ })).toBeNull()

    // Pelo cartão, abre de novo; Esc faz o mesmo que "Responder depois".
    await ui.click(within(card).getByRole('button', { name: 'Responder à proposta' }))
    expect(await screen.findByRole('dialog', { name: 'Adversário encontrado · Society' })).not.toBeNull()
    await ui.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Adversário encontrado/ })).toBeNull())
    expect(api.calls.filter(call => call.method === 'PUT')).toHaveLength(0)
  })

  it('o membro lê "Só os representantes aceitam." e não responde', async () => {
    world(playBoard({ proposals: [proposal({ can_respond: false, my_role: 'membro' })], searches: [search({ state: 'pareada', match_id: 50, can_cancel: false })] }), {}, [{ team: leoes, role: 'membro' }])
    const { ui } = renderPlay()
    const card = await screen.findByRole('article', { name: 'Proposta contra Tigres J1' })
    // Sem aceite possível, a proposta não abre sozinha.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(within(card).getByText('Só os representantes aceitam.')).not.toBeNull()
    await ui.click(within(card).getByRole('button', { name: 'Ver proposta' }))
    const dialog = await screen.findByRole('dialog', { name: 'Adversário encontrado · Society' })
    expect(within(dialog).getByRole('note').textContent).toBe('Só os representantes aceitam.')
    expect(within(dialog).queryByRole('button', { name: 'Aceitar partida' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Recusar' })).toBeNull()
    await ui.click(within(dialog).getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('mostra o erro do servidor ao aceitar uma proposta que já fechou', async () => {
    world(playBoard({ proposals: [proposal()], searches: [search({ state: 'pareada', match_id: 50 })] }), {
      'PUT /matches/50/accept': () => apiError(409, 'Esta proposta não está mais aberta.'),
    })
    const { go, ui } = renderPlay()
    const dialog = await screen.findByRole('dialog', { name: 'Adversário encontrado · Society' })
    await ui.click(within(dialog).getByRole('button', { name: 'Aceitar partida' }))
    expect(await findToast('Esta proposta não está mais aberta.')).toBeTruthy()
    expect(go).not.toHaveBeenCalled()
  })

  it('tênis: o atleta aceita, com as fotos e o texto dos atletas', async () => {
    const duel = proposal({
      sport: 'tenis', format: null, my_role: 'atleta',
      sides: [athleteSide('a', 1, 'Ana Tenista', { is_mine: true }), athleteSide('b', 2, 'Beatriz Lima', { tier: 'ouro' })],
    })
    world(playBoard({ proposals: [duel], searches: [search({ id: 56, kind: 'tenis', sport: 'tenis', team: null, format: null, open_slots: null, state: 'pareada', match_id: 50 })] }))
    renderPlay()
    const dialog = await screen.findByRole('dialog', { name: 'Adversário encontrado · Tênis' })
    expect(within(dialog).getByText('Beatriz Lima')).not.toBeNull()
    expect(within(dialog).getByText('Ouro')).not.toBeNull()
    expect(within(dialog).getByText('para os atletas aceitarem')).not.toBeNull()
  })

  it('abre a proposta de uma busca recém-criada que já pareou e a pedida pela notificação', async () => {
    const instant = proposal()
    const { state } = world(playBoard(), {
      'POST /matchmaking/searches': () => {
        state.board = playBoard({ proposals: [instant], searches: [search({ state: 'pareada', match_id: 50 })] })
        return reply(201, created({ search: search({ state: 'pareada', match_id: 50 }), proposal: instant }))
      },
    })
    const { ui } = renderPlay([football, tennis])
    await ui.click(await screen.findByRole('tab', { name: 'Tênis' }))
    await ui.click(await findButton('Encontrar partida'))
    expect(await screen.findByRole('dialog', { name: /Adversário encontrado/ })).not.toBeNull()
  })

  it('abre a proposta indicada ao entrar (notificação "Partida encontrada")', async () => {
    world(playBoard({ proposals: [proposal({ can_respond: false })], searches: [search({ state: 'pareada', match_id: 50 })] }))
    renderPlay([football, tennis], 50)
    expect(await screen.findByRole('dialog', { name: 'Adversário encontrado · Society' })).not.toBeNull()
  })

  it('a notificação de uma partida que já não tem proposta nem oferta não prende a abertura automática', async () => {
    world(playBoard({ proposals: [proposal({ match_id: 77 })], searches: [search({ state: 'pareada', match_id: 77 })] }))
    renderPlay([football, tennis], 50)
    expect(await screen.findByRole('dialog', { name: 'Adversário encontrado · Society' })).not.toBeNull()
  })
})

describe('placa: oferta de vaga ao avulso', () => {
  const offered = () => playBoard({ offers: [slotOffer()], searches: [search({ id: 70, kind: 'avulso', team: null, format: null, position: 'atacante', open_slots: null, state: 'pareada', slot_id: 9, offer_expires_at: inFuture(2 * HOUR) })] })

  it('mostra o cartão com a partida e a posição, e o diálogo com a data, a quadra, o formato e os times', async () => {
    world(offered())
    const { ui } = renderPlay()
    await ui.click(await screen.findByRole('button', { name: 'Avulso' }))
    const card = await screen.findByRole('article', { name: 'Vaga de atacante no Tigres J1' })
    expect(within(card).getByText('Tigres J1 × Leões J1')).not.toBeNull()
    expect(within(card).getByText(/Arena Sudoeste/)).not.toBeNull()
    expect(within(card).getByText('Você joga como atacante convidado, só nesta partida')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Responder à oferta de vaga' })).not.toBeNull()
    await ui.click(within(card).getByRole('button', { name: 'Ver vaga' }))
    const dialog = await screen.findByRole('dialog', { name: 'Vaga encontrada · Society' })
    expect(within(dialog).getByText('Vaga de atacante')).not.toBeNull()
    expect(within(dialog).getByText('Leões J1')).not.toBeNull()
    expect(within(dialog).getByText('Tigres J1')).not.toBeNull()
    expect(within(dialog).getByText(/Arena Sudoeste/)).not.toBeNull()
    expect(within(dialog).getByRole('timer').textContent).toMatch(/1:59:\d\d/)
    expect(within(dialog).getByText('Tigres J1 abriu esta vaga. Você joga como atacante convidado, só nesta partida.')).not.toBeNull()
    await ui.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('article', { name: 'Vaga de atacante no Tigres J1' })).not.toBeNull()
  })

  it('abre a oferta indicada ao entrar (notificação "Vaga encontrada", com o id da partida)', async () => {
    world(offered())
    renderPlay([football, tennis], 60)
    const dialog = await screen.findByRole('dialog', { name: 'Vaga encontrada · Society' })
    expect(within(dialog).getByRole('button', { name: 'Quero jogar' })).not.toBeNull()
  })

  it('"Quero jogar" preenche a vaga e leva à partida', async () => {
    const { api } = world(offered(), { 'PUT /match-slots/9/accept': () => ({ id: 60 }) })
    const { go, ui } = renderPlay()
    await ui.click(await screen.findByRole('button', { name: 'Avulso' }))
    await ui.click(await screen.findByRole('button', { name: 'Ver vaga' }))
    await ui.click(within(await screen.findByRole('dialog', { name: 'Vaga encontrada · Society' })).getByRole('button', { name: 'Quero jogar' }))
    await waitFor(() => expect(go).toHaveBeenCalledWith('match', { matchId: 60 }))
    expect(api.find('PUT', '/match-slots/9/accept')[0].body).toEqual({})
  })

  it('"Agora não" recusa a oferta e a placa volta ao estado de busca', async () => {
    const { state, api } = world(offered(), { 'PUT /match-slots/9/decline': () => { state.board = playBoard(); return undefined } })
    const { go, ui } = renderPlay()
    await ui.click(await screen.findByRole('button', { name: 'Avulso' }))
    await ui.click(await screen.findByRole('button', { name: 'Ver vaga' }))
    await ui.click(within(await screen.findByRole('dialog', { name: 'Vaga encontrada · Society' })).getByRole('button', { name: 'Agora não' }))
    await waitFor(() => expect(screen.queryByRole('article', { name: /Vaga de atacante/ })).toBeNull())
    expect(api.find('PUT', '/match-slots/9/decline')).toHaveLength(1)
    expect(toneOf(await findToast('Vaga recusada. Sua busca terminou.'))).toBe('info')
    expect(go).not.toHaveBeenCalled()
  })

  it('mostra o erro do servidor quando a vaga não está mais reservada', async () => {
    world(offered(), { 'PUT /match-slots/9/accept': () => apiError(409, 'Esta vaga não está mais reservada para você.') })
    const { go, ui } = renderPlay()
    await ui.click(await screen.findByRole('button', { name: 'Avulso' }))
    await ui.click(await screen.findByRole('button', { name: 'Ver vaga' }))
    const dialog = await screen.findByRole('dialog', { name: 'Vaga encontrada · Society' })
    await ui.click(within(dialog).getByRole('button', { name: 'Quero jogar' }))
    expect(await findToast('Esta vaga não está mais reservada para você.')).toBeTruthy()
    expect(go).not.toHaveBeenCalled()
  })
})

describe('placa: minhas partidas', () => {
  const upcoming = () => [
    matchCard({ id: 50, phase: 'combinando', needs_my_action: true }),
    matchCard({
      id: 51, state: 'agendada', phase: 'agendada', starts_at: inFuture(30 * HOUR), my_role: 'membro',
      sides: [teamSide('a', leoes, { is_mine: true }), teamSide('b', { id: 12, name: 'Real Guará', initials: 'RG', crest_url: null })],
      court: { id: 3, name: 'Arena Sudoeste', address: null, kind: 'society', city: brasilia, state: 'publicada', provisional: false },
    }),
    matchCard({ id: 52, sport: 'tenis', format: null, my_role: 'atleta', sides: [athleteSide('a', 1, 'Ana Tenista', { is_mine: true }), athleteSide('b', 2, 'Beatriz Lima')] }),
  ]
  const history = [
    matchCard({ id: 40, state: 'encerrada', phase: 'encerrada', score: { a: 3, b: 1, sets: null, winner: 'a' }, starts_at: inFuture(-72 * HOUR) }),
    matchCard({ id: 41, sport: 'tenis', format: null, state: 'cancelada', phase: 'cancelada', sides: [athleteSide('a', 1, 'Ana Tenista', { is_mine: true }), athleteSide('b', 2, 'Beatriz Lima')] }),
  ]

  it('lista as próximas da modalidade com a fase e leva à partida; o histórico lê a API só ao abrir', async () => {
    const { api } = world(playBoard({ matches: upcoming() }), { 'GET /me/matches?scope=historico': { items: history, next_cursor: null } })
    const { go, ui } = renderPlay()
    const section = await screen.findByRole('region', { name: 'Minhas partidas' })
    const rows = await within(section).findAllByRole('button', { name: /Leões J1 × / })
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('Combinando')).not.toBeNull()
    expect(within(rows[0]).getByText('Sua vez')).not.toBeNull()
    expect(within(rows[0]).getByText('Data e quadra a combinar no chat')).not.toBeNull()
    expect(within(rows[1]).getByText('Agendada')).not.toBeNull()
    expect(within(rows[1]).getByText(/Arena Sudoeste/)).not.toBeNull()
    expect(within(section).queryByText(/Ana Tenista/)).toBeNull() // outra modalidade
    expect(api.find('GET', '/me/matches?scope=historico')).toHaveLength(0)
    await ui.click(rows[1])
    expect(go).toHaveBeenCalledWith('match', { matchId: 51 })

    await ui.click(within(section).getByRole('tab', { name: 'Histórico' }))
    const past = await within(section).findByRole('button', { name: /Leões J1 × Tigres J1/ })
    expect(within(past).getByText('Encerrada')).not.toBeNull()
    expect(within(past).getByText(/Placar 3 × 1/)).not.toBeNull()
    expect(within(section).queryByText(/Ana Tenista/)).toBeNull()
    expect(api.find('GET', '/me/matches?scope=historico')).toHaveLength(1)
    await ui.click(within(screen.getByRole('region', { name: 'Minhas partidas' })).getByRole('tab', { name: 'Próximas' }))
    expect(within(screen.getByRole('region', { name: 'Minhas partidas' })).getAllByRole('button', { name: /Leões J1 × / })).toHaveLength(2)
  })

  it('mostra as do tênis na aba Tênis e o estado vazio sem partidas', async () => {
    world(playBoard({ matches: upcoming() }), { 'GET /me/matches?scope=historico': { items: [], next_cursor: null } })
    const { ui } = renderPlay()
    await ui.click(await screen.findByRole('tab', { name: 'Tênis' }))
    const section = screen.getByRole('region', { name: 'Minhas partidas' })
    expect(within(section).getByRole('button', { name: /Ana Tenista × Beatriz Lima/ })).not.toBeNull()
    await ui.click(within(section).getByRole('tab', { name: 'Histórico' }))
    expect(await within(section).findByText('Suas partidas encerradas, sem resultado ou canceladas aparecem aqui.')).not.toBeNull()
  })

  it('o histórico pagina com "Carregar mais"', async () => {
    let page = 0
    const { api } = world(playBoard(), {
      'GET /me/matches?scope=historico': () => ({ items: [history[0]], next_cursor: 'p2' }),
      'GET /me/matches?scope=historico&cursor=p2': () => { page++; return { items: [matchCard({ id: 39, state: 'encerrada', phase: 'encerrada' })], next_cursor: null } },
    })
    const { ui } = renderPlay()
    await ui.click(within(await screen.findByRole('region', { name: 'Minhas partidas' })).getByRole('tab', { name: 'Histórico' }))
    await ui.click(await screen.findByRole('button', { name: 'Carregar mais' }))
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Leões J1 × Tigres J1/ })).toHaveLength(2))
    expect(page).toBe(1)
    expect(api.find('GET', '/me/matches?scope=historico&cursor=p2')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull()
  })
})

describe('histórico que não carregou', () => {
  it('vira erro de seção com "Tentar novamente"; falta de conexão fala em conexão', async () => {
    let status = 500
    const { api } = world(playBoard(), {
      'GET /me/matches?scope=historico': () => (status ? apiError(status, 'Histórico fora do ar.') : { items: [], next_cursor: null }),
    })
    const { ui } = renderPlay()
    const section = await screen.findByRole('region', { name: 'Minhas partidas' })
    await ui.click(within(section).getByRole('tab', { name: 'Histórico' }))
    const alert = await within(section).findByRole('alert')
    expect(alert.getAttribute('data-size')).toBe('section')
    expect(alert.textContent).toContain('Histórico fora do ar.')
    status = 503
    await ui.click(within(alert).getByRole('button', { name: 'Tentar novamente' }))
    await waitFor(() => expect(within(section).getByRole('alert').textContent).toContain('Sem conexão com a ARENA'))
    status = 0
    await ui.click(within(within(section).getByRole('alert')).getByRole('button', { name: 'Tentar novamente' }))
    expect(await within(section).findByText('Suas partidas encerradas, sem resultado ou canceladas aparecem aqui.')).not.toBeNull()
    expect(api.find('GET', '/me/matches?scope=historico')).toHaveLength(3)
  })
})

describe('leitura da placa (GET /me/play)', () => {
  it('lê ao montar, relê ao voltar o foco e só de tempos em tempos, e trata o 401', async () => {
    const { state, api } = world(playBoard())
    const onExpired = vi.fn()
    function Probe() {
      const { board, loading } = usePlayBoard(onExpired, true)
      return <output>{loading ? 'carregando' : board?.attention ? 'atenção' : 'calmo'}</output>
    }
    renderWithToaster(<Probe />)
    expect(await screen.findByText('calmo')).not.toBeNull()
    expect(api.find('GET', '/me/play')).toHaveLength(1)
    // Foco logo depois da leitura reaproveita a última.
    focusWindow()
    expect(api.find('GET', '/me/play')).toHaveLength(1)
    // Passado o intervalo, o foco relê e a placa nova acende a atenção.
    state.board = playBoard({ proposals: [proposal()] })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 10_000)
    focusWindow()
    vi.useRealTimers()
    expect(await screen.findByText('atenção')).not.toBeNull()
    expect(api.find('GET', '/me/play')).toHaveLength(2)
    // Uma resposta com erro não derruba a última placa; 401 avisa a sessão.
    mockApi({ 'GET /me/play': () => apiError(401, 'Sessão expirada.') })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 20_000)
    focusWindow()
    vi.useRealTimers()
    await waitFor(() => expect(onExpired).toHaveBeenCalled())
    expect(screen.getByText('atenção')).not.toBeNull()
  })

  it('relê a cada 15 s só enquanto há atenção', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    const { state, api } = world(playBoard())
    function Probe() {
      const { board } = usePlayBoard(vi.fn(), true)
      return <output>{board ? (board.attention ? 'atenção' : 'calmo') : 'carregando'}</output>
    }
    const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
    renderWithToaster(<Probe />)
    await tick(0)
    expect(screen.getByText('calmo')).not.toBeNull()
    const reads = () => api.find('GET', '/me/play').length
    expect(reads()).toBe(1)
    await tick(60_000)
    expect(reads()).toBe(1) // sem atenção, sem leitura periódica
    state.board = playBoard({ searches: [search()] })
    focusWindow()
    await tick(0)
    expect(reads()).toBe(2)
    expect(screen.getByText('atenção')).not.toBeNull()
    await tick(15_000)
    expect(reads()).toBe(3)
    await tick(30_000)
    expect(reads()).toBe(5)
    state.board = playBoard()
    await tick(15_000)
    expect(reads()).toBe(6)
    await tick(45_000)
    expect(reads()).toBe(6) // a atenção apagou: parou de ler
  })
})
