import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ResultDecisionPage from '../src/pages/ResultDecisionPage'
import { apiError, mockApi } from './teams-fixtures'
import { caio, court, fromNow, matchDetail, message, noPermissions, page, ricardo, sides } from './match-fixtures'
import { hiddenReport, report, result as resultOf } from './results-fixtures'

/*
 * Placar divergente (D3), do lado do organizador: a linha do tempo, o trecho do chat com "Abrir chat" e a decisão — o placar
 * de um dos times, outro placar ou W.O. — com a justificativa obrigatória; o erro do servidor (eliminação não aceita empate)
 * e o que a tela mostra quando não há nada para decidir.
 */

afterEach(cleanup)

const organizer = { ...noPermissions, read_chat: true, write_chat: true, decide_result: true, schedule_match: false }
const noSides = () => sides({ is_mine: false }, { is_mine: false })

/** Partida de campeonato iniciada, vista pelo organizador (sem lado): Ferrugem (A) disse 2 × 1 e Leões (B), 1 × 1. */
function divergent(overrides: Partial<ReturnType<typeof matchDetail>> = {}) {
  return matchDetail({
    id: 11, origin: 'campeonato', state: 'agendada', phase: 'divergente', sides: noSides(), my_side: null, my_role: 'organizador',
    starts_at: fromNow(-3), court: court(), result_deadline: fromNow(45), event: { id: 5, name: 'Liga Society Noturna' }, round_number: 2,
    result: resultOf({
      state: 'divergente', deadline: fromNow(45),
      reports: { a: { ...report('a', 2, 1), reported_by: ricardo, updated_at: fromNow(-2) }, b: { ...report('b', 1, 1), reported_by: caio, updated_at: fromNow(-1) } },
    }),
    permissions: organizer, ...overrides,
  })
}

type Routes = Parameters<typeof mockApi>[0]
function renderPage(detail = divergent(), routes: Routes = {}) {
  const api = mockApi({
    'GET /matches/11': detail,
    'GET /matches/11/messages?limit=20': page([
      message(1, { body: 'O segundo gol deles saiu depois do apito final.', author: ricardo, side: 'a', author_role: 'representante' }),
      message(2, { body: 'O juiz validou antes de encerrar.', author: caio, side: 'b', author_role: 'representante' }),
      message(3, { body: 'Vou analisar e decido hoje.', author: { ...ricardo, id: 9, name: 'Rafa Nunes' }, side: null, author_role: 'organizador' }),
    ]),
    ...routes,
  })
  const props = { onBack: vi.fn(), onOpenChat: vi.fn(), onDone: vi.fn(), onExpired: vi.fn() }
  render(<ResultDecisionPage matchId={11} {...props} />)
  return { ...api, ...props, user: userEvent.setup() }
}
const radio = (name: string | RegExp) => screen.getByRole('radio', { name }) as HTMLButtonElement
const note = () => screen.getByLabelText('Justificativa (obrigatória)') as HTMLTextAreaElement

