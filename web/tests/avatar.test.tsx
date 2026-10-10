import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Avatar from '../src/components/Avatar'
import AvatarEditor from '../src/components/AvatarEditor'
import type { User } from '../src/api/client'

vi.mock('react-easy-crop', () => ({
  default: ({ onCropComplete }: { onCropComplete: (area: unknown, pixels: { x: number; y: number; width: number; height: number }) => void }) => {
    return <button type="button" aria-label="Selecionar recorte" onClick={() => onCropComplete({}, { x: 0, y: 0, width: 20, height: 20 })} />
  },
}))

const user: User = { id: 1, name: 'Atleta Arena', email: 'athlete@example.com', birth_date: '1995-01-01', social_public: false, is_admin: false, avatar: null }

afterEach(() => { vi.unstubAllGlobals() })

describe('avatar e editor de foto', () => {
  it('mostra iniciais e usa a rota autenticada para ler a foto', () => {
    const { rerender, container } = render(<Avatar user={user} />)
    expect(screen.getByText('AA')).toBeTruthy()
    rerender(<Avatar user={{ ...user, avatar: { id: 'abc', url: '/api/v1/me/avatar?v=abc' } }} />)
    expect(container.querySelector('img')?.getAttribute('src')).toContain('/api/v1/me/avatar?v=abc')
  })

  it('cancela seleção sem alterar a foto, então recorta e salva multipart', async () => {
    const onUser = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:avatar'), revokeObjectURL: vi.fn() })
    vi.stubGlobal('Image', class { src = ''; decode = async () => undefined })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['webp'], { type: 'image/webp' })))
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...user, avatar: { id: 'new-id', url: '/api/v1/me/avatar?v=new-id' } })))
    vi.stubGlobal('fetch', fetch)
    const ui = userEvent.setup()
    const { container } = render(<AvatarEditor user={user} onUser={onUser} onExpired={vi.fn()} />)
    const input = container.querySelector('input[type="file"]')!
    const file = new File(['image'], 'profile.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(screen.getByRole('dialog', { name: 'Ajustar foto' })).toBeTruthy()
    await ui.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onUser).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { files: [file] } })
    await ui.click(screen.getByRole('button', { name: 'Selecionar recorte' }))
    await ui.click(screen.getByRole('button', { name: 'Salvar foto' }))
    await waitFor(() => expect(onUser).toHaveBeenCalledWith(expect.objectContaining({ avatar: expect.objectContaining({ id: 'new-id' }) })))
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/me/avatar'), expect.objectContaining({ method: 'PUT', headers: {}, body: expect.any(FormData) }))
  })

  it('remove foto pela API e retorna às iniciais', async () => {
    const onUser = vi.fn()
    const withAvatar = { ...user, avatar: { id: 'old-id', url: '/api/v1/me/avatar?v=old-id' } }
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)
    render(<AvatarEditor user={withAvatar} onUser={onUser} onExpired={vi.fn()} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Remover foto' }))
    await waitFor(() => expect(onUser).toHaveBeenCalledWith({ ...withAvatar, avatar: null }))
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/me/avatar'), expect.objectContaining({ method: 'DELETE' }))
  })
})
