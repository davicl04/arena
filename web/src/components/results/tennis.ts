import type { TennisSetInput } from '@/api/results'
import type { ScoreOut, Side } from '@/api/matches'
/*
 * Placar do tênis (RN15). `validateTennisSets` espelha `match_rules.validate_tennis_sets`, com as mesmas mensagens: sets de
 * 6-0 a 6-4, 7-5 ou 7-6 (com o tie-break a 7 pontos, 2 de vantagem, de quem venceu o set); o vencedor leva dois sets e o
 * terceiro só existe se os dois primeiros foram divididos; com o super tie-break combinado, o terceiro "set" são os pontos
 * (até 10, com 2 de vantagem). O servidor continua decidindo: isto só evita o envio de um placar que ele recusaria.
 *
 * O rascunho do formulário fica sempre do ponto de vista de quem informa (meus games × games do adversário); a API pede
 * os lados A e B da partida, e `draftToInput` faz a troca.
 */

export const GAMES_MAX = 7
export const POINTS_MAX = 99
export const SUPER_TIEBREAK_TARGET = 10
export const TIEBREAK_TARGET = 7

export interface SetDraft { mine: number; theirs: number; tbMine: number; tbTheirs: number }

export const emptySets = (): SetDraft[] => Array.from({ length: 3 }, () => ({ mine: 0, theirs: 0, tbMine: 0, tbTheirs: 0 }))

const whole = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max

/** Tie-break até `target` pontos com dois de vantagem: 7-5, 8-6, 10-8, 12-10… */
const tiebreakValid = (winner: number, loser: number, target: number) =>
  winner >= target && winner - loser >= 2 && (winner === target || winner - loser === 2)

/** Set decidido em 7-6 (qualquer lado) pede o placar do tie-break. */
export const needsTiebreak = (set: Pick<SetDraft, 'mine' | 'theirs'>) =>
  (set.mine === 7 && set.theirs === 6) || (set.mine === 6 && set.theirs === 7)

/** Quem venceu o set pelos games; `null` enquanto está empatado. */
export const setWinner = (set: Pick<SetDraft, 'mine' | 'theirs'>): 'mine' | 'theirs' | null =>
  set.mine === set.theirs ? null : set.mine > set.theirs ? 'mine' : 'theirs'

/** O terceiro set (ou o super tie-break) só aparece quando os dois primeiros foram divididos. */
export function showsThirdSet(sets: SetDraft[]): boolean {
  const first = setWinner(sets[0])
  const second = setWinner(sets[1])
  return first !== null && second !== null && first !== second
}

/** Sets enviados à API (lados A e B), sem o terceiro quando não há; o tie-break só vai no set de 7-6. */
export function draftToInput(sets: SetDraft[], mySide: Side, superTiebreak: boolean): TennisSetInput[] {
  const count = showsThirdSet(sets) ? 3 : 2
  return sets.slice(0, count).map((set, index) => {
    const own = mySide === 'a'
    const item: TennisSetInput = { a: own ? set.mine : set.theirs, b: own ? set.theirs : set.mine }
    if (!(index === 2 && superTiebreak) && needsTiebreak(set))
      item.tiebreak = { a: own ? set.tbMine : set.tbTheirs, b: own ? set.tbTheirs : set.tbMine }
    return item
  })
}

/** Rascunho a partir de um placar já informado (para corrigir o meu). */
export function reportToDraft(score: ScoreOut | undefined, mySide: Side): SetDraft[] {
  const drafts = emptySets()
  score?.sets?.slice(0, 3).forEach((set, index) => {
    const own = mySide === 'a'
    drafts[index] = {
      mine: own ? set.a : set.b, theirs: own ? set.b : set.a,
      tbMine: set.tiebreak ? (own ? set.tiebreak.a : set.tiebreak.b) : 0,
      tbTheirs: set.tiebreak ? (own ? set.tiebreak.b : set.tiebreak.a) : 0,
    }
  })
  return drafts
}

function regularSet(set: TennisSetInput, number: number): string | null {
  if (!whole(set.a, GAMES_MAX) || !whole(set.b, GAMES_MAX)) return `Informe números inteiros de 0 a ${GAMES_MAX}.`
  const high = Math.max(set.a, set.b)
  const low = Math.min(set.a, set.b)
  if ((high === 6 && low <= 4) || (high === 7 && low === 5)) return set.tiebreak ? `O ${number}º set não teve tie-break.` : null
  if (high === 7 && low === 6) {
    if (!set.tiebreak) return `Informe o placar do tie-break do ${number}º set.`
    const { a, b } = set.tiebreak
    if (!whole(a, POINTS_MAX) || !whole(b, POINTS_MAX)) return `Informe números inteiros de 0 a ${POINTS_MAX}.`
    if (a > b !== set.a > set.b || !tiebreakValid(Math.max(a, b), Math.min(a, b), TIEBREAK_TARGET))
      return `O tie-break do ${number}º set vai a 7 pontos, com 2 de vantagem, e é de quem venceu o set.`
    return null
  }
  return `O ${number}º set precisa terminar em 6-0 a 6-4, 7-5 ou 7-6.`
}

function superTiebreak(set: TennisSetInput): string | null {
  if (!whole(set.a, POINTS_MAX) || !whole(set.b, POINTS_MAX)) return `Informe números inteiros de 0 a ${POINTS_MAX}.`
  if (set.tiebreak || !tiebreakValid(Math.max(set.a, set.b), Math.min(set.a, set.b), SUPER_TIEBREAK_TARGET))
    return 'O super tie-break vai a 10 pontos, com 2 de vantagem.'
  return null
}

/** `null` quando o placar é válido; senão a mensagem do primeiro problema, como o servidor a daria. */
export function validateTennisSets(sets: TennisSetInput[], withSuperTiebreak = false): string | null {
  if (sets.length < 2 || sets.length > 3) return 'Informe dois ou três sets.'
  const first = regularSet(sets[0], 1) ?? regularSet(sets[1], 2)
  if (first) return first
  const split = sets[0].a > sets[0].b !== sets[1].a > sets[1].b
  if (split && sets.length === 2) return 'Os dois primeiros sets ficaram divididos: informe o terceiro.'
  if (!split && sets.length === 3) return 'Quem venceu os dois primeiros sets já ganhou a partida: não há terceiro set.'
  if (sets.length === 3) return withSuperTiebreak ? superTiebreak(sets[2]) : regularSet(sets[2], 3)
  return null
}
