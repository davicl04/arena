import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, request } from '../src/api/client'
import { MatchTimeline } from '../src/components/profile-matches/MatchTimeline'
import { ShareStoryScreen } from '../src/components/share/ShareStoryScreen'
import { Toaster } from '../src/components/ui/toast'
import { match, run } from './timeline-fixtures'
import { coliseumSvg, fakeContext, FakePath2D, placement, shareMatch, shareRun } from './share-fixtures'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

const page = (items: unknown[]) => ({ items, next_cursor: null, total: items.length })

/** A linha do tempo responde `items`; as rotas do adesivo, `share` (ou o erro). */
function mockApi(items: unknown[], share: Record<string, unknown> = {}) {
  vi.mocked(request).mockImplementation(async path => {
    if (path.startsWith('/users/1/timeline')) return page(items) as never
    if (path === '/me/play') return { matches: [] } as never
    if (path in share) {
      const value = share[path]
      if (value instanceof Error) throw value
      return value as never
    }
    throw new ApiError('Rota inesperada.', 500)
  })
}

let canvas: ReturnType<typeof fakeContext>
beforeEach(() => {
  vi.mocked(request).mockReset()
  canvas = fakeContext()
  vi.stubGlobal('Path2D', FakePath2D)
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => coliseumSvg })))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => canvas.ctx as never)
})
afterEach(cleanup)

const renderTimeline = (props: Partial<React.ComponentProps<typeof MatchTimeline>> = {}) =>
  render(<MatchTimeline userId={1} own matches={null} onExpired={vi.fn()} {...props} />)

