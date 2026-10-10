import type { SocialUser, UsernameAvailability } from '../api/client'

// As regras do @ espelham o servidor (a validação definitiva é feita lá); aqui servem só para feedback imediato.
export function normalizeUsername(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase()
}

export function usernameProblem(value: string): string | null {
  if (!value) return 'Informe um nome de usuário.'
  if (value.length < 3) return 'Use pelo menos 3 caracteres.'
  if (value.length > 30) return 'Use no máximo 30 caracteres.'
  if (!/^[a-z0-9._]+$/.test(value)) return 'Use apenas letras minúsculas sem acento, números, ponto e sublinhado.'
  if (value.startsWith('.') || value.endsWith('.')) return 'O nome de usuário não pode começar nem terminar com ponto.'
  if (value.includes('..')) return 'O nome de usuário não pode ter dois pontos seguidos.'
  return null
}

export function availabilityMessage(result: UsernameAvailability): string {
  if (result.reason === 'current') return 'Este já é o seu nome de usuário.'
  if (result.reason === 'taken') return 'Este nome de usuário já está em uso.'
  if (result.reason === 'reserved') return 'Este nome de usuário é reservado.'
  if (result.reason === 'invalid') return 'Nome de usuário inválido.'
  return 'Nome de usuário disponível.'
}

export function mutualFollowersText(items: Pick<SocialUser, 'name'>[], total: number): string | null {
  if (!total || !items.length) return null
  const [first, second] = items
  if (total === 1) return `${first.name}, que você segue, também segue esta conta.`
  if (total === 2 && second) return `${first.name} e ${second.name}, que você segue, também seguem esta conta.`
  if (!second) return `${first.name} e mais ${total - 1} que você segue também seguem esta conta.`
  return `${first.name}, ${second.name} e mais ${total - 2} que você segue também seguem esta conta.`
}

export function connectionsText(followers: number, following: number): string {
  return `${followers} ${followers === 1 ? 'seguidor' : 'seguidores'} · ${following} seguindo`
}