describe('linha do tempo e chat', () => {
  it('mostra o jogo, os dois envios (quem e quando) e a divergência', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Placar divergente' })).not.toBeNull()
    expect(screen.getByText('Liga Society Noturna')).not.toBeNull()
    const timeline = screen.getByRole('region', { name: 'Linha do tempo da partida' })
    const steps = within(timeline).getAllByRole('listitem').map(item => item.textContent)
    expect(steps[0]).toContain('Partida jogada')
    expect(steps[0]).toContain('Arena Sudoeste')
    // Os envios, do mais antigo ao mais novo, com a pessoa que enviou.
    expect(steps[1]).toContain('Ferrugem FC informou 2 × 1')
    expect(steps[1]).toContain('Ricardo Moura')
    expect(steps[2]).toContain('Leões do Cerrado informou 1 × 1')
    expect(steps[2]).toContain('Caio Ramos')
    expect(steps[3]).toContain('Placares diferentes')
    expect(steps[3]).toContain('A partida aguarda a sua decisão')
    expect(screen.getByRole('heading', { level: 2, name: 'Ferrugem FC contra Leões do Cerrado' })).not.toBeNull()
  })

  it('o trecho do chat tem as três últimas mensagens, com a etiqueta do organizador, e "Abrir chat" leva à partida', async () => {
    const { user, onOpenChat } = renderPage()
    const chat = await screen.findByRole('region', { name: 'No chat da partida' })
    expect(await within(chat).findByText('O segundo gol deles saiu depois do apito final.')).not.toBeNull()
    expect(within(chat).getByText('Vou analisar e decido hoje.')).not.toBeNull()
    expect(within(chat).getByText('Organizador')).not.toBeNull()
    await user.click(within(chat).getByRole('button', { name: 'Abrir chat' }))
    expect(onOpenChat).toHaveBeenCalledTimes(1)
  })

  it('chat vazio e sem permissão de leitura', async () => {
    renderPage(divergent(), { 'GET /matches/11/messages?limit=20': page([]) })
    expect(await screen.findByText('Ainda não há mensagens no chat desta partida.')).not.toBeNull()
    cleanup()
    renderPage(divergent({ permissions: { ...organizer, read_chat: false } }))
    await screen.findByRole('heading', { level: 1, name: 'Placar divergente' })
    expect(screen.queryByRole('region', { name: 'No chat da partida' })).toBeNull()
  })
})

