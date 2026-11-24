import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  render(<AuthPage onLogin={onLogin} notice="" onRetry={vi.fn()} onConnectionFailure={vi.fn()} />)
  fillLogin()
  await userEvent.click(screen.getByRole('button', { name: 'Entrar na Arena' }))
  await waitFor(() => expect(onLogin).toHaveBeenCalledWith(user))
  expect(request).toHaveBeenCalledWith('/auth/login', 'POST', { email: user.email, password: 'TestPassword123' })
})

/** Escolhe a data de nascimento pelo DatePicker: listas de mês e ano e o dia na grade. */
async function pickBirthDate(ui: ReturnType<typeof userEvent.setup>, day: string, month: string, year: string) {
  await ui.click(screen.getByRole('button', { name: /^Data de nascimento:/ }))
  const dialog = await screen.findByRole('dialog', { name: 'Escolher data de nascimento' })
  await ui.selectOptions(within(dialog).getByRole('combobox', { name: 'Escolha o ano' }), year)
  await ui.selectOptions(within(dialog).getByRole('combobox', { name: 'Escolha o mês' }), month)
  const target = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-slot="calendar-day"]:not([data-outside])'))
    .find((button) => button.textContent === day)!
  await ui.click(target)
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Escolher data de nascimento' })).toBeNull())
}

describe('cadastro com o DatePicker', () => {
  beforeEach(() => {
    // Só o relógio: os temporizadores continuam reais para o Base UI e o user-event.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 24, 10, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('retorna ao login após cadastro, sem autenticar implicitamente', async () => {
    vi.mocked(request).mockResolvedValue(user)
    const onLogin = vi.fn()
    const ui = userEvent.setup()
    render(<AuthPage onLogin={onLogin} notice="" onRetry={vi.fn()} onConnectionFailure={vi.fn()} />)
    await ui.click(screen.getByRole('button', { name: 'Criar conta', exact: true }))
    fillLogin()
    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: user.name } })
    await pickBirthDate(ui, '1', '0', '1990')
    expect(screen.getByRole('button', { name: /^Data de nascimento:/ }).textContent).toContain('1 jan 1990')
    await ui.click(screen.getByRole('button', { name: 'Criar minha conta' }))
    const confirmation = await findToast('Conta criada.')
    expect(confirmation.closest('[data-tone]')?.getAttribute('data-tone')).toBe('success')
    expect(await findToast('Entre com seu e-mail e senha.')).toBeTruthy()
    // A confirmação é toast: nenhum bloco de sucesso fica no formulário.
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('button', { name: 'Entrar na Arena' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Entrar', exact: true }).getAttribute('aria-pressed')).toBe('true')
    expect(onLogin).not.toHaveBeenCalled()
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('/auth/register', 'POST', {
      name: user.name, email: user.email, password: 'TestPassword123', birth_date: user.birth_date,
    })
  })

  it('abre o calendário no mês atual de 18 anos atrás, com mês e ano em listas e hoje como último dia', async () => {
    const ui = userEvent.setup()
    render(<AuthPage onLogin={vi.fn()} notice="" onRetry={vi.fn()} onConnectionFailure={vi.fn()} />)
    await ui.click(screen.getByRole('button', { name: 'Criar conta', exact: true }))
    const trigger = screen.getByLabelText('Data de nascimento')
    expect(trigger.getAttribute('aria-describedby')).toBe('age-help')
    expect(document.getElementById('age-help')?.textContent).toBe('A Arena é para pessoas com 18 anos completos ou mais.')
    await ui.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Escolher data de nascimento' })
    const year = within(dialog).getByRole<HTMLSelectElement>('combobox', { name: 'Escolha o ano' })
    expect(year.value).toBe('2008')
    expect(within(dialog).getByRole<HTMLSelectElement>('combobox', { name: 'Escolha o mês' }).value).toBe('10')
    // O último ano da lista é o atual; no mês atual, os dias depois de hoje ficam desabilitados.
    expect(Array.from(year.options).at(-1)?.value).toBe('2026')
    await ui.selectOptions(year, '2026')
    const day = (n: string) => Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-slot="calendar-day"]:not([data-outside])'))
      .find((button) => button.textContent === n)!
    expect(day('24').disabled).toBe(false)
    expect(day('25').disabled).toBe(true)
  })

  it('sem data de nascimento, não envia e avisa no próprio campo', async () => {
    const ui = userEvent.setup()
    render(<AuthPage onLogin={vi.fn()} notice="" onRetry={vi.fn()} onConnectionFailure={vi.fn()} />)
    await ui.click(screen.getByRole('button', { name: 'Criar conta', exact: true }))
    fillLogin()
    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: user.name } })
    await ui.click(screen.getByRole('button', { name: 'Criar minha conta' }))
    expect(request).not.toHaveBeenCalled()
    const message = screen.getByRole('alert')
    expect(message.textContent).toBe('Informe a data de nascimento.')
    const trigger = screen.getByLabelText('Data de nascimento')
    expect(trigger.getAttribute('aria-invalid')).toBe('true')
    expect(trigger.getAttribute('aria-describedby')?.split(' ')).toContain(message.id)
    expect(document.activeElement).toBe(trigger)
    // Escolher a data limpa o aviso.
    await pickBirthDate(ui, '15', '5', '1995')
    expect(screen.queryByText('Informe a data de nascimento.')).toBeNull()
    expect(screen.getByLabelText('Data de nascimento').getAttribute('aria-invalid')).toBeNull()
  })

  it('a recusa do servidor (menor de 18 anos) aparece no formulário, sem marcar e-mail e senha', async () => {
    vi.mocked(request).mockRejectedValue(new ApiError('O cadastro exige 18 anos completos.', 422))
    const ui = userEvent.setup()
    render(<AuthPage onLogin={vi.fn()} notice="" onRetry={vi.fn()} onConnectionFailure={vi.fn()} />)
    await ui.click(screen.getByRole('button', { name: 'Criar conta', exact: true }))
    fillLogin()
    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: user.name } })
    await pickBirthDate(ui, '1', '0', '2010')
    await ui.click(screen.getByRole('button', { name: 'Criar minha conta' }))
    expect((await screen.findByRole('alert')).textContent).toBe('O cadastro exige 18 anos completos.')
    expect(request).toHaveBeenCalledWith('/auth/register', 'POST', expect.objectContaining({ birth_date: '2010-01-01' }))
    expect(screen.getByLabelText('E-mail').getAttribute('aria-invalid')).toBeNull()
    expect(screen.getByRole('button', { name: 'Criar conta', exact: true }).getAttribute('aria-pressed')).toBe('true')
  })
})

