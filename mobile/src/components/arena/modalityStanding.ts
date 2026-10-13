import type { Sport } from '../../api/client'
import type { MeStandings, StandingLine } from '../../api/play'
import { footballFormat, placementRequired, positionOptions, rankingTiers } from '../../data/arena'
import type { RunDistance, TierKey } from '../../data/arena'
import { normalizeStandings, rankedTier } from '../play/tierLines'

/**
 * Situação do atleta numa modalidade, para os cartões "Seu elo" do Início, a partir de `GET /me/standings` (porta de
 * `modalityStanding` da web): o maior elo entre as linhas ranqueadas (nunca para quem está em classificação) ou, sem
 * elo, o andamento da classificação ("n de 3 partidas"). A corrida classifica na primeira marca: com elo, mostra a
 * distância de maior elo e o melhor tempo dela; sem elo, "Sem marca".
 */
export interface ModalityStanding {
  /** Elo com a classificação completa; `null` em classificação. */
  tier: TierKey | null
  /** Partidas contadas (no máximo `required`). */
  played: number
  required: number
  /** Onde o elo vale ("Society · Leões do Cerrado", "Society · como atacante"); só com elo. */
  context: string | null
  /** Pontos (time e tênis), média por partida (individual) ou melhor tempo em segundos (corrida) da linha que dá o elo; só com elo. */
  metric: { value: number; unit: 'pontos' | 'média' | 'tempo' } | null
  /** Corrida com elo: a distância de maior elo, para abrir o Ranking nela. */
  distanceKm: RunDistance | null
}

const rank = (tier: TierKey) => rankingTiers.findIndex(item => item.image === tier)
const lower = (text: string) => text.toLocaleLowerCase('pt-BR')

interface Candidate { line: StandingLine; context: string; unit: 'pontos' | 'média' | 'tempo'; distanceKm?: RunDistance }

export function modalityStanding(sport: Sport, data: Partial<MeStandings> | null | undefined): ModalityStanding {
  const { teams, individual, tenis, corrida } = normalizeStandings(data)
  const candidates: Candidate[] = sport === 'futebol'
    ? [
      ...teams.flatMap(team => team.formats.map(line => ({ line, context: `${footballFormat[line.format]?.label ?? line.format} · ${team.team.name}`, unit: 'pontos' as const }))),
      ...individual.map(line => ({
        line,
        context: `${footballFormat[line.format]?.label ?? line.format} · como ${lower(positionOptions.find(item => item.value === line.position)?.label ?? line.position)}`,
        unit: 'média' as const,
      })),
    ]
    : sport === 'tenis'
      ? (tenis ? [{ line: tenis, context: 'Tênis', unit: 'pontos' as const }] : [])
      : corrida.map(line => ({ line, context: `Nos ${line.distance_km} km`, unit: 'tempo' as const, distanceKm: line.distance_km }))

  let best: { tier: TierKey; context: string; metric: ModalityStanding['metric']; distanceKm: RunDistance | null } | null = null
  for (const { line, context, unit, distanceKm } of candidates) {
    const tier = rankedTier(line)
    if (tier && (!best || rank(tier) > rank(best.tier)))
      best = { tier, context, metric: line.metric_value != null ? { value: line.metric_value, unit } : null, distanceKm: distanceKm ?? null }
  }
  const required = sport === 'corrida' ? 1 : candidates[0]?.line.required || placementRequired
  if (best) return { tier: best.tier, played: required, required, context: best.context, metric: best.metric, distanceKm: best.distanceKm }
  const played = candidates.reduce((max, { line }) => Math.max(max, line.played || 0), 0)
  return { tier: null, played: Math.min(played, required), required, context: null, metric: null, distanceKm: null }
}
