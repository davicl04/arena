import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import HomePage from '../src/pages/HomePage'
import { mockApi } from './teams-fixtures'
import { summaryOf } from './notifications-fixtures'

/*
 * Início em tela larga (ticket 03 da web responsiva). A estrutura muda por faixa pelo gancho `useLayout`: no celular
 * (sem `matchMedia`, como em todos os outros testes) o cabeçalho com a marca e o sino e os blocos numa coluna; em tablet
 * e computador, a medida larga, sem a marca (a navegação lateral já a mostra) e com os blocos em duas colunas.
 */

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** `matchMedia` simulado: `(min-width: Nrem)` casa pela largura atual (1rem = 16 px) e avisa os ouvintes ao redimensionar. */
function viewport(width: number) {
  let current = width
  const listeners = new Set<() => void>()
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      const min = /min-width:\s*([\d.]+)rem/.exec(query)
      return min ? current >= Number(min[1]) * 16 : false
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }))
  return {
    resize(next: number) {
      current = next
      act(() => { for (const listener of [...listeners]) listener() })
    },
  }
}

/** Conta sem perfis esportivos (o "preparar perfis"): sem leitura de campeonatos. */
function renderHome() {
  mockApi({ 'GET /me/notifications/summary': summaryOf({ unread_count: 2 }) })
  const go = vi.fn()
  const { container } = render(<HomePage firstName="Caio" profiles={[]} loading={false} go={go} onExpired={vi.fn()} />)
  return { container, go }
}

const brand = () => screen.queryByText('arena', { selector: 'strong' })
const bell = () => screen.queryByRole('button', { name: /^Notificações/ })

describe('Início por faixa', () => {
  it('celular: cabeçalho com a marca e o sino; os blocos numa coluna, sem a medida larga', () => {
    const { container } = renderHome()
    expect(brand()).not.toBeNull()
    expect(bell()).not.toBeNull()
    expect(container.querySelector('[data-largura]')).toBeNull()
    expect(container.querySelector('[data-slot="home-colunas"]')).toBeNull()
    // Ordem de hoje: cabeçalho, saudação, Placar, Jogar, Seu elo, próximo passo, campeonatos.
    expect(container.firstElementChild?.tagName).toBe('HEADER')
    expect(screen.getAllByRole('heading').map(heading => heading.textContent)).toEqual([
      'A arena te chama, Caio', 'Nenhuma partida agendada', 'Seu elo', 'Seu próximo passo', 'Perto de você',
    ])
  })

  it('computador: medida larga, sem a marca nem o sino; saudação no topo e duas colunas (agenda | progresso)', () => {
    viewport(1440)
    const { container, go } = renderHome()
    expect(brand()).toBeNull()
    expect(bell()).toBeNull()
    const root = container.firstElementChild as HTMLElement
    expect(root.dataset.largura).toBe('larga')
    expect(root.querySelector('header')).toBeNull()
    expect(within(root).getAllByRole('heading')[0].textContent).toBe('A arena te chama, Caio')
    const agenda = root.querySelector<HTMLElement>('[data-slot="home-agenda"]')!
    const progress = root.querySelector<HTMLElement>('[data-slot="home-progresso"]')!
    expect(agenda.parentElement).toBe(progress.parentElement)
    expect(agenda.querySelector('[data-slot="placar"]')).not.toBeNull()
    within(agenda).getByRole('button', { name: 'Preparar perfis' }).click()
    expect(go).toHaveBeenCalledWith('play')
    expect(within(progress).getAllByRole('heading').map(heading => heading.textContent)).toEqual(['Seu elo', 'Seu próximo passo', 'Perto de você'])
    expect(within(agenda).queryByTestId('pilulas')).toBeNull()
  })

  it('tablet usa a mesma composição; ao voltar para o celular, o cabeçalho com a marca reaparece', () => {
    const screenSize = viewport(800)
    const { container } = renderHome()
    expect(container.querySelector('[data-largura="larga"] [data-slot="home-colunas"]')).not.toBeNull()
    expect(brand()).toBeNull()
    screenSize.resize(390)
    expect(container.querySelector('[data-largura]')).toBeNull()
    expect(brand()).not.toBeNull()
    expect(bell()).not.toBeNull()
  })
})