it('o seletor Entrar | Criar conta expõe o modo ativo e troca os títulos', async () => {
  render(<AuthPage onLogin={vi.fn()} notice="" onRetry={vi.fn()} onConnectionFailure={vi.fn()} />)
  const enter = screen.getByRole('button', { name: 'Entrar', exact: true })
  const create = screen.getByRole('button', { name: 'Criar conta', exact: true })
  expect(enter.getAttribute('aria-pressed')).toBe('true')
  expect(create.getAttribute('aria-pressed')).toBe('false')
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('A arena te chama')
  expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Bom ter você aqui')
  await userEvent.click(create)
  expect(create.getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Sua trajetória começa aqui')
  expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Comece sua jornada')
  expect(screen.getByRole('main').id).toBe('main')
})

it('apresenta falha do login e permite nova tentativa', async () => {
  vi.mocked(request).mockRejectedValue(new ApiError('E-mail ou senha inválidos.', 401))
  render(<AuthPage onLogin={vi.fn()} notice="" onRetry={vi.fn()} onConnectionFailure={vi.fn()} />)
  fillLogin()
  await userEvent.click(screen.getByRole('button', { name: 'Entrar na Arena' }))
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveProperty('textContent', 'E-mail ou senha inválidos.')
  // O erro de entrar fica no formulário, não em toast, e marca os campos de credencial.
  expect(queryToast('E-mail ou senha inválidos.')).toBeNull()
  for (const field of ['E-mail', 'Senha']) {
    expect(screen.getByLabelText(field).getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByLabelText(field).getAttribute('aria-describedby')).toBe(alert.id)
  }
  expect(screen.getByRole('button', { name: 'Entrar na Arena' })).toHaveProperty('disabled', false)
})

it('abre o login para uma sessão inexistente sem mostrar erro de rede', async () => {
  vi.mocked(request).mockRejectedValue(new ApiError('Sem sessão', 401))
  render(<App />)
  expect(await screen.findByRole('button', { name: 'Entrar na Arena' })).toBeTruthy()
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
  const { rerender } = render(<AuthPage onLogin={vi.fn()} expired notice="" onRetry={vi.fn()} onConnectionFailure={vi.fn()} />)
  const expired = screen.getByRole('alert')
  expect(expired.textContent).toBe('Sua sessão expirou. Entre novamente para continuar.')
  expect(screen.queryByRole('button', { name: 'Tentar conexão novamente' })).toBeNull()
  rerender(<AuthPage onLogin={vi.fn()} notice="Falha de conexão" onRetry={vi.fn()} onConnectionFailure={vi.fn()} />)
  expect(screen.getByRole('alert').textContent).toContain('Falha de conexão')
  expect(screen.queryByText(/Sua sessão expirou/)).toBeNull()
  expect(screen.getByRole('button', { name: 'Tentar conexão novamente' })).toBeTruthy()
})

it('falha de conexão ao entrar vai para o aplicativo e o formulário não repete a mensagem', async () => {
  vi.mocked(request).mockRejectedValue(new ApiError('Não foi possível conectar à ARENA.', 0))
  const onConnectionFailure = vi.fn()
  render(<AuthPage onLogin={vi.fn()} notice="" onRetry={vi.fn()} onConnectionFailure={onConnectionFailure} />)
  fillLogin()
  await userEvent.click(screen.getByRole('button', { name: 'Entrar na Arena' }))
  await waitFor(() => expect(onConnectionFailure).toHaveBeenCalledWith('Não foi possível conectar à ARENA.'))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByRole('button', { name: 'Entrar na Arena' })).toHaveProperty('disabled', false)
})

