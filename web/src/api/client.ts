export type Sport = 'futebol' | 'tenis' | 'corrida'
export type Position = 'goleiro' | 'defesa' | 'meio_campo' | 'atacante'
export interface User {
  id: number
  name: string
  email: string
  birth_date: string
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
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
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
