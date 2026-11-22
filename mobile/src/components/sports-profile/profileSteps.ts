import { positions, sports } from '../../api/client'
import type { City, Position, Profile, Sport } from '../../api/client'
import { cityLabel } from '../../api/cities'
import { positionDescription } from '../../data/arena'

/*
 * Regras da tela de modalidades (as mesmas da web): passos de cada modalidade, títulos, opções de posição, o resumo da
 * faixa ativa e os textos de conclusão. Nada aqui fala de nível, elo ou pontos.
 */

export type ProfileStep = 'city' | 'position' | 'review'

/** Futebol: Cidade → Posição → Revisão. Tênis e corrida: Cidade → Revisão. */
export const profileSteps = (sport: Sport): ProfileStep[] => (sport === 'futebol' ? ['city', 'position', 'review'] : ['city', 'review'])

/** A pergunta de cada passo, mostrada como título. */
export const stepTitle: Record<ProfileStep, string> = {
  city: 'Em que cidade você joga?',
  position: 'Onde você gosta de jogar?',
  review: 'Tudo certo?',
}

export const sportLabel = (sport: Sport) => sports.find(item => item.value === sport)?.label ?? sport

/** Rótulo da posição; sem posição, "Ainda não sei". */
export const positionLabel = (position: Position | null) => positions.find(item => item.value === position)?.label ?? 'Ainda não sei'

/** Opções do grupo de rádio da posição: as quatro de `positions` e "Ainda não sei" (`null`). */
export const positionChoices: { value: Position | null; label: string; description: string }[] = [
  ...positions.map(item => ({ value: item.value, label: item.label, description: positionDescription[item.value] })),
  { value: null, label: 'Ainda não sei', description: 'Você define depois, no perfil.' },
]

/** Resumo da faixa ativa e do toast: "Cidade · UF · Posição · Procurando/Sem procura" (sem posição, ela fica de fora). */
export function profileSummary(profile: { city: City; position: Position | null; looking_for: boolean }): string {
  const position = profile.position ? positionLabel(profile.position) : ''
  return [cityLabel(profile.city), position, profile.looking_for ? 'Procurando' : 'Sem procura'].filter(Boolean).join(' · ')
}

/** Nome acessível da faixa: modalidade e estado ("Futebol, ativa, editar" / "Tênis, ativar"). */
export const bandLabel = (sport: Sport, profile?: Profile) => `${sportLabel(sport)}, ${profile ? 'ativa, editar' : 'ativar'}`

/** Botão final da revisão: "Ativar <modalidade>" para perfil novo, "Salvar" para perfil existente. */
export const finishLabel = (sport: Sport, isNew: boolean) => (isNew ? `Ativar ${sportLabel(sport).toLowerCase()}` : 'Salvar')

/** Título do toast de sucesso: "<Modalidade> ativado." para perfil novo, "Perfil salvo." ao editar. */
export const savedTitle = (sport: Sport, isNew: boolean) => (isNew ? `${sportLabel(sport)} ativado.` : 'Perfil salvo.')
