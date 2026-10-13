import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import MatchPage from '../src/pages/MatchPage'
import { page, scheduled } from './match-fixtures'
import { acting, result } from './results-fixtures'
import { apiError, mockApi } from './teams-fixtures'

afterEach(() => { cleanup(); vi.useRealTimers(); Reflect.deleteProperty(document, 'hidden') })
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
function setup() {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-12T15:00:00Z'))
  const before = scheduled(0.01)
  const after = { ...before, phase: 'informar_resultado' as const, result: result(), permissions: acting() }
  let fail = false
  const api = mockApi({
    'GET /matches/1': () => Date.now() < Date.parse(before.starts_at!) ? before : fail ? apiError(503, 'Sem conexão') : after,
    'GET /matches/1/messages': page([]),
    'GET /matches/1/messages?after=0': page([]),
    'GET /matches/1/stats': { items: [] },
  })
  const view = render(<MatchPage matchId={1} viewerId={1} onBack={vi.fn()} onExpired={vi.fn()} />)
  return { ...api, ...view, fail: (value: boolean) => { fail = value } }
}

it('libera o placar no horário de início mesmo sem mensagens novas', async () => {
  const api = setup()
  await tick(50)
  expect(screen.queryByRole('heading', { name: 'Informe o placar' })).toBeNull()
  await tick(36_000)
  expect(screen.getByRole('heading', { name: 'Informe o placar' })).toBeTruthy()
  expect(api.find('GET', '/matches/1')).toHaveLength(2)
  api.unmount()
  await tick(60_000)
  expect(api.find('GET', '/matches/1')).toHaveLength(2)
})

it('pausa oculta e relê ao voltar depois do início', async () => {
  const api = setup()
  await tick(50)
  let hidden = true
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  document.dispatchEvent(new Event('visibilitychange'))
  await tick(60_000)
  expect(api.find('GET', '/matches/1')).toHaveLength(1)
  hidden = false
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
  expect(screen.getByRole('heading', { name: 'Informe o placar' })).toBeTruthy()
})

it('repete a leitura após falha de rede sem entrar em loop', async () => {
  const api = setup()
  await tick(50)
  api.fail(true)
  await tick(36_000)
  expect(api.find('GET', '/matches/1')).toHaveLength(2)
  api.fail(false)
  await tick(15_000)
  expect(api.find('GET', '/matches/1')).toHaveLength(3)
  expect(screen.getByRole('heading', { name: 'Informe o placar' })).toBeTruthy()
})
