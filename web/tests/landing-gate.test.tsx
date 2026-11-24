import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from '../src/App'
import type { User } from '../src/api/client'
import { GATE_TIMING } from '../src/hooks/useGate'
import { apiError, mockApi } from './teams-fixtures'

/*
 * Portão entre a landing e a tela de entrada (web). A sequência é conduzida por temporizadores falsos, ligados só
 * depois de a landing aparecer (a leitura de /me e as esperas do Testing Library seguem com o relógio real).
 */

const me: User = { id: 1, name: 'Atleta Teste', username: 'atleta', email: 'atleta@example.com', birth_date: '1990-01-01', social_public: true, is_admin: false, avatar: null, cover: null }
const noSession = () => apiError(401, 'Entre na sua conta para continuar.')

const gate = () => document.querySelector<HTMLElement>('[data-gate]')
const inertContent = () => document.querySelector('[inert]')
const landingTitle = () => screen.findByRole('heading', { level: 1, name: 'A arena te chama' })
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

function reduceMotion() {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }))
}

/** Abre a landing (sem sessão) e liga os temporizadores falsos para a sequência do portão. */
async function openLanding() {
  mockApi({ 'GET /me': noSession })
  render(<App />)
  await landingTitle()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
}

beforeEach(() => { Element.prototype.scrollTo = () => {} })
afterEach(() => {
  vi.useRealTimers()
  cleanup()
  window.history.replaceState(null, '', '/')
})