it('com a API fora do ar, a mensagem de conexão aparece uma só vez e Tentar conexão novamente recupera', async () => {
  const down = new ApiError('Não foi possível conectar à ARENA.', 503)
  vi.mocked(request).mockRejectedValueOnce(new ApiError('Sem sessão', 401)).mockRejectedValueOnce(down)
    .mockRejectedValueOnce(new ApiError('Sem sessão', 401))
  render(<App />)
  expect(await screen.findByRole('button', { name: 'Entrar na Arena' })).toBeTruthy()
  // O /me funcionou (401): nenhum bloco de conexão ainda.
  expect(screen.queryByRole('alert')).toBeNull()
  fillLogin()
  await userEvent.click(screen.getByRole('button', { name: 'Entrar na Arena' }))
  const alerts = await screen.findAllByRole('alert')
  expect(alerts).toHaveLength(1)
  expect(alerts[0].textContent).toContain('Não foi possível conectar à ARENA.')
  expect(screen.getAllByText(/Não foi possível conectar à ARENA\./)).toHaveLength(1)
  await userEvent.click(screen.getByRole('button', { name: 'Tentar conexão novamente' }))
  await waitFor(() => expect(request).toHaveBeenCalledTimes(3))
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  expect(await screen.findByRole('button', { name: 'Entrar na Arena' })).toBeTruthy()
})

it('credenciais inválidas continuam no formulário, sem acionar o bloco de conexão', async () => {
  vi.mocked(request).mockRejectedValueOnce(new ApiError('Sem sessão', 401))
    .mockRejectedValueOnce(new ApiError('E-mail ou senha inválidos.', 401))
  render(<App />)
  expect(await screen.findByRole('button', { name: 'Entrar na Arena' })).toBeTruthy()
  fillLogin()
  await userEvent.click(screen.getByRole('button', { name: 'Entrar na Arena' }))
  const alerts = await screen.findAllByRole('alert')
  expect(alerts).toHaveLength(1)
  expect(alerts[0].textContent).toBe('E-mail ou senha inválidos.')
  expect(screen.queryByRole('button', { name: 'Tentar conexão novamente' })).toBeNull()
})
