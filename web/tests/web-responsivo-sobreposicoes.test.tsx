import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { ProposalDialog } from '../src/components/play/ProposalDialog'
import { Glass } from '../src/components/ui/glass'
import { DialogContainerProvider } from '../src/components/ui/dialog'
import { Sheet } from '../src/components/ui/sheet'
import { proposal } from './matchmaking-fixtures'

/*
 * Sobreposições por faixa (ticket 02 da web responsiva). No celular (sem `matchMedia`, como nos demais testes) folhas e
 * telas cheias ficam onde a tela as renderiza; em tablet e computador entram por portal no `app-frame`, a tela cheia
 * ganha o fundo escurecido (que não fecha ao clique, como hoje) e o foco continua preso, com Escape e devolução do foco.
 */

/** Janela simulada para `matchMedia` (consultas `(min-width: Nrem)`, 1rem = 16 px). */
function viewport(width: number) {
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width:\s*([\d.]+)rem/.exec(query)
    return { matches: min ? width >= Number(min[1]) * 16 : false, media: query, addEventListener: () => {}, removeEventListener: () => {} }
  })
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

/** Uma tela com o botão que abre a sobreposição, dentro do provedor do `app-frame` (como no ArenaPage). */
function Screen({ overlay }: { overlay: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return <DialogContainerProvider container={frame}>
    <main data-testid="tela">
      <button type="button" onClick={() => setOpen(true)}>Abrir</button>
      {open && overlay(() => setOpen(false))}
    </main>
  </DialogContainerProvider>
}

const sheet = (close: () => void) => <Sheet title="Categoria" onClose={close}>
  <button type="button">Primeiro</button>
  <button type="button">Último</button>
</Sheet>
const glass = (close: () => void) => <Glass variant="screen" label="Ações da conta" onClose={close}>
  <button type="button">Bloquear</button>
</Glass>

describe('folha (Sheet)', () => {
  it('no celular fica dentro da tela, como hoje', async () => {
    render(<Screen overlay={sheet} />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    const dialog = screen.getByRole('dialog', { name: 'Categoria' })
    expect(within(screen.getByTestId('tela')).getByRole('dialog')).toBe(dialog)
    expect(frame.childElementCount).toBe(0)
  })

  it('em tela larga entra no app-frame, prende o Tab, fecha com Escape e devolve o foco', async () => {
    viewport(1440)
    render(<Screen overlay={sheet} />)
    const opener = screen.getByRole('button', { name: 'Abrir' })
    await userEvent.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Categoria' })
    expect(frame.contains(dialog)).toBe(true)
    expect(screen.getByTestId('tela').contains(dialog)).toBe(false)
    expect(frame.querySelector('[data-slot="sheet-scrim"]')).not.toBeNull()

    // Tab circula dentro da folha: Fechar → Primeiro → Último → Fechar.
    const close = within(dialog).getByRole('button', { name: 'Fechar' })
    close.focus()
    await userEvent.tab()
    await userEvent.tab()
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Último' }))
    await userEvent.tab()
    expect(document.activeElement).toBe(close)

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('em tela larga fecha ao clicar no fundo, como no celular', async () => {
    viewport(768)
    render(<Screen overlay={sheet} />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    await userEvent.click(frame.querySelector<HTMLElement>('[data-slot="sheet-scrim"]')!)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('tela cheia (Glass screen)', () => {
  it('no celular não tem fundo escurecido próprio e fica dentro da tela', async () => {
    render(<Screen overlay={glass} />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(within(screen.getByTestId('tela')).queryByRole('dialog', { name: 'Ações da conta' })).not.toBeNull()
    expect(document.querySelector('[data-slot="overlay-scrim"]')).toBeNull()
  })

  it('em tela larga vira painel no app-frame sobre um fundo que não fecha ao clique; Escape fecha e devolve o foco', async () => {
    viewport(1024)
    render(<Screen overlay={glass} />)
    const opener = screen.getByRole('button', { name: 'Abrir' })
    await userEvent.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Ações da conta' })
    expect(frame.contains(dialog)).toBe(true)
    const scrim = frame.querySelector<HTMLElement>('[data-slot="overlay-scrim"]')!
    expect(scrim.getAttribute('aria-hidden')).toBe('true')
    await userEvent.click(scrim)
    expect(screen.queryByRole('dialog', { name: 'Ações da conta' })).not.toBeNull()

    dialog.focus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })
})

describe('tela cheia em Dialog (proposta)', () => {
  const renderProposal = (onLater: () => void) => render(<DialogContainerProvider container={frame}>
    <ProposalDialog proposal={proposal()} onLater={onLater} onAnswer={vi.fn()} onOpenMatch={vi.fn()} onElapsed={vi.fn()} onExpired={vi.fn()} />
  </DialogContainerProvider>)

  it('em tela larga o clique no fundo não responde depois (como no celular, sem fundo à vista); Escape sim', async () => {
    viewport(1440)
    const onLater = vi.fn()
    renderProposal(onLater)
    const dialog = await screen.findByTestId('proposal-dialog')
    expect(frame.contains(dialog)).toBe(true)
    const overlay = frame.querySelector<HTMLElement>('[data-slot="dialog-overlay"]')!
    await act(async () => {
      fireEvent.pointerDown(overlay)
      fireEvent.mouseDown(overlay)
      fireEvent.click(overlay)
    })
    expect(onLater).not.toHaveBeenCalled()
    await userEvent.keyboard('{Escape}')
    expect(onLater).toHaveBeenCalledTimes(1)
  })
})
