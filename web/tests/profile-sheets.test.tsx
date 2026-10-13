import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { User } from '../src/api/client'
import { Sheet } from '../src/components/ui/sheet'
import { CoverSheet, NameSheet, UsernameSheet, VisibilitySheet } from '../src/components/EditSheets'
import { findToast, queryToast, renderWithToaster } from './toast-utils'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(),
  apiUrl: (path: string) => path,
}))
vi.mock('react-easy-crop', () => ({
  default: ({ onCropComplete, aspect }: { onCropComplete: (area: unknown, pixels: { x: number; y: number; width: number; height: number }) => void; aspect: number }) =>
    <button type="button" aria-label="Selecionar recorte" data-aspect={aspect} onClick={() => onCropComplete({}, { x: 0, y: 0, width: 50, height: 20 })} />,
}))

const user: User = { id: 1, name: 'Atleta Arena', username: 'atleta.arena', email: 'a@example.com', birth_date: '1995-01-01',
  social_public: false, is_admin: false, avatar: null, cover: null }
const handlers = () => ({ onUser: vi.fn(), onExpired: vi.fn(), onClose: vi.fn(), onSaved: vi.fn() })

beforeEach(() => { vi.mocked(request).mockReset() })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Sheet (folhas de Editar perfil)', () => {
  function Harness({ onClose }: { onClose: () => void }) {
    const [open, setOpen] = useState(false)
    return <>
      <button onClick={() => setOpen(true)}>Abrir</button>
      {open && <Sheet title="Exemplo" onClose={() => { onClose(); setOpen(false) }}>
        <input aria-label="Campo" data-autofocus /><button>Ação</button>
      </Sheet>}
    </>
  }

  it('é um diálogo modal, prende o foco, fecha com Esc e devolve o foco', async () => {
    const onClose = vi.fn()
    const ui = userEvent.setup()
    renderWithToaster(<Harness onClose={onClose} />)
    const opener = screen.getByRole('button', { name: 'Abrir' })
    await ui.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Exemplo' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(screen.getByLabelText('Campo'))
    await ui.tab(); await ui.tab(); await ui.tab()
    await ui.tab()
    expect(dialog.contains(document.activeElement)).toBe(true)
    await ui.tab({ shift: true })
    expect(dialog.contains(document.activeElement)).toBe(true)
    await ui.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('fecha ao tocar no fundo e pelo botão Fechar', async () => {
    const onClose = vi.fn()
    const ui = userEvent.setup()
    renderWithToaster(<Sheet title="Exemplo" onClose={onClose}><p>conteúdo</p></Sheet>)
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
    await ui.click(screen.getByTestId('sheet-scrim'))
    await ui.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

describe('NameSheet', () => {
  it('valida o tamanho e salva o nome', async () => {
    const h = handlers()
    vi.mocked(request).mockResolvedValue({ ...user, name: 'Novo Nome' } as never)
    renderWithToaster(<NameSheet user={user} {...h} />)
    const input = screen.getByLabelText('Nome completo')
    fireEvent.change(input, { target: { value: 'A' } })
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(input, { target: { value: 'Novo Nome' } })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(h.onSaved).toHaveBeenCalledWith('Nome atualizado.'))
    expect(request).toHaveBeenCalledWith('/me', 'PATCH', { name: 'Novo Nome' })
    expect(h.onUser).toHaveBeenCalledWith(expect.objectContaining({ name: 'Novo Nome' }))
  })
})

describe('UsernameSheet', () => {
  const type = (value: string) => fireEvent.change(screen.getByRole('textbox', { name: 'Nome de usuário' }), { target: { value } })
  const settle = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }

  it('mostra as regras ao vivo e não consulta o servidor com formato inválido', async () => {
    vi.useFakeTimers()
    renderWithToaster(<UsernameSheet user={user} {...handlers()} />)
    type('.a')
    expect(screen.getByText('Formato inválido. Revise as regras abaixo.')).toBeTruthy()
    const rules = screen.getByRole('list', { name: 'Regras do nome de usuário' })
    expect(rules.querySelectorAll('li[data-state="bad"]').length).toBe(2)
    expect(rules.querySelector('li[data-state="ok"]')?.textContent).toContain('Apenas letras minúsculas')
    await settle(1000)
    expect(request).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('espera 400 ms antes de verificar, normaliza o @ e salva quando disponível', async () => {
    vi.useFakeTimers()
    const h = handlers()
    vi.mocked(request).mockImplementation(async (path, method) => {
      if (method === 'PATCH') return { ...user, username: 'novo.user' } as never
      return { available: true, reason: null, suggestions: [] } as never
    })
    renderWithToaster(<UsernameSheet user={user} {...h} />)
    type('@No')
    type('@Novo.User')
    expect((screen.getByRole('textbox', { name: 'Nome de usuário' }) as HTMLInputElement).value).toBe('novo.user')
    await settle(399)
    expect(request).not.toHaveBeenCalled()
    await settle(1)
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('/me/username-availability?u=novo.user')
    expect(screen.getByText('@novo.user está disponível.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await settle(0)
    expect(request).toHaveBeenCalledWith('/me', 'PATCH', { username: 'novo.user' })
    expect(h.onSaved).toHaveBeenCalledWith('Nome de usuário atualizado.')
    expect(screen.getByText(/mesmo com a conta privada/)).toBeTruthy()
  })

  it('oferece sugestões clicáveis quando o nome está em uso', async () => {
    vi.useFakeTimers()
    vi.mocked(request).mockImplementation(async (path) => {
      return (path.endsWith('=ocupado')
        ? { available: false, reason: 'taken', suggestions: ['ocupado1', 'ocupado.fit'] }
        : { available: true, reason: null, suggestions: [] }) as never
    })
    renderWithToaster(<UsernameSheet user={user} {...handlers()} />)
    type('ocupado')
    await settle(400)
    expect(screen.getByText('@ocupado já está em uso.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '@ocupado.fit' }))
    expect((screen.getByRole('textbox', { name: 'Nome de usuário' }) as HTMLInputElement).value).toBe('ocupado.fit')
    await settle(400)
    expect(screen.getByText('@ocupado.fit está disponível.')).toBeTruthy()
  })

  it('trata 409 ao salvar como nome em uso sem fechar a folha', async () => {
    vi.useFakeTimers()
    const h = handlers()
    vi.mocked(request).mockImplementation(async (path, method) => {
      if (method === 'PATCH') throw new ApiError('Este nome de usuário já está em uso.', 409)
      return { available: true, reason: null, suggestions: [] } as never
    })
    renderWithToaster(<UsernameSheet user={user} {...h} />)
    type('corrida')
    await settle(400)
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await settle(0)
    // Com os temporizadores falsos, `findBy*` não avança: o toast já está na região depois do `settle`.
    expect(queryToast('Este nome de usuário já está em uso.')).toBeTruthy()
    expect(screen.getByText('@corrida já está em uso.')).toBeTruthy()
    expect(h.onSaved).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('indica quando o nome é o atual e permite salvar se a verificação falhar', async () => {
    vi.useFakeTimers()
    vi.mocked(request).mockImplementation(async () => { throw new ApiError('Sem conexão.', 0) })
    renderWithToaster(<UsernameSheet user={user} {...handlers()} />)
    expect(screen.getByText('Este já é o seu nome de usuário.')).toBeTruthy()
    type('outro.nome')
    await settle(400)
    expect(screen.getByText(/Não foi possível verificar agora/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('VisibilitySheet', () => {
  it('avisa sobre solicitações pendentes ao tornar pública e salva a privacidade', async () => {
    const h = handlers()
    vi.mocked(request).mockResolvedValue({ social_public: true } as never)
    renderWithToaster(<VisibilitySheet user={user} {...h} />)
    expect(screen.getByText('Com a conta privada')).toBeTruthy()
    expect(screen.queryByRole('note')).toBeNull()
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(true)
    const ui = userEvent.setup()
    await ui.click(screen.getByRole('radio', { name: /Pública/ }))
    expect(screen.getByRole('note').textContent).toContain('solicitações pendentes')
    expect(screen.getByText('Com a conta pública')).toBeTruthy()
    await ui.click(screen.getByRole('button', { name: 'Tornar pública' }))
    await waitFor(() => expect(h.onSaved).toHaveBeenCalledWith('Conta pública.'))
    expect(request).toHaveBeenCalledWith('/me/privacy', 'PUT', { social_public: true })
    expect(h.onUser).toHaveBeenCalledWith({ ...user, social_public: true })
  })

  it('avisa que quem já segue continua ao tornar privada e mostra erro do servidor', async () => {
    const h = handlers()
    vi.mocked(request).mockImplementation(async () => { throw new ApiError('Falha ao salvar.', 500) })
    renderWithToaster(<VisibilitySheet user={{ ...user, social_public: true }} {...h} />)
    const ui = userEvent.setup()
    await ui.click(screen.getByRole('radio', { name: /Privada/ }))
    expect(screen.getByRole('note').textContent).toContain('continua seguindo')
    await ui.click(screen.getByRole('button', { name: 'Tornar privada' }))
    expect(await findToast('Falha ao salvar.')).toBeTruthy()
    expect(h.onUser).not.toHaveBeenCalled()
  })
})

describe('CoverSheet', () => {
  it('envia a capa recortada em 5:2 como multipart', async () => {
    const h = handlers()
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:cover'), revokeObjectURL: vi.fn() })
    vi.stubGlobal('Image', class { src = ''; decode = async () => undefined })
    const draw = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: draw } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['webp'], { type: 'image/webp' })))
    vi.mocked(request).mockResolvedValue({ ...user, cover: { id: 'c1', url: '/api/v1/me/cover?v=c1' } } as never)
    const { container } = renderWithToaster(<CoverSheet user={user} {...h} />)
    expect(screen.getByText('Enviar capa')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Usar capa padrão' })).toBeNull()
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(['i'], 'capa.png', { type: 'image/png' })] } })
    expect(screen.getByRole('dialog', { name: 'Ajustar capa' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Selecionar recorte' }).getAttribute('data-aspect')).toBe('2.5')
    const ui = userEvent.setup()
    await ui.click(screen.getByRole('button', { name: 'Selecionar recorte' }))
    await ui.click(screen.getByRole('button', { name: 'Salvar capa' }))
    await waitFor(() => expect(h.onSaved).toHaveBeenCalledWith('Foto de capa atualizada.'))
    expect(request).toHaveBeenCalledWith('/me/cover', 'PUT', expect.any(FormData))
    expect(h.onUser).toHaveBeenCalledWith(expect.objectContaining({ cover: expect.objectContaining({ id: 'c1' }) }))
  })

  it('volta à capa padrão pela API', async () => {
    const h = handlers()
    const withCover = { ...user, cover: { id: 'c1', url: '/api/v1/me/cover?v=c1' } }
    vi.mocked(request).mockResolvedValue(undefined as never)
    renderWithToaster(<CoverSheet user={withCover} {...h} />)
    expect(screen.getByText('Trocar capa')).toBeTruthy()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Usar capa padrão' }))
    await waitFor(() => expect(h.onUser).toHaveBeenCalledWith({ ...withCover, cover: null }))
    expect(request).toHaveBeenCalledWith('/me/cover', 'DELETE')
    expect(h.onSaved).toHaveBeenCalledWith('Capa padrão restaurada.')
  })
})
