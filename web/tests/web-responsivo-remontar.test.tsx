import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { request } from '../src/api/client'
import { TeamCardCarousel } from '../src/components/teams/TeamCardCarousel'
import EventManagePage from '../src/pages/EventManagePage'
import EventPage from '../src/pages/EventPage'
import MenuPage from '../src/pages/MenuPage'
import { detail, eventDetail } from './events-fixtures'
import { team } from './teams-fixtures'
import { renderWithToaster } from './toast-utils'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

/*
 * Redimensionar a janela cruzando 1024 px (revisão da web responsiva): as telas com duas colunas no computador mantêm
 * os componentes com estado no mesmo lugar da árvore, para o que a pessoa estava fazendo (rascunho, confirmação aberta,
 * listas já carregadas) não se perder; e o carrossel de Meus times recentraliza o escolhido ao voltar ao celular.
 */

/** Janela simulada para `matchMedia` (consultas `(min-width: Nrem)`, 1rem = 16 px) que avisa os ouvintes ao redimensionar. */
function viewport(width: number) {
  let current = width
  const listeners = new Set<() => void>()
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width:\s*([\d.]+)rem/.exec(query)
    return {
      get matches() { return min ? current >= Number(min[1]) * 16 : false },
      media: query,
      addEventListener: (_type: string, listener: () => void) => { if (min) listeners.add(listener) },
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    }
  })
  return {
    resize(next: number) {
      current = next
      act(() => { for (const listener of [...listeners]) listener() })
    },
  }
}

const emptyPage = { items: [], next_cursor: null }
const noop = () => {}
const calls = (prefix: string) => vi.mocked(request).mock.calls.filter(([path, method]) => String(path).startsWith(prefix) && !method).length

beforeEach(() => { vi.mocked(request).mockReset(); Element.prototype.scrollTo = () => {} })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Gestão do evento ao cruzar 1024 px', () => {
  it.each([
    ['do computador para o celular', 1440, 390],
    ['do tablet para o computador', 900, 1280],
  ])('%s: o rascunho do aviso continua e os avisos não são lidos de novo', async (_label, from, to) => {
    const window = viewport(from)
    const event = eventDetail()
    vi.mocked(request).mockImplementation(async (path, method) => (path === `/organizer/events/${event.id}` && !method ? event : emptyPage) as never)
    renderWithToaster(<EventManagePage eventId={event.id} onBack={noop} onEdit={noop} onReceipts={noop} onBracket={noop} onMatches={noop}
      onDeleted={noop} onExpired={noop} />)
    const field = await screen.findByLabelText('Novo aviso')
    await screen.findByText('Nenhum aviso ainda.')
    await userEvent.type(field, 'Primeira rodada às 9h')
    const reads = calls(`/events/${event.id}/messages`)

    window.resize(to)
    expect(document.querySelector('[data-slot="gestao-colunas"]') !== null).toBe(to >= 1024)
    expect(screen.getByLabelText('Novo aviso')).toBe(field)
    expect(field).toHaveProperty('value', 'Primeira rodada às 9h')
    expect(calls(`/events/${event.id}/messages`)).toBe(reads)
  })
})

describe('Evento ao cruzar 1024 px', () => {
  it('os avisos e as abas ficam no mesmo lugar e a barra de inscrição muda de coluna', async () => {
    const window = viewport(390)
    vi.mocked(request).mockImplementation(async path => (path === '/events/1' ? detail({ price_cents: 0, pix: null, can_read_messages: true }) : emptyPage) as never)
    renderWithToaster(<EventPage eventId={1} onTeams={noop} onExpired={noop} />)
    const tabs = await screen.findByRole('tablist')
    await screen.findByText(/Nenhum aviso/)
    const reads = calls('/events/1/messages')
    expect(reads).toBe(1)

    window.resize(1440)
    const columns = document.querySelector<HTMLElement>('[data-slot="evento-colunas"]')!
    const [side, main] = Array.from(columns.children) as HTMLElement[]
    expect(screen.getByRole('tablist')).toBe(tabs)
    expect(main.contains(tabs)).toBe(true)
    expect(side.contains(document.querySelector('[data-slot="entry-bar"]'))).toBe(true)
    expect(calls('/events/1/messages')).toBe(reads)

    window.resize(600)
    expect(screen.getByRole('tablist')).toBe(tabs)
    expect(document.querySelector('[data-slot="entry-bar"]')?.parentElement).toBe(document.querySelector('[data-event]'))
    expect(calls('/events/1/messages')).toBe(reads)
  })
})

