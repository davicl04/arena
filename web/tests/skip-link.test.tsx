import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import type { User } from '../src/api/client'
import { apiError, mockApi } from './teams-fixtures'

/*
 * "Pular para conteúdo" leva o foco ao `main#main` da tela atual sem navegar pelo fragmento: a navegação para `#main`
 * criaria uma entrada no histórico (com estado vazio) e o `popstate` da tela pública levaria a entrada de volta à landing.
 */

const me: User = { id: 1, name: 'Atleta Teste', username: 'atleta', email: 'atleta@example.com', birth_date: '1990-01-01', social_public: true, is_admin: false, avatar: null, cover: null }
const noSession = () => apiError(401, 'Entre na sua conta para continuar.')

beforeEach(() => {
  Element.prototype.scrollTo = () => {}
  // Sem portão: a troca da landing para a entrada é direta.
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/') })

/** Ativa o link pelo teclado, como quem o usa: Tab a partir do início da página e Enter. */
async function skip(ui: ReturnType<typeof userEvent.setup>) {
  const link = screen.getByRole('link', { name: 'Pular para conteúdo' })
  link.focus()
  await ui.keyboard('{Enter}')
}

/** Endereço e histórico antes e depois do link: nada muda. */
function addressSnapshot() {
  return { href: window.location.href, length: window.history.length, state: JSON.stringify(window.history.state) }
}

describe('Pular para conteúdo', () => {
  it('na entrada aberta pela landing, leva o foco ao main sem voltar à landing nem mexer no endereço', async () => {
    mockApi({ 'GET /me': noSession })
    const ui = userEvent.setup()
    render(<App />)
    await ui.click((await screen.findAllByRole('button', { name: 'Entrar na Arena' }))[0])
    await screen.findByLabelText('E-mail')
    const before = addressSnapshot()
    await skip(ui)
    expect(document.activeElement).toBe(screen.getByRole('main'))
    expect(screen.getByLabelText('E-mail')).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 2, name: 'Os portões estão abertos.' })).toBeNull()
    expect(addressSnapshot()).toEqual(before)
    expect(window.location.hash).toBe('')
    // O Voltar continua levando à landing.
    await ui.click(screen.getByRole('button', { name: 'Voltar para o início' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Os portões estão abertos.' })).toBeTruthy()
  })

  it('na landing e na entrada direta, leva o foco ao main da tela atual', async () => {
    mockApi({ 'GET /me': noSession })
    const ui = userEvent.setup()
    const { unmount } = render(<App />)
    await screen.findByRole('heading', { level: 2, name: 'Os portões estão abertos.' })
    let before = addressSnapshot()
    await skip(ui)
    expect(document.activeElement).toBe(screen.getByRole('main'))
    expect(screen.getByRole('heading', { level: 2, name: 'Os portões estão abertos.' })).toBeTruthy()
    expect(addressSnapshot()).toEqual(before)
    unmount()

    mockApi({ 'GET /me': () => apiError(503, 'Não foi possível conectar à ARENA.') })
    render(<App />)
    await screen.findByRole('button', { name: 'Tentar conexão novamente' })
    before = addressSnapshot()
    await skip(ui)
    expect(document.activeElement).toBe(screen.getByRole('main'))
    expect(screen.getByRole('button', { name: 'Tentar conexão novamente' })).toBeTruthy()
    expect(addressSnapshot()).toEqual(before)
  })

  it('com sessão, leva o foco ao main do aplicativo', async () => {
    mockApi({ 'GET /me': me, 'GET /me/sports-profiles': [] })
    const ui = userEvent.setup()
    render(<App />)
    await screen.findByRole('navigation', { name: 'Navegação principal' })
    const before = addressSnapshot()
    await skip(ui)
    expect(document.activeElement?.id).toBe('main')
    expect(addressSnapshot()).toEqual(before)
  })
})
