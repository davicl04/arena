import * as SecureStore from 'expo-secure-store'
import { connection } from './connection'
import { isApiPath } from './path'

export type Sport = 'futebol' | 'tenis' | 'corrida'
export type Position = 'goleiro' | 'defesa' | 'meio_campo' | 'atacante'
export interface MediaRef { id: string; url: string }
export interface User { id: number; name: string; username: string; email: string; birth_date: string; social_public: boolean; is_admin: boolean; avatar: MediaRef | null; cover: MediaRef | null }
export interface SocialUser { id: number; name: string; username: string; avatar_url: string | null; cover_url: string | null; social_public: boolean; post_count: number; follower_count: number; following_count: number; follows_you: boolean; follow_state: 'none' | 'pending' | 'approved' | 'self' }
export interface Post { id: number; author: SocialUser; caption: string; image_url: string; created_at: string; like_count: number; comment_count: number; liked_by_me: boolean; can_edit: boolean }
export interface SocialComment { id: number; author_id: number; author_name: string; author_avatar_url: string | null; body: string; created_at: string; can_delete: boolean }
export interface Page<T> { items: T[]; next_cursor: string | null; total?: number }
export interface MutualFollowersPage extends Page<SocialUser> { total: number }
export interface UsernameAvailability { available: boolean; reason: 'invalid' | 'reserved' | 'taken' | 'current' | null; suggestions: string[] }
export interface City { id: number; name: string; state: string }
/** Pessoa resumida dos contratos de times, organizador e notificações; `avatar_url` é null se houver bloqueio. */
export interface Person { id: number; name: string; username: string; avatar_url: string | null }
export interface ProfileInput { city_id: number; position: Position | null; looking_for: boolean }
export interface Profile extends ProfileInput { id: number; sport: Sport; is_public: boolean; level: string | null }
/** Campo recusado num `422` (`{ detail, fields: [{ field, message }] }`). */
export interface FieldError { field: string; message: string }
export class ApiError extends Error {
  /**
   * `fields` traz os campos recusados pela validação do servidor (vazio nos demais erros); `body`, o corpo do erro quando é um
   * objeto JSON (o `conflict` do `409` da agenda do campeonato), e `null` nos demais.
   */
  constructor(message: string, public status: number, public fields: FieldError[] = [], public body: Record<string, unknown> | null = null) {
    super(message)
    this.isConnection = isConnectionStatus(status)
  }
  /** Falha de conexão: rede ou timeout (status 0) ou servidor/banco fora do ar (502, 503, 504). Aciona o aviso de conexão. */
  readonly isConnection: boolean
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
/** Arquivo local escolhido no aparelho (galeria, câmera ou seletor de documentos), enviado em multipart. */
export interface UploadFile { uri: string; name: string; type: string; size?: number | null }
/** `FormData` com o arquivo no campo `file`: o React Native lê `{ uri, name, type }` como uma parte de arquivo. */
export function fileForm(file: UploadFile): FormData {
  const form = new FormData()
  form.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob)
  return form
}
const base = (process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:8000').replace(/\/$/, '')
// A volta da conexão é confirmada em `GET /health/ready` (consulta o banco), fora de `/api/v1` e sem Bearer.
connection.configure({ healthUrl: `${base}/health/ready` })
const key = 'arena.session.v1'
export const saveToken = (token: string) => SecureStore.setItemAsync(key, token)
export const clearToken = () => SecureStore.deleteItemAsync(key)
export const getToken = () => SecureStore.getItemAsync(key)
/** Endereço absoluto de um caminho da API (`/api/v1/...`); recusa o que possa desviar o host (ver `isApiPath`). */
export function apiUrl(path: string): string {
  if (!isApiPath(path)) throw new TypeError('Caminho fora da API.')
  return `${base}${path}`
}
/** Teto de uma chamada comum: passado ele, a chamada é abortada. */
export const REQUEST_TIMEOUT_MS = 15_000
/** Teto do envio de arquivo (multipart): 5 MiB a 1 Mbps levam cerca de 40 s, e o teto comum abortaria o envio no meio. */
export const UPLOAD_TIMEOUT_MS = 120_000
/** Opções de `request`. `background`: leitura em segundo plano (sondagem do chat e da placa), que nunca abre a folha de conexão. */
export interface RequestOptions { background?: boolean }
export async function request<T>(path: string, method = 'GET', body?: unknown, { background = false }: RequestOptions = {}): Promise<T> {
  const mutating = method.toUpperCase() !== 'GET'
  // Depois de "Continuar sem conexão", uma nova ação não é enviada: a faixa treme (plano de toasts). A entrada
  // (`/auth/`) não tem o aviso de conexão e sempre tenta.
  const offline = connection.getState()
  if (mutating && !background && offline.status === 'offline' && offline.sheetDismissed && !path.startsWith('/auth/')) {
    const failure = new ApiError('Não foi possível conectar ao Arena. Verifique a conexão e tente novamente.', 0)
    connection.lost({ mutating, background, cause: failure })
    throw failure
  }
  const token = await SecureStore.getItemAsync(key)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), body instanceof FormData ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(`${base}/api/v1${path}`, { method,
      headers: { ...(body ? (body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) as BodyInit : undefined, signal: controller.signal,
    })
  } catch {
    const failure = new ApiError('Não foi possível conectar ao Arena. Verifique a conexão e tente novamente.', 0)
    connection.lost({ mutating, background, cause: failure })
    throw failure
  } finally { clearTimeout(timer) }
  // Qualquer resposta do servidor prova que há conexão, exceto 502/503/504 (o servidor ou o banco não responde).
  if (!isConnectionStatus(response.status)) connection.reached()
  if (!response.ok) {
    const raw: unknown = await response.json().catch(() => null)
    // Só um objeto JSON vira `body`; texto, lista, `null` ou corpo ilegível ficam sem detalhe.
    const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null
    const failure = new ApiError(typeof data?.detail === 'string' ? data.detail : 'Não foi possível concluir a ação.', response.status, fieldErrors(data?.fields), data)
    if (failure.isConnection) connection.lost({ mutating, background, cause: failure })
    throw failure
  }
  return response.status === 204 ? undefined as T : response.json()
}
export const sports: { value: Sport; label: string }[] = [{ value: 'futebol', label: 'Futebol' }, { value: 'tenis', label: 'Tênis' }, { value: 'corrida', label: 'Corrida' }]
export const positions: { value: Position; label: string }[] = [{ value: 'goleiro', label: 'Goleiro' }, { value: 'defesa', label: 'Defesa' }, { value: 'meio_campo', label: 'Meio de campo' }, { value: 'atacante', label: 'Atacante' }]
