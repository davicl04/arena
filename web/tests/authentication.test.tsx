import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AuthPage from '../src/pages/AuthPage'
import App from '../src/App'
import { ApiError, request } from '../src/api/client'

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
  expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Conta criada. Entre com seu e-mail e senha.')
  expect(onLogin).not.toHaveBeenCalled()
  expect(request).toHaveBeenCalledWith('/auth/register', 'POST', expect.objectContaining({ birth_date: user.birth_date }))
})

it('apresenta falha do login e permite nova tentativa', async () => {
  vi.mocked(request).mockRejectedValue(new ApiError('E-mail ou senha inválidos.', 401))
  render(<AuthPage onLogin={vi.fn()} notice="" onRetry={vi.fn()} />)
  fillLogin()
  await userEvent.click(screen.getByRole('button', { name: 'Entrar no Arena →' }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'E-mail ou senha inválidos.')
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
  await userEvent.click(screen.getByRole('button', { name: 'Tentar conexão novamente' }))
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
})
