import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import type { User } from '../src/api/client'
import { apiError, mockApi } from './teams-fixtures'

const me: User = { id: 1, name: 'Atleta Teste', username: 'atleta', email: 'atleta@example.com', birth_date: '1990-01-01', social_public: true, is_admin: false, avatar: null, cover: null }
const noSession = () => apiError(401, 'Entre na sua conta para continuar.')

beforeEach(() => { Element.prototype.scrollTo = () => {} })
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/') })

const landingTitle = () => screen.findByRole('heading', { level: 1, name: 'A arena te chama' })

describe('landing sem sessão', () => {
  it('aparece para quem chega sem contexto, com exatamente dois pontos de entrada e sem formulário', async () => {
    const api = mockApi({ 'GET /me': noSession })
    render(<App />)
    expect(await landingTitle()).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Entrar na Arena' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Crie sua conta' })).toHaveLength(2)
    // Cabeçalho só com a marca.
    expect(within(screen.getByRole('banner')).queryByRole('button')).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Os portões estão abertos.' })).toBeTruthy()
    expect(within(screen.getByRole('contentinfo')).getByText('Futebol, tênis e corrida amadores.')).toBeTruthy()
    expect(screen.getByRole('main').id).toBe('main')
    expect(screen.queryByLabelText('E-mail')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    // Nenhuma requisição além da leitura da conta.
    expect(api.calls.map(call => `${call.method} ${call.path}`)).toEqual(['GET /me'])
  })

  it('"Entrar na Arena" abre a entrada no modo Entrar, com foco no primeiro campo e uma entrada no histórico em /', async () => {
    mockApi({ 'GET /me': noSession })
    const ui = userEvent.setup()
    render(<App />)
    await landingTitle()
    const before = window.history.length
    await ui.click(screen.getAllByRole('button', { name: 'Entrar na Arena' })[0])
    const email = await screen.findByLabelText('E-mail')
    expect(screen.getByRole('button', { name: 'Entrar', exact: true }).getAttribute('aria-pressed')).toBe('true')
    expect(document.activeElement).toBe(email)
    expect(window.history.length).toBe(before + 1)
    expect(window.location.pathname).toBe('/')
    // "← Voltar para o início" retorna à landing.
    await ui.click(screen.getByRole('button', { name: 'Voltar para o início' }))
    expect(await landingTitle()).toBeTruthy()
    expect(screen.queryByLabelText('E-mail')).toBeNull()
    expect(window.location.pathname).toBe('/')
  })

  it('"Crie sua conta" do fecho abre no modo Criar conta; o Voltar e o Avançar do navegador alternam entre landing e entrada', async () => {
    mockApi({ 'GET /me': noSession })
    const ui = userEvent.setup()
    render(<App />)
    await landingTitle()
    await ui.click(screen.getAllByRole('button', { name: 'Crie sua conta' })[1])
    const name = await screen.findByLabelText('Nome completo')
    expect(screen.getByRole('button', { name: 'Criar conta', exact: true }).getAttribute('aria-pressed')).toBe('true')
    expect(document.activeElement).toBe(name)
    window.history.back()
    expect(await landingTitle()).toBeTruthy()
    window.history.forward()
    expect(await screen.findByLabelText('Nome completo')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Voltar para o início' })).toBeTruthy()
  })

  it('depois de entrar pela landing, a conta abre e a próxima tela pública não herda a entrada', async () => {
    let session = false
    mockApi({
      'GET /me': () => (session ? me : noSession()),
      'POST /auth/login': () => { session = true; return { user: me } },
      'GET /me/sports-profiles': [],
    })
    const ui = userEvent.setup()
    render(<App />)
    await landingTitle()
    await ui.click(screen.getAllByRole('button', { name: 'Entrar na Arena' })[0])
    fireEvent.change(await screen.findByLabelText('E-mail'), { target: { value: me.email } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'SenhaDeTeste123' } })
    await ui.click(screen.getByRole('button', { name: 'Entrar na Arena' }))
    expect(await screen.findByRole('navigation', { name: 'Navegação principal' })).toBeTruthy()
    expect(window.history.state).toBeNull()
    expect(window.location.pathname).toBe('/')
  })
})

describe('atalhos diretos para a entrada', () => {
  it('a falha da leitura de /me abre a entrada direto, com a nova tentativa e sem volta nem histórico', async () => {
    mockApi({ 'GET /me': () => apiError(503, 'Não foi possível conectar à ARENA.') })
    const before = window.history.length
    render(<App />)
    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível conectar à ARENA.')
    expect(screen.getByRole('button', { name: 'Tentar conexão novamente' })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 2, name: 'Os portões estão abertos.' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Voltar para o início' })).toBeNull()
    expect(window.history.length).toBe(before)
  })

  it('o convite de time pendente abre a entrada direto, sem volta nem histórico', async () => {
    window.history.pushState(null, '', '/entrar/AbC_123-xyz')
    mockApi({ 'GET /me': noSession })
    const before = window.history.length
    render(<App />)
    expect(await screen.findByLabelText('E-mail')).toBeTruthy()
    expect(window.location.pathname).toBe('/')
    expect(screen.queryByRole('heading', { level: 2, name: 'Os portões estão abertos.' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Voltar para o início' })).toBeNull()
    expect(window.history.length).toBe(before)
  })

  it('a sessão expirada abre a entrada direto, com o aviso e sem volta', async () => {
    mockApi({ 'GET /me': me, 'GET /me/sports-profiles': noSession })
    render(<App />)
    expect(await screen.findByText('Sua sessão expirou. Entre novamente para continuar.')).toBeTruthy()
    expect(screen.getByLabelText('E-mail')).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 2, name: 'Os portões estão abertos.' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Voltar para o início' })).toBeNull()
  })
})

describe('seta de rolagem do hero', () => {
  async function scrollWith(reduced: boolean) {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduced && query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }))
    mockApi({ 'GET /me': noSession })
    render(<App />)
    await landingTitle()
    const target = document.getElementById('landing-fecho')!
    target.scrollIntoView = vi.fn()
    await userEvent.click(screen.getByRole('button', { name: 'Rolar para o conteúdo' }))
    return target.scrollIntoView
  }

  it('leva ao conteúdo seguinte com rolagem suave', async () => {
    expect(await scrollWith(false)).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('sem rolagem suave com "reduzir movimento"', async () => {
    expect(await scrollWith(true)).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
  })
})
