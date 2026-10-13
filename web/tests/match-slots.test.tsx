import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MatchPage from '../src/pages/MatchPage'
import { guestSlots, headerNames, maxSlots, openSlotCounts, slotTotal } from '../src/data/match'
import { activeNavFor } from '../src/data/arena'
import { apiError, mockApi } from './teams-fixtures'
import { arranging, marcos, matchDetail, noPermissions, page, scheduled, sides, slot } from './match-fixtures'
import { findToast, renderWithToaster } from './toast-utils'

/*
 * Vagas para avulsos (representante): um passo por posição (no máximo um goleiro e o formato menos um) e a lista dos
 * avulsos escalados com "Remover", com confirmação. Também os mapeamentos de `data/match.ts` e a navegação.
 */

afterEach(cleanup)

type Routes = Parameters<typeof mockApi>[0]
function renderSlots(detail: ReturnType<typeof matchDetail>, routes: Routes = {}) {
  const api = mockApi({ 'GET /matches/1': detail, 'GET /matches/1/messages': page([]), ...routes })
  renderWithToaster(<MatchPage matchId={1} viewerId={1} onBack={vi.fn()} onExpired={vi.fn()} />)
  return { ...api, user: userEvent.setup() }
}
const withSlots = (overrides: Partial<ReturnType<typeof matchDetail>> = {}) => scheduled(72, {
  slots: [
    slot(1, { position: 'goleiro' }), slot(2, { position: 'defesa', state: 'oferecida' }),
    slot(3, { position: 'atacante', state: 'preenchida', guest: marcos, filled_at: '2026-10-12T10:00:00Z' }),
    slot(4, { side: 'b', position: 'meio_campo' }),
  ],
  permissions: { ...arranging, cancel: true, manage_slots: true }, ...overrides,
})
async function openSlots(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Partida agendada/ }))
  await user.click(await screen.findByRole('button', { name: 'Ajustar' }))
  return await screen.findByRole('dialog', { name: 'Vagas para avulsos' })
}
const count = (sheet: HTMLElement, position: string) => within(sheet).getByLabelText(`Vagas de ${position}`).textContent

