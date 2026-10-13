import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, request } from '../src/api/client'
import { connection } from '../src/api/connection'
import { LoadError, CONNECTION_LOAD_TEXT } from '../src/components/ui/load-error'
import { usePagedList } from '../src/hooks/usePagedList'
import { useResource } from '../src/hooks/useResource'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(), request: vi.fn(),
}))

afterEach(() => { cleanup(); vi.mocked(request).mockReset() })

describe('LoadError', () => {
  it('tela: alerta com título, texto e o botão principal "Tentar novamente", com o Coliseu', async () => {
    const onRetry = vi.fn()
    render(<LoadError size="screen" title="Não foi possível carregar a partida" text="Tente de novo em instantes." onRetry={onRetry} />)
    const alert = screen.getByRole('alert')
    expect(alert.getAttribute('data-size')).toBe('screen')
    expect(screen.getByRole('heading', { name: 'Não foi possível carregar a partida' })).toBeTruthy()
    expect(screen.getByText('Tente de novo em instantes.')).toBeTruthy()
    expect(alert.querySelector('span[aria-hidden="true"]')).not.toBeNull()
    const button = screen.getByRole('button', { name: 'Tentar novamente' })
    expect(button.getAttribute('data-slot')).toBe('button')
    await userEvent.setup().click(button)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('seção: compacta, sem o Coliseu, com o botão de texto', () => {
    render(<LoadError size="section" text="Os comentários não carregaram." onRetry={vi.fn()} />)
    const alert = screen.getByRole('alert')
    expect(alert.getAttribute('data-size')).toBe('section')
    expect(screen.getByRole('heading', { name: 'Não foi possível carregar' })).toBeTruthy()
    expect(alert.querySelector('span[aria-hidden="true"]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Tentar novamente' }).className).toContain('text-brand')
  })

  it('tom escuro: botão e Coliseu para a placa escura', () => {
    const { rerender } = render(<LoadError size="screen" tone="dark" text="x" onRetry={vi.fn()} />)
    expect(screen.getByRole('alert').getAttribute('data-tone')).toBe('dark')
    expect(screen.getByRole('button', { name: 'Tentar novamente' }).className).toContain('bg-mint')
    rerender(<LoadError size="section" tone="dark" text="x" onRetry={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Tentar novamente' }).className).toContain('text-mint')
  })

  it('falha de conexão troca o texto e mantém o botão; outro erro mantém o texto', () => {
    const { rerender } = render(<LoadError size="section" text="Os comentários não carregaram." cause={new ApiError('x', 503)} onRetry={vi.fn()} />)
    expect(screen.getByText(CONNECTION_LOAD_TEXT)).toBeTruthy()
    expect(CONNECTION_LOAD_TEXT).toBe('Sem conexão com a ARENA. Vamos tentar de novo assim que voltar.')
    expect(screen.queryByText('Os comentários não carregaram.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeTruthy()
    rerender(<LoadError size="section" text="Os comentários não carregaram." cause={new ApiError('x', 500)} onRetry={vi.fn()} />)
    expect(screen.getByText('Os comentários não carregaram.')).toBeTruthy()
    rerender(<LoadError size="section" text="Os comentários não carregaram." cause={new Error('x')} onRetry={vi.fn()} />)
    expect(screen.getByText('Os comentários não carregaram.')).toBeTruthy()
  })
})

describe('recarga automática quando a conexão volta', () => {
  const onExpired = vi.fn()
  it('useResource: erro de conexão recarrega uma única vez ao restabelecer', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new ApiError('Sem rede.', 0))
      .mockResolvedValueOnce({ ok: true })
    const { result } = renderHook(() => useResource(load, onExpired))
    await waitFor(() => expect(result.current.error).toBe('Sem rede.'))
    expect(result.current.connectionError).toBe(true)
    expect((result.current.errorCause as ApiError).status).toBe(0)
    act(() => { connection.lost({ mutating: false }); connection.reached() })
    await waitFor(() => expect(result.current.data).toEqual({ ok: true }))
    expect(load).toHaveBeenCalledTimes(2)
    expect(result.current.connectionError).toBe(false)
    expect(result.current.errorCause).toBeNull()
    // Já carregou: outra volta da conexão não relê.
    act(() => { connection.reset(); connection.lost({ mutating: false }); connection.reached() })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('useResource: erro que não é de conexão espera o "Tentar novamente"', async () => {
    const load = vi.fn().mockRejectedValue(new ApiError('Não encontrado.', 404))
    const { result } = renderHook(() => useResource(load, onExpired))
    await waitFor(() => expect(result.current.error).toBe('Não encontrado.'))
    expect(result.current.connectionError).toBe(false)
    act(() => { connection.lost({ mutating: false }); connection.reached() })
    expect(load).toHaveBeenCalledTimes(1)
    load.mockResolvedValueOnce('depois')
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.data).toBe('depois'))
  })

  it('useResource: se a releitura falha de novo por conexão, a próxima volta recarrega de novo', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new ApiError('Sem rede.', 0))
      .mockRejectedValueOnce(new ApiError('Fora do ar.', 503))
      .mockResolvedValueOnce('ok')
    const { result } = renderHook(() => useResource(load, onExpired))
    await waitFor(() => expect(result.current.connectionError).toBe(true))
    act(() => { connection.lost({ mutating: false }); connection.reached() })
    await waitFor(() => expect(result.current.error).toBe('Fora do ar.'))
    act(() => { connection.reset(); connection.lost({ mutating: false }); connection.reached() })
    await waitFor(() => expect(result.current.data).toBe('ok'))
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('usePagedList: a primeira página que falhou por conexão recarrega uma vez; moreError fica no rodapé', async () => {
    vi.mocked(request)
      .mockRejectedValueOnce(new ApiError('Sem rede.', 0))
      .mockResolvedValueOnce({ items: ['a'], next_cursor: 'c' })
      .mockRejectedValueOnce(new ApiError('Sem rede.', 0))
    const { result } = renderHook(() => usePagedList<string>('/lista', onExpired))
    await waitFor(() => expect(result.current.error?.message).toBe('Sem rede.'))
    expect(result.current.connectionError).toBe(true)
    act(() => { connection.lost({ mutating: false }); connection.reached() })
    await waitFor(() => expect(result.current.items).toEqual(['a']))
    expect(result.current.connectionError).toBe(false)
    await act(async () => { await result.current.loadMore() })
    expect(result.current.moreError).toBe('Sem rede.')
    expect(result.current.items).toEqual(['a'])
    // O erro de "carregar mais" não recarrega a lista quando a conexão volta.
    act(() => { connection.reset(); connection.lost({ mutating: false }); connection.reached() })
    expect(vi.mocked(request)).toHaveBeenCalledTimes(3)
  })

  it('usePagedList: erro comum não recarrega sozinho', async () => {
    vi.mocked(request).mockRejectedValue(new ApiError('Não encontrado.', 404))
    const { result } = renderHook(() => usePagedList<string>('/lista', onExpired))
    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.connectionError).toBe(false)
    act(() => { connection.lost({ mutating: false }); connection.reached() })
    expect(vi.mocked(request)).toHaveBeenCalledTimes(1)
  })
})
