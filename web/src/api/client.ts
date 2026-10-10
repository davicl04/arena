export type Sport = 'futebol' | 'tenis' | 'corrida'
export type Position = 'goleiro' | 'defesa' | 'meio_campo' | 'atacante'
export interface Page<T> { items: T[]; next_cursor: string | null }
export interface User {
  id: number
  name: string
  email: string
  birth_date: string
  social_public: boolean
  is_admin: boolean
  avatar: { id: string; url: string } | null
}
export interface SocialUser {
  id: number
  name: string
  avatar_url: string | null
  social_public: boolean
  post_count: number
  follower_count: number
  following_count: number
  follows_you: boolean
  follow_state: 'none' | 'pending' | 'approved' | 'self'
}
export interface Post {
  id: number
  author: SocialUser
  caption: string
  image_url: string
  created_at: string
  like_count: number
  comment_count: number
  liked_by_me: boolean
  can_edit: boolean
}
export interface SocialComment {
  id: number
  author_id: number
  author_name: string
  author_avatar_url: string | null
  body: string
  created_at: string
  can_delete: boolean
}
export interface City {
  id: number
  name: string
  state: string
}
export interface ProfileInput {
  city_id: number
  position: Position | null
  looking_for: boolean
}
export interface Profile extends ProfileInput {
  id: number
  sport: Sport
  is_public: boolean
  level: string | null
}
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}
const base = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(
  /\/$/,
  '',
)
export const apiUrl = (path: string) => `${base}${path}`
export async function request<T>(
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${base}/api/v1${path}`, {
      method,
      credentials: 'include',
      headers: body ? (body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) : {},
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    throw new ApiError(
      'Não foi possível conectar ao Arena. Verifique a conexão e tente novamente.',
      0,
    )
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new ApiError(
      typeof data.detail === 'string'
        ? data.detail
        : 'Não foi possível concluir a ação.',
      response.status,
    )
  }
  return response.status === 204 ? (undefined as T) : response.json()
}
export const sports: {
  value: Sport
  label: string
  symbol: string
  description: string
}[] = [
  {
    value: 'futebol',
    label: 'Futebol',
    symbol: '01',
    description: 'Seu lugar dentro de campo.',
  },
  {
    value: 'tenis',
    label: 'Tênis',
    symbol: '02',
    description: 'Cada troca é um novo começo.',
  },
  {
    value: 'corrida',
    label: 'Corrida',
    symbol: '03',
    description: 'No seu ritmo, a cada passo.',
  },
]
export const positions: { value: Position; label: string }[] = [
  { value: 'goleiro', label: 'Goleiro' },
  { value: 'defesa', label: 'Defesa' },
  { value: 'meio_campo', label: 'Meio de campo' },
  { value: 'atacante', label: 'Atacante' },
]
