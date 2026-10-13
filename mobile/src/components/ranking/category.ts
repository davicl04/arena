import type { Position, Profile, Sport } from '../../api/client'
import type { RankingCategory, RankingKey } from '../../api/results'
import { footballFormat, positionOptions } from '../../data/arena'
import type { FootballFormat, RunDistance } from '../../data/arena'

/** Tipo do ranking de futebol: de times ou individual. */
export type RankingKind = 'time' | 'individual'

/** O que a folha de filtros escolhe: a categoria inteira, com a posição já resolvida. */
export interface CategoryChoice {
  sport: Sport
  kind: RankingKind
  format: FootballFormat
  position: Position
  distance: RunDistance
}

/** Modalidades em que o titular tem perfil, na ordem do app (futebol, tênis, corrida). */
export function activeSports(profiles: readonly Pick<Profile, 'sport'>[]): Sport[] {
  const present = new Set(profiles.map(profile => profile.sport))
  return (['futebol', 'tenis', 'corrida'] as const).filter(sport => present.has(sport))
}

/** Parâmetros de `GET /rankings` e do overview para a categoria escolhida. */
export function categoryOf({ sport, kind, format, position, distance }: CategoryChoice): RankingCategory {
  if (sport === 'tenis') return { sport }
  if (sport === 'corrida') return { sport, distance_km: distance }
  return kind === 'time' ? { sport, kind, format } : { sport, kind, format, position }
}

/** Chave do ranking mostrada (a API devolve a mesma em `ranking`). */
export function rankingKeyOf(category: RankingCategory): RankingKey {
  if (category.sport === 'tenis') return 'tenis'
  if (category.sport === 'corrida') return `corrida_${category.distance_km}` as RankingKey
  return category.kind === 'individual' ? 'futebol_individual' : 'futebol_time'
}

const positionLabel = (position: Position | undefined) => positionOptions.find(item => item.value === position)?.label

/** Texto da categoria no cartão e na subtela: "Futebol · Society 7×7 · Times", "Futebol · Futsal 5×5 · Atacante", "Tênis", "Corrida · 5 km". */
export function categoryText(category: RankingCategory): string {
  if (category.sport === 'tenis') return 'Tênis'
  if (category.sport === 'corrida') return `Corrida · ${category.distance_km} km`
  const format = category.format ? footballFormat[category.format] : null
  const place = category.kind === 'individual' ? positionLabel(category.position) : 'Times'
  return ['Futebol', format ? `${format.label} ${format.size}` : null, place].filter(Boolean).join(' · ')
}

/** Nome curto da categoria nos estados vazios: "Society", "Futsal · Defesa", "5 km" ou "Tênis". */
export function categoryShort(category: RankingCategory): string {
  if (category.sport === 'tenis') return 'Tênis'
  if (category.sport === 'corrida') return `${category.distance_km} km`
  const format = category.format ? footballFormat[category.format].label : ''
  return category.kind === 'individual' ? `${format} · ${positionLabel(category.position)}` : format
}

/** Os integrantes do ranking: times no futebol de times, atletas nos demais. */
export const subjectNoun = (category: RankingCategory) => (category.sport === 'futebol' && category.kind === 'time' ? { one: 'time', many: 'times' } : { one: 'atleta', many: 'atletas' })
