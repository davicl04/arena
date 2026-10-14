import { sports } from '@/api/client'
import type { Position, Profile, Sport } from '@/api/client'
import type { RankingCategoryQuery, RankingKey } from '@/api/results'
import { footballFormat, positionOptions } from '@/data/arena'
import type { FootballFormat, RunDistance } from '@/data/arena'

/** Tipo do ranking de futebol: os times ou os atletas por posição. */
export type RankingKind = 'time' | 'individual'

/**
 * Categoria escolhida no Ranking: a modalidade e, conforme ela, o tipo, o formato, a posição ou a distância. Os campos
 * que não se aplicam à modalidade ficam guardados (voltar ao futebol lembra o formato) e `categoryQuery` os ignora.
 */
export interface RankingCategory {
  sport: Sport
  kind: RankingKind
  format: FootballFormat
  position: Position
  distance: RunDistance
}

/** A categoria na forma que a API lê (`GET /rankings` e `/rankings/overview`). */
export function categoryQuery(category: RankingCategory): RankingCategoryQuery {
  if (category.sport === 'futebol') {
    return { sport: 'futebol', kind: category.kind, format: category.format, position: category.kind === 'individual' ? category.position : undefined }
  }
  if (category.sport === 'corrida') return { sport: 'corrida', distance_km: category.distance }
  return { sport: category.sport }
}

/** Chave do ranking mostrado, para a métrica e os textos; a API devolve a mesma em `ranking`. */
export function rankingKey(category: RankingCategory): RankingKey {
  if (category.sport === 'tenis') return 'tenis'
  if (category.sport === 'corrida') return `corrida_${category.distance}`
  return category.kind === 'time' ? 'futebol_time' : 'futebol_individual'
}

/** A categoria sem a modalidade: "Society 7×7 · Times", "Society 7×7 · Atacante", "5 km" ou "Tênis". */
export function categoryDetail(category: RankingCategory): string {
  if (category.sport === 'tenis') return 'Tênis'
  if (category.sport === 'corrida') return `${category.distance} km`
  const format = footballFormat[category.format]
  const who = category.kind === 'time' ? 'Times' : positionOptions.find(item => item.value === category.position)?.label ?? 'Individual'
  return `${format.label} ${format.size} · ${who}`
}

/** O texto do cartão Categoria: "Futebol · Society 7×7 · Times", "Tênis" ou "Corrida · 5 km". */
export function categoryText(category: RankingCategory): string {
  if (category.sport === 'tenis') return 'Tênis'
  return `${category.sport === 'futebol' ? 'Futebol' : 'Corrida'} · ${categoryDetail(category)}`
}

/** O ranking de times (futebol): o que tem a troca entre os times do titular. */
export const isTeamRanking = (category: RankingCategory) => category.sport === 'futebol' && category.kind === 'time'

/** "time"/"times" no ranking de times e "atleta"/"atletas" nos demais. */
export function subjectNoun(category: RankingCategory, count: number): string {
  if (isTeamRanking(category)) return count === 1 ? 'time' : 'times'
  return count === 1 ? 'atleta' : 'atletas'
}

/** A categoria que a página guarda na pilha do aplicativo: volta do Salão sem perder a escolha nem o time. */
export interface RankingState extends RankingCategory {
  /** Time da placa (ranking de times com mais de um time ativo); `null` deixa a escolha com o servidor. */
  teamId: number | null
}

/** Modalidades em que o titular tem perfil, na ordem futebol, tênis e corrida. */
export function activeSports(profiles: readonly Profile[]): Sport[] {
  return sports.map(item => item.value).filter(sport => profiles.some(profile => profile.sport === sport))
}
