import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { DialogContainerProvider } from '../src/components/ui/dialog'
import { Sheet } from '../src/components/ui/sheet'

/*
 * Redimensionar a janela com uma folha aberta (verificação final da web responsiva, ticket 10). Cruzar 768 px remonta a
 * folha noutro lugar da árvore (dentro da tela no celular, por portal no `app-frame` em tela larga); o foco tem de
 * continuar nela, para o Escape fechar e o Tab continuar preso.
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
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
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

let frame: HTMLDivElement
beforeEach(() => {
  frame = document.createElement('div')
  frame.dataset.slot = 'app-frame'
  document.body.append(frame)
})
afterEach(() => {
  cleanup()
  frame.remove()
  vi.unstubAllGlobals()
})

function Screen() {
  const [open, setOpen] = useState(false)
  return <DialogContainerProvider container={frame}>
    <main data-testid="tela">
      <button type="button" onClick={() => setOpen(true)}>Abrir</button>
      {open && <Sheet title="Visibilidade" onClose={() => setOpen(false)}>
        <button type="button">Primeiro</button>
        <button type="button">Último</button>
      </Sheet>}
    </main>
  </DialogContainerProvider>
}

describe('folha aberta ao redimensionar', () => {
  it.each([
    ['do computador para o celular', 1440, 600],
    ['do celular para o tablet', 390, 900],
  ])('%s: a folha muda de lugar e o foco continua nela', async (_label, from, to) => {
    const window = viewport(from)
    render(<Screen />)
    const opener = screen.getByRole('button', { name: 'Abrir' })
    await userEvent.click(opener)
    expect(screen.getByRole('dialog', { name: 'Visibilidade' }).contains(document.activeElement)).toBe(true)

    window.resize(to)
    const dialog = screen.getByRole('dialog', { name: 'Visibilidade' })
    expect(frame.contains(dialog)).toBe(to >= 768)
    expect(dialog.contains(document.activeElement)).toBe(true)

    // O Tab continua preso na folha e o Escape a fecha, devolvendo o foco a quem a abriu.
    within(dialog).getByRole('button', { name: 'Último' }).focus()
    await userEvent.tab()
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Fechar' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('sem cruzar 768 px a folha não remonta e o foco fica onde estava', async () => {
    const window = viewport(1440)
    render(<Screen />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    const dialog = screen.getByRole('dialog', { name: 'Visibilidade' })
    const first = within(dialog).getByRole('button', { name: 'Primeiro' })
    first.focus()
    window.resize(900)
    expect(screen.getByRole('dialog', { name: 'Visibilidade' })).toBe(dialog)
    expect(document.activeElement).toBe(first)
  })
})
