import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MatchPage from '../src/pages/MatchPage'
import { combineDateTime } from '../src/utils/dateKey'
import { apiError, mockApi } from './teams-fixtures'
import {
  arranging, caio, court, fromNow, matchDetail, memberPermissions, noPermissions, page, ricardo, scheduled, sides, terms, walkover,
} from './match-fixtures'
import { findToast, renderWithToaster } from './toast-utils'

/*
 * Tela da partida (P2): cabeçalho, cartão de condições, folha "Propor condições" com Date Picker, horário e quadras,
 * reserva, cancelamento e W.O. A tela obedece a `detail.permissions` do servidor.
 */

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

type Routes = Parameters<typeof mockApi>[0]
function renderMatch(detail: ReturnType<typeof matchDetail>, routes: Routes = {}) {
  const api = mockApi({ 'GET /matches/1': detail, 'GET /matches/1/messages': page([]), 'GET /matches/1/stats': { items: [] }, ...routes })
  const onBack = vi.fn()
  const onExpired = vi.fn()
  renderWithToaster(<MatchPage matchId={1} viewerId={1} onBack={onBack} onExpired={onExpired} />)
  return { ...api, onBack, onExpired, user: userEvent.setup() }
}
const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement

/** Escolhe um dia no Date Picker aberto (relógio de teste em 12/10/2026). */
async function pickDay(user: ReturnType<typeof userEvent.setup>, day: string) {
  await user.click(screen.getByRole('button', { name: /^Data:/ }))
  const calendar = await screen.findByRole('dialog', { name: 'Escolher data' })
  const target = Array.from(calendar.querySelectorAll<HTMLButtonElement>('[data-slot="calendar-day"]'))
    .find(item => item.textContent === day && !item.hasAttribute('data-outside'))!
  await user.click(target)
}