describe('portão da landing para a entrada', () => {
  it('"Entrar na Arena" do hero fecha o portão, troca para o modo Entrar com ele fechado, abre e leva o foco ao e-mail', async () => {
    await openLanding()
    const before = window.history.length
    fireEvent.click(screen.getAllByRole('button', { name: 'Entrar na Arena' })[0])

    // Fechando: decorativo, sobre a landing, que fica inerte.
    expect(gate()?.getAttribute('aria-hidden')).toBe('true')
    expect(gate()?.dataset.gate).toBe('closing')
    expect(inertContent()).not.toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Os portões estão abertos.' })).toBeTruthy()
    expect(window.history.length).toBe(before)

    // Com o portão fechado, a entrada substitui a landing: uma entrada no histórico, endereço em /.
    advance(GATE_TIMING.switchAt)
    const email = screen.getByLabelText('E-mail')
    expect(screen.queryByRole('heading', { level: 2, name: 'Os portões estão abertos.' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Entrar', exact: true }).getAttribute('aria-pressed')).toBe('true')
    expect(window.history.length).toBe(before + 1)
    expect(window.location.pathname).toBe('/')
    expect(gate()?.dataset.gate).toBe('closing')
    expect(document.activeElement).not.toBe(email)

    // Abrindo.
    advance(GATE_TIMING.openAt - GATE_TIMING.switchAt)
    expect(gate()?.dataset.gate).toBe('opening')
    expect(inertContent()).not.toBeNull()
    expect(document.activeElement).not.toBe(email)

    // Fim: o portão sai do DOM, nada fica inerte e o foco vai ao primeiro campo.
    advance(GATE_TIMING.doneAt - GATE_TIMING.openAt)
    expect(gate()).toBeNull()
    expect(inertContent()).toBeNull()
    expect(document.activeElement).toBe(email)
    expect(window.history.length).toBe(before + 1)
  })

  it('cliques repetidos durante o portão não disparam outra sequência: vale o primeiro, "Crie sua conta" do fecho', async () => {
    await openLanding()
    const before = window.history.length
    fireEvent.click(screen.getAllByRole('button', { name: 'Crie sua conta' })[1])
    advance(200)
    fireEvent.click(screen.getAllByRole('button', { name: 'Entrar na Arena' })[0])
    advance(200)
    fireEvent.click(screen.getAllByRole('button', { name: 'Entrar na Arena' })[1])
    expect(gate()?.dataset.gate).toBe('closing')

    advance(GATE_TIMING.doneAt - 400)
    expect(gate()).toBeNull()
    const name = screen.getByLabelText('Nome completo')
    expect(screen.getByRole('button', { name: 'Criar conta', exact: true }).getAttribute('aria-pressed')).toBe('true')
    expect(document.activeElement).toBe(name)
    expect(window.history.length).toBe(before + 1)
    // Nenhum passo de outra sequência fica pendente.
    advance(GATE_TIMING.doneAt)
    expect(gate()).toBeNull()
    expect(window.history.length).toBe(before + 1)
  })

  it('com "reduzir movimento", não há portão: a troca é direta e o foco vai ao primeiro campo', async () => {
    reduceMotion()
    await openLanding()
    fireEvent.click(screen.getAllByRole('button', { name: 'Crie sua conta' })[0])
    expect(gate()).toBeNull()
    expect(inertContent()).toBeNull()
    expect(document.activeElement).toBe(screen.getByLabelText('Nome completo'))
  })

  it('o retorno à landing, pelo botão ou pelo Voltar do navegador, não usa portão', async () => {
    await openLanding()
    fireEvent.click(screen.getAllByRole('button', { name: 'Entrar na Arena' })[0])
    advance(GATE_TIMING.doneAt)
    expect(screen.getByLabelText('E-mail')).toBeTruthy()

    vi.useRealTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para o início' }))
    expect(await landingTitle()).toBeTruthy()
    expect(gate()).toBeNull()

    // Avançar volta à entrada pelo histórico, também sem portão; o Voltar retorna à landing.
    window.history.forward()
    expect(await screen.findByLabelText('E-mail')).toBeTruthy()
    expect(gate()).toBeNull()
    window.history.back()
    expect(await landingTitle()).toBeTruthy()
    expect(gate()).toBeNull()
  })

  it('o Voltar do navegador no meio do portão interrompe a sequência e mostra a landing', async () => {
    await openLanding()
    fireEvent.click(screen.getAllByRole('button', { name: 'Entrar na Arena' })[0])
    advance(GATE_TIMING.openAt)
    expect(gate()?.dataset.gate).toBe('opening')

    act(() => { window.dispatchEvent(new PopStateEvent('popstate', { state: null })) })
    expect(gate()).toBeNull()
    expect(inertContent()).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Os portões estão abertos.' })).toBeTruthy()
    advance(GATE_TIMING.doneAt)
    expect(screen.queryByLabelText('E-mail')).toBeNull()
  })

  it('os temporizadores do portão são limpos ao desmontar', async () => {
    await openLanding()
    const idle = vi.getTimerCount()
    fireEvent.click(screen.getAllByRole('button', { name: 'Entrar na Arena' })[0])
    expect(vi.getTimerCount()).toBeGreaterThan(idle)
    cleanup()
    expect(vi.getTimerCount()).toBeLessThanOrEqual(idle)
  })
})

describe('atalhos diretos para a entrada, sem portão', () => {
  it('sessão expirada', async () => {
    mockApi({ 'GET /me': me, 'GET /me/sports-profiles': noSession })
    render(<App />)
    expect(await screen.findByText('Sua sessão expirou. Entre novamente para continuar.')).toBeTruthy()
    expect(gate()).toBeNull()
    expect(inertContent()).toBeNull()
  })

  it('falha da leitura de /me', async () => {
    mockApi({ 'GET /me': () => apiError(503, 'Não foi possível conectar à ARENA.') })
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Tentar conexão novamente' })).toBeTruthy()
    expect(gate()).toBeNull()
    expect(inertContent()).toBeNull()
  })

  it('convite de time pendente', async () => {
    window.history.pushState(null, '', '/entrar/AbC_123-xyz')
    mockApi({ 'GET /me': noSession })
    render(<App />)
    expect(await screen.findByLabelText('E-mail')).toBeTruthy()
    expect(gate()).toBeNull()
    expect(inertContent()).toBeNull()
  })
})