describe('vagas para avulsos', () => {
  it('mostra o resumo no cartão e as vagas do meu lado nos passos (abertas e reservadas)', async () => {
    const { user } = renderSlots(withSlots())
    await user.click(await screen.findByRole('button', { name: /Partida agendada/ }))
    // 3 abertas ou reservadas (as 2 de A e a de B) e 1 avulso escalado.
    expect(await screen.findByText(/3 vagas abertas · 1 avulso escalado/)).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Ajustar' }))
    const sheet = await screen.findByRole('dialog', { name: 'Vagas para avulsos' })
    expect(within(sheet).getByText(/Ferrugem · Society 7×7 · até 6 vagas/)).not.toBeNull()
    expect(count(sheet, 'Goleiro')).toBe('1')
    expect(count(sheet, 'Defesa')).toBe('1')
    expect(count(sheet, 'Meio de campo')).toBe('0')
    expect(count(sheet, 'Atacante')).toBe('0')
    expect(within(sheet).getByText(/3 de 6 vagas, contando 1 avulso escalado/)).not.toBeNull()
    expect(within(sheet).getByText(/1 vaga está reservada para avulsos que ainda vão responder/)).not.toBeNull()
  })

  it('no máximo um goleiro e o total até o formato menos um', async () => {
    const { user } = renderSlots(withSlots({ slots: [slot(3, { position: 'atacante', state: 'preenchida', guest: marcos })] }))
    const sheet = await openSlots(user)
    const plus = (position: string) => within(sheet).getByRole('button', { name: `Mais uma vaga de ${position}` }) as HTMLButtonElement
    const minus = (position: string) => within(sheet).getByRole('button', { name: `Menos uma vaga de ${position}` }) as HTMLButtonElement
    expect(minus('Goleiro').disabled).toBe(true)
    await user.click(plus('Goleiro'))
    expect(count(sheet, 'Goleiro')).toBe('1')
    expect(plus('Goleiro').disabled).toBe(true)
    // Society: 7 jogadores, até 6 vagas contando o avulso escalado (1): sobram 5.
    for (let i = 0; i < 4; i++) await user.click(plus('Defesa'))
    expect(within(sheet).getByText(/6 de 6 vagas, contando 1 avulso escalado/)).not.toBeNull()
    expect(plus('Defesa').disabled).toBe(true)
    expect(plus('Meio de campo').disabled).toBe(true)
    await user.click(minus('Defesa'))
    expect(plus('Meio de campo').disabled).toBe(false)
  })

  it('salva as vagas do meu lado e mostra o resultado', async () => {
    const saved = withSlots({ slots: [slot(1, { position: 'goleiro' }), slot(9, { position: 'defesa' }), slot(3, { position: 'atacante', state: 'preenchida', guest: marcos })] })
    const { user, find } = renderSlots(withSlots(), { 'PUT /matches/1/slots': saved })
    const sheet = await openSlots(user)
    const save = within(sheet).getByRole('button', { name: 'Salvar vagas' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    await user.click(within(sheet).getByRole('button', { name: 'Mais uma vaga de Defesa' }))
    await user.click(within(sheet).getByRole('button', { name: 'Menos uma vaga de Goleiro' }))
    expect(save.disabled).toBe(false)
    await user.click(save)
    expect(find('PUT', '/matches/1/slots')[0].body).toEqual({ open_slots: { goleiro: 0, defesa: 2, meio_campo: 0, atacante: 0 } })
    expect(await findToast('Vagas para avulsos atualizadas.')).not.toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Vagas para avulsos' })).toBeNull()
  })

  it('mostra o erro do servidor na folha sem fechar', async () => {
    const { user } = renderSlots(withSlots(), { 'PUT /matches/1/slots': apiError(422, 'No máximo uma vaga de goleiro.') })
    const sheet = await openSlots(user)
    await user.click(within(sheet).getByRole('button', { name: 'Mais uma vaga de Meio de campo' }))
    await user.click(within(sheet).getByRole('button', { name: 'Salvar vagas' }))
    expect(await findToast('No máximo uma vaga de goleiro.')).not.toBeNull()
  })

  it('lista os avulsos escalados e remove com confirmação', async () => {
    const after = withSlots({ slots: [slot(1, { position: 'goleiro' }), slot(3, { position: 'atacante', state: 'fechada' as never })].filter(item => item.state !== 'fechada') })
    let reads = 0
    const { user, find } = renderSlots(withSlots(), {
      'GET /matches/1': () => (++reads === 1 ? withSlots() : after),
      'DELETE /matches/1/guests/5': undefined,
    })
    const sheet = await openSlots(user)
    expect(within(sheet).getByText('Marcos Ribeiro')).not.toBeNull()
    expect(within(sheet).getByText('Avulso · Atacante')).not.toBeNull()
    await user.click(within(sheet).getByRole('button', { name: 'Remover Marcos Ribeiro da partida' }))
    const confirm = await screen.findByRole('dialog', { name: 'Remover avulso' })
    expect(within(confirm).getByText(/sai da partida e deixa de ver o chat/)).not.toBeNull()
    // "Voltar" da confirmação volta às vagas sem remover.
    await user.click(within(confirm).getByRole('button', { name: 'Voltar' }))
    expect(find('DELETE', '/matches/1/guests/5')).toHaveLength(0)
    await user.click(within(await screen.findByRole('dialog', { name: 'Vagas para avulsos' })).getByRole('button', { name: 'Remover Marcos Ribeiro da partida' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Remover avulso' })).getByRole('button', { name: 'Remover' }))
    expect(find('DELETE', '/matches/1/guests/5')).toHaveLength(1)
    expect(await findToast('Marcos Ribeiro saiu da partida.')).not.toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(find('GET', '/matches/1')).toHaveLength(2)
  })

  it('o erro ao remover (depois do início, por exemplo) fica na confirmação', async () => {
    const { user } = renderSlots(withSlots(), { 'DELETE /matches/1/guests/5': apiError(409, 'Depois do início, o avulso só fica de fora pela presença.') })
    const sheet = await openSlots(user)
    await user.click(within(sheet).getByRole('button', { name: 'Remover Marcos Ribeiro da partida' }))
    const confirm = await screen.findByRole('dialog', { name: 'Remover avulso' })
    await user.click(within(confirm).getByRole('button', { name: 'Remover' }))
    expect(await findToast('Depois do início, o avulso só fica de fora pela presença.')).not.toBeNull()
  })

  it('em "combinando" avisa que as vagas abrem quando a partida for agendada', async () => {
    const { user } = renderSlots(matchDetail({ permissions: { ...arranging, manage_slots: true } }))
    expect(await screen.findByText('Nenhuma vaga declarada · abrem para avulsos quando a partida for agendada')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Ajustar' }))
    const sheet = await screen.findByRole('dialog', { name: 'Vagas para avulsos' })
    expect(within(sheet).getByText(/As vagas abrem para avulsos quando a partida for agendada/)).not.toBeNull()
    expect(within(sheet).getByText('Nenhum avulso escalado no seu time.')).not.toBeNull()
  })

  it('em "combinando" mostra as vagas declaradas na busca (declared_slots) e as ajusta', async () => {
    const declared = { goleiro: 1, defesa: 0, meio_campo: 0, atacante: 2 }
    const detail = matchDetail({ sides: sides({ declared_slots: declared }), permissions: { ...arranging, manage_slots: true } })
    const { user, find } = renderSlots(detail, { 'PUT /matches/1/slots': detail })
    expect(await screen.findByText('3 vagas declaradas · abrem para avulsos quando a partida for agendada')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Ajustar' }))
    const sheet = await screen.findByRole('dialog', { name: 'Vagas para avulsos' })
    expect(count(sheet, 'Goleiro')).toBe('1')
    expect(count(sheet, 'Atacante')).toBe('2')
    await user.click(within(sheet).getByRole('button', { name: 'Mais uma vaga de Defesa' }))
    await user.click(within(sheet).getByRole('button', { name: 'Salvar vagas' }))
    expect(find('PUT', '/matches/1/slots')[0].body).toEqual({ open_slots: { goleiro: 1, defesa: 1, meio_campo: 0, atacante: 2 } })
  })

  it('sem permissão de ajustar, o cartão só resume as vagas', async () => {
    const { user } = renderSlots(withSlots({ permissions: { ...noPermissions, read_chat: true, write_chat: true } }))
    await user.click(await screen.findByRole('button', { name: /Partida agendada/ }))
    expect(await screen.findByText(/3 vagas abertas · 1 avulso escalado/)).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Ajustar' })).toBeNull()
  })

  it('não há vagas em partida de tênis ou de campeonato', async () => {
    renderSlots(scheduled(72, { sport: 'tenis', format: null, my_role: 'atleta', permissions: { ...arranging, manage_slots: false } }))
    await userEvent.setup().click(await screen.findByRole('button', { name: /Partida agendada/ }))
    expect(screen.queryByText('Vagas para avulsos')).toBeNull()
  })
})

describe('mapeamentos da partida', () => {
  it('conta vagas por posição, avulsos, total e limites por formato', () => {
    const slots = [slot(1, { position: 'goleiro' }), slot(2, { position: 'defesa', state: 'oferecida' }), slot(3, { side: 'b', position: 'defesa' }),
      slot(4, { position: 'atacante', state: 'preenchida', guest: marcos })]
    expect(openSlotCounts(slots, 'a')).toEqual({ goleiro: 1, defesa: 1, meio_campo: 0, atacante: 0 })
    expect(openSlotCounts(slots, 'b')).toEqual({ goleiro: 0, defesa: 1, meio_campo: 0, atacante: 0 })
    expect(guestSlots(slots, 'a').map(item => item.id)).toEqual([4])
    expect(guestSlots(slots, 'b')).toEqual([])
    expect(slotTotal(openSlotCounts(slots, 'a'))).toBe(2)
    expect([maxSlots('futsal'), maxSlots('society'), maxSlots('campo'), maxSlots(null)]).toEqual([4, 6, 10, 0])
  })

  it('o nome do cabeçalho usa a primeira palavra, e o nome completo quando coincide', () => {
    expect(headerNames(sides())).toEqual(['Ferrugem', 'Leões'])
    expect(headerNames(sides({ team: { id: 1, name: 'Real Guará', initials: 'RG', crest_url: null } }, { team: { id: 2, name: 'real Brasília', initials: 'RB', crest_url: null } }))).toEqual(['Real Guará', 'real Brasília'])
  })

  it('a partida acende JOGAR na navegação', () => {
    expect(activeNavFor('match', 'home')).toBe('play')
    expect(activeNavFor('match', 'play')).toBe('play')
    expect(activeNavFor('user-profile', 'match')).toBe('play')
  })
})
