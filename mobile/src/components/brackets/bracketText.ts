import type { Bracket, BracketNode, BracketRound, BracketSlot, Competitor } from '../../api/brackets'
import type { ScoreOut } from '../../api/matches'
import { scoreText } from '../results/format'
import { eventType } from '../../data/arena'
import { whenText } from '../../data/match'
import { teamInitials } from '../../utils/teamInitials'

/*
 * Nomes, siglas e textos da árvore e da tabela do campeonato (0003, seção 21): o mesmo vocabulário para o desenho em SVG,
 * para a lista alternativa dos confrontos (leitor de tela) e para as telas do organizador e do atleta.
 */

export const competitorName = (competitor: Competitor | null | undefined, fallback = 'A definir') =>
  competitor?.team?.name ?? competitor?.athlete?.name ?? fallback

/** Iniciais do escudo: as do time (vindas da API) ou as do nome do atleta. */
export const competitorInitials = (competitor: Competitor | null | undefined) =>
  competitor?.team?.initials ?? (competitor?.athlete ? teamInitials(competitor.athlete.name) : '?')

/** Nome do que ocupa o lugar: o competidor, "Folga" ou "Vencedor J1". */
export function slotName(slot: BracketSlot): string {
  if (slot.kind === 'competidor') return competitorName(slot.competitor)
  return slot.placeholder ?? (slot.kind === 'folga' ? 'Folga' : 'A definir')
}

const shortRounds: Record<string, string> = {
  'Oitavas de final': 'Oitavas', 'Quartas de final': 'Quartas', Semifinal: 'Semi', Final: 'Final',
}
/** Cabeçalho curto da coluna da árvore ("Quartas", "Semi"). */
export const shortRound = (name: string) => shortRounds[name] ?? name

/** Placar de um jogo do ponto de vista do lado A ("2 × 1" no futebol, "6-4 3-6" no tênis). */
export function nodeScore(sport: Bracket['sport'], score: ScoreOut | null | undefined): string | null {
  return score ? scoreText(sport === 'tenis' ? 'tenis' : 'futebol', score, 'a') : null
}

/** Frase de um confronto para o leitor de tela e a lista alternativa: "J1: Ferrugem FC contra Leões. Placar 2 × 1." */
export function nodeSentence(node: BracketNode, sport: Bracket['sport']): string {
  const [a, b] = node.slots
  if (node.bye) {
    const present = a.kind === 'folga' ? b : a
    return `${slotName(present)} avança direto (folga)`
  }
  const head = `${node.label ?? 'Jogo'}: ${slotName(a)} contra ${slotName(b)}`
  const extra: string[] = []
  const match = node.match
  if (match) {
    const score = nodeScore(sport, match.score)
    if (score) extra.push(`placar ${score}`)
    else if (match.starts_at) extra.push(`${whenText(match.starts_at)}${match.court_name ? ` em ${match.court_name}` : ''}`)
    else extra.push('sem data')
    if (match.awaiting_decision) extra.push('aguarda a decisão do organizador')
  }
  return `${head}${extra.length ? `, ${extra.join(', ')}` : ''}.`
}

/** Competidores do plano, na ordem do sorteio (`place`). */
export function planCompetitors(rounds: BracketRound[]): Competitor[] {
  const seen = new Map<number, Competitor>()
  for (const round of rounds) {
    for (const node of round.nodes) {
      for (const slot of node.slots) if (slot.competitor && !seen.has(slot.competitor.entry_id)) seen.set(slot.competitor.entry_id, slot.competitor)
    }
    if (round.rest && !seen.has(round.rest.entry_id)) seen.set(round.rest.entry_id, round.rest)
  }
  return [...seen.values()].sort((a, b) => (a.place ?? 99) - (b.place ?? 99))
}

/** Resumo do tipo e do tamanho ("Eliminação simples · chave de 8 · 2 folgas"). */
export function bracketSummary(bracket: Pick<Bracket, 'kind' | 'size' | 'byes' | 'sport'>): string {
  const label = eventType[bracket.kind]?.label ?? 'Campeonato'
  if (bracket.kind === 'eliminacao_simples') {
    const parts = [label, bracket.size ? `chave de ${bracket.size}` : '']
    if (bracket.byes > 0) parts.push(bracket.byes === 1 ? '1 folga' : `${bracket.byes} folgas`)
    return parts.filter(Boolean).join(' · ')
  }
  return [label, bracket.size ? `${bracket.size} ${bracket.sport === 'tenis' ? 'atletas' : 'times'}` : ''].filter(Boolean).join(' · ')
}

/** Rótulo da colocação final ("Campeão", "Vice", "3º lugar"). */
export function placementLabel(placement: number, kind: Bracket['kind']): string {
  if (placement === 1) return 'Campeão'
  if (placement === 2) return 'Vice-campeão'
  return kind === 'eliminacao_simples' ? 'Semifinalista' : `${placement}º lugar`
}