describe('decisão', () => {
  it('um dos placares informados, com a justificativa de pelo menos 5 caracteres, e volta ao registrar', async () => {
    const { user, find, onDone } = renderPage(divergent(), { 'POST /organizer/matches/11/result-decision': divergent({ state: 'encerrada' }) })
    await screen.findByRole('heading', { name: 'Sua decisão' })
    expect(screen.getByRole('button', { name: 'Registrar decisão' })).not.toBeNull()
    await user.click(radio(/Informado por Ferrugem FC/))
    expect(radio(/Informado por Ferrugem FC/).getAttribute('aria-checked')).toBe('true')
    // Sem justificativa (ou com menos de 5 caracteres) o envio é recusado antes de chamar o servidor.
    await user.click(screen.getByRole('button', { name: 'Registrar 2 × 1' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Escreva a justificativa, de 5 a 500 caracteres.')
    await user.type(note(), 'ok')
    await user.click(screen.getByRole('button', { name: 'Registrar 2 × 1' }))
    expect(find('POST', '/organizer/matches/11/result-decision')).toHaveLength(0)
    await user.type(note(), ' o vídeo confirma o gol')
    expect(screen.getByText(/Fica registrada e os dois times veem\. 25\/500/)).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Registrar 2 × 1' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(find('POST', '/organizer/matches/11/result-decision')[0].body).toEqual({
      score: { goals_a: 2, goals_b: 1 }, justification: 'ok o vídeo confirma o gol',
    })
  })

  it('outro placar: contadores de gols dos dois lados', async () => {
    const { user, find } = renderPage(divergent(), { 'POST /organizer/matches/11/result-decision': divergent({ state: 'encerrada' }) })
    await user.click(await screen.findByRole('radio', { name: /Outro placar/ }))
    const goals = screen.getByRole('group', { name: 'Placar em gols' })
    await user.click(within(goals).getByRole('button', { name: 'Mais gols do Ferrugem FC' }))
    await user.click(within(goals).getByRole('button', { name: 'Mais gols do Ferrugem FC' }))
    await user.click(within(goals).getByRole('button', { name: 'Mais gols do Leões do Cerrado' }))
    await user.type(note(), 'Placar corrigido pela súmula.')
    await user.click(screen.getByRole('button', { name: 'Registrar 2 × 1' }))
    await waitFor(() => expect(find('POST', '/organizer/matches/11/result-decision')).toHaveLength(1))
    expect(find('POST', '/organizer/matches/11/result-decision')[0].body).toEqual({ score: { goals_a: 2, goals_b: 1 }, justification: 'Placar corrigido pela súmula.' })
  })

  it('W.O.: escolhe o lado ausente, sem placar, e mostra o que vale (3 × 0)', async () => {
    const { user, find } = renderPage(divergent(), { 'POST /organizer/matches/11/result-decision': divergent({ state: 'encerrada' }) })
    await user.click(await screen.findByRole('radio', { name: /W\.O\./ }))
    expect(screen.getByText(/vence por/).textContent).toContain('3 × 0')
    // Sem escolher o lado ausente, o envio é recusado.
    await user.type(note(), 'Não compareceu até 20 min.')
    await user.click(screen.getByRole('button', { name: 'Registrar W.O.' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Escolha o lado que não compareceu.')
    await user.click(within(screen.getByRole('radiogroup', { name: 'Lado ausente' })).getByRole('radio', { name: /Leões do Cerrado/ }))
    await user.click(screen.getByRole('button', { name: 'Registrar W.O. de Leões do Cerrado' }))
    await waitFor(() => expect(find('POST', '/organizer/matches/11/result-decision')).toHaveLength(1))
    expect(find('POST', '/organizer/matches/11/result-decision')[0].body).toEqual({ walkover_absent_side: 'b', justification: 'Não compareceu até 20 min.' })
  })

  it('eliminação não aceita empate: o erro do servidor aparece e o formulário continua', async () => {
    const { user, onDone } = renderPage(divergent(), {
      'POST /organizer/matches/11/result-decision': apiError(422, 'Na eliminação simples não há empate. Informe o placar final com o vencedor (some os pênaltis, se houver).'),
    })
    await user.click(await screen.findByRole('radio', { name: /Informado por Leões do Cerrado/ }))
    await user.type(note(), 'Usar o placar do Leões.')
    await user.click(screen.getByRole('button', { name: 'Registrar 1 × 1' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Na eliminação simples não há empate. Informe o placar final com o vencedor (some os pênaltis, se houver).')
    expect(onDone).not.toHaveBeenCalled()
    // O formulário continua com a escolha e a justificativa.
    expect(note().value).toBe('Usar o placar do Leões.')
    expect(radio(/Informado por Leões do Cerrado/).getAttribute('aria-checked')).toBe('true')
  })

  it('409 porque a partida já foi decidida (outra aba): relê o detalhe, tira o formulário e mostra o estado atual com a mensagem', async () => {
    const decided = divergent({
      state: 'encerrada', phase: 'encerrada', permissions: { ...organizer, decide_result: false },
      result: resultOf({ state: 'confirmado', final: { a: 2, b: 1, sets: null, winner: 'a' }, source: 'organizador', decision_reason: 'Vídeo confirma o gol.', reports: { a: report('a', 2, 1), b: report('b', 1, 1) } }),
    })
    let reads = 0
    const { user, find, onDone } = renderPage(divergent(), {
      'GET /matches/11': () => (++reads === 1 ? divergent() : decided),
      'POST /organizer/matches/11/result-decision': apiError(409, 'O resultado desta partida já foi definido.'),
    })
    await user.click(await screen.findByRole('radio', { name: /Informado por Ferrugem FC/ }))
    await user.type(note(), 'Usar o placar do Ferrugem.')
    await user.click(screen.getByRole('button', { name: 'Registrar 2 × 1' }))
    expect(await screen.findByRole('region', { name: 'Resultado registrado' })).not.toBeNull()
    expect(screen.getByRole('alert').textContent).toBe('O resultado desta partida já foi definido.')
    expect(find('GET', '/matches/11')).toHaveLength(2)
    expect(screen.queryByRole('heading', { name: 'Sua decisão' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Registrar/ })).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Resultado decidido' })).not.toBeNull()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('409 com a decisão ainda cabendo: relê, o formulário continua com a escolha e a mensagem do servidor', async () => {
    let reads = 0
    const { user, find } = renderPage(divergent(), {
      'GET /matches/11': () => { reads++; return divergent() },
      'POST /organizer/matches/11/result-decision': apiError(409, 'Esta partida ainda espera o resultado dos jogos anteriores.'),
    })
    await user.click(await screen.findByRole('radio', { name: /Informado por Leões do Cerrado/ }))
    await user.type(note(), 'Usar o placar do Leões.')
    await user.click(screen.getByRole('button', { name: 'Registrar 1 × 1' }))
    await waitFor(() => expect(reads).toBe(2))
    expect((await screen.findByRole('alert')).textContent).toBe('Esta partida ainda espera o resultado dos jogos anteriores.')
    expect(find('GET', '/matches/11')).toHaveLength(2)
    expect(note().value).toBe('Usar o placar do Leões.')
    expect(radio(/Informado por Leões do Cerrado/).getAttribute('aria-checked')).toBe('true')
  })

  it('um erro de validação (422) não relê a partida', async () => {
    const { user, find } = renderPage(divergent(), {
      'POST /organizer/matches/11/result-decision': apiError(422, 'Na eliminação simples não há empate. Informe o placar final com o vencedor (some os pênaltis, se houver).'),
    })
    await user.click(await screen.findByRole('radio', { name: /Informado por Leões do Cerrado/ }))
    await user.type(note(), 'Usar o placar do Leões.')
    await user.click(screen.getByRole('button', { name: 'Registrar 1 × 1' }))
    await screen.findByRole('alert')
    expect(find('GET', '/matches/11')).toHaveLength(1)
  })

  it('as opções são botões de opção: só a escolhida (ou a primeira) entra na ordem do Tab e as setas movem a escolha', async () => {
    const { user } = renderPage()
    await screen.findByRole('heading', { name: 'Sua decisão' })
    const group = screen.getByRole('radiogroup', { name: 'Como decidir o resultado' })
    const options = within(group).getAllByRole('radio')
    expect(options).toHaveLength(4)
    expect(options.map(item => item.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'false'])
    expect(options.map(item => item.tabIndex)).toEqual([0, -1, -1, -1])
    options[0].focus()
    await user.keyboard('{ArrowRight}')
    expect(options[1].getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(options[1])
    expect(options.map(item => item.tabIndex)).toEqual([-1, 0, -1, -1])
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(options[3].getAttribute('aria-checked')).toBe('true') // volta ao fim: W.O.
    expect(screen.getByRole('radiogroup', { name: 'Lado ausente' })).not.toBeNull()
  })

  it('só um lado informou (prazo): o placar informado já vem escolhido; sem nenhum, só outro placar ou W.O.', async () => {
    const one = divergent({ phase: 'informar_resultado', result: resultOf({ state: 'aguardando', deadline: fromNow(-1), reports: { a: report('a', 1, 0), b: null } }) })
    renderPage(one)
    expect(await screen.findByRole('heading', { level: 1, name: 'Decidir resultado' })).not.toBeNull()
    expect(radio(/Informado por Ferrugem FC/).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Prazo de 48 h vencido')).not.toBeNull()
    expect(screen.getByText('Leões do Cerrado não informou o placar')).not.toBeNull()
    cleanup()
    renderPage(divergent({ result: resultOf({ deadline: fromNow(45), reports: { a: null, b: null } }), phase: 'informar_resultado' }))
    await screen.findByRole('heading', { name: 'Sua decisão' })
    const choices = within(screen.getByRole('radiogroup', { name: 'Como decidir o resultado' })).getAllByRole('radio').map(item => item.textContent)
    expect(choices).toEqual([expect.stringContaining('Outro placar'), expect.stringContaining('W.O.')])
    expect(screen.queryByRole('radio', { name: /Informado por/ })).toBeNull()
  })

  it('relato cego (placar oculto) não vira opção de decisão', async () => {
    renderPage(divergent({ result: resultOf({ state: 'divergente', reports: { a: report('a', 2, 0), b: hiddenReport('b') } }) }))
    await screen.findByRole('heading', { name: 'Sua decisão' })
    expect(screen.getAllByRole('radio', { name: /Informado por/ })).toHaveLength(1)
  })
})

describe('tênis', () => {
  const sets = (a: number, b: number) => [{ a, b, tiebreak: null, super_tiebreak: false }]
  it('o placar informado vai com os sets; "Outro placar" pede os sets e valida como o servidor', async () => {
    const detail = divergent({
      sport: 'tenis', format: null, super_tiebreak: false,
      sides: [
        { side: 'a', kind: 'atleta', team: null, athlete: ricardo, tier: null, accepted_at: null, is_mine: false, declared_slots: null },
        { side: 'b', kind: 'atleta', team: null, athlete: caio, tier: null, accepted_at: null, is_mine: false, declared_slots: null },
      ],
      result: resultOf({
        state: 'divergente',
        reports: {
          a: report('a', 2, 0, { sets: [...sets(6, 4), ...sets(6, 3)] }),
          b: report('b', 1, 2, { sets: [...sets(4, 6), ...sets(6, 4), ...sets(3, 6)] }),
        },
      }),
    })
    const { user, find } = renderPage(detail, { 'POST /organizer/matches/11/result-decision': detail })
    await user.click(await screen.findByRole('radio', { name: /Informado por Ricardo Moura/ }))
    await user.type(note(), 'Súmula do juiz confere.')
    await user.click(screen.getByRole('button', { name: 'Registrar 6-4 6-3' }))
    await waitFor(() => expect(find('POST', '/organizer/matches/11/result-decision')).toHaveLength(1))
    expect(find('POST', '/organizer/matches/11/result-decision')[0].body).toEqual({
      score: { sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }] }, justification: 'Súmula do juiz confere.',
    })
    // Outro placar: sets em branco são recusados (0 × 0 não é um set).
    await user.click(screen.getByRole('radio', { name: /Outro placar/ }))
    expect(screen.getByRole('group', { name: 'Placar por sets' })).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Registrar o placar' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/set precisa terminar em 6-0 a 6-4, 7-5 ou 7-6/)
  })
})

describe('sem o que decidir', () => {
  it('já decidida: mostra o resultado e a justificativa, sem formulário', async () => {
    renderPage(divergent({
      state: 'encerrada', phase: 'encerrada', permissions: { ...organizer, decide_result: false },
      result: resultOf({ state: 'confirmado', final: { a: 2, b: 1, sets: null, winner: 'a' }, source: 'organizador', decision_reason: 'Vídeo confirma o gol.', reports: { a: report('a', 2, 1), b: report('b', 1, 1) } }),
    }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Resultado decidido' })).not.toBeNull()
    const card = screen.getByRole('region', { name: 'Resultado registrado' })
    expect(card.textContent).toContain('Resultado registrado: 2 × 1')
    expect(card.textContent).toContain('Justificativa: Vídeo confirma o gol.')
    expect(screen.queryByRole('heading', { name: 'Sua decisão' })).toBeNull()
  })

  it('W.O. decidido mostra o lado ausente e o placar que vale', async () => {
    renderPage(divergent({
      state: 'encerrada', permissions: { ...organizer, decide_result: false }, walkover: { absent_side: 'b', registered_by: null, registered_at: fromNow(-1), contest_until: fromNow(40), contested_by: null, contested_at: null, contest_reason: null, decision: null, decision_reason: null },
      result: resultOf({ state: 'confirmado', final: { a: 3, b: 0, sets: null, winner: 'a' }, source: 'organizador', decision_reason: 'Ausente.' }),
    }))
    const card = await screen.findByRole('region', { name: 'Resultado registrado' })
    expect(card.textContent).toContain('W.O. de Leões do Cerrado: o lado presente venceu por 3 × 0')
  })

  it('antes do início, avisa que a decisão fica disponível depois do horário', async () => {
    renderPage(divergent({ result: null, starts_at: fromNow(20), permissions: { ...organizer, decide_result: false } }))
    expect((await screen.findByRole('note')).textContent).toContain('A partida ainda não começou')
  })

  it('erro de carregamento, 401 e voltar', async () => {
    const first = renderPage(divergent(), { 'GET /matches/11': apiError(404, 'Partida não encontrada.') })
    expect((await screen.findByRole('alert')).textContent).toContain('Partida não encontrada.')
    await first.user.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(first.onBack).toHaveBeenCalled()
    cleanup()
    const expired = renderPage(divergent(), { 'GET /matches/11': apiError(401, 'Sessão expirada.') })
    await waitFor(() => expect(expired.onExpired).toHaveBeenCalled())
  })
})
