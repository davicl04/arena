import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TeamsPage from '../src/pages/TeamsPage'
import { apiError, member, mockApi, person, receivedInvite, reply, roster, team } from './teams-fixtures'

beforeEach(() => { Element.prototype.scrollTo = () => {} })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

/** Meus times com a seleção guardada como no ArenaPage (o cartão escolhido volta como `selectedTeamId`). */
function Harness(props: Partial<React.ComponentProps<typeof TeamsPage>>) {
  const [selected, setSelected] = useState<number | undefined>(props.selectedTeamId)
  return <TeamsPage viewerId={1} onBack={vi.fn()} onCreate={vi.fn()} onEdit={vi.fn()} onInvite={vi.fn()} onLink={vi.fn()} onOpenUser={vi.fn()} onExpired={vi.fn()}
    {...props} selectedTeamId={selected} onSelectTeam={id => { setSelected(id); props.onSelectTeam?.(id) }} />
}
const status = () => screen.getAllByRole('status').map(node => node.textContent).join(' ')

describe('Meus times', () => {
  it('mostra a carteirinha C5 e o elenco; o representante aprova pedido e cancela convite', async () => {
    const hugo = person(17, 'Hugo Prates')
    let approved = false
    const api = mockApi({
      'GET /me/teams': () => ({ items: [team({ pending_join_requests: approved ? 0 : 1, pending_invites: 1, member_count: approved ? 4 : 3 })] }),
      'GET /me/team-invites': { items: [] },
      'GET /teams/10/members': () => ({ items: approved ? [...roster(), member(17, 'Hugo Prates')] : roster() }),
      'GET /teams/10/join-requests': () => ({ items: approved ? [] : [{ id: 601, team_id: 10, requester: hugo, state: 'pendente', created_at: new Date(Date.now() - 3600e3).toISOString(), decided_at: null }] }),
      'GET /teams/10/invites': { items: [{ id: 503, invitee: person(12, 'Marcos Lima'), inviter: person(1, 'Ricardo Moura'), message: null, state: 'pendente', created_at: '2026-10-01T10:00:00Z' }] },
      'PUT /team-join-requests/601': () => { approved = true; return { id: 601, team_id: 10, requester: hugo, state: 'aprovado', created_at: '2026-10-11T10:00:00Z', decided_at: '2026-10-12T10:00:00Z' } },
      'DELETE /team-invites/503': undefined,
    })
    const onLink = vi.fn()
    const ui = userEvent.setup()
    render(<Harness onLink={onLink} />)
    const card = await screen.findByRole('group', { name: 'Ferrugem FC, 1 de 1' })
    expect(within(card).getByText('Brasília · você representa')).toBeTruthy()
    expect(within(card).getByText('Prata')).toBeTruthy()
    expect(within(card).getByText('sem jogos')).toBeTruthy()
    expect(within(card).getByRole('button', { name: 'Convidar' })).toBeTruthy()
    expect(within(card).queryByRole('button', { name: 'Sair do time' })).toBeNull()
    await ui.click(within(card).getByRole('button', { name: 'Link e QR do time' }))
    expect(onLink).toHaveBeenCalledWith(expect.objectContaining({ id: 10 }))
    expect(within(card).getByRole('button', { name: 'Editar time' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Tiago Melo · Defesa' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ricardo Moura · Atacante · Representante · você' })).toBeTruthy()

    await ui.click(await screen.findByRole('button', { name: 'Aprovar pedido de Hugo Prates' }))
    await waitFor(() => expect(status()).toContain('Hugo Prates entrou no elenco.'))
    expect(api.find('PUT', '/team-join-requests/601')[0].body).toEqual({ decision: 'aprovar' })
    expect(screen.queryByRole('button', { name: 'Aprovar pedido de Hugo Prates' })).toBeNull()
    // O elenco recarrega com quem entrou.
    expect(await screen.findByRole('button', { name: 'Hugo Prates · Meio de campo' })).toBeTruthy()

    await ui.click(screen.getByRole('button', { name: 'Cancelar convite de Marcos Lima' }))
    await waitFor(() => expect(status()).toContain('Convite para Marcos Lima cancelado.'))
    expect(api.find('DELETE', '/team-invites/503')[0].body).toBeUndefined()
  })

  it('recusa um pedido para entrar e mostra o erro de pedido já decidido', async () => {
    const lia = person(18, 'Lia Moraes')
    const request = { id: 602, team_id: 10, requester: lia, state: 'pendente', created_at: '2026-10-11T10:00:00Z', decided_at: null }
    let attempts = 0
    const api = mockApi({
      'GET /me/teams': { items: [team({ pending_join_requests: 1 })] }, 'GET /me/team-invites': { items: [] }, 'GET /teams/10/members': { items: roster() },
      'GET /teams/10/join-requests': () => ({ items: attempts > 1 ? [] : [request] }),
      'PUT /team-join-requests/602': () => ++attempts === 1 ? { ...request, state: 'recusado' } : apiError(409, 'Este pedido não está mais pendente.'),
    })
    const ui = userEvent.setup()
    render(<Harness />)
    await ui.click(await screen.findByRole('button', { name: 'Recusar pedido de Lia Moraes' }))
    await waitFor(() => expect(status()).toContain('Pedido de Lia Moraes recusado.'))
    expect(api.find('PUT', '/team-join-requests/602')[0].body).toEqual({ decision: 'recusar' })
  })

  it('aceita o convite pela faixa: o time entra no carrossel e fica selecionado', async () => {
    const invite = receivedInvite()
    let accepted = false
    const joined = { ...invite.team, my_role: 'membro' as const, member_count: 4 }
    const api = mockApi({
      'GET /me/teams': () => ({ items: accepted ? [team(), joined] : [team()] }),
      'GET /me/team-invites': () => ({ items: accepted ? [] : [invite] }),
      'GET /teams/10/members': { items: roster() },
      'GET /teams/20/members': { items: [member(9, 'Caio Ramos', { role: 'representante' }), member(1, 'Ricardo Moura')] },
      'PUT /team-invites/501': () => { accepted = true; return { state: 'aceito', team: joined } },
    })
    const onSelectTeam = vi.fn()
    const ui = userEvent.setup()
    render(<Harness onSelectTeam={onSelectTeam} />)
    await ui.click(await screen.findByRole('button', { name: 'Leões do Cerrado convidou você' }))
    const sheet = screen.getByRole('dialog', { name: 'Convite para time' })
    expect(within(sheet).getByText('Precisamos de um atacante para quinta.')).toBeTruthy()
    expect(within(sheet).getByText(/Caio Ramos convidou você · há 2 horas/)).toBeTruthy()
    expect(within(sheet).getByRole('list', { name: 'Formatos em que o time jogou' }).textContent).toContain('Society')
    await ui.click(within(sheet).getByRole('button', { name: 'Aceitar convite do Leões do Cerrado' }))
    await waitFor(() => expect(status()).toContain('Você entrou no Leões do Cerrado.'))
    expect(api.find('PUT', '/team-invites/501')[0].body).toEqual({ decision: 'aceitar' })
    expect(onSelectTeam).toHaveBeenCalledWith(20)
    expect(screen.queryByRole('dialog')).toBeNull()
    const card = await screen.findByRole('group', { name: 'Leões do Cerrado, 2 de 2' })
    expect(within(card).getByText('Brasília · você é membro')).toBeTruthy()
    expect(within(card).getByRole('button', { name: 'Sair do time' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /convidou você|convites para times/ })).toBeNull()
  })

  it('recusa convite e mostra "2 convites para times" com mais de um', async () => {
    const first = receivedInvite()
    const second = receivedInvite({ id: 502, team: team({ id: 30, name: 'Unidos do Lago', my_role: null }), inviter: null, message: null })
    let left = [first, second]
    const api = mockApi({
      'GET /me/teams': { items: [] }, 'GET /me/team-invites': () => ({ items: left }),
      'PUT /team-invites/502': () => { left = [first]; return { state: 'recusado', team: null } },
    })
    const ui = userEvent.setup()
    render(<Harness />)
    expect(await screen.findByText('Você ainda não tem time')).toBeTruthy()
    await ui.click(screen.getByRole('button', { name: '2 convites para times' }))
    const sheet = screen.getByRole('dialog', { name: 'Convites para times · 2' })
    expect(within(sheet).getByText(/Um representante convidou você/)).toBeTruthy()
    await ui.click(within(sheet).getByRole('button', { name: 'Recusar convite do Unidos do Lago' }))
    await waitFor(() => expect(status()).toContain('Convite do Unidos do Lago recusado.'))
    expect(api.find('PUT', '/team-invites/502')[0].body).toEqual({ decision: 'recusar' })
    expect(screen.getByRole('dialog', { name: 'Convite para time' })).toBeTruthy()
  })

  it('torna representante pela folha do atleta e mostra o erro do último representante', async () => {
    const api = mockApi({
      'GET /me/teams': { items: [team()] }, 'GET /me/team-invites': { items: [] }, 'GET /teams/10/members': { items: roster() },
      'PATCH /teams/10/members/3': member(3, 'Tiago Melo', { position: 'defesa', role: 'representante' }),
      'PATCH /teams/10/members/2': apiError(409, 'O time precisa de pelo menos um representante. Passe a braçadeira a outro atleta antes.'),
    })
    const onOpenUser = vi.fn()
    const ui = userEvent.setup()
    render(<Harness onOpenUser={onOpenUser} />)
    await ui.click(await screen.findByRole('button', { name: 'Tiago Melo · Defesa' }))
    let sheet = screen.getByRole('dialog', { name: 'Tiago Melo' })
    expect(within(sheet).getByText(/Defesa · no time desde/)).toBeTruthy()
    await ui.click(within(sheet).getByRole('button', { name: /Tornar representante/ }))
    await waitFor(() => expect(status()).toContain('Tiago agora é representante do Ferrugem FC.'))
    expect(api.find('PATCH', '/teams/10/members/3')[0].body).toEqual({ role: 'representante' })

    await ui.click(screen.getByRole('button', { name: 'Rafa Nunes · Meio de campo · Representante' }))
    sheet = screen.getByRole('dialog', { name: 'Rafa Nunes' })
    const loads = api.find('GET', '/me/teams').length
    await ui.click(within(sheet).getByRole('button', { name: /Tirar a braçadeira/ }))
    expect((await within(sheet).findByRole('alert')).textContent).toBe('O time precisa de pelo menos um representante. Passe a braçadeira a outro atleta antes.')
    expect(api.find('PATCH', '/teams/10/members/2')[0].body).toEqual({ role: 'membro' })
    // O 409 indica elenco desatualizado: a página relê o time, e a folha continua aberta com o erro.
    await waitFor(() => expect(api.find('GET', '/me/teams').length).toBe(loads + 1))
    expect(screen.getByRole('dialog', { name: 'Rafa Nunes' })).toBeTruthy()
    await ui.click(within(sheet).getByRole('button', { name: 'Ver perfil' }))
    expect(onOpenUser).toHaveBeenCalledWith(2)
  })

  it('remove um atleta só depois da confirmação', async () => {
    let removed = false
    const api = mockApi({
      'GET /me/teams': { items: [team()] }, 'GET /me/team-invites': { items: [] },
      'GET /teams/10/members': () => ({ items: removed ? roster().slice(0, 2) : roster() }),
      'DELETE /teams/10/members/3': () => { removed = true; return undefined },
    })
    const ui = userEvent.setup()
    render(<Harness />)
    await ui.click(await screen.findByRole('button', { name: 'Tiago Melo · Defesa' }))
    const sheet = screen.getByRole('dialog', { name: 'Tiago Melo' })
    await ui.click(within(sheet).getByRole('button', { name: 'Remover do time' }))
    const confirm = within(sheet).getByRole('group', { name: 'Confirmação' })
    expect(confirm.textContent).toContain('Remover Tiago Melo do Ferrugem FC?')
    expect(document.activeElement).toBe(confirm)
    await ui.click(within(confirm).getByRole('button', { name: 'Cancelar' }))
    expect(api.find('DELETE', '/teams/10/members/3')).toHaveLength(0)
    await ui.click(within(sheet).getByRole('button', { name: 'Remover do time' }))
    await ui.click(within(sheet).getByRole('button', { name: 'Remover' }))
    await waitFor(() => expect(status()).toContain('Tiago Melo foi removido do Ferrugem FC.'))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Tiago Melo · Defesa' })).toBeNull())
  })

  it('o último representante não tira a própria braçadeira nem sai; membro sai do time pelo cartão', async () => {
    const solo = team({ representative_count: 1, member_count: 1, roster_preview: team().roster_preview.slice(0, 1) })
    let mine = [solo, team({ id: 11, name: 'Unidos do Lago', my_role: 'membro', pending_invites: null, pending_join_requests: null })]
    const api = mockApi({
      'GET /me/teams': () => ({ items: mine }), 'GET /me/team-invites': { items: [] },
      'GET /teams/10/members': { items: [member(1, 'Ricardo Moura', { role: 'representante' })] },
      'GET /teams/11/members': { items: roster() },
      'DELETE /teams/11/members/1': () => { mine = [solo]; return undefined },
    })
    const onInvite = vi.fn()
    const ui = userEvent.setup()
    render(<Harness onInvite={onInvite} />)
    expect(await screen.findByText('Seu time só tem você')).toBeTruthy()
    await ui.click(screen.getAllByRole('button', { name: 'Convidar' }).at(-1)!)
    expect(onInvite).toHaveBeenCalledWith(expect.objectContaining({ id: 10 }))
    await ui.click(await screen.findByRole('button', { name: /^Ricardo Moura/ }))
    const sheet = screen.getByRole('dialog', { name: 'Ricardo Moura' })
    expect(within(sheet).queryByRole('button', { name: 'Ver perfil' })).toBeNull()
    expect(within(sheet).getByRole('button', { name: /Tirar a braçadeira/ }).hasAttribute('disabled')).toBe(true)
    expect(within(sheet).getByRole('button', { name: /Sair do time/ }).hasAttribute('disabled')).toBe(true)
    expect(sheet.textContent).toContain('O time precisa de pelo menos um representante.')
    await ui.keyboard('{Escape}')

    // Teclado no carrossel: a seta leva ao cartão seguinte e troca o elenco mostrado.
    screen.getByRole('group', { name: 'Ferrugem FC, 1 de 2' }).focus()
    await ui.keyboard('{ArrowRight}')
    const second = screen.getByRole('group', { name: 'Unidos do Lago, 2 de 2' })
    expect(document.activeElement).toBe(second)
    expect(await screen.findByRole('button', { name: 'Tiago Melo · Defesa' })).toBeTruthy()
    await ui.click(within(second).getByRole('button', { name: 'Sair do time' }))
    const leave = screen.getByRole('dialog', { name: 'Sair do Unidos do Lago' })
    await ui.click(within(leave).getByRole('button', { name: 'Sair do time' }))
    await waitFor(() => expect(status()).toContain('Você saiu do Unidos do Lago.'))
    expect(api.find('DELETE', '/teams/11/members/1')).toHaveLength(1)
    await waitFor(() => expect(screen.queryByRole('group', { name: /Unidos do Lago/ })).toBeNull())
  })

  it('mostra 11 rostos e o "+N" abre o elenco completo; os pontos levam a cada cartão', async () => {
    const many = Array.from({ length: 14 }, (_, index) => member(index + 1, `Atleta ${index + 1}`))
    mockApi({
      'GET /me/teams': { items: [team({ member_count: 14 }), team({ id: 11, name: 'Unidos do Lago', my_role: 'membro' })] }, 'GET /me/team-invites': { items: [] },
      'GET /teams/10/members': { items: many }, 'GET /teams/11/members': { items: roster() },
    })
    const onSelectTeam = vi.fn()
    const ui = userEvent.setup()
    render(<Harness onSelectTeam={onSelectTeam} />)
    await ui.click(await screen.findByRole('button', { name: 'Ver todos os 14 atletas' }))
    expect(screen.getByRole('button', { name: /^Atleta 14/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Elenco · 14' })).toBeTruthy()
    await ui.click(screen.getByRole('button', { name: 'Mostrar Unidos do Lago' }))
    expect(onSelectTeam).toHaveBeenCalledWith(11)
    expect(screen.getByRole('button', { name: 'Mostrar Unidos do Lago' }).getAttribute('aria-current')).toBe('true')
  })

  it('mostra o erro de carregamento e tenta de novo', async () => {
    let fail = true
    mockApi({ 'GET /me/teams': () => fail ? reply(503, { detail: 'Serviço indisponível.' }) : { items: [] }, 'GET /me/team-invites': { items: [] } })
    const ui = userEvent.setup()
    render(<Harness />)
    expect((await screen.findByRole('alert')).textContent).toContain('Serviço indisponível.')
    fail = false
    await ui.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('Você ainda não tem time')).toBeTruthy()
  })

  it('abre já com a folha de convites quando vem de uma notificação', async () => {
    mockApi({ 'GET /me/teams': { items: [] }, 'GET /me/team-invites': { items: [receivedInvite()] } })
    const onInvitesOpened = vi.fn()
    render(<Harness openInvites onInvitesOpened={onInvitesOpened} />)
    expect(await screen.findByRole('dialog', { name: 'Convite para time' })).toBeTruthy()
    expect(onInvitesOpened).toHaveBeenCalled()
  })
})
