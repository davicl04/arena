import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { connection, RESTORED_MS } from '../src/api/connection'
import { ConnectionNotice } from '../src/components/ConnectionNotice'

afterEach(() => { cleanup(); vi.useRealTimers() })

/** O painel do app: a faixa e a folha são absolutas nele, e `--connection-dock` é definido nele. */
function Frame() {
  const [frame, setFrame] = useState<HTMLDivElement | null>(null)
  return <div ref={setFrame} data-testid="frame" className="relative"><ConnectionNotice frame={frame} /></div>
}
const strip = () => document.querySelector<HTMLElement>('[data-slot="connection-strip"]')
const dock = () => screen.getByTestId('frame').style.getPropertyValue('--connection-dock')

describe('aviso de conexão', () => {
  it('online: nada na tela e o toast não sobe', () => {
    render(<Frame />)
    expect(strip()).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(dock()).toBe('0px')
  })

  it('uma leitura que falha liga só a faixa (role status) e sobe o toast pela variável --connection-dock', () => {
    render(<Frame />)
    act(() => connection.lost({ mutating: false }))
    const bar = screen.getByRole('status')
    expect(bar).toBe(strip())
    expect(within(bar).getByText('Sem conexão com a ARENA')).toBeTruthy()
    expect(within(bar).getByText('Nova tentativa em 5 s.')).toBeTruthy()
    expect(within(bar).getByRole('button', { name: 'Tentar agora' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(dock()).toBe('52px')
  })

  it('uma ação que falha abre a folha modal, com o foco em "Tentar agora"', () => {
    render(<Frame />)
    act(() => connection.lost({ mutating: true }))
    const sheet = screen.getByRole('dialog', { name: 'Sem conexão com a ARENA' })
    expect(sheet.getAttribute('aria-modal')).toBe('true')
    expect(within(sheet).getByText(/Suas ações não chegam ao servidor agora\. Nova tentativa em 5 s\./)).toBeTruthy()
    expect(document.activeElement).toBe(within(sheet).getByRole('button', { name: 'Tentar agora' }))
    expect(within(sheet).getByRole('button', { name: 'Continuar sem conexão' })).toBeTruthy()
    expect(strip()).not.toBeNull()
  })

  it('"Continuar sem conexão" vira a faixa; uma nova ação não reabre a folha e faz a faixa tremer', async () => {
    render(<Frame />)
    act(() => connection.lost({ mutating: true }))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Continuar sem conexão' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(strip()?.getAttribute('data-nudged')).toBe('0')
    act(() => connection.lost({ mutating: true }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(strip()?.getAttribute('data-nudged')).toBe('1')
    act(() => connection.attempted())
    expect(strip()?.getAttribute('data-nudged')).toBe('2')
  })

  it('o tremor usa a animação da faixa, exceto com movimento reduzido', () => {
    const animate = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate })
    try {
      render(<Frame />)
      act(() => connection.lost({ mutating: true }))
      act(() => connection.dismissSheet())
      act(() => connection.attempted())
      expect(animate).toHaveBeenCalledTimes(1)
      vi.stubGlobal('matchMedia', () => ({ matches: true }))
      act(() => connection.attempted())
      expect(animate).toHaveBeenCalledTimes(1)
    } finally {
      delete (HTMLElement.prototype as { animate?: unknown }).animate
    }
  })

  it('Esc e o X da folha também dispensam', async () => {
    render(<Frame />)
    act(() => connection.lost({ mutating: true }))
    await userEvent.setup().keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(connection.getState().sheetDismissed).toBe(true)
  })

  it('a contagem acompanha o relógio e "Tentar agora" consulta o servidor e restabelece', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    const fetch = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetch)
    connection.configure({ healthUrl: 'http://localhost:8000/health/ready' })
    render(<Frame />)
    act(() => connection.lost({ mutating: false }))
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(within(screen.getByRole('status')).getByText('Nova tentativa em 3 s.')).toBeTruthy()
    fireClick(screen.getByRole('button', { name: 'Tentar agora' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: 'omit' })
    expect(within(screen.getByRole('status')).getByText('Conexão restabelecida')).toBeTruthy()
  })

  it('a conexão volta: "Conexão restabelecida" em menta por cerca de 2,5 s, a folha some e o toast desce', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    render(<Frame />)
    act(() => connection.lost({ mutating: true }))
    act(() => connection.reached())
    expect(screen.queryByRole('dialog')).toBeNull()
    const bar = screen.getByRole('status')
    expect(bar.getAttribute('data-state')).toBe('restored')
    expect(within(bar).getByText('Conexão restabelecida')).toBeTruthy()
    expect(within(bar).queryByRole('button', { name: 'Tentar agora' })).toBeNull()
    expect(dock()).toBe('52px')
    await act(async () => { await vi.advanceTimersByTimeAsync(RESTORED_MS) })
    expect(strip()).toBeNull()
    expect(dock()).toBe('0px')
    // Depois da volta, a próxima ação sem conexão abre a folha de novo.
    act(() => connection.lost({ mutating: true }))
    expect(screen.getByRole('dialog', { name: 'Sem conexão com a ARENA' })).toBeTruthy()
  })

  it('desmontar tira a variável do painel e os ouvintes da janela', () => {
    const { unmount } = render(<Frame />)
    const frame = screen.getByTestId('frame')
    unmount()
    expect(frame.style.getPropertyValue('--connection-dock')).toBe('')
  })
})

function fireClick(node: HTMLElement) {
  act(() => node.click())
}
