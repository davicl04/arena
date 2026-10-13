import type {
  Bracket, BracketMatch, BracketNode, BracketRound, BracketSlot, Competitor, EventMatchList, EventMatchRow, TableRow,
} from '../src/api/brackets'
import type { MatchCard, MatchSideOut, ScoreOut } from '../src/api/matches'
import { brasilia, person } from './teams-fixtures'
import { court, fromNow } from './match-fixtures'

/*
 * Formas da árvore, da tabela e da lista de partidas do campeonato (0003, seção 21.3) para os testes da etapa 4. A árvore
 * é montada como a API a monta: a primeira fase pelos lugares do sorteio (`null` é folga), as fases seguintes com "Vencedor
 * J1" (ou o competidor que passou pela folga) e a numeração J1, J2… sem contar as folgas.
 */

export { brasilia }

export function competitor(entryId: number, name: string, place: number | null = null, kind: 'time' | 'atleta' = 'time'): Competitor {
  const initials = name.split(/\s+/).map(word => word[0]).join('').slice(0, 2).toUpperCase()
  return kind === 'time'
    ? { entry_id: entryId, kind, team: { id: entryId + 100, name, initials, crest_url: null }, athlete: null, place }
    : { entry_id: entryId, kind, team: null, athlete: person(entryId + 200, name), place }
}

const slot = (overrides: Partial<BracketSlot>): BracketSlot => ({
  kind: 'competidor', competitor: null, placeholder: null, from_match: null, advanced_by_bye: false, place: null, winner: false, ...overrides,
})

export const sixTeams = ['Novo Horizonte', null, 'Atlético Guará', 'Unidos do Lago', 'Leões do Cerrado', null, 'Ferrugem FC', 'Bola Murcha FC']
export const eightTeams = ['Novo Horizonte', 'Bola Murcha FC', 'Atlético Guará', 'Unidos do Lago', 'Leões do Cerrado', 'Dragões FC', 'Ferrugem FC', 'Tigres do Lago']

const roundName = (round: number, total: number) => (round === total ? 'Final' : round === total - 1 ? 'Semifinal' : round === total - 2 ? 'Quartas de final' : 'Oitavas de final')

/** Árvore de eliminação simples a partir dos lugares do sorteio (nome ou `null` para a folga). */
export function eliminationBracket(places: (string | null)[] = sixTeams, overrides: Partial<Bracket> = {}, matches = false): Bracket {
  const size = places.length
  const total = Math.log2(size)
  const people = new Map<string, Competitor>()
  places.forEach((name, index) => { if (name) people.set(name, competitor(index + 1, name, index)) })
  const rounds: BracketRound[] = []
  // Cada nó da fase anterior: o que sai dele ("Vencedor J1") ou o competidor que passou pela folga.
  let feeders: { number: number | null; competitor: Competitor | null }[] = []
  let counter = 0
  for (let round = 1; round <= total; round++) {
    const count = size / 2 ** round
    const nodes: BracketNode[] = []
    const out: typeof feeders = []
    for (let position = 1; position <= count; position++) {
      let slots: [BracketSlot, BracketSlot]
      if (round === 1) {
        const [a, b] = [places[2 * (position - 1)], places[2 * (position - 1) + 1]]
        const make = (name: string | null, place: number) => name
          ? slot({ kind: 'competidor', competitor: people.get(name)!, place })
          : slot({ kind: 'folga', placeholder: 'Folga', place })
        slots = [make(a, 2 * (position - 1)), make(b, 2 * (position - 1) + 1)]
      } else {
        const from = (feeder: typeof feeders[number]) => feeder.competitor
          ? slot({ kind: 'competidor', competitor: feeder.competitor, advanced_by_bye: true })
          : slot({ kind: 'vencedor', placeholder: `Vencedor J${feeder.number}`, from_match: feeder.number })
        slots = [from(feeders[2 * (position - 1)]), from(feeders[2 * (position - 1) + 1])]
      }
      const bye = slots.some(item => item.kind === 'folga')
      const number = bye ? null : ++counter
      const present = bye ? (slots[0].kind === 'folga' ? slots[1].competitor : slots[0].competitor) : null
      out.push({ number, competitor: present })
      const match: BracketMatch | null = matches && !bye ? { id: 1000 + (number ?? 0), state: 'combinando', phase: 'combinando', starts_at: null, court_name: null, score: null, awaiting_decision: false } : null
      nodes.push({
        position, number, label: number ? `J${number}` : null, bye, slots, match,
        next: round < total ? { round: round + 1, position: Math.ceil(position / 2), side: position % 2 ? 'a' : 'b' } : null,
      })
    }
    rounds.push({ number: round, name: roundName(round, total), nodes, rest: null })
    feeders = out
  }
  return bracket({ kind: 'eliminacao_simples', size, byes: places.filter(name => !name).length, rounds, ...overrides })
}