describe('cabeçalho', () => {
  it('mostra os brasões, "Ferrugem × Leões", o estado e o elo só quando o pareamento o guardou', async () => {
    renderMatch(matchDetail({ sides: sides({ tier: null }, { tier: 'prata' }) }))
    await screen.findByRole('button', { name: /Condições da partida/ })
    const title = screen.getByRole('heading', { level: 1, name: 'Ferrugem FC contra Leões do Cerrado' })
    expect(Array.from(title.querySelectorAll('b')).map(name => name.textContent)).toEqual(['Ferrugem', 'Leões'])
    expect(screen.getByText('Combinando')).not.toBeNull()
    expect(screen.getByRole('img', { name: 'Brasão de Ferrugem FC' })).not.toBeNull()
    expect(screen.getByRole('img', { name: 'Brasão de Leões do Cerrado' })).not.toBeNull()
    // Só o lado com elo guardado mostra o elo; quem está em classificação não ganha elo.
    expect(screen.getAllByRole('img', { name: /^Elo / }).map(img => img.getAttribute('alt'))).toEqual(['Elo Prata'])
  })

  it('usa o lado do titular primeiro e os nomes completos quando as primeiras palavras coincidem', async () => {
    renderMatch(matchDetail({
      my_side: 'b',
      sides: sides({ team: { id: 10, name: 'Real Guará', initials: 'RG', crest_url: null }, is_mine: false }, { team: { id: 20, name: 'Real Brasília', initials: 'RB', crest_url: null }, is_mine: true }),
    }))
    await screen.findByRole('button', { name: /Condições da partida/ })
    const title = screen.getByRole('heading', { level: 1 })
    expect(Array.from(title.querySelectorAll('b')).map(name => name.textContent)).toEqual(['Real Brasília', 'Real Guará'])
  })

  it('volta pelo botão "Voltar"', async () => {
    const { user, onBack } = renderMatch(matchDetail())
    await screen.findByRole('button', { name: /Condições da partida/ })
    await user.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

describe('estados da tela', () => {
  it('mostra o carregamento e depois a partida', async () => {
    renderMatch(matchDetail())
    expect(screen.getByText('Carregando partida…')).not.toBeNull()
    expect(await screen.findByRole('button', { name: /Condições da partida/ })).not.toBeNull()
  })

  it('partida inexistente ou sem acesso (404): estado vazio com "Voltar"', async () => {
    const { onBack, user } = renderMatch(matchDetail(), { 'GET /matches/1': apiError(404, 'Partida não encontrada.') })
    expect(await screen.findByText('Partida não encontrada')).not.toBeNull()
    expect(screen.getByText('Ela não existe ou você não participa dela.')).not.toBeNull()
    await user.click(screen.getAllByRole('button', { name: 'Voltar' })[1])
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('log')).toBeNull()
  })

  it('sessão expirada (401) chama onExpired', async () => {
    const { onExpired } = renderMatch(matchDetail(), { 'GET /matches/1': apiError(401, 'Sessão expirada.') })
    await waitFor(() => expect(onExpired).toHaveBeenCalled())
  })

  it('erro de rede mostra o aviso e tenta de novo pelo botão', async () => {
    let calls = 0
    const { user } = renderMatch(matchDetail(), { 'GET /matches/1': () => (++calls === 1 ? apiError(500, 'Falha no servidor.') : matchDetail()) })
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Falha no servidor.'))
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByRole('button', { name: /Condições da partida/ })).not.toBeNull()
  })

  it('proposta ainda não aceita: aviso, sem chat e sem condições', async () => {
    renderMatch(matchDetail({ state: 'proposta', phase: 'proposta', permissions: noPermissions }))
    expect(await screen.findByText('Proposta aguardando resposta')).not.toBeNull()
    expect(screen.queryByRole('log')).toBeNull()
    expect(screen.queryByRole('button', { name: /Condições da partida/ })).toBeNull()
  })

  it('chat fechado antes do aceite: estado vazio e nenhuma leitura de mensagens', async () => {
    const api = renderMatch(matchDetail({ permissions: { ...arranging, read_chat: false, write_chat: false } }))
    expect(await screen.findByText('O chat ainda não abriu')).not.toBeNull()
    expect(screen.getByText('O chat abre quando os dois lados aceitam a proposta.')).not.toBeNull()
    expect(api.calls.filter(call => call.path.startsWith('/matches/1/messages'))).toHaveLength(0)
  })
})

describe('condições: propor', () => {
  it('propõe data, horário, quadra do catálogo e quem reserva', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
    const proposed = matchDetail({
      terms: { current: null, pending: terms({ id: 40, starts_at: combineDateTime('2026-10-20', '19:00')!, proposed_by: ricardo, proposed_by_side: 'a', booking_side: 'b', accepted_a_at: fromNow(0), accepted_b_at: null }) },
      permissions: { ...arranging, accept_terms: false },
    })
    const { user, find } = renderMatch(matchDetail(), {
      'GET /courts?city_id=5300108&kind=society&match_id=1': { items: [court(), court({ id: 8, name: 'Quadra do Lago', address: null })] },
      'POST /matches/1/terms': proposed,
    })
    expect(await screen.findByText(/Os representantes combinam dia, horário e quadra/)).not.toBeNull()
    await user.click(button('Propor condições'))
    const sheet = await screen.findByRole('dialog', { name: 'Propor condições' })
    expect(within(sheet).getByText('Ferrugem FC × Leões do Cerrado')).not.toBeNull()

    await pickDay(user, '20')
    fireEvent.change(within(sheet).getByLabelText('Horário'), { target: { value: '19:00' } })
    await user.click(await within(sheet).findByRole('button', { name: /Arena Sudoeste/ }))
    expect(within(sheet).getByRole('button', { name: /Arena Sudoeste/ }).getAttribute('aria-pressed')).toBe('true')
    // Quem reserva: por padrão o meu lado; escolhe o adversário.
    expect(within(sheet).getByRole('button', { name: 'Ferrugem FC' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(within(sheet).getByRole('button', { name: 'Leões do Cerrado' }))
    await user.click(within(sheet).getByRole('button', { name: 'Enviar proposta' }))

    expect(find('POST', '/matches/1/terms')[0].body).toEqual({
      starts_at: combineDateTime('2026-10-20', '19:00'), court_id: 7, booking_side: 'b',
    })
    expect(await findToast('Proposta enviada. Leões do Cerrado precisa aceitar.')).not.toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Propor condições' })).toBeNull()
    // O cartão mostra a proposta com os selos de aceite de cada lado.
    expect(screen.getByText('Proposta de Ferrugem FC')).not.toBeNull()
    expect(screen.getByText('Ferrugem FC aceitou')).not.toBeNull()
    expect(screen.getByText('Leões do Cerrado falta aceitar')).not.toBeNull()
    expect(screen.getByText('Aguardando Leões aceitar a proposta.')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Aceitar condições' })).toBeNull()
  })

  it('desabilita os dias passados e limita a data a 60 dias', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
    const { user } = renderMatch(matchDetail(), { 'GET /courts?city_id=5300108&kind=society&match_id=1': { items: [] } })
    await user.click(await screen.findByRole('button', { name: 'Propor condições' }))
    await user.click(screen.getByRole('button', { name: /^Data:/ }))
    const calendar = await screen.findByRole('dialog', { name: 'Escolher data' })
    const day = (text: string) => Array.from(calendar.querySelectorAll<HTMLButtonElement>('[data-slot="calendar-day"]'))
      .find(item => item.textContent === text && !item.hasAttribute('data-outside'))!
    expect(day('11').disabled).toBe(true)
    expect(day('12').disabled).toBe(false)
    // O horário usa passo de 15 minutos.
    await user.keyboard('{Escape}')
    const time = screen.getByLabelText('Horário') as HTMLInputElement
    expect(time.step).toBe('900')
  })

  it('confere data, horário, passo de 15 minutos, horário futuro e quadra antes de enviar, e mostra o erro do servidor sem fechar', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
    const { user, find } = renderMatch(matchDetail(), {
      'GET /courts?city_id=5300108&kind=society&match_id=1': { items: [court()] },
      'POST /matches/1/terms': apiError(422, 'Escolha uma quadra de society.'),
    })
    await user.click(await screen.findByRole('button', { name: 'Propor condições' }))
    const sheet = await screen.findByRole('dialog', { name: 'Propor condições' })
    const send = () => user.click(within(sheet).getByRole('button', { name: 'Enviar proposta' }))
    await send()
    expect(within(sheet).getByRole('alert').textContent).toBe('Escolha a data da partida.')
    await pickDay(user, '20')
    await send()
    expect(within(sheet).getByRole('alert').textContent).toBe('Escolha o horário da partida.')
    fireEvent.change(within(sheet).getByLabelText('Horário'), { target: { value: '19:10' } })
    await send()
    expect(within(sheet).getByRole('alert').textContent).toBe('Use horários de 15 em 15 minutos.')
    fireEvent.change(within(sheet).getByLabelText('Horário'), { target: { value: '19:15' } })
    await send()
    expect(within(sheet).getByRole('alert').textContent).toBe('Escolha a quadra do catálogo ou sugira uma.')
    await user.click(await within(sheet).findByRole('button', { name: /Arena Sudoeste/ }))
    await send()
    expect(await findToast('Escolha uma quadra de society.')).not.toBeNull()
    expect(find('POST', '/matches/1/terms')).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: 'Propor condições' })).not.toBeNull()
  })

  it('busca quadras no catálogo da cidade pelo nome e mostra o estado vazio', async () => {
    const { user, find } = renderMatch(matchDetail(), {
      'GET /courts?city_id=5300108&kind=society&match_id=1': { items: [] },
      'GET /courts?city_id=5300108&kind=society&q=lago&match_id=1': { items: [court({ id: 8, name: 'Quadra do Lago' })] },
    })
    await user.click(await screen.findByRole('button', { name: 'Propor condições' }))
    const sheet = await screen.findByRole('dialog', { name: 'Propor condições' })
    expect(await within(sheet).findByText('Ainda não há quadras publicadas em Brasília. Sugira a quadra onde vocês vão jogar.')).not.toBeNull()
    await user.type(within(sheet).getByLabelText('Buscar quadra'), 'lago')
    expect(await within(sheet).findByRole('button', { name: /Quadra do Lago/ })).not.toBeNull()
    expect(find('GET', '/courts?city_id=5300108&kind=society&q=lago&match_id=1').length).toBeGreaterThan(0)
    // Enter na busca não envia a proposta que está em volta.
    await user.type(within(sheet).getByLabelText('Buscar quadra'), '{Enter}')
    expect(find('POST', '/matches/1/terms')).toHaveLength(0)
  })

  it('sugere outra quadra: fica "em revisão", vale só nesta partida e entra na proposta', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
    const suggested = court({ id: 9, name: 'Quadra Nova', address: 'SQN 100', state: 'em_revisao', provisional: true })
    const { user, find } = renderMatch(matchDetail(), {
      'GET /courts?city_id=5300108&kind=society&match_id=1': { items: [] },
      'POST /courts/suggestions': { court: suggested, existing: false },
      'POST /matches/1/terms': matchDetail({ terms: { current: null, pending: terms({ id: 41, court: suggested, accepted_a_at: fromNow(0), accepted_b_at: null, proposed_by_side: 'a' }) } }),
    })
    await user.click(await screen.findByRole('button', { name: 'Propor condições' }))
    const sheet = await screen.findByRole('dialog', { name: 'Propor condições' })
    await user.click(await within(sheet).findByRole('button', { name: /Sugerir outra quadra/ }))
    // Nome curto demais.
    await user.type(within(sheet).getByLabelText('Nome da quadra'), 'A')
    await user.click(within(sheet).getByRole('button', { name: 'Sugerir quadra' }))
    expect(within(sheet).getByRole('alert').textContent).toBe('O nome da quadra precisa ter de 2 a 80 caracteres.')
    await user.clear(within(sheet).getByLabelText('Nome da quadra'))
    await user.type(within(sheet).getByLabelText('Nome da quadra'), 'Quadra Nova')
    await user.type(within(sheet).getByLabelText(/Endereço/), 'SQN 100')
    await user.click(within(sheet).getByRole('button', { name: 'Sugerir quadra' }))

    expect(find('POST', '/courts/suggestions')[0].body).toEqual({ match_id: 1, name: 'Quadra Nova', address: 'SQN 100' })
    const option = await within(sheet).findByRole('button', { name: /Quadra Nova/ })
    expect(option.getAttribute('aria-pressed')).toBe('true')
    expect(within(option).getByText('Sugestão em revisão')).not.toBeNull()
    expect((await findToast('Quadra Nova foi sugerida.')).closest('[data-tone]')?.getAttribute('data-tone')).toBe('warning')
    expect(await findToast(/até a aprovação da administração/)).not.toBeNull()

    await pickDay(user, '20')
    fireEvent.change(within(sheet).getByLabelText('Horário'), { target: { value: '20:00' } })
    await user.click(within(sheet).getByRole('button', { name: 'Enviar proposta' }))
    expect(find('POST', '/matches/1/terms')[0].body).toMatchObject({ court_id: 9 })
    // No cartão, a quadra segue com o selo "Sugestão em revisão".
    expect(await screen.findByText('Sugestão em revisão')).not.toBeNull()
    expect(screen.getByText('vale só para esta partida')).not.toBeNull()
  })

  it('uma falha ao sugerir a quadra vira toast de erro e o formulário da sugestão continua aberto', async () => {
    const { user } = renderMatch(matchDetail(), {
      'GET /courts?city_id=5300108&kind=society&match_id=1': { items: [] },
      'POST /courts/suggestions': apiError(500, 'Não foi possível registrar a sugestão agora.'),
    })
    await user.click(await screen.findByRole('button', { name: 'Propor condições' }))
    const sheet = await screen.findByRole('dialog', { name: 'Propor condições' })
    await user.click(await within(sheet).findByRole('button', { name: /Sugerir outra quadra/ }))
    await user.type(within(sheet).getByLabelText('Nome da quadra'), 'Quadra Nova')
    await user.click(within(sheet).getByRole('button', { name: 'Sugerir quadra' }))
    expect((await findToast('Não foi possível registrar a sugestão agora.')).closest('[data-tone]')?.getAttribute('data-tone')).toBe('error')
    expect(within(sheet).queryByRole('alert')).toBeNull()
    expect(within(sheet).getByLabelText('Nome da quadra')).not.toBeNull()
  })

  it('sem permissão para sugerir, a folha não oferece "Sugerir outra quadra"', async () => {
    const { user } = renderMatch(matchDetail({ permissions: { ...arranging, suggest_court: false } }), {
      'GET /courts?city_id=5300108&kind=society&match_id=1': { items: [court()] },
    })
    await user.click(await screen.findByRole('button', { name: 'Propor condições' }))
    await screen.findByRole('button', { name: /Arena Sudoeste/ })
    expect(screen.queryByRole('button', { name: /Sugerir outra quadra/ })).toBeNull()
  })

  it('mostra o erro de ao carregar o catálogo sem travar a folha', async () => {
    const { user } = renderMatch(matchDetail(), { 'GET /courts?city_id=5300108&kind=society&match_id=1': apiError(500, 'Catálogo indisponível.') })
    await user.click(await screen.findByRole('button', { name: 'Propor condições' }))
    const sheet = await screen.findByRole('dialog', { name: 'Propor condições' })
    expect(await within(sheet).findByText('Catálogo indisponível.')).not.toBeNull()
    expect(within(sheet).getByRole('button', { name: 'Tentar novamente' })).not.toBeNull()
    expect(within(sheet).getByRole('button', { name: /Sugerir outra quadra/ })).not.toBeNull()
  })

  it('pelo ícone do campo do chat, o representante abre a mesma folha', async () => {
    const { user } = renderMatch(matchDetail(), { 'GET /courts?city_id=5300108&kind=society&match_id=1': { items: [] } })
    await user.click(await screen.findByRole('button', { name: 'Propor dia, horário e quadra' }))
    expect(await screen.findByRole('dialog', { name: 'Propor condições' })).not.toBeNull()
  })

  it('no tênis, a folha oferece o super tie-break e envia a escolha', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
    const tennis = matchDetail({
      sport: 'tenis', format: null, my_role: 'atleta',
      sides: [
        { side: 'a', kind: 'atleta', team: null, athlete: ricardo, tier: null, accepted_at: fromNow(-1), is_mine: true, declared_slots: null },
        { side: 'b', kind: 'atleta', team: null, athlete: caio, tier: null, accepted_at: fromNow(-1), is_mine: false, declared_slots: null },
      ],
    })
    const { user, find } = renderMatch(tennis, {
      'GET /courts?city_id=5300108&kind=tenis&match_id=1': { items: [court({ kind: 'tenis', name: 'Clube de Tênis' })] },
      'POST /matches/1/terms': tennis,
    })
    await user.click(await screen.findByRole('button', { name: 'Propor condições' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Ricardo Moura contra Caio Ramos' })).not.toBeNull()
    const sheet = await screen.findByRole('dialog', { name: 'Propor condições' })
    await pickDay(user, '21')
    fireEvent.change(within(sheet).getByLabelText('Horário'), { target: { value: '07:30' } })
    await user.click(await within(sheet).findByRole('button', { name: /Clube de Tênis/ }))
    await user.click(within(sheet).getByRole('switch', { name: 'Super tie-break no lugar do 3º set' }))
    await user.click(within(sheet).getByRole('button', { name: 'Enviar proposta' }))
    expect(find('POST', '/matches/1/terms')[0].body).toEqual({
      starts_at: combineDateTime('2026-10-21', '07:30'), court_id: 7, booking_side: 'a', super_tiebreak: true,
    })
  })

  it('fecha a folha com o botão de fechar sem enviar nada', async () => {
    const { user, find } = renderMatch(matchDetail(), { 'GET /courts?city_id=5300108&kind=society&match_id=1': { items: [] } })
    await user.click(await screen.findByRole('button', { name: 'Propor condições' }))
    const sheet = await screen.findByRole('dialog', { name: 'Propor condições' })
    await user.click(within(sheet).getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog', { name: 'Propor condições' })).toBeNull()
    expect(find('POST', '/matches/1/terms')).toHaveLength(0)
  })
})

describe('condições: aceitar', () => {
  const opponentProposal = () => matchDetail({
    terms: { current: null, pending: terms() },
    permissions: { ...arranging, accept_terms: true },
    needs_my_action: true,
  })

  it('mostra a proposta do adversário com os selos e aceita as condições: a partida fica agendada', async () => {
    const { user, find } = renderMatch(opponentProposal(), {
      'PUT /matches/1/terms/31/accept': scheduled(72, { permissions: { ...arranging, cancel: true } }),
    })
    expect(await screen.findByText('Proposta de Leões do Cerrado')).not.toBeNull()
    expect(screen.getByText('Arena Sudoeste')).not.toBeNull()
    expect(screen.getByText('Reserva: Leões do Cerrado')).not.toBeNull()
    expect(screen.getByText('Ferrugem FC falta aceitar')).not.toBeNull()
    expect(screen.getByText('Leões do Cerrado aceitou')).not.toBeNull()
    await user.click(button('Aceitar condições'))
    expect(find('PUT', '/matches/1/terms/31/accept')[0].body).toEqual({})
    expect(await findToast('Partida agendada. As condições estão valendo.')).not.toBeNull()
    expect(screen.getByText('Agendada')).not.toBeNull()
    expect(screen.getByRole('button', { name: /Partida agendada/ })).not.toBeNull()
  })

  it('mostra o erro do servidor ao aceitar condições substituídas, sem perder a tela', async () => {
    const { user } = renderMatch(opponentProposal(), { 'PUT /matches/1/terms/31/accept': apiError(409, 'Estas condições foram substituídas. Confira a proposta atual.') })
    await user.click(await screen.findByRole('button', { name: 'Aceitar condições' }))
    expect(await findToast('Estas condições foram substituídas. Confira a proposta atual.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Aceitar condições' })).not.toBeNull()
  })

  it('"Propor outra" abre a folha já com a proposta atual', async () => {
    const proposal = opponentProposal()
    const { user } = renderMatch(proposal, { 'GET /courts?city_id=5300108&kind=society&match_id=1': { items: [court()] } })
    await user.click(await screen.findByRole('button', { name: 'Propor outra' }))
    const sheet = await screen.findByRole('dialog', { name: 'Propor condições' })
    expect(within(sheet).getByLabelText('Horário')).toHaveProperty('value', expect.stringMatching(/^\d\d:\d\d$/))
    expect(within(sheet).getByRole('button', { name: /Arena Sudoeste/ }).getAttribute('aria-pressed')).toBe('true')
    expect(within(sheet).getByRole('button', { name: 'Leões do Cerrado' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('qualquer alteração depois do aceite exige novo aceite dos dois lados', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
    const base = scheduled(24 * 8)
    const changed = {
      ...base,
      terms: { current: base.terms.current, pending: terms({ id: 55, starts_at: combineDateTime('2026-10-21', '20:00')!, proposed_by: ricardo, proposed_by_side: 'a', accepted_a_at: fromNow(0), accepted_b_at: null }) },
      permissions: { ...base.permissions, accept_terms: false },
    }
    const { user, find } = renderMatch(base, {
      'GET /courts?city_id=5300108&kind=society&match_id=1': { items: [court()] },
      'POST /matches/1/terms': changed,
    })
    // Agendada: o cartão vem recolhido, com o resumo.
    const trigger = await screen.findByRole('button', { name: /Partida agendada/ })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await user.click(trigger)
    await user.click(await screen.findByRole('button', { name: 'Alterar' }))
    const sheet = await screen.findByRole('dialog', { name: 'Propor condições' })
    await pickDay(user, '21')
    fireEvent.change(within(sheet).getByLabelText('Horário'), { target: { value: '20:00' } })
    await user.click(await within(sheet).findByRole('button', { name: /Arena Sudoeste/ }))
    await user.click(within(sheet).getByRole('button', { name: 'Enviar proposta' }))
    expect(find('POST', '/matches/1/terms')).toHaveLength(1)

    // A partida continua agendada, com as condições antigas valendo e a nova esperando o aceite do outro lado.
    expect(await screen.findByText('Nova proposta')).not.toBeNull()
    expect(screen.getByText(/Continua valendo/)).not.toBeNull()
    expect(screen.getByText('Ferrugem FC aceitou')).not.toBeNull()
    expect(screen.getByText('Leões do Cerrado falta aceitar')).not.toBeNull()
    expect(screen.getByText('Aguardando Leões aceitar a proposta.')).not.toBeNull()
    expect(screen.getByText('Agendada')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Aceitar condições' })).toBeNull()
  })

  it('o aceite do outro lado (evento no chat) atualiza o cartão sem recarregar', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    const proposal = matchDetail({ terms: { current: null, pending: terms({ proposed_by: ricardo, proposed_by_side: 'a', accepted_a_at: fromNow(-1), accepted_b_at: null }) } })
    let reads = 0
    const { calls } = renderMatch(proposal, {
      'GET /matches/1': () => (++reads === 1 ? proposal : scheduled(72)),
      'GET /matches/1/messages': page([{ ...message0(), id: 1 }]),
      'GET /matches/1/messages?after=1': page([{ ...eventMessage(2) }], { last_id: 2 }),
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    expect(screen.getByText('Aguardando Leões aceitar a proposta.')).not.toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(4100) })
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    expect(screen.getByText('Agendada')).not.toBeNull()
    expect(calls.filter(call => call.path === '/matches/1')).toHaveLength(2)
  })
})

/** Mensagem de texto simples e faixa de evento do aceite, para o teste acima. */
function message0() {
  return { id: 1, kind: 'texto' as const, event_type: null, body: 'Oi', removed: false, author: caio, side: 'b' as const, author_role: 'representante' as const, is_mine: false, payload: null, created_at: fromNow(-1) }
}
function eventMessage(id: number) {
  return { id, kind: 'evento' as const, event_type: 'partida_agendada' as const, body: 'Partida agendada na quadra Arena Sudoeste.', removed: false, author: null, side: 'b' as const, author_role: null, is_mine: false, payload: null, created_at: fromNow(0) }
}

describe('condições: membro e papéis sem ação', () => {
  it('o membro não aceita nem propõe: "Só os representantes aceitam"', async () => {
    renderMatch(matchDetail({
      my_role: 'membro', permissions: memberPermissions,
      terms: { current: null, pending: terms() },
    }))
    expect(await screen.findByText(/Só os representantes aceitam/)).not.toBeNull()
    expect(screen.getByText('Proposta de Leões do Cerrado')).not.toBeNull()
    for (const name of ['Aceitar condições', 'Propor outra', 'Propor condições', 'Cancelar partida', 'Ajustar'])
      expect(screen.queryByRole('button', { name })).toBeNull()
    // O membro conversa: o campo do chat existe, sem o atalho de propor.
    expect(screen.getByLabelText('Mensagem')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Propor dia, horário e quadra' })).toBeNull()
  })

  it('agendada, o membro vê "Só os representantes alteram a partida" ao abrir o cartão', async () => {
    const { user } = renderMatch(scheduled(72, { my_role: 'membro', permissions: memberPermissions }))
    await user.click(await screen.findByRole('button', { name: /Partida agendada/ }))
    expect(await screen.findByText('Só os representantes alteram a partida.')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Alterar' })).toBeNull()
  })

  it('a administração só lê: sem ações e sem campo de mensagem', async () => {
    renderMatch(matchDetail({ my_role: 'administracao', my_side: null, permissions: { ...noPermissions, read_chat: true } }))
    expect(await screen.findByText('A administração só lê o chat.')).not.toBeNull()
    expect(screen.queryByLabelText('Mensagem')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Propor condições' })).toBeNull()
  })
})

describe('reserva', () => {
  it('quem reserva confirma com o interruptor e volta a "a confirmar"', async () => {
    const base = scheduled(72, { booking: { side: 'a', state: 'a_confirmar', confirmed_at: null }, permissions: { ...arranging, confirm_booking: true, cancel: true } })
    base.terms.current = { ...base.terms.current!, booking_side: 'a' }
    const confirmed = { ...base, booking: { side: 'a' as const, state: 'confirmada' as const, confirmed_at: fromNow(0) } }
    const { user, find } = renderMatch(base, { 'PUT /matches/1/booking': confirmed })
    await user.click(await screen.findByRole('button', { name: /Partida agendada/ }))
    expect(await screen.findByText('Reserva: Ferrugem FC')).not.toBeNull()
    expect(screen.getByText('a confirmar com o local')).not.toBeNull()
    const toggle = screen.getByRole('switch', { name: 'Reserva confirmada' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    await user.click(toggle)
    expect(find('PUT', '/matches/1/booking')[0].body).toEqual({ confirmed: true })
    expect(await findToast('Reserva confirmada.')).not.toBeNull()
    expect(screen.getByRole('switch', { name: 'Reserva confirmada' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('confirmada com o local')).not.toBeNull()
  })

  it('quando o adversário reserva, mostra só o estado, sem o interruptor', async () => {
    const { user } = renderMatch(scheduled(72, { booking: { side: 'b', state: 'confirmada', confirmed_at: fromNow(-2) } }))
    await user.click(await screen.findByRole('button', { name: /Partida agendada/ }))
    expect(await screen.findByText('Reserva: Leões do Cerrado')).not.toBeNull()
    expect(screen.getByText('confirmada com o local')).not.toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
  })
})

describe('cancelamento', () => {
  it('cancela antes de 24 h, com motivo opcional: a partida fica cancelada e o chat só leitura', async () => {
    const base = scheduled(72)
    const cancelled = matchDetail({
      ...base, state: 'cancelada', phase: 'cancelada', permissions: { ...noPermissions, read_chat: true },
      cancellation: { at: fromNow(0), by: ricardo, reason: 'A quadra caiu para manutenção.' },
    })
    const { user, find } = renderMatch(base, { 'POST /matches/1/cancel': cancelled })
    await user.click(await screen.findByRole('button', { name: /Partida agendada/ }))
    expect(await screen.findByText(/Dá para cancelar até/)).not.toBeNull()
    await user.click(button('Cancelar partida'))
    const sheet = await screen.findByRole('dialog', { name: 'Cancelar partida' })
    expect(within(sheet).getByText(/Os dois elencos e os avulsos escalados são avisados/)).not.toBeNull()
    await user.type(within(sheet).getByLabelText('Motivo (opcional)'), 'A quadra caiu para manutenção.')
    await user.click(within(sheet).getByRole('button', { name: 'Confirmar cancelamento' }))
    expect(find('POST', '/matches/1/cancel')[0].body).toEqual({ reason: 'A quadra caiu para manutenção.' })
    expect(await findToast('Partida cancelada. Os dois lados foram avisados.')).not.toBeNull()
    expect(screen.getAllByText('Cancelada').length).toBeGreaterThan(0)
    expect(screen.getByText(/Ricardo Moura cancelou a partida\. Motivo: A quadra caiu para manutenção\./)).not.toBeNull()
    expect(screen.getByText('O chat desta partida está fechado.')).not.toBeNull()
  })

  it('o motivo é opcional: sem texto, envia reason nulo', async () => {
    const base = matchDetail()
    const { user, find } = renderMatch(base, { 'POST /matches/1/cancel': matchDetail({ state: 'cancelada', phase: 'cancelada', permissions: noPermissions, cancellation: { at: fromNow(0), by: ricardo, reason: null } }) })
    await user.click(await screen.findByRole('button', { name: 'Cancelar partida' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Cancelar partida' })).getByRole('button', { name: 'Confirmar cancelamento' }))
    expect(find('POST', '/matches/1/cancel')[0].body).toEqual({ reason: null })
  })

  it('o erro do servidor aparece na folha, que continua aberta', async () => {
    const { user } = renderMatch(scheduled(72), { 'POST /matches/1/cancel': apiError(409, 'Faltam menos de 24 h para a partida. Quem não comparecer perde por W.O.') })
    await user.click(await screen.findByRole('button', { name: /Partida agendada/ }))
    await user.click(await screen.findByRole('button', { name: 'Cancelar partida' }))
    const sheet = await screen.findByRole('dialog', { name: 'Cancelar partida' })
    await user.click(within(sheet).getByRole('button', { name: 'Confirmar cancelamento' }))
    expect(await findToast(/Faltam menos de 24 h/)).not.toBeNull()
    expect(screen.getByRole('dialog', { name: 'Cancelar partida' })).not.toBeNull()
  })

  it('com menos de 24 h para a partida não há botão de cancelar e o aviso explica o W.O.', async () => {
    const { user } = renderMatch(scheduled(10))
    await user.click(await screen.findByRole('button', { name: /Partida agendada/ }))
    expect(await screen.findByText(/Faltam menos de 24 h: não dá mais para cancelar/)).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancelar partida' })).toBeNull()
  })

  it('em "combinando" o cancelamento vale a qualquer momento', async () => {
    const { user } = renderMatch(matchDetail())
    await user.click(await screen.findByRole('button', { name: 'Cancelar partida' }))
    const sheet = await screen.findByRole('dialog', { name: 'Cancelar partida' })
    expect(within(sheet).getByText(/A partida combinada é encerrada/)).not.toBeNull()
  })
})

describe('W.O.', () => {
  /** Partida que já começou (início há 2 h), com o placar ainda aguardando. */
  const resultOf = (state: 'aguardando' | 'wo_registrado' | 'wo_contestado' | 'confirmado' | 'sem_resultado' = 'aguardando', overrides: Record<string, unknown> = {}) => ({
    state, deadline: fromNow(46), reports: { a: null, b: null }, final: null, source: null, confirmed_at: null, decision_reason: null, points: null, ...overrides,
  })
  const started = (overrides: Partial<ReturnType<typeof scheduled>> = {}) => scheduled(-2, {
    result: resultOf(),
    phase: 'informar_resultado', result_deadline: fromNow(46), cancel_until: fromNow(-26),
    permissions: { ...noPermissions, read_chat: true, write_chat: true, report_result: true, register_walkover: true }, ...overrides,
  })

  it('registra o W.O. depois do horário: confirma, grava e mostra o aviso com o prazo de contestação', async () => {
    const registered = started({
      walkover: walkover(), phase: 'wo_registrado', result: resultOf('wo_registrado'),
      permissions: { ...noPermissions, read_chat: true, write_chat: true, withdraw_walkover: true },
    })
    const { user, find } = renderMatch(started(), { 'POST /matches/1/walkover': registered })
    await user.click(await screen.findByRole('button', { name: /Partida agendada/ }))
    expect(await screen.findByText(/Leões do Cerrado não compareceu\?/)).not.toBeNull()
    await user.click(button('Registrar W.O.'))
    const sheet = await screen.findByRole('dialog', { name: 'Registrar W.O.' })
    expect(within(sheet).getByText('3 × 0')).not.toBeNull()
    await user.click(within(sheet).getByRole('button', { name: 'Registrar W.O.' }))
    expect(find('POST', '/matches/1/walkover')[0].body).toEqual({})
    expect(await findToast('W.O. registrado. O outro lado pode contestar até o fim do prazo.')).not.toBeNull()
    // O estado do W.O. fica no cartão de resultado; os botões, no de condições (sem repetir a nota).
    expect(screen.getByText('W.O. registrado contra Leões do Cerrado')).not.toBeNull()
    expect(document.querySelector('[data-slot="walkover-note"]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Registrar W.O.' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Retirar W.O.' })).not.toBeNull()
  })

  it('no tênis o W.O. vale 6-0 6-0', async () => {
    const tennis = started({ sport: 'tenis', format: null, my_role: 'atleta' })
    const { user } = renderMatch(tennis)
    await user.click(await screen.findByRole('button', { name: /Partida agendada/ }))
    await user.click(await screen.findByRole('button', { name: 'Registrar W.O.' }))
    expect(within(await screen.findByRole('dialog', { name: 'Registrar W.O.' })).getByText('6-0 6-0')).not.toBeNull()
  })

  it('retira o W.O. registrado pelo meu lado e relê a partida', async () => {
    let reads = 0
    const withWalkover = started({ walkover: walkover(), phase: 'wo_registrado', result: resultOf('wo_registrado'), permissions: { ...noPermissions, read_chat: true, write_chat: true, withdraw_walkover: true } })
    const { user, find } = renderMatch(withWalkover, {
      'GET /matches/1': () => (++reads === 1 ? withWalkover : started()),
      'DELETE /matches/1/walkover': undefined,
    })
    // Com W.O. registrado o cartão de condições já abre.
    expect(await screen.findByText('W.O. registrado contra Leões do Cerrado')).not.toBeNull()
    await user.click(button('Retirar W.O.'))
    const sheet = await screen.findByRole('dialog', { name: 'Retirar W.O.' })
    await user.click(within(sheet).getByRole('button', { name: 'Retirar W.O.' }))
    expect(find('DELETE', '/matches/1/walkover')).toHaveLength(1)
    expect(await findToast('W.O. retirado. A partida volta a aguardar o placar.')).not.toBeNull()
    expect(screen.queryByText('W.O. registrado contra Leões do Cerrado')).toBeNull()
  })

  it('o lado ausente contesta com motivo de 5 a 500 caracteres; a administração decide', async () => {
    const asAbsent = started({
      my_side: 'b', sides: sides({ is_mine: false }, { is_mine: true }), walkover: walkover({ registered_by: caio, absent_side: 'b' }), phase: 'wo_registrado', result: resultOf('wo_registrado'),
      permissions: { ...noPermissions, read_chat: true, write_chat: true, contest_walkover: true }, needs_my_action: true,
    })
    const contested = { ...asAbsent, phase: 'wo_contestado' as const, result: resultOf('wo_contestado'), walkover: walkover({ absent_side: 'b', registered_by: caio, contested_by: ricardo, contested_at: fromNow(0), contest_reason: 'Estávamos na quadra.' }), permissions: { ...noPermissions, read_chat: true, write_chat: true } }
    const { user, find } = renderMatch(asAbsent, { 'POST /matches/1/walkover/contest': contested })
    await user.click(await screen.findByRole('button', { name: 'Contestar W.O.' }))
    const sheet = await screen.findByRole('dialog', { name: 'Contestar W.O.' })
    await user.type(within(sheet).getByLabelText('O que aconteceu?'), 'Não')
    await user.click(within(sheet).getByRole('button', { name: 'Contestar W.O.' }))
    expect(within(sheet).getByRole('alert').textContent).toBe('Conte o que aconteceu.')
    expect(find('POST', '/matches/1/walkover/contest')).toHaveLength(0)
    await user.type(within(sheet).getByLabelText('O que aconteceu?'), ' Estávamos na quadra.')
    await user.click(within(sheet).getByRole('button', { name: 'Contestar W.O.' }))
    expect(find('POST', '/matches/1/walkover/contest')[0].body).toEqual({ reason: 'Não Estávamos na quadra.' })
    expect(await findToast('Contestação enviada à administração.')).not.toBeNull()
    expect(screen.getAllByText('W.O. contestado').length).toBeGreaterThan(0)
    expect(screen.getByText(/Ricardo Moura contestou o W\.O\.: “Estávamos na quadra\.” A administração decide/)).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Contestar W.O.' })).toBeNull()
  })

  it('mostra a decisão da administração sobre o W.O.', async () => {
    renderMatch(started({
      state: 'encerrada', phase: 'encerrada', permissions: { ...noPermissions, read_chat: true },
      result: resultOf('confirmado', { source: 'administracao', final: { a: 3, b: 0, sets: null, winner: 'a' }, decision_reason: 'Sem provas de presença.' }),
      walkover: walkover({ contested_by: caio, contested_at: fromNow(-3), contest_reason: 'Estávamos lá.', decision: 'mantido', decision_reason: 'Sem provas de presença.' }),
    }))
    expect(await screen.findByText('Placar confirmado · 3 × 0')).not.toBeNull()
    expect(screen.getByText(/A administração decidiu o resultado\. Sem provas de presença\./)).not.toBeNull()
  })

  it('o erro do servidor ao registrar fica na folha', async () => {
    const { user } = renderMatch(started(), { 'POST /matches/1/walkover': apiError(409, 'O outro lado já informou o placar. Informe o seu ou converse no chat.') })
    await user.click(await screen.findByRole('button', { name: /Partida agendada/ }))
    await user.click(await screen.findByRole('button', { name: 'Registrar W.O.' }))
    const sheet = await screen.findByRole('dialog', { name: 'Registrar W.O.' })
    await user.click(within(sheet).getByRole('button', { name: 'Registrar W.O.' }))
    expect(await findToast(/O outro lado já informou o placar/)).not.toBeNull()
  })
})

describe('cartão de resultado', () => {
  it('antes do início, só o aviso honesto, sem botão de placar', async () => {
    renderMatch(scheduled(72))
    expect(await screen.findByText('Informe o placar depois do horário da partida.')).not.toBeNull()
    expect(screen.queryByRole('button', { name: /placar/i })).toBeNull()
  })

  it('depois do início, o MatchResultCard mostra o prazo; confirmado, o placar e a origem (administração)', async () => {
    const result = (state: 'aguardando' | 'confirmado') => ({
      state, deadline: fromNow(46), reports: { a: null, b: null }, source: state === 'confirmado' ? 'administracao' as const : null,
      final: state === 'confirmado' ? { a: 3, b: 0, sets: null, winner: 'a' as const } : null, confirmed_at: null, decision_reason: state === 'confirmado' ? 'O W.O. vale.' : null, points: null,
    })
    renderMatch(scheduled(-1, { result: result('confirmado'), phase: 'encerrada', state: 'encerrada', permissions: noPermissions }))
    expect(await screen.findByText('Placar confirmado · 3 × 0')).not.toBeNull()
    expect(screen.getByText(/A administração decidiu o resultado\. O W\.O\. vale\./)).not.toBeNull()
    cleanup()
    renderMatch(scheduled(-1, { result: result('aguardando'), phase: 'informar_resultado' }))
    expect(await screen.findByText('Aguardando o placar')).not.toBeNull()
  })
})
