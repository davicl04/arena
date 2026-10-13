import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BracketView } from '../src/components/brackets/BracketView'
import { MirrorBracket } from '../src/components/brackets/MirrorBracket'
import { CrossTable, StandingsTable } from '../src/components/brackets/RoundRobinGrid'
import { mirrorLayout } from '../src/components/brackets/mirrorLayout'
import { eightTeams, eliminationBracket, roundRobinBracket, sixTeams, confirmed } from './brackets-fixtures'
import { score } from './brackets-fixtures'

/*
 * Árvore espelhada (B3 + T2) e tabela cruzada: a geometria do SVG, a lista alternativa dos confrontos para o leitor de
 * tela, "Folga" e "Vencedor J1", os placares e a troca de lugares pelo teclado.
 */

afterEach(cleanup)

describe('geometria da árvore espelhada', () => {
  it('8 lugares: quartas dos dois lados, semifinais ao centro e a final no meio, em 354 px (cabe em 390)', () => {
    const layout = mirrorLayout(eliminationBracket(eightTeams).rounds)
    expect(layout.width).toBe(354)
    expect(layout.nodes).toHaveLength(7)
    expect(layout.columns.map(column => `${column.side}${column.round}`)).toEqual(['left0', 'left1', 'center2', 'right1', 'right0'])
    const final = layout.nodes.find(node => node.side === 'center')!
    // A final fica no centro horizontal e as duas semifinais, à mesma distância dos lados.
    expect(final.x + final.w / 2).toBe(layout.width / 2)
    const semis = layout.nodes.filter(node => node.round === 1)
    expect(semis.map(node => node.side)).toEqual(['left', 'right'])
    expect(semis[0].x + semis[0].w + 14).toBe(final.x)
    // Um conector por confronto que alimenta outro (4 quartas + 2 semifinais).
    expect(layout.connectors).toHaveLength(6)
    // Nada sai da área desenhada.
    for (const node of layout.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0)
      expect(node.x + node.w).toBeLessThanOrEqual(layout.width)
      expect(node.y).toBeGreaterThanOrEqual(0)
      expect(node.y + node.h).toBeLessThanOrEqual(layout.height)
    }
  })

  it('16 lugares passam de 390 px e rolam; 4 e 2 lugares têm menos colunas', () => {
    const sixteen = Array.from({ length: 16 }, (_, index) => `Time ${index + 1}`)
    expect(mirrorLayout(eliminationBracket(sixteen).rounds).width).toBeGreaterThan(390)
    expect(mirrorLayout(eliminationBracket(eightTeams.slice(0, 4)).rounds).columns.map(column => column.side)).toEqual(['left', 'center', 'right'])
    const two = mirrorLayout(eliminationBracket(eightTeams.slice(0, 2)).rounds)
    expect(two.columns).toHaveLength(1)
    expect(two.nodes).toHaveLength(1)
    expect(mirrorLayout([])).toEqual({ width: 0, height: 0, nodes: [], columns: [], connectors: [] })
  })
})

