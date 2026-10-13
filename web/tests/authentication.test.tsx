import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AuthPage from '../src/pages/AuthPage'
import App from '../src/App'
import { ApiError, request } from '../src/api/client'
import { findToast, queryToast } from './toast-utils'

vi.mock('../src/api/client', async (original) => ({
  ...await original<typeof import('../src/api/client')>(), request: vi.fn(),
}))

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)
const user = { id: 1, name: 'Atleta Teste', email: 'atleta@example.com', birth_date: '1990-01-01' }

function fillLogin() {
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: user.email } })
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'TestPassword123' } })
}

it('entrega a conta autenticada ao aplicativo após login', async () => {
  vi.mocked(request).mockResolvedValue({ user })
  const onLogin = vi.fn()
  render(<AuthPage onLogin={onLogin} notice="" onRetry={vi.fn()} />)
  fillLogin()
  await userEvent.click(screen.getByRole('button', { name: 'Entrar no Arena →' }))
  await waitFor(() => expect(onLogin).toHaveBeenCalledWith(user))
  expect(request).toHaveBeenCalledWith('/auth/login', 'POST', { email: user.email, password: 'TestPassword123' })
})

it('retorna ao login após cadastro, sem autenticar implicitamente', async () => {
  vi.mocked(request).mockResolvedValue(user)
  const onLogin = vi.fn()
  render(<AuthPage onLogin={onLogin} notice="" onRetry={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Criar conta', exact: true }))
  fillLogin()
  fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: user.name } })
  fireEvent.change(screen.getByLabelText('Data de nascimento'), { target: { value: user.birth_date } })
  await userEvent.click(screen.getByRole('button', { name: 'Criar minha conta →' }))
  const confirmation = await findToast('Conta criada.')
  expect(confirmation.closest('[data-tone]')?.getAttribute('data-tone')).toBe('success')
  expect(await findToast('Entre com seu e-mail e senha.')).toBeTruthy()
  // A confirmação é toast: nenhum bloco de sucesso fica no formulário.
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.getByRole('button', { name: 'Entrar no Arena →' })).toBeTruthy()
  expect(onLogin).not.toHaveBeenCalled()
  expect(request).toHaveBeenCalledWith('/auth/register', 'POST', expect.objectContaining({ birth_date: user.birth_date }))
})

it('apresenta falha do login e permite nova tentativa', async () => {
  vi.mocked(request).mockRejectedValue(new ApiError('E-mail ou senha inválidos.', 401))
  render(<AuthPage onLogin={vi.fn()} notice="" onRetry={vi.fn()} />)
  fillLogin()
  await userEvent.click(screen.getByRole('button', { name: 'Entrar no Arena →' }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'E-mail ou senha inválidos.')
  // O erro de entrar fica no formulário, não em toast.
  expect(queryToast('E-mail ou senha inválidos.')).toBeNull()
  expect(screen.getByRole('button', { name: 'Entrar no Arena →' })).toHaveProperty('disabled', false)
})

it('abre o login para uma sessão inexistente sem mostrar erro de rede', async () => {
  vi.mocked(request).mockRejectedValue(new ApiError('Sem sessão', 401))
  render(<App />)
  expect(await screen.findByRole('button', { name: 'Entrar no Arena →' })).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
})

it('permite repetir a conexão quando o bootstrap falha', async () => {
  vi.mocked(request).mockRejectedValueOnce(new ApiError('Falha de conexão', 0))
    .mockRejectedValueOnce(new ApiError('Sem sessão', 401))
  render(<App />)
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Falha de conexão'))
  expect(screen.queryByText(/Sua sessão expirou/)).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Tentar conexão novamente' }))
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
})

it('a sessão expirada e a falha de conexão do /me são estados separados na tela de entrada', () => {
  const { rerender } = render(<AuthPage onLogin={vi.fn()} expired notice="" onRetry={vi.fn()} />)
  const expired = screen.getByRole('alert')
  expect(expired.textContent).toBe('Sua sessão expirou. Entre novamente para continuar.')
  expect(screen.queryByRole('button', { name: 'Tentar conexão novamente' })).toBeNull()
  rerender(<AuthPage onLogin={vi.fn()} notice="Falha de conexão" onRetry={vi.fn()} />)
  expect(screen.getByRole('alert').textContent).toContain('Falha de conexão')
  expect(screen.queryByText(/Sua sessão expirou/)).toBeNull()
  expect(screen.getByRole('button', { name: 'Tentar conexão novamente' })).toBeTruthy()
})