describe('Folhas da barra de inscrição do Evento ao cruzar 1024 px', () => {
  it.each([
    ['inscrição, do celular para o computador', /^Inscrever/, 390, 1440],
    ['inscrição, do computador para o tablet', /^Inscrever/, 1440, 900],
    ['pagamento, do celular para o computador', 'Informações de pagamento', 390, 1440],
    ['pagamento, do computador para o celular', 'Informações de pagamento', 1440, 390],
  ])('%s: fechar com Esc devolve o foco ao botão da barra atual', async (_label, button, from, to) => {
    const window = viewport(from)
    vi.mocked(request).mockImplementation(async path => (path === '/events/1' ? detail() : emptyPage) as never)
    renderWithToaster(<EventPage eventId={1} onTeams={noop} onExpired={noop} />)
    const bar = () => document.querySelector<HTMLElement>('[data-slot="entry-bar"]')!
    await screen.findByRole('tablist')
    const opener = within(bar()).getByRole('button', { name: button })
    await userEvent.click(opener)
    expect(screen.getByRole('dialog')).toBeTruthy()

    window.resize(to)
    const current = within(bar()).getByRole('button', { name: button })
    expect(current).not.toBe(opener)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(current)
  })
})

describe('Menu ao cruzar 1024 px', () => {
  it('a confirmação de cancelar o pedido de organizador continua aberta', async () => {
    const window = viewport(1440)
    vi.mocked(request).mockImplementation(async path => {
      if (path === '/me/organizer-request') return { state: 'em_analise', request: { created_at: '2026-11-20T12:00:00Z' }, organizer: null, revocation: null } as never
      return emptyPage as never
    })
    render(<MenuPage isAdmin={false} busy={false} onEditProfile={noop} onSports={noop} onModeration={noop}
      onOrganizerRequest={noop} onOrganizerRequests={noop} onPaidEvents={noop} onRevokedEvents={noop} onRefundDisputes={noop}
      onCourtSuggestions={noop} onWalkoverDisputes={noop} onOrganizerEvents={noop} onOpenEvent={noop} onNewEvent={noop}
      onNotifications={noop} onLogout={noop} onExpired={noop} />)
    const card = await screen.findByRole('region', { name: 'Organizar no Arena' })
    await userEvent.click(within(card).getByRole('button', { name: 'Cancelar pedido' }))
    expect(within(card).getByText('Cancelar o pedido em análise?')).toBeTruthy()

    window.resize(390)
    expect(document.querySelector('[data-slot="menu-colunas"]')).toBeNull()
    expect(screen.getByRole('region', { name: 'Organizar no Arena' })).toBe(card)
    expect(within(card).getByText('Cancelar o pedido em análise?')).toBeTruthy()
    expect(calls('/me/organizer-request')).toBe(1)
  })
})

describe('Carteirinhas de Meus times ao voltar ao celular', () => {
  it('da grade para o carrossel, a escolhida volta ao centro', () => {
    const window = viewport(1440)
    const teams = [team(), team({ id: 11, name: 'Cerrado FC', initials: 'CF' })]
    const scrollTo = vi.fn()
    Element.prototype.scrollTo = scrollTo
    render(<TeamCardCarousel teams={teams} selectedId={11} onSelect={noop} onCreate={noop} onInvite={noop} onLink={noop} onEdit={noop} onLeave={noop} />)
    scrollTo.mockClear()

    window.resize(390)
    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(scrollTo.mock.contexts[0]).toBe(screen.getByRole('group', { name: 'Cerrado FC, 2 de 2' }).parentElement)
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }))
  })
})
