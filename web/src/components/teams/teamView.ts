import type { FormatStanding, TeamCard, TeamMember } from '@/api/teams'
import { footballFormats, positionOptions, teamRole } from '@/data/arena'

/** Elenco visível antes do "+N" (E1). */
export const ROSTER_LIMIT = 11

/** Rótulo completo da posição no elenco ("Meio de campo"), ou "Sem posição". */
export const positionLabel = (position: TeamMember['position']) =>
  positionOptions.find(option => option.value === position)?.label ?? 'Sem posição'

/** Dados que a carteirinha mostra; a prévia do Criar time monta o mesmo formato antes de o time existir. */
export type TeamCardView = Pick<TeamCard, 'name' | 'initials' | 'city' | 'crest_url' | 'my_role' | 'member_count' | 'roster_preview' | 'formats'>

/** Grade sempre com as três células, na ordem futsal, society, campo; formato ausente sai como "sem jogos". */
export function formatGrid(formats: FormatStanding[]): FormatStanding[] {
  return footballFormats.map(({ value }) => formats.find(cell => cell.format === value)
    ?? { format: value, state: 'sem_jogos', tier: null, played: 0, required: 3, rank_position: null, metric_value: null, faces: [], faces_any_level: true })
}

/** Formatos em que o time já jogou (pílulas do convite K1): elo completo ou classificação em andamento. */
export function playedFormats(formats: FormatStanding[]): FormatStanding[] {
  return formatGrid(formats).filter(cell => cell.played > 0 || cell.state === 'ranqueado')
}

/** Linha da carteirinha para o próprio elenco: "Brasília · você representa" ou "você é membro". */
export function roleLine(team: Pick<TeamCard, 'city' | 'my_role'>): string {
  return team.my_role ? `${team.city.name} · ${teamRole[team.my_role].viewer}` : `${team.city.name} · ${team.city.state}`
}

/** "N atletas" com singular. */
export const athletes = (count: number) => `${count} ${count === 1 ? 'atleta' : 'atletas'}`

/** Nome normalizado como no servidor: aparado e com espaços internos repetidos reduzidos a um. */
export const normalizeTeamName = (name: string) => name.trim().replace(/\s+/g, ' ')
export const TEAM_NAME_MIN = 3
export const TEAM_NAME_MAX = 40
