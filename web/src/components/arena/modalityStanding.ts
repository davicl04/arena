import type { Sport } from '@/api/client'
import type { MeStandings, StandingLine } from '@/api/play'
import { normalizeStandings, rankedTier } from '@/components/play/tierLines'
import { footballFormat, placementRequired, positionOptions, rankingTiers } from '@/data/arena'
import type { TierKey } from '@/data/arena'

/**
 * Situação do atleta numa modalidade, para os cartões "Seu elo" do Início, a partir de `GET /me/standings`: o maior
 * elo entre as linhas ranqueadas (nunca para quem está em classificação) ou, sem elo, o andamento da classificação
 * ("n de 3 partidas"). A corrida classifica na primeira marca: com elo, mostra a distância de maior elo e o melhor tempo
 * dela; sem elo, "Sem marca".
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
}

const rank = (tier: TierKey) => rankingTiers.findIndex(item => item.image === tier)
const lower = (text: string) => text.toLocaleLowerCase('pt-BR')

interface Candidate { line: StandingLine; context: string; unit: 'pontos' | 'média' | 'tempo' }

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
      : corrida.map(line => ({ line, context: `Nos ${line.distance_km} km`, unit: 'tempo' as const }))

  let best: { tier: TierKey; context: string; metric: ModalityStanding['metric'] } | null = null
  for (const { line, context, unit } of candidates) {
    const tier = rankedTier(line)
    if (tier && (!best || rank(tier) > rank(best.tier)))
      best = { tier, context, metric: line.metric_value != null ? { value: line.metric_value, unit } : null }
  }
  const required = sport === 'corrida' ? 1 : candidates[0]?.line.required || placementRequired
  if (best) return { tier: best.tier, played: required, required, context: best.context, metric: best.metric }
  const played = candidates.reduce((max, { line }) => Math.max(max, line.played || 0), 0)
  return { tier: null, played: Math.min(played, required), required, context: null, metric: null }
}
