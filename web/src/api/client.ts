import { connection } from './connection'

export type Sport = 'futebol' | 'tenis' | 'corrida'
export type Position = 'goleiro' | 'defesa' | 'meio_campo' | 'atacante'
export interface Page<T> { items: T[]; next_cursor: string | null; total?: number }
export interface User {
  id: number
  name: string
  username: string
  email: string
  birth_date: string
  social_public: boolean
  is_admin: boolean
  avatar: { id: string; url: string } | null
  cover: { id: string; url: string } | null
}
export interface SocialUser {
  id: number
  name: string
  username: string
  avatar_url: string | null
  cover_url: string | null
  social_public: boolean
  post_count: number
  follower_count: number
  following_count: number
  follows_you: boolean
  follow_state: 'none' | 'pending' | 'approved' | 'self'
}
export interface MutualFollowersPage {
  items: SocialUser[]
  total: number
  next_cursor: string | null
}
export interface UsernameAvailability {
  available: boolean
  reason: 'invalid' | 'reserved' | 'taken' | 'current' | null
  suggestions: string[]
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
/** Pessoa resumida dos contratos de times, organizador e notificações; `avatar_url` é null se houver bloqueio. */
export interface Person {
  id: number
  name: string
  username: string
  avatar_url: string | null
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
/** Campo recusado num `422` (`{ detail, fields: [{ field, message }] }`). */
export interface FieldError { field: string; message: string }
export class ApiError extends Error {
  status: number
  /** Campos recusados pela validação do servidor (vazio nos demais erros). */
  fields: FieldError[]
  /** Corpo do erro quando é um objeto JSON (o `conflict` do `409` da agenda do campeonato); `null` nos demais. */
  body: Record<string, unknown> | null
  /** Falha de conexão: rede ou timeout (status 0) ou servidor/banco fora do ar (502, 503, 504). Aciona o aviso de conexão. */
  readonly isConnection: boolean
  constructor(message: string, status: number, fields: FieldError[] = [], body: Record<string, unknown> | null = null) {
    super(message)
    this.status = status
    this.fields = fields
    this.body = body
    this.isConnection = isConnectionStatus(status)
  }
}
/** Status que o cliente trata como "sem conexão com a ARENA": 0 (rede ou timeout), 502, 503 e 504. */
export function isConnectionStatus(status: number): boolean {
  return status === 0 || status === 502 || status === 503 || status === 504
}
/** Lista `fields` de um corpo de erro, só com itens bem formados. */
function fieldErrors(value: unknown): FieldError[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is FieldError => typeof item?.field === 'string' && typeof item?.message === 'string')
}
export function apiBaseUrl(configuredUrl: string | undefined, development: boolean, location: Pick<Location, 'protocol' | 'hostname'>) {
  const defaultBase = development ? `${location.protocol}//${location.hostname}:8000` : 'http://localhost:8000'
  return (configuredUrl || defaultBase).replace(/\/$/, '')
}
const base = apiBaseUrl(import.meta.env.VITE_API_URL, import.meta.env.DEV, window.location)
// A volta da conexão é confirmada em `GET /health/ready` (consulta o banco), fora de `/api/v1`.
connection.configure({ healthUrl: `${base}/health/ready` })
export const apiUrl = (path: string) => `${base}${path}`
/** Opções de `request`. `background`: leitura em segundo plano (contador, sondagem), que nunca abre a folha de conexão. */
export interface RequestOptions { background?: boolean }
export async function request<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  { background = false }: RequestOptions = {},
): Promise<T> {
  const mutating = method.toUpperCase() !== 'GET'
  // Depois de "Continuar sem conexão", uma nova ação não é enviada: a faixa treme (plano de toasts). A entrada
  // (`/auth/`) não tem o aviso de conexão e sempre tenta.
  const offline = connection.getState()
  if (mutating && !background && offline.status === 'offline' && offline.sheetDismissed && !path.startsWith('/auth/')) {
    const failure = new ApiError('Não foi possível conectar ao Arena. Verifique a conexão e tente novamente.', 0)
    connection.lost({ mutating, background, cause: failure })
    throw failure
  }
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
    const failure = new ApiError(
      'Não foi possível conectar ao Arena. Verifique a conexão e tente novamente.',
      0,
    )
    connection.lost({ mutating, background, cause: failure })
    throw failure
  }
  // Qualquer resposta do servidor prova que há conexão, exceto 502/503/504 (o servidor ou o banco não responde).
  if (!isConnectionStatus(response.status)) connection.reached()
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    const failure = new ApiError(
      typeof data.detail === 'string'
        ? data.detail
        : 'Não foi possível concluir a ação.',
      response.status,
      fieldErrors(data.fields),
      data && typeof data === 'object' && !Array.isArray(data) ? data : null,
    )
    if (failure.isConnection) connection.lost({ mutating, background, cause: failure })
    throw failure
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
