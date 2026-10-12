import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Championship, NextActionKind } from '../src/api/events'
import { alertCount } from '../src/components/organizer/eventView'
import EventManagePage from '../src/pages/EventManagePage'
import { mockApi } from './teams-fixtures'
import { eventDetail, inDays } from './events-fixtures'

/*
 * Gestão do evento (G3) com o campeonato: o cartão "Agora" dos tipos novos (sortear, confirmar, decidir, agendar e acompanhar) e
 * as seções Chaveamento/Tabela e Partidas, que abrem as telas novas com os contadores do cartaz.
 */

afterEach(cleanup)

const champ = (overrides: Partial<Championship> = {}): Championship => ({
  bracket: 'sem_chaveamento', confirmed: 6, matches_total: 0, to_schedule: 0, waiting: 0, scheduled: 0, to_decide: 0, finished: 0, attention: 0, ...overrides,
})
function renderManage(kind: NextActionKind, count: number | null, championship: Championship | null, overrides: Parameters<typeof eventDetail>[0] = {}) {
  const detail = eventDetail({
    state: 'em_andamento', phase: 'em_andamento', price_cents: 0, pix: null, entries_by_state: { confirmada: 6 }, confirmed_count: 6, entries_count: 6,
    next_action: { kind, count, deadline: null }, championship, ...overrides,
  })
  mockApi({ 'GET /organizer/events/5': detail, 'GET /events/5/messages': { items: [], next_cursor: null } })
  const props = { onBack: vi.fn(), onEdit: vi.fn(), onReceipts: vi.fn(), onBracket: vi.fn(), onMatches: vi.fn(), onDeleted: vi.fn(), onExpired: vi.fn() }
  render(<EventManagePage eventId={5} {...props} />)
  return { ...props, user: userEvent.setup() }
}
const now = () => screen.getByRole('region', { name: (_, element) => element.getAttribute('data-slot') === 'next-action' })
const section = (title: string) => screen.getByText(title, { selector: 'b' }).closest('button, [aria-disabled]') as HTMLElement

