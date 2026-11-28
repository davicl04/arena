import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import { request } from '../src/api/client'
import EventManagePage from '../src/pages/EventManagePage'
import EventPage from '../src/pages/EventPage'
import { detail, eventDetail } from './events-fixtures'
import { renderWithToaster } from './toast-utils'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

/*
 * Subtelas de eventos em tela larga (ticket 09 da web responsiva): o Evento e a Gestão do evento ganham duas colunas só
 * no computador (estrutura pelo gancho `useLayout`); no celular e no tablet o DOM é o de sempre, em coluna única.
 */

/* Janela simulada para `matchMedia` (como em web-responsivo-layout.test.tsx): casa `(min-width: Nrem)` pela largura. */
function viewport(width: number) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      const min = /min-width:\s*([\d.]+)rem/.exec(query)
      return min ? width >= Number(min[1]) * 16 : false
    },
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

const emptyPage = { items: [], next_cursor: null }
const bar = () => document.querySelector<HTMLElement>('[data-slot="entry-bar"]')

function renderEvent() {
  // Evento gratuito, sem inscrição de quem vê: barra "Inscrever-se · Grátis".
  vi.mocked(request).mockImplementation(async path => (path === '/events/1' ? detail({ price_cents: 0, pix: null }) : emptyPage) as never)
  renderWithToaster(<EventPage eventId={1} onTeams={vi.fn()} onExpired={vi.fn()} />)
}

function renderManage() {
  const event = eventDetail()
  vi.mocked(request).mockImplementation(async (path, method) => (path === `/organizer/events/${event.id}` && !method ? event : emptyPage) as never)
  renderWithToaster(<EventManagePage eventId={event.id} onBack={vi.fn()} onEdit={vi.fn()} onReceipts={vi.fn()} onBracket={vi.fn()} onMatches={vi.fn()}
    onDeleted={vi.fn()} onExpired={vi.fn()} />)
}

beforeEach(() => { vi.mocked(request).mockReset(); Element.prototype.scrollTo = () => {} })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Evento (D2) por faixa', () => {
  it('celular: coluna única, sem medida própria, com a barra de inscrição depois das abas', async () => {
    renderEvent()
    await screen.findByRole('tablist')
    const root = document.querySelector<HTMLElement>('[data-event]')!
    expect(root.hasAttribute('data-largura')).toBe(false)
    expect(document.querySelector('[data-slot="evento-colunas"]')).toBeNull()
    expect(bar()?.parentElement).toBe(root)
    expect(bar()?.textContent).toContain('Inscrever-se · Grátis')
  })

  it('tablet: ainda em coluna única na coluna de leitura', async () => {
    viewport(900)
    renderEvent()
    await screen.findByRole('tablist')
    expect(document.querySelector('[data-event]')?.hasAttribute('data-largura')).toBe(false)
    expect(document.querySelector('[data-slot="evento-colunas"]')).toBeNull()
    expect(bar()?.parentElement).toBe(document.querySelector('[data-event]'))
  })

  it('computador: medida larga em duas colunas, com o cartaz e a barra de um lado e as abas do outro', async () => {
    viewport(1440)
    renderEvent()
    const tabs = await screen.findByRole('tablist')
    expect(document.querySelector('[data-event]')?.getAttribute('data-largura')).toBe('larga')
    const columns = document.querySelector<HTMLElement>('[data-slot="evento-colunas"]')!
    const [side, main] = Array.from(columns.children) as HTMLElement[]
    expect(within(side).getByRole('heading', { level: 2, name: 'Copa Sudoeste' })).not.toBeNull()
    expect(side.contains(bar())).toBe(true)
    expect(main.contains(tabs)).toBe(true)
    expect(main.contains(screen.getByRole('tabpanel'))).toBe(true)
    // Sem o espaço reservado à barra presa na base, que só existe no celular e no tablet.
    expect(document.querySelector('[data-event] > [aria-hidden="true"].h-16')).toBeNull()
  })
})

describe('Gestão do evento (G3) por faixa', () => {
  it('celular e tablet: cartão "Agora", seções e avisos em sequência, numa coluna', async () => {
    viewport(900)
    renderManage()
    expect(await screen.findByRole('heading', { name: /Avisos do evento/ })).not.toBeNull()
    expect(document.querySelector('[data-slot="gestao-colunas"]')).toBeNull()
  })

  it('computador: "Agora" e as seções numa coluna; avisos e cancelar na outra', async () => {
    viewport(1440)
    renderManage()
    const notices = await screen.findByRole('heading', { name: /Avisos do evento/ })
    const columns = document.querySelector<HTMLElement>('[data-slot="gestao-colunas"]')!
    const [summary, channel] = Array.from(columns.children) as HTMLElement[]
    expect(summary.querySelector('[data-slot="next-action"]')).not.toBeNull()
    expect(within(summary).getByRole('heading', { name: 'Seções' })).not.toBeNull()
    expect(channel.contains(notices)).toBe(true)
    expect(within(channel).getByRole('button', { name: /Cancelar evento/ })).not.toBeNull()
  })
})