describe('linha do tempo: folha de ações', () => {
  it('abre a folha na partida compartilhável, com Compartilhar nos Stories e Ver partida', async () => {
    mockApi([match({ shareable: true })])
    const onOpenMatch = vi.fn()
    const ui = userEvent.setup()
    renderTimeline({ onOpenMatch })
    const card = await screen.findByRole('button', { name: 'Ações da partida: Ferrugem FC × Leões do Cerrado, Vitória' })
    expect(card.getAttribute('aria-haspopup')).toBe('dialog')
    await ui.click(card)
    const sheet = screen.getByRole('dialog', { name: 'Vitória · 3 × 1 · Society' })
    expect(within(sheet).getByText('Sua partida')).not.toBeNull()
    const share = within(sheet).getByRole('button', { name: 'Compartilhar nos Stories' })
    expect(document.activeElement).toBe(share)
    expect(onOpenMatch).not.toHaveBeenCalled()
    await ui.click(within(sheet).getByRole('button', { name: 'Ver partida' }))
    expect(onOpenMatch).toHaveBeenCalledWith(50)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('fecha a folha por Escape, pelo fundo e por Cancelar', async () => {
    mockApi([match({ shareable: true })])
    const ui = userEvent.setup()
    renderTimeline({ onOpenMatch: vi.fn() })
    const card = await screen.findByRole('button', { name: /Ações da partida/ })
    await ui.click(card)
    await ui.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    await ui.click(card)
    await ui.click(screen.getByTestId('sheet-scrim'))
    expect(screen.queryByRole('dialog')).toBeNull()
    await ui.click(card)
    await ui.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('leva a partida não compartilhável direto à tela da partida', async () => {
    mockApi([match({ shareable: false, state: 'sem_resultado', outcome: null, score: null, points: null })])
    const onOpenMatch = vi.fn()
    renderTimeline({ onOpenMatch })
    await userEvent.setup().click(await screen.findByRole('button', { name: /Abrir partida: Ferrugem FC × Leões do Cerrado, Sem resultado/ }))
    expect(onOpenMatch).toHaveBeenCalledWith(50)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('torna a corrida compartilhável tocável, com a folha só com o compartilhar', async () => {
    mockApi([run({ shareable: true })])
    const ui = userEvent.setup()
    renderTimeline({ onOpenMatch: vi.fn() })
    await ui.click(await screen.findByRole('button', { name: 'Ações da corrida: Corrida de 5 km em 24:12' }))
    const sheet = screen.getByRole('dialog', { name: 'Corrida · 24:12 · 5 km' })
    expect(within(sheet).getByText('Sua corrida')).not.toBeNull()
    expect(within(sheet).getByRole('button', { name: 'Compartilhar nos Stories' })).not.toBeNull()
    expect(within(sheet).queryByRole('button', { name: 'Ver partida' })).toBeNull()
  })

  it('não torna nada tocável no perfil visitado', async () => {
    mockApi([match({ shareable: true }), run({ shareable: true })])
    renderTimeline({ own: false, onOpenMatch: vi.fn() })
    await screen.findByRole('article', { name: 'Ferrugem FC × Leões do Cerrado' })
    expect(screen.getByRole('article', { name: 'Corrida de 5 km em 24:12' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: /Ações da|Abrir partida/ })).toBeNull()
  })
})

describe('tela imersiva', () => {
  it('abre pela folha com os dados reais e fecha de volta à linha do tempo', async () => {
    let resolve!: (value: unknown) => void
    mockApi([match({ shareable: true })], { '/me/share/matches/50': new Promise(done => { resolve = done }) })
    const ui = userEvent.setup()
    renderTimeline({ onOpenMatch: vi.fn() })
    await ui.click(await screen.findByRole('button', { name: /Ações da partida/ }))
    await ui.click(screen.getByRole('button', { name: 'Compartilhar nos Stories' }))
    const immersive = screen.getByRole('dialog', { name: 'Prévia do Story' })
    expect(within(immersive).getByRole('status').textContent).toContain('Carregando o adesivo')
    resolve(shareMatch())
    const preview = await within(immersive).findByRole('img')
    expect(preview.getAttribute('aria-label')).toBe('Adesivo de resultado: Resultado Vitória, Placar 3 × 1, Você 1 G · 1 A. Elo Prata, +3 pts, 3º na Prata · faltam 71 para Ouro.')
    await waitFor(() => expect(canvas.texts.map(item => item.text)).toContain('3º na Prata · faltam 71 para Ouro'))
    expect(request).toHaveBeenCalledTimes(2)
    expect(request).toHaveBeenCalledWith('/me/share/matches/50')
    expect(window.localStorage.length).toBe(0)
    await ui.click(within(immersive).getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: /Ações da partida/ })).not.toBeNull()
  })

  it('lê a corrida pela rota da corrida e fecha por Escape', async () => {
    mockApi([run({ shareable: true })], { '/me/share/runs/7': shareRun({ category: null, standard_distance_km: null }) })
    const ui = userEvent.setup()
    renderTimeline({ onOpenMatch: vi.fn() })
    await ui.click(await screen.findByRole('button', { name: /Ações da corrida/ }))
    await ui.click(screen.getByRole('button', { name: 'Compartilhar nos Stories' }))
    const preview = await screen.findByRole('img')
    expect(preview.getAttribute('aria-label')).toBe('Adesivo de resultado: Distância 5,02 km, Tempo 26:14, Ritmo 5:14 /km.')
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Prévia do Story' }), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('mostra o erro com "Tentar de novo" e recarrega', async () => {
    let calls = 0
    vi.mocked(request).mockImplementation(async () => {
      calls += 1
      if (calls === 1) throw new ApiError('Falha no servidor.', 500)
      return shareMatch({ category: placement({ ranking: 'futebol_individual' }) }) as never
    })
    render(<ShareStoryScreen target={{ kind: 'partida', id: 50 }} onClose={vi.fn()} onExpired={vi.fn()} />)
    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível carregar o adesivo')
    expect(screen.queryByRole('button', { name: 'Salvar só o adesivo' })).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect((await screen.findByRole('img')).getAttribute('aria-label')).toContain('Em classificação, 2 de 3 partidas.')
  })

  it('explica a atividade não encontrada (404) e volta à linha do tempo', async () => {
    vi.mocked(request).mockRejectedValue(new ApiError('Atividade não encontrada.', 404))
    const onClose = vi.fn()
    render(<ShareStoryScreen target={{ kind: 'partida', id: 99 }} onClose={onClose} onExpired={vi.fn()} />)
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByRole('heading', { name: 'Atividade não encontrada' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull()
    await userEvent.setup().click(within(alert).getByRole('button', { name: 'Voltar às partidas' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('segue o fluxo de sessão expirada no 401', async () => {
    vi.mocked(request).mockRejectedValue(new ApiError('Sessão expirada.', 401))
    const onExpired = vi.fn()
    render(<ShareStoryScreen target={{ kind: 'corrida', id: 7 }} onClose={vi.fn()} onExpired={onExpired} />)
    await waitFor(() => expect(onExpired).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('"Salvar só o adesivo" baixa o PNG 1080×1920 transparente', async () => {
    vi.mocked(request).mockResolvedValue(shareMatch() as never)
    const sizes: number[][] = []
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback, type) {
      sizes.push([this.width, this.height])
      callback(new Blob(['png'], { type }))
    })
    const createObjectURL = vi.fn(() => 'blob:adesivo')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const downloads: { name: string; href: string }[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloads.push({ name: this.download, href: this.href }) })
    render(<><ShareStoryScreen target={{ kind: 'partida', id: 50 }} onClose={vi.fn()} onExpired={vi.fn()} /><Toaster /></>)
    const ui = userEvent.setup()
    const save = await screen.findByRole('button', { name: 'Salvar só o adesivo' })
    await ui.click(save)
    expect((await screen.findAllByText('Imagem salva')).length).toBeGreaterThan(0)
    // O foco fica no botão (sem `disabled` durante a geração), e o Escape continua fechando a tela.
    expect(document.activeElement).toBe(save)
    expect(sizes).toEqual([[1080, 1920]])
    expect(createObjectURL).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/png' }))
    expect(downloads).toEqual([{ name: 'arena-adesivo-partida-50.png', href: 'blob:adesivo' }])
    // O PNG só limpa o quadro (transparente); o xadrez fica na prévia.
    expect(canvas.ctx.clearRect).toHaveBeenCalledWith(0, 0, 1080, 1920)
  })

  it('avisa quando o adesivo não pôde ser gerado', async () => {
    vi.mocked(request).mockResolvedValue(shareMatch() as never)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(null))
    render(<><ShareStoryScreen target={{ kind: 'partida', id: 50 }} onClose={vi.fn()} onExpired={vi.fn()} /><Toaster /></>)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Salvar só o adesivo' }))
    expect((await screen.findAllByText('Não foi possível salvar o adesivo')).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Salvar só o adesivo' }).getAttribute('aria-disabled')).toBe('false')
  })
})
