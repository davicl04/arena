import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BracketPage from '../src/pages/BracketPage'
import { apiError, mockApi } from './teams-fixtures'
import { confirmed, eightTeams, eliminationBracket, roundRobinBracket, sixTeams, undrawn } from './brackets-fixtures'
import { findToast, queryToast, renderWithToaster } from './toast-utils'

/*
 * Chaveamento do organizador (B3 + T2): sortear, trocar dois times de lugar, "Sortear de novo" e "Confirmar chaveamento"
 * (com a folha de confirmação), o impedimento do sorteio (`draw_blocker`), o todos contra todos e o chaveamento confirmado.
 */

afterEach(cleanup)

type Routes = Parameters<typeof mockApi>[0]
function renderPage(routes: Routes) {
  const api = mockApi(routes)
  const props = { onBack: vi.fn(), onMatches: vi.fn(), onExpired: vi.fn() }
  renderWithToaster(<BracketPage eventId={5} {...props} />)
  return { ...api, ...props, user: userEvent.setup() }
}
const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement
const swapButton = (label: string) => screen.getAllByRole('button').find(item => item.getAttribute('aria-label')?.startsWith(label)) as HTMLButtonElement

describe('sem sorteio', () => {
  it('explica o sorteio e sorteia: a árvore aparece com o aviso de que só o organizador a vê', async () => {
    const { user, find } = renderPage({
      'GET /events/5/bracket': undrawn(),
      'POST /organizer/events/5/bracket': eliminationBracket(sixTeams),
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Chaveamento' })).not.toBeNull()
    expect(screen.getByText('COPA SUDOESTE SOCIETY', { exact: false })).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Sorteie o chaveamento' })).not.toBeNull()
    expect(screen.getByText(/Quem ficar sem adversário na primeira fase tem folga/)).not.toBeNull()
    await user.click(button('Sortear chaveamento'))
    await screen.findByRole('img', { name: /8 lugares, 2 folgas/ })
    expect(find('POST', '/organizer/events/5/bracket')[0].body).toEqual({})
    expect(await findToast('Sorteio feito.')).toBeTruthy()
    expect(await findToast('Confira e confirme quando estiver pronto.')).toBeTruthy()
    expect(screen.getByText(/6 times confirmados\. Os times só veem a chave depois que você confirmar/)).not.toBeNull()
    expect(screen.getByText('Toque em dois times para trocá-los de lugar.')).not.toBeNull()
    expect(button('Sortear de novo').disabled).toBe(false)
    expect(button('Confirmar chaveamento').disabled).toBe(false)
  })

  it('draw_blocker: mostra o motivo e não deixa sortear', async () => {
    renderPage({ 'GET /events/5/bracket': undrawn('As inscrições ainda estão abertas. Sorteie depois do fim das inscrições.') })
    const note = await screen.findByText('As inscrições ainda estão abertas. Sorteie depois do fim das inscrições.')
    expect(note.closest('[data-slot="draw-blocker"]')).not.toBeNull()
    expect(button('Sortear chaveamento').disabled).toBe(true)
  })

  it('o servidor recusa o sorteio: o erro fica na tela, sem árvore', async () => {
    const { user } = renderPage({
      'GET /events/5/bracket': undrawn(),
      'POST /organizer/events/5/bracket': apiError(409, 'Confirme pelo menos 2 inscrições para sortear o campeonato.'),
    })
    await user.click(await screen.findByRole('button', { name: 'Sortear chaveamento' }))
    expect(await findToast('Confirme pelo menos 2 inscrições para sortear o campeonato.')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('todos contra todos com 5: sorteia as rodadas, sem troca manual, e confirma a tabela', async () => {
    const { user } = renderPage({
      'GET /events/5/bracket': undrawn(null, { kind: 'todos_contra_todos' }),
      'POST /organizer/events/5/bracket': roundRobinBracket(),
      'POST /organizer/events/5/bracket/confirm': confirmedRoundRobin(),
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Tabela' })).not.toBeNull()
    await user.click(button('Sortear rodadas'))
    expect(await screen.findByRole('table', { name: /Tabela cruzada/ })).not.toBeNull()
    expect(screen.getByText(/não há encaixe manual/)).not.toBeNull()
    expect(screen.queryByText('Toque em dois times para trocá-los de lugar.')).toBeNull()
    expect(screen.getByText(/Folga por rodada:/)).not.toBeNull()
    await user.click(button('Confirmar tabela'))
    await user.click(within(screen.getByRole('dialog', { name: 'Confirmar tabela' })).getByRole('button', { name: 'Confirmar' }))
    expect(await findToast('Tabela confirmada.')).toBeTruthy()
    expect(await findToast('As rodadas foram criadas e os times foram avisados.')).toBeTruthy()
  })

  it('no tênis o texto fala em atletas, não em times', async () => {
    const tennis = { sport: 'tenis' as const, kind: 'todos_contra_todos' as const }
    const { user } = renderPage({
      'GET /events/5/bracket': undrawn(null, tennis),
      'POST /organizer/events/5/bracket': roundRobinBracket(undefined, tennis),
      'POST /organizer/events/5/bracket/confirm': confirmed(roundRobinBracket(undefined, tennis)),
    })
    await user.click(await screen.findByRole('button', { name: 'Sortear rodadas' }))
    expect(await screen.findByText(/Os atletas só veem a tabela depois que você confirmar/)).not.toBeNull()
    expect(screen.getByText(/Depois de confirmar, os atletas veem a tabela/)).not.toBeNull()
    await user.click(button('Confirmar tabela'))
    await user.click(within(screen.getByRole('dialog', { name: 'Confirmar tabela' })).getByRole('button', { name: 'Confirmar' }))
    expect(await findToast('Tabela confirmada.')).toBeTruthy()
    expect(await findToast('As rodadas foram criadas e os atletas foram avisados.')).toBeTruthy()
  })
})

function confirmedRoundRobin() {
  return confirmed(roundRobinBracket())
}

describe('trocar lugares', () => {
  const swapped = () => {
    const places = [...sixTeams]
    ;[places[0], places[7]] = [places[7], places[0]]
    return eliminationBracket(places)
  }

  it('escolhe um time, o segundo toque envia {a, b} e a árvore já vem trocada', async () => {
    const { user, find } = renderPage({
      'GET /events/5/bracket': eliminationBracket(sixTeams),
      'PATCH /organizer/events/5/bracket': swapped(),
    })
    await screen.findByRole('img', { name: /8 lugares/ })
    await user.click(swapButton('Novo Horizonte'))
    // A instrução do segundo toque fica na tela (não é toast).
    expect(queryToast(/escolhido/)).toBeNull()
    expect(screen.getByText('Agora toque no time que vai para o lugar de Novo Horizonte.')).not.toBeNull()
    expect(swapButton('Novo Horizonte').getAttribute('aria-pressed')).toBe('true')
    await user.click(swapButton('Bola Murcha FC'))
    expect(await findToast('Troca concluída.')).toBeTruthy()
    expect(await findToast('Novo Horizonte e Bola Murcha FC trocaram de lugar.')).toBeTruthy()
    expect(find('PATCH', '/organizer/events/5/bracket')[0].body).toEqual({ a: 0, b: 7 })
    expect(swapButton('Bola Murcha FC, lugar 1')).toBeDefined()
    expect(swapButton('Novo Horizonte, lugar 8')).toBeDefined()
    expect(screen.getByText('Toque em dois times para trocá-los de lugar.')).not.toBeNull()
  })

  it('tocar duas vezes no mesmo time cancela a escolha, e uma folga também pode ser escolhida', async () => {
    const { user, find } = renderPage({
      'GET /events/5/bracket': eliminationBracket(sixTeams),
      'PATCH /organizer/events/5/bracket': eliminationBracket(sixTeams),
    })
    await screen.findByRole('img', { name: /8 lugares/ })
    await user.click(swapButton('Ferrugem FC'))
    await user.click(swapButton('Ferrugem FC'))
    expect((await findToast('Troca cancelada.')).closest('[data-tone]')?.getAttribute('data-tone')).toBe('info')
    expect(find('PATCH', '/organizer/events/5/bracket')).toHaveLength(0)
    // Um time pode ocupar o lugar de uma folga (lugar 2 da chave).
    await user.click(swapButton('Ferrugem FC'))
    await user.click(swapButton('Folga, lugar 2'))
    await waitFor(() => expect(find('PATCH', '/organizer/events/5/bracket')[0].body).toEqual({ a: 6, b: 1 }))
  })

  it('a troca recusada pelo servidor mostra o erro e solta a escolha', async () => {
    const { user } = renderPage({
      'GET /events/5/bracket': eliminationBracket(sixTeams),
      'PATCH /organizer/events/5/bracket': apiError(422, 'Escolha pelo menos um time para trocar de lugar.'),
    })
    await screen.findByRole('img', { name: /8 lugares/ })
    await user.click(swapButton('Folga, lugar 2'))
    await user.click(swapButton('Folga, lugar 6'))
    expect(await findToast('Escolha pelo menos um time para trocar de lugar.')).toBeTruthy()
    expect(screen.getAllByRole('button').filter(item => item.getAttribute('aria-pressed') === 'true')).toHaveLength(0)
  })

  it('"Sortear de novo" refaz o sorteio e descarta as trocas', async () => {
    const { user, find } = renderPage({
      'GET /events/5/bracket': eliminationBracket(sixTeams, { draw_count: 1 }),
      'POST /organizer/events/5/bracket': eliminationBracket(eightTeams, { draw_count: 2 }),
    })
    await screen.findByRole('img', { name: /8 lugares, 2 folgas/ })
    await user.click(button('Sortear de novo'))
    expect(await findToast('Sorteio refeito.')).toBeTruthy()
    expect(await findToast('As trocas anteriores foram descartadas.')).toBeTruthy()
    expect(find('POST', '/organizer/events/5/bracket')).toHaveLength(1)
    expect(screen.getByRole('img', { name: 'Árvore do chaveamento: 8 lugares. Os confrontos estão na lista logo abaixo.' })).not.toBeNull()
    expect(screen.getByText(/Sorteio nº 2/)).not.toBeNull()
  })

  it('sem permissão de troca ou de sorteio, os botões ficam desabilitados e a árvore é só leitura', async () => {
    renderPage({
      'GET /events/5/bracket': eliminationBracket(sixTeams, {
        permissions: { can_draw: false, can_swap: false, can_confirm: false, draw_blocker: 'Confirme pelo menos 2 inscrições para sortear o campeonato.' },
      }),
    })
    await screen.findByRole('img', { name: /8 lugares/ })
    expect(screen.queryByText('Toque em dois times para trocá-los de lugar.')).toBeNull()
    expect(button('Sortear de novo').disabled).toBe(true)
    expect(button('Confirmar chaveamento').disabled).toBe(true)
    expect(screen.getByText('Confirme pelo menos 2 inscrições para sortear o campeonato.').closest('[data-slot="draw-blocker"]')).not.toBeNull()
    expect(screen.getAllByRole('button').filter(item => item.getAttribute('aria-pressed') !== null)).toHaveLength(0)
  })
})

describe('confirmar', () => {
  it('abre a folha de confirmação, confirma e leva às partidas', async () => {
    const { user, find, onMatches } = renderPage({
      'GET /events/5/bracket': eliminationBracket(sixTeams),
      'POST /organizer/events/5/bracket/confirm': confirmed(eliminationBracket(sixTeams, {}, true)),
    })
    await screen.findByRole('img', { name: /8 lugares/ })
    await user.click(button('Confirmar chaveamento'))
    const sheet = screen.getByRole('dialog', { name: 'Confirmar chaveamento' })
    expect(within(sheet).getByText(/não dá mais para trocar os lugares nem sortear de novo/)).not.toBeNull()
    expect(find('POST', '/organizer/events/5/bracket/confirm')).toHaveLength(0)
    await user.click(within(sheet).getByRole('button', { name: 'Confirmar' }))
    expect(await findToast('Chaveamento confirmado.')).toBeTruthy()
    expect(await findToast('As partidas foram criadas e os times foram avisados.')).toBeTruthy()
    expect(find('POST', '/organizer/events/5/bracket/confirm')[0].body).toEqual({})
    expect(screen.queryByRole('dialog')).toBeNull()
    // Confirmado: sem troca nem sorteio; as partidas são o próximo passo.
    expect(screen.queryByRole('button', { name: 'Sortear de novo' })).toBeNull()
    expect(screen.getAllByRole('button').filter(item => item.getAttribute('aria-pressed') !== null)).toHaveLength(0)
    await user.click(button('Ver e agendar partidas'))
    expect(onMatches).toHaveBeenCalledTimes(1)
  })

  it('comprovante em análise: o servidor recusa e a folha continua aberta com o motivo', async () => {
    const { user } = renderPage({
      'GET /events/5/bracket': eliminationBracket(sixTeams),
      'POST /organizer/events/5/bracket/confirm': apiError(409, 'Analise 1 comprovante(s) pendente(s) antes de confirmar o chaveamento.'),
    })
    await screen.findByRole('img', { name: /8 lugares/ })
    await user.click(button('Confirmar chaveamento'))
    const sheet = screen.getByRole('dialog', { name: 'Confirmar chaveamento' })
    await user.click(within(sheet).getByRole('button', { name: 'Confirmar' }))
    expect(await findToast('Analise 1 comprovante(s) pendente(s) antes de confirmar o chaveamento.')).toBeTruthy()
    expect(screen.getByRole('dialog', { name: 'Confirmar chaveamento' })).not.toBeNull()
    await user.click(within(sheet).getByRole('button', { name: 'Voltar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('já confirmado, com o evento encerrado: mostra o campeão e as colocações', async () => {
    const base = eliminationBracket(eightTeams.slice(0, 4), {}, true)
    const champion = base.rounds[0].nodes[0].slots[0].competitor!
    const runner = base.rounds[0].nodes[0].slots[1].competitor!
    renderPage({
      'GET /events/5/bracket': confirmed(base, {
        event_state: 'encerrado', champion,
        placements: [{ placement: 1, competitor: champion, bonus_points: 0 }, { placement: 2, competitor: runner, bonus_points: 0 }],
      }),
    })
    const board = await screen.findByRole('region', { name: 'Classificação final' })
    expect(within(board).getAllByText('Campeão')).toHaveLength(2)
    expect(within(board).getAllByText('Novo Horizonte').length).toBeGreaterThan(0)
    expect(within(board).getByText('Vice-campeão')).not.toBeNull()
    expect(screen.getByText(/O campeonato terminou/)).not.toBeNull()
  })
})

describe('estado obsoleto depois de um erro do servidor', () => {
  it('troca recusada com 409 porque o chaveamento foi confirmado em outra aba: relê e some com as ações', async () => {
    let reads = 0
    const { user, find } = renderPage({
      'GET /events/5/bracket': () => (++reads === 1 ? eliminationBracket(sixTeams) : confirmed(eliminationBracket(sixTeams, {}, true))),
      'PATCH /organizer/events/5/bracket': apiError(409, 'O chaveamento já foi confirmado.'),
    })
    await screen.findByRole('img', { name: /8 lugares/ })
    await user.click(swapButton('Novo Horizonte'))
    await user.click(swapButton('Bola Murcha FC'))
    expect(await findToast('O chaveamento já foi confirmado.')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Sortear de novo' })).toBeNull())
    expect(find('GET', '/events/5/bracket')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Confirmar chaveamento' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Ver e agendar partidas' })).not.toBeNull()
    expect(screen.getAllByRole('button').filter(item => item.getAttribute('aria-pressed') !== null)).toHaveLength(0)
  })

  it('confirmação recusada com 409 (já confirmado em outra aba): fecha a folha, relê e mantém a mensagem', async () => {
    let reads = 0
    const { user, find } = renderPage({
      'GET /events/5/bracket': () => (++reads === 1 ? eliminationBracket(sixTeams) : confirmed(eliminationBracket(sixTeams, {}, true))),
      'POST /organizer/events/5/bracket/confirm': apiError(409, 'O chaveamento já foi confirmado.'),
    })
    await screen.findByRole('img', { name: /8 lugares/ })
    await user.click(button('Confirmar chaveamento'))
    await user.click(within(screen.getByRole('dialog', { name: 'Confirmar chaveamento' })).getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await findToast('O chaveamento já foi confirmado.')).toBeTruthy()
    expect(find('GET', '/events/5/bracket')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Ver e agendar partidas' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Confirmar chaveamento' })).toBeNull()
  })

  it('evento cancelado (404/409 com a releitura sem permissões): os botões ficam desabilitados', async () => {
    let reads = 0
    const frozen = { permissions: { can_draw: false, can_swap: false, can_confirm: false, draw_blocker: null } }
    const { user } = renderPage({
      'GET /events/5/bracket': () => (++reads === 1 ? eliminationBracket(sixTeams) : eliminationBracket(sixTeams, frozen)),
      'POST /organizer/events/5/bracket': apiError(409, 'Este evento não aceita mais sorteio.'),
    })
    await screen.findByRole('img', { name: /8 lugares/ })
    await user.click(button('Sortear de novo'))
    expect(await findToast('Este evento não aceita mais sorteio.')).toBeTruthy()
    await waitFor(() => expect(button('Sortear de novo').disabled).toBe(true))
    expect(button('Confirmar chaveamento').disabled).toBe(true)
  })

  it('um erro que não é de estado (422) não relê o chaveamento', async () => {
    const { user, find } = renderPage({
      'GET /events/5/bracket': eliminationBracket(sixTeams),
      'PATCH /organizer/events/5/bracket': apiError(422, 'Escolha pelo menos um time para trocar de lugar.'),
    })
    await screen.findByRole('img', { name: /8 lugares/ })
    await user.click(swapButton('Folga, lugar 2'))
    await user.click(swapButton('Folga, lugar 6'))
    expect(await findToast('Escolha pelo menos um time para trocar de lugar.')).toBeTruthy()
    expect(find('GET', '/events/5/bracket')).toHaveLength(1)
  })
})

describe('estados da tela', () => {
  it('erro de carregamento tem "Tentar novamente"; 401 chama onExpired', async () => {
    const { user } = renderPage({ 'GET /events/5/bracket': apiError(500, 'Falha no servidor.') })
    expect((await screen.findByRole('alert')).textContent).toContain('Falha no servidor.')
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    cleanup()
    const expired = renderPage({ 'GET /events/5/bracket': apiError(401, 'Sessão expirada.') })
    await waitFor(() => expect(expired.onExpired).toHaveBeenCalled())
  })

  it('o botão voltar da barra chama onBack', async () => {
    const { user, onBack } = renderPage({ 'GET /events/5/bracket': undrawn() })
    await screen.findByRole('heading', { name: 'Sorteie o chaveamento' })
    await user.click(button('Voltar'))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