describe('MirrorBracket', () => {
  it('8 confirmados: imagem rotulada, 7 confrontos na lista alternativa e "Vencedor J1" nas fases seguintes', () => {
    render(<MirrorBracket bracket={eliminationBracket(eightTeams)} />)
    expect(screen.getByRole('img', { name: 'Árvore do chaveamento: 8 lugares. Os confrontos estão na lista logo abaixo.' })).not.toBeNull()
    const list = screen.getByRole('list', { name: 'Confrontos do chaveamento' })
    const items = within(list).getAllByRole('listitem').map(item => item.textContent)
    expect(items).toHaveLength(7)
    expect(items[0]).toBe('Quartas de final: J1: Novo Horizonte contra Bola Murcha FC.')
    expect(items[4]).toBe('Semifinal: J5: Vencedor J1 contra Vencedor J2.')
    expect(items[6]).toBe('Final: J7: Vencedor J5 contra Vencedor J6.')
    // Sem `onPick`, não há botões de troca.
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('a lista alternativa sai quando os confrontos já aparecem em lista visível (BracketView)', () => {
    render(<BracketView bracket={eliminationBracket(eightTeams)} />)
    expect(screen.queryByRole('list', { name: 'Confrontos do chaveamento' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Quartas de final' })).not.toBeNull()
    expect(screen.getByRole('region', { name: 'Final' })).not.toBeNull()
  })

  it('6 confirmados: duas folgas passam direto e o rótulo conta as folgas', () => {
    render(<MirrorBracket bracket={eliminationBracket(sixTeams)} />)
    expect(screen.getByRole('img', { name: /8 lugares, 2 folgas/ })).not.toBeNull()
    const items = within(screen.getByRole('list', { name: 'Confrontos do chaveamento' })).getAllByRole('listitem').map(item => item.textContent)
    expect(items.filter(text => text?.includes('avança direto (folga)')).map(text => text?.replace('Quartas de final: ', ''))).toEqual([
      'Novo Horizonte avança direto (folga)', 'Leões do Cerrado avança direto (folga)',
    ])
    // Quem passou pela folga já espera na semifinal; o outro lado é "Vencedor J1" (as folgas não têm número).
    expect(items).toContain('Semifinal: J3: Novo Horizonte contra Vencedor J1.')
    expect(items).toContain('Semifinal: J4: Leões do Cerrado contra Vencedor J2.')
    expect(items).toContain('Final: J5: Vencedor J3 contra Vencedor J4.')
    // A folga é desenhada ("Folga") e os jogos reais têm número no SVG.
    const svg = screen.getByRole('img', { name: /2 folgas/ })
    expect(within(svg as unknown as HTMLElement).getAllByText('Folga')).toHaveLength(2)
    expect(svg.querySelector('[data-node="J1"]')).not.toBeNull()
    expect(svg.querySelector('[data-node="J5"]')).not.toBeNull()
  })

  it('mostra os placares nos lados e destaca quem venceu; o texto alternativo traz o resultado', () => {
    const base = eliminationBracket(eightTeams.slice(0, 4), {}, true)
    const [first] = base.rounds[0].nodes
    first.match = { ...first.match!, state: 'realizada', phase: 'confirmado', score: score(2, 1) }
    first.slots[0].winner = true
    const final = base.rounds[1].nodes[0]
    final.match = { ...final.match!, awaiting_decision: true }
    render(<MirrorBracket bracket={confirmed(base)} />)
    const node = screen.getByRole('img').querySelector('[data-node="J1"]') as unknown as HTMLElement
    expect(within(node).getByText('2')).not.toBeNull()
    expect(within(node).getByText('1')).not.toBeNull()
    const items = within(screen.getByRole('list', { name: 'Confrontos do chaveamento' })).getAllByRole('listitem').map(item => item.textContent)
    expect(items[0]).toBe('Semifinal: J1: Novo Horizonte contra Bola Murcha FC, placar 2 × 1.')
    expect(items[2]).toContain('aguarda a decisão do organizador')
  })

  it('troca de lugares: Enter ou Espaço escolhem, o segundo toque envia os dois lugares e tocar de novo cancela', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    const { rerender } = render(<MirrorBracket bracket={eliminationBracket(sixTeams)} onPick={onPick} picked={null} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(8)
    expect(buttons.map(button => button.getAttribute('aria-pressed'))).toEqual(Array(8).fill('false'))
    expect(buttons[0].getAttribute('aria-label')).toBe('Novo Horizonte, lugar 1 da chave. Selecione para trocar de lugar.')
    expect(buttons[1].getAttribute('aria-label')).toMatch(/^Folga, lugar 2 da chave/)
    buttons[0].focus()
    await user.keyboard('{Enter}')
    expect(onPick).toHaveBeenLastCalledWith(0)
    buttons[7].focus()
    await user.keyboard(' ')
    expect(onPick).toHaveBeenLastCalledWith(7)
    // Com o primeiro escolhido, o rótulo explica o segundo toque e o escolhido fica marcado.
    rerender(<MirrorBracket bracket={eliminationBracket(sixTeams)} onPick={onPick} picked={0} />)
    const after = screen.getAllByRole('button')
    expect(after[0].getAttribute('aria-pressed')).toBe('true')
    expect(after[0].getAttribute('aria-label')).toContain('escolhido. Selecione de novo para cancelar.')
    expect(after[2].getAttribute('aria-label')).toContain('Selecione para trocar com o escolhido.')
    // Ocupado (troca em andamento): os botões ficam desabilitados.
    rerender(<MirrorBracket bracket={eliminationBracket(sixTeams)} onPick={onPick} picked={0} busy />)
    expect((screen.getAllByRole('button')[0] as HTMLButtonElement).disabled).toBe(true)
  })

  it('tênis: atletas aparecem com as iniciais do nome', () => {
    const bracket = eliminationBracket(['Beatriz Lima', 'Caio Ramos', 'Dani Souza', 'Eduardo Pires'], { sport: 'tenis', format: null })
    for (const round of bracket.rounds) for (const node of round.nodes) for (const slot of node.slots) {
      if (slot.competitor) slot.competitor = { ...slot.competitor, kind: 'atleta', team: null, athlete: { id: slot.competitor.entry_id, name: slot.competitor.team!.name, username: 'x', avatar_url: null } }
    }
    render(<MirrorBracket bracket={bracket} />)
    const svg = screen.getByRole('img') as unknown as HTMLElement
    for (const initials of ['BL', 'CR', 'DS', 'EP']) expect(within(svg).getAllByText(initials).length).toBeGreaterThan(0)
  })
})

describe('todos contra todos', () => {
  it('tabela cruzada com 5: a rodada de cada confronto, a diagonal e quem folga em cada rodada', () => {
    const bracket = roundRobinBracket()
    render(<BracketView bracket={bracket} />)
    expect(screen.getByRole('table', { name: /Tabela cruzada/ })).not.toBeNull()
    const cross = screen.getAllByRole('table')[0]
    const rows = within(cross).getAllByRole('row')
    expect(rows).toHaveLength(6)
    // 5 × 5 menos a diagonal: 20 células com rodada, e cada rodada aparece 4 vezes (2 jogos × 2 lados).
    const rounds = within(cross).getAllByText(/^R[1-5]$/).map(item => item.textContent)
    expect(rounds).toHaveLength(20)
    for (const round of ['R1', 'R2', 'R3', 'R4', 'R5']) expect(rounds.filter(item => item === round)).toHaveLength(4)
    expect(within(cross).getAllByLabelText('Mesmo competidor')).toHaveLength(5)
    // O mesmo confronto tem a mesma rodada nos dois lados da diagonal.
    expect(within(cross).getByText('Novo Horizonte contra Leões do Cerrado: rodada 5')).not.toBeNull()
    expect(within(cross).getByText('Leões do Cerrado contra Novo Horizonte: rodada 5')).not.toBeNull()
    // Com 5, um folga por rodada.
    expect(screen.getByText(/Folga por rodada:/).closest('p')?.textContent).toContain('rodada 1, Novo Horizonte')
    expect(bracket.rounds.every(round => round.rest !== null)).toBe(true)
    // Lista das rodadas com os jogos J1 a J10.
    expect(screen.getByRole('region', { name: 'Rodada 3' })).not.toBeNull()
    expect(screen.getAllByText(/^J\d+$/).map(item => item.textContent)).toHaveLength(10)
  })

  it('classificação: 3/1/0, saldo e gols pró; no tênis, as colunas são de sets', () => {
    const bracket = roundRobinBracket(['Ana', 'Bia', 'Cris'], {
      table: [
        { position: 1, competitor: roundRobinBracket(['Ana', 'Bia', 'Cris']).table![0].competitor, played: 2, wins: 2, draws: 0, losses: 0, goals_for: 5, goals_against: 1, goal_difference: 4, points: 6 },
        { position: 2, competitor: roundRobinBracket(['Ana', 'Bia', 'Cris']).table![1].competitor, played: 2, wins: 0, draws: 1, losses: 1, goals_for: 2, goals_against: 3, goal_difference: -1, points: 1 },
        { position: 3, competitor: roundRobinBracket(['Ana', 'Bia', 'Cris']).table![2].competitor, played: 2, wins: 0, draws: 1, losses: 1, goals_for: 1, goals_against: 4, goal_difference: -3, points: 1 },
      ],
    })
    const { rerender } = render(<StandingsTable rows={bracket.table!} sport="futebol" />)
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('columnheader').map(item => item.textContent)).toEqual(['#', 'Time', 'J', 'V', 'E', 'D', 'GP', 'GC', 'SG', 'Pts'])
    const first = within(within(table).getAllByRole('row')[1]).getAllByRole('cell').map(item => item.textContent)
    expect(first).toEqual(['1', '2', '2', '0', '0', '5', '1', '+4', '6'])
    expect(within(table).getByText('Ana')).not.toBeNull()
    rerender(<StandingsTable rows={bracket.table!} sport="tenis" />)
    expect(within(screen.getByRole('table')).getAllByRole('columnheader').map(item => item.textContent)).toContain('SP')
  })

  it('tabela cruzada vazia não desenha nada', () => {
    const { container } = render(<CrossTable bracket={roundRobinBracket([])} />)
    expect(container.textContent).toBe('')
  })
})