describe('cartão "Agora" do campeonato', () => {
  it('sortear_chaveamento: conta as confirmadas e abre o chaveamento', async () => {
    const { user, onBracket } = renderManage('sortear_chaveamento', 6, champ(), { state: 'publicado', phase: 'inscricoes_encerradas', registration_deadline: inDays(-1, 20) })
    expect(await screen.findByRole('heading', { name: 'Sorteie o chaveamento' })).not.toBeNull()
    expect(now().textContent).toContain('6 inscrições confirmadas')
    await user.click(within(now()).getByRole('button', { name: 'Sortear chaveamento' }))
    expect(onBracket).toHaveBeenCalledTimes(1)
    // A seção abre a mesma tela; as partidas esperam o sorteio.
    expect(section('Chaveamento').textContent).toContain('Pronto para sortear · 6 confirmados')
    await user.click(section('Chaveamento'))
    expect(onBracket).toHaveBeenCalledTimes(2)
    expect(section('Partidas').getAttribute('aria-disabled')).toBe('true')
    expect(section('Partidas').textContent).toContain('Depois do sorteio')
  })

  it('todos contra todos: "Sorteie as rodadas" e a seção se chama Tabela', async () => {
    renderManage('sortear_chaveamento', 5, champ({ confirmed: 5 }), { state: 'publicado', phase: 'inscricoes_encerradas', competition_type: 'todos_contra_todos', registration_deadline: inDays(-1, 20) })
    expect(await screen.findByRole('heading', { name: 'Sorteie as rodadas' })).not.toBeNull()
    expect(within(now()).getByRole('button', { name: 'Sortear rodadas' })).not.toBeNull()
    expect(section('Tabela').textContent).toContain('Pronto para sortear · 5 confirmados')
    expect(screen.queryByText('Chaveamento', { selector: 'b' })).toBeNull()
  })

  it('confirmar_chaveamento: o sorteio está feito e só o organizador vê', async () => {
    const { user, onBracket } = renderManage('confirmar_chaveamento', 6, champ({ bracket: 'sorteado' }), { state: 'publicado', phase: 'inscricoes_encerradas', registration_deadline: inDays(-1, 20) })
    expect(await screen.findByRole('heading', { name: 'Confirme o chaveamento' })).not.toBeNull()
    expect(now().textContent).toContain('só você vê o chaveamento')
    await user.click(within(now()).getByRole('button', { name: 'Revisar e confirmar' }))
    expect(onBracket).toHaveBeenCalledTimes(1)
    expect(section('Chaveamento').textContent).toContain('Sorteio feito · falta confirmar')
    expect(section('Partidas').textContent).toContain('Depois de confirmar o chaveamento')
  })

  it('agendar_partidas: os contadores do cartaz nas partidas e o botão leva à lista', async () => {
    const { user, onMatches, onBracket } = renderManage('agendar_partidas', 2, champ({ bracket: 'confirmado', matches_total: 5, to_schedule: 2, waiting: 3, attention: 2 }))
    expect(await screen.findByRole('heading', { name: '2 partidas para agendar' })).not.toBeNull()
    await user.click(within(now()).getByRole('button', { name: 'Agendar' }))
    expect(onMatches).toHaveBeenCalledTimes(1)
    expect(section('Chaveamento').textContent).toContain('Confirmado · 5 jogos')
    expect(section('Partidas').textContent).toContain('2 para agendar · 3 esperando')
    await user.click(section('Partidas'))
    expect(onMatches).toHaveBeenCalledTimes(2)
    await user.click(section('Chaveamento'))
    expect(onBracket).toHaveBeenCalledTimes(1)
  })

  it('decidir_divergencias: "N partidas para decidir" aparece antes de agendar e a seção as conta', async () => {
    const { user, onMatches } = renderManage('decidir_divergencias', 1, champ({ bracket: 'confirmado', matches_total: 5, to_schedule: 1, to_decide: 1, waiting: 2, scheduled: 0, finished: 1, attention: 2 }))
    expect(await screen.findByRole('heading', { name: '1 partida para decidir' })).not.toBeNull()
    expect(now().getAttribute('data-tone')).toBe('bad')
    await user.click(within(now()).getByRole('button', { name: 'Decidir' }))
    expect(onMatches).toHaveBeenCalledTimes(1)
    expect(section('Partidas').textContent).toContain('1 para decidir · 1 para agendar · 2 esperando · 1 de 5 encerradas')
  })

  it('acompanhar_partidas: com agendadas conta; só com jogos esperando, diz que estão em andamento', async () => {
    renderManage('acompanhar_partidas', 3, champ({ bracket: 'confirmado', matches_total: 5, scheduled: 3, waiting: 1, finished: 1 }))
    expect(await screen.findByRole('heading', { name: '3 partidas agendadas' })).not.toBeNull()
    expect(within(now()).getByRole('button', { name: 'Ver partidas' })).not.toBeNull()
    cleanup()
    renderManage('acompanhar_partidas', 0, champ({ bracket: 'confirmado', matches_total: 5, waiting: 3, finished: 2 }))
    expect(await screen.findByRole('heading', { name: 'Partidas em andamento' })).not.toBeNull()
    expect(now().textContent).toContain('esperam o resultado dos anteriores')
  })

  it('evento encerrado: o chaveamento e as partidas seguem acessíveis, com os jogos encerrados', async () => {
    renderManage('nenhuma', null, champ({ bracket: 'confirmado', matches_total: 5, finished: 5 }), { state: 'encerrado', phase: 'encerrado' })
    expect(await screen.findByRole('heading', { name: 'Evento encerrado' })).not.toBeNull()
    expect(section('Chaveamento').getAttribute('aria-disabled')).toBeNull()
    expect(section('Partidas').textContent).toContain('5 de 5 encerradas')
  })

  it('sem sorteio possível (menos de 2 confirmadas), continua aguardando e explica', async () => {
    renderManage('aguardar_inicio', null, champ({ confirmed: 1 }), { state: 'publicado', phase: 'inscricoes_encerradas', registration_deadline: inDays(-1, 20) })
    expect(await screen.findByText(/Inscrições encerradas · começa/)).not.toBeNull()
    expect(now().textContent).toContain('Com pelo menos 2 inscrições confirmadas, você pode sortear o chaveamento.')
    expect(section('Chaveamento').getAttribute('aria-disabled')).toBe('true')
    expect(section('Chaveamento').textContent).toContain('Confirme pelo menos 2 inscrições')
  })

  it('sem o contador do cartaz (corrida ou rascunho), as seções ficam como antes', async () => {
    renderManage('aguardar_inicio', null, null, { state: 'publicado', phase: 'inscricoes_abertas' })
    expect(await screen.findByRole('heading', { level: 2, name: 'Seções' })).not.toBeNull()
    expect(section('Chaveamento').getAttribute('aria-disabled')).toBe('true')
    expect(section('Partidas').getAttribute('aria-disabled')).toBe('true')
  })
})

describe('alerta do cartaz', () => {
  it('soma os comprovantes e devoluções aos jogos para agendar e decidir', () => {
    expect(alertCount({ pending: { total: 2 }, championship: champ({ attention: 3 }) })).toBe(5)
    expect(alertCount({ pending: { total: 2 }, championship: null })).toBe(2)
    expect(alertCount({ pending: { total: 0 } })).toBe(0)
  })
})
