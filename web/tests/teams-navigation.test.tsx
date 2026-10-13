import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Profile, User } from '../src/api/client'
import type { ArenaNotification } from '../src/api/notifications'
import ArenaPage from '../src/pages/ArenaPage'
import { brasilia, mockApi, person, receivedInvite, roster, team } from './teams-fixtures'
import { summaryOf } from './notifications-fixtures'

/*
 * Pontas entre as frentes da etapa 1, com o ArenaPage inteiro: as notificações (frente D) abrem Meus times (frente C) no
 * time certo ou na folha de convites, e a placa do Jogar leva a Meus times quando não há time representado.
 */

const me: User = { id: 1, name: 'Ricardo Moura', username: 'ricardo.moura', email: 'r@example.com', birth_date: '1990-01-01', social_public: false, is_admin: false, avatar: null, cover: null }
const football: Profile = { id: 1, sport: 'futebol', city_id: brasilia.id, position: 'atacante', looking_for: false, is_public: false, level: null }
const lions = team({ id: 20, name: 'Leões do Cerrado', initials: 'LC', my_role: 'membro', pending_join_requests: null, pending_invites: null })
const notice = (id: number, type: string, payload: Record<string, unknown>): ArenaNotification =>
  ({ id, type, payload, actor: person(9, 'Caio Ramos'), created_at: new Date(Date.now() - id * 60e3).toISOString(), read_at: null })
const empty = { items: [], next_cursor: null }

function api(notifications: ArenaNotification[], extra: Record<string, unknown> = {}) {
  return mockApi({
    'GET /me/sports-profiles': [football],
    'GET /cities': [brasilia],
    'GET /me/notifications/summary': summaryOf({ unread_count: notifications.length }),
    'GET /me/follow-requests': empty,
    'GET /me/notifications/pending?limit=50': { items: [] },
    'GET /me/notifications?pendente=false': { items: notifications, next_cursor: null },
    'PUT /me/notifications/1/read': summaryOf({ unread_count: 0 }),
    'GET /me/teams': { items: [team(), lions] },
    'GET /me/team-invites': { items: [] },
    'GET /teams/10/members': { items: roster() },
    'GET /teams/20/members': { items: roster() },
    ...extra,
  })
}
const renderArena = () => render(<ArenaPage user={me} onUser={vi.fn()} onLogout={vi.fn()} onExpired={vi.fn()} />)

beforeEach(() => { Element.prototype.scrollTo = () => {} })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('ligações entre Notificações, Jogar e Meus times', () => {
  it('a notificação de convite aceito abre Meus times com o cartão do time citado', async () => {
    const calls = api([notice(1, 'convite_aceito', { team_id: 20, team_name: 'Leões do Cerrado', invite_id: 3 })])
    const ui = userEvent.setup()
    renderArena()
    await ui.click(await screen.findByRole('button', { name: 'Notificações, 1 nova' }))
    await ui.click(await screen.findByRole('button', { name: /aceitou o convite e entrou no Leões do Cerrado/ }))
    const card = await screen.findByRole('group', { name: 'Leões do Cerrado, 2 de 2' })
    expect(card.getAttribute('tabindex')).toBe('0')
    expect(screen.getByRole('group', { name: 'Ferrugem FC, 1 de 2' }).getAttribute('tabindex')).toBe('-1')
    await waitFor(() => expect(calls.find('GET', '/teams/20/members')).toHaveLength(1))
    expect(calls.find('GET', '/teams/10/members')).toHaveLength(0)
    expect(calls.find('PUT', '/me/notifications/1/read')[0].body).toEqual({})
    // Voltar retorna às Notificações, de onde o time foi aberto.
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))
    expect((await screen.findAllByRole('listitem')).length).toBeGreaterThan(0)
  })

  it('a notificação de pedido para entrar leva aos "Pedidos para entrar" do time, uma vez', async () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    const lia = person(18, 'Lia Moraes')
    const calls = api([notice(1, 'pedido_entrada', { team_id: 10, team_name: 'Ferrugem FC', request_id: 601 })], {
      'GET /me/teams': { items: [team({ pending_join_requests: 1 }), lions] },
      'GET /teams/10/join-requests': { items: [{ id: 601, team_id: 10, requester: lia, state: 'pendente', created_at: new Date().toISOString(), decided_at: null }] },
    })
    const ui = userEvent.setup()
    renderArena()
    await ui.click(await screen.findByRole('button', { name: 'Notificações, 1 nova' }))
    await ui.click(await screen.findByRole('button', { name: /pediu para entrar no Ferrugem FC/ }))
    expect(await screen.findByRole('button', { name: 'Aprovar pedido de Lia Moraes' })).not.toBeNull()
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1))
    expect(calls.find('GET', '/teams/10/join-requests')).toHaveLength(1)
    // Trocar de cartão e voltar não rola de novo.
    await ui.click(screen.getByRole('button', { name: 'Mostrar Leões do Cerrado' }))
    await ui.click(screen.getByRole('button', { name: 'Mostrar Ferrugem FC' }))
    await screen.findByRole('button', { name: 'Aprovar pedido de Lia Moraes' })
    expect(scroll).toHaveBeenCalledTimes(1)
  })

  it('a notificação de convite abre a folha de convites recebidos', async () => {
    const invite = receivedInvite()
    api([notice(1, 'convite_time', { team_id: 20, team_name: 'Leões do Cerrado', invite_id: invite.id })], {
      'GET /me/teams': { items: [team()] }, 'GET /me/team-invites': { items: [invite] },
    })
    const ui = userEvent.setup()
    renderArena()
    await ui.click(await screen.findByRole('button', { name: 'Notificações, 1 nova' }))
    await ui.click(await screen.findByRole('button', { name: /convidou você para o Leões do Cerrado/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Convite para time' })
    expect(await within(sheet).findByRole('button', { name: 'Aceitar convite do Leões do Cerrado' })).not.toBeNull()
  })

  it('"Com meu time" sem time representado e "Meu time" levam a Meus times', async () => {
    api([], {
      'GET /me/standings': { calc_version: 1, futebol: { teams: [], individual: [] }, tenis: null, corrida: [] },
      'GET /me/teams': { items: [] },
    })
    const ui = userEvent.setup()
    renderArena()
    await ui.click(within(screen.getByRole('navigation', { name: 'Navegação principal' })).getByRole('button', { name: 'JOGAR' }))
    await ui.click(await screen.findByRole('button', { name: 'Crie ou represente um time' }))
    expect(await screen.findByText('Você ainda não tem time')).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Voltar' }))
    await ui.click(await screen.findByRole('button', { name: /Meu time/ }))
    expect(await screen.findByText('Você ainda não tem time')).not.toBeNull()
  })
})