/** Todos contra todos pelo método do círculo (a ordem do sorteio é a dos nomes). */
export function roundRobinBracket(names = ['Novo Horizonte', 'Leões do Cerrado', 'Unidos do Lago', 'Ferrugem FC', 'Atlético Guará'], overrides: Partial<Bracket> = {}): Bracket {
  const players = names.map((name, index) => competitor(index + 1, name, index))
  const ring: (Competitor | null)[] = players.length % 2 ? [...players, null] : [...players]
  const count = ring.length
  const rounds: BracketRound[] = []
  let number = 0
  for (let round = 1; round <= count - 1; round++) {
    const nodes: BracketNode[] = []
    let rest: Competitor | null = null
    for (let i = 0; i < count / 2; i++) {
      const [a, b] = [ring[i], ring[count - 1 - i]]
      if (!a || !b) { rest = (a ?? b) as Competitor; continue }
      number += 1
      nodes.push({
        position: nodes.length + 1, number, label: `J${number}`, bye: false, next: null, match: null,
        slots: [slot({ competitor: a }), slot({ competitor: b })],
      })
    }
    rounds.push({ number: round, name: `Rodada ${round}`, nodes, rest })
    ring.splice(1, 0, ring.pop() as Competitor | null)
  }
  const table: TableRow[] = players.map((item, index) => ({ position: index + 1, competitor: item, played: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, goal_difference: 0, points: 0 }))
  return bracket({ kind: 'todos_contra_todos', size: players.length, byes: 0, rounds, table, ...overrides })
}

export function bracket(overrides: Partial<Bracket> = {}): Bracket {
  return {
    event_id: 5, event_name: 'Copa Sudoeste Society', event_state: 'publicado', sport: 'futebol', format: 'society', kind: 'eliminacao_simples',
    state: 'sorteado', is_organizer: true, size: 8, byes: 0, seed: 123456789, draw_count: 1, drawn_at: fromNow(-1), confirmed_at: null,
    rounds: [], table: null, placements: null, champion: null,
    permissions: { can_draw: true, can_swap: true, can_confirm: true, draw_blocker: null }, ...overrides,
  }
}

/** Sem sorteio: o organizador pode sortear (ou há um impedimento). */
export const undrawn = (blocker: string | null = null, overrides: Partial<Bracket> = {}): Bracket => bracket({
  state: 'sem_chaveamento', size: null, byes: 0, seed: null, draw_count: null, drawn_at: null, rounds: [],
  permissions: { can_draw: blocker === null, can_swap: false, can_confirm: false, draw_blocker: blocker }, ...overrides,
})

/** Confirmado: nada mais muda de lugar. */
export const confirmed = (base: Bracket, overrides: Partial<Bracket> = {}): Bracket => ({
  ...base, state: 'confirmado', event_state: 'em_andamento', confirmed_at: fromNow(-1),
  permissions: { can_draw: false, can_swap: false, can_confirm: false, draw_blocker: null }, ...overrides,
})

// ----- Lista das partidas (S1) ---------------------------------------------------------------------------------------

export const side = (key: 'a' | 'b', name: string, id: number): MatchSideOut => ({
  side: key, kind: 'time', team: { id, name, initials: name.split(/\s+/).map(word => word[0]).join('').slice(0, 2).toUpperCase(), crest_url: null },
  athlete: null, tier: null, accepted_at: null, is_mine: false, declared_slots: null,
})

export function matchCard(id: number, sides: MatchSideOut[], overrides: Partial<MatchCard> = {}): MatchCard {
  return {
    id, sport: 'futebol', format: 'society', origin: 'campeonato', state: 'combinando', phase: 'combinando', sides, my_side: null, my_role: 'organizador',
    starts_at: null, court: null, result_deadline: null, score: null, needs_my_action: false, ...overrides,
  }
}

export function row(label: string, id: number, names: [string | null, string | null], overrides: Partial<EventMatchRow> = {}, card: Partial<MatchCard> = {}): EventMatchRow {
  const sides = names.flatMap((name, index) => (name ? [side(index ? 'b' : 'a', name, id * 10 + index)] : []))
  return {
    card: matchCard(id, sides, card), label, stage: 'Quartas de final', round_number: 1, position: id,
    placeholders: [names[0] ? null : 'Vencedor J1', names[1] ? null : 'Vencedor J2'], can_schedule: sides.length === 2, awaiting_decision: false, ...overrides,
  }
}

export function matchList(items: EventMatchRow[]): EventMatchList {
  const finished = items.filter(item => ['realizada', 'encerrada'].includes(item.card.state)).length
  const scheduled = items.filter(item => item.card.state === 'agendada' && !item.awaiting_decision).length
  const toSchedule = items.filter(item => item.can_schedule && item.card.starts_at === null).length
  const toDecide = items.filter(item => item.awaiting_decision).length
  const waiting = items.filter(item => item.card.sides.length < 2).length
  return { items, counts: { total: items.length, to_schedule: toSchedule, waiting, scheduled, to_decide: toDecide, finished } }
}

export const score = (a: number, b: number): ScoreOut => ({ a, b, sets: null, winner: a === b ? null : a > b ? 'a' : 'b' })
export { court }
