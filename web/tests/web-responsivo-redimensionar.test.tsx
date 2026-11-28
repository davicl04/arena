import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { request } from '../src/api/client'
import type { Post, SocialUser } from '../src/api/client'
import PostViewer from '../src/components/PostViewer'
import { DialogContainerProvider } from '../src/components/ui/dialog'
import { Sheet } from '../src/components/ui/sheet'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

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

describe('visualizador de fotos aberto ao redimensionar', () => {
  const me: SocialUser = { id: 1, name: 'Eu Mesmo', username: 'eu.mesmo', avatar_url: null, cover_url: null, social_public: true,
    post_count: 3, follower_count: 0, following_count: 0, follows_you: false, follow_state: 'self' }
  const post = (id: number): Post => ({ id, author: me, caption: `Foto ${id}`, image_url: `/posts/${id}/image`,
    created_at: '2026-10-10T10:00:00Z', like_count: 0, comment_count: 0, liked_by_me: false, can_edit: true })

  /** Cada post tem 100 px e começa em id × 100 dentro do contêiner rolável. */
  function layoutPosts() {
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) { return Number(this.dataset.postId ?? 0) * 100 })
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.dataset.postId ? 100 : 0 })
  }

  it('cruzar 768 px nos dois sentidos mantém a foto e leva a paginação ao contêiner novo, sem pedir de novo', () => {
    layoutPosts()
    const observers: { callback: (entries: { isIntersecting: boolean }[]) => void; root: Element | null; nodes: Element[]; connected: boolean }[] = []
    vi.stubGlobal('IntersectionObserver', class {
      entry
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void, options: { root: Element | null }) {
        this.entry = { callback, root: options.root, nodes: [] as Element[], connected: true }
        observers.push(this.entry)
      }
      observe(node: Element) { this.entry.nodes.push(node) }
      disconnect() { this.entry.connected = false }
    })
    const onLoadMore = vi.fn()
    const window = viewport(1440)
    render(<DialogContainerProvider container={frame}>
      <main data-testid="tela">
        <PostViewer username="eu.mesmo" posts={[post(7), post(8), post(9)]} initialPostId={8} viewerId={1} hasMore busy={false} moreError=""
          onLoadMore={onLoadMore} onUpdate={vi.fn()} onRemoved={vi.fn()} onClose={vi.fn()} onExpired={vi.fn()} />
      </main>
    </DialogContainerProvider>)
    const scroller = () => screen.getByTestId('viewer-scroll')
    /** O único observador ativo: observa o botão de carregar mais do contêiner atual, com ele como raiz. */
    function activeObserver() {
      const active = observers.filter(entry => entry.connected)
      expect(active).toHaveLength(1)
      const [entry] = active
      expect(entry.root).toBe(scroller())
      expect(entry.nodes).toHaveLength(1)
      expect(entry.nodes[0].isConnected && scroller().contains(entry.nodes[0])).toBe(true)
      return entry
    }

    const wide = scroller()
    expect(frame.contains(wide)).toBe(true)
    expect(wide.scrollTop).toBe(800)
    activeObserver()

    // A pessoa rola até a metade da terceira foto.
    wide.scrollTop = 950
    fireEvent.scroll(wide)

    window.resize(600)
    const narrow = scroller()
    expect(narrow).not.toBe(wide)
    expect(frame.contains(narrow)).toBe(false)
    expect(narrow.scrollTop).toBe(950)
    const afterNarrow = activeObserver()
    expect(onLoadMore).not.toHaveBeenCalled()
    act(() => afterNarrow.callback([{ isIntersecting: true }]))
    expect(onLoadMore).toHaveBeenCalledTimes(1)

    window.resize(1024)
    const back = scroller()
    expect(frame.contains(back)).toBe(true)
    expect(back.scrollTop).toBe(950)
    activeObserver()
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  /** Galeria mínima: o visualizador tira da lista a foto excluída, como a galeria do perfil. */
  function Gallery({ initialPostId }: { initialPostId: number }) {
    const [items, setItems] = useState([post(7), post(8), post(9)])
    return <DialogContainerProvider container={frame}>
      <main data-testid="tela">
        <PostViewer username="eu.mesmo" posts={items} initialPostId={initialPostId} viewerId={1} hasMore={false} busy={false} moreError=""
          onLoadMore={vi.fn()} onUpdate={vi.fn()} onRemoved={id => setItems(list => list.filter(item => item.id !== id))} onClose={vi.fn()} onExpired={vi.fn()} />
      </main>
    </DialogContainerProvider>
  }

  it.each([
    ['do meio', 8, 9],
    ['a última', 9, 8],
  ])('excluir a foto aberta (%s) sem rolar e cruzar 768 px abre o contêiner novo na foto vizinha', async (_label, opened, neighbour) => {
    layoutPosts()
    vi.mocked(request).mockResolvedValue(undefined as never)
    const window = viewport(1440)
    const user = userEvent.setup()
    render(<Gallery initialPostId={opened} />)
    expect(screen.getByTestId('viewer-scroll').scrollTop).toBe(opened * 100)

    const article = screen.getByText(`Foto ${opened}`).closest('article')!
    await user.click(within(article).getByRole('button', { name: 'Ações da publicação' }))
    await user.click(screen.getByRole('button', { name: 'Excluir' }))
    await user.click(screen.getByRole('button', { name: 'Excluir' }))
    expect(request).toHaveBeenCalledWith(`/posts/${opened}`, 'DELETE')
    await waitFor(() => expect(screen.queryByText(`Foto ${opened}`)).toBeNull())

    window.resize(600)
    const narrow = screen.getByTestId('viewer-scroll')
    expect(frame.contains(narrow)).toBe(false)
    expect(narrow.scrollTop).toBe(neighbour * 100)
  })
})
