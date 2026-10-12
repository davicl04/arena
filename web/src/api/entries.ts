import { request } from './client'
import type { Person, Sport } from './client'
import type { EntryState, TierKey } from '../data/arena'
import type { PixInfo } from '../components/events/pix'
import type { EntrySubject, EventPix, EventPoster, Receipt, TeamRef, TennisBonus } from './events'

/*
 * Lado do atleta nos campeonatos e provas. Contratos: docs/decisoes/0002-jogar.md, seção 6 (lista E2, detalhe D2,
 * inscrição, comprovante e devolução) e docs/decisoes/0003-times-campeonatos.md, seções 13, 14 (avisos) e 16.
 * Os tipos comuns da seção 13 (cartaz, Pix, comprovante, inscrito, aviso) têm uma só definição, em `api/events.ts`; as
 * regras e rotas de comprovante comuns, em `api/receipts.ts`. Aqui ficam só as formas do atleta.
 */

export type EligibilityReason = 'em_classificacao' | 'fora_da_faixa' | 'sem_time'

export interface TeamEligibility {
  team: TeamRef
  /** Elo do time no formato do evento; `null` em classificação. */
  tier: TierKey | null
  eligible: boolean
  reason: 'em_classificacao' | 'fora_da_faixa' | null
  /** Inscrição do time que ocupa vaga, se houver. */
  entry_id: number | null
}

export interface EventEligibility {
  /** Futebol: algum time representado elegível e ainda sem inscrição. */
  eligible: boolean
  reason: EligibilityReason | null
  /** "Este evento aceita só Prata e Ouro." etc. */
  message: string | null
  /** Tênis e corrida: elo de quem vê na categoria. */
  tier: TierKey | null
  /** Futebol: times ativos que quem vê representa. */
  teams: TeamEligibility[] | null
}

export interface MyEntrySummary { id: number; state: EntryState; team: TeamRef | null; reserved_until: string | null }

/** Cartaz da lista E2. */
export interface EventCard extends EventPoster {
  organizer_name: string
  eligibility: EventEligibility
  /** A inscrição de quem vê (ou de um time dele) que ocupa vaga, em devolução ou expirada. */
  my_entry: MyEntrySummary | null
}

/** Detalhe D2. */
export interface EventDetail extends EventCard {
  course_notes: string | null
  contact: string | null
  organizer: { display_name: string; person: Person | null }
  pix: EventPix | null
  registration_open: boolean
  spots_left: number
  tennis_bonus: TennisBonus | null
  cancelled_at: string | null
  cancel_reason: string | null
  /** O organizador vê o evento, mas não se inscreve. */
  is_organizer: boolean
  /** Leitor do canal de avisos. */
  can_read_messages: boolean
}

/** Aba Inscritos: só as confirmadas, na ordem da confirmação. */
export interface PublicEntry { id: number; subject: EntrySubject; confirmed_at: string }

export type EntryRole = 'atleta' | 'representante' | 'membro' | 'organizador' | 'administracao'

/** Cartão S1 da inscrição e a folha "Enviar comprovante". */
export interface MyEntry {
  id: number
  event: EventPoster
  subject: EntrySubject
  my_role: EntryRole
  /** Estado efetivo: reserva vencida aparece `expirada`. */
  state: EntryState
  price_cents: number
  reserved_until: string | null
  created_at: string
  confirmed_at: string | null
  expired_at: string | null
  cancelled_at: string | null
  refunded_at: string | null
  /** `null` para quem é só membro do time. */
  latest_payment: Receipt | null
  /** Devolução em aberto ou a última; `null` para quem é só membro do time. */
  refund: Receipt | null
  can_send_receipt: boolean
  can_cancel: boolean
  can_respond_refund: boolean
}

function query(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== null && value !== undefined && value !== '') search.set(key, String(value))
  const text = search.toString()
  return text ? `?${text}` : ''
}

/** Lista E2 (para `usePagedList`): eventos publicados ou em andamento da modalidade, na cidade escolhida. */
export const eventsPath = (sport: Sport, cityId?: number | null) => `/events${query({ sport, city_id: cityId })}`
/** Inscrições de quem vê: `ativas` (ocupam vaga ou com devolução em curso) ou `historico`. */
export const myEntriesPath = (scope: 'ativas' | 'historico' = 'ativas', limit = 50) => `/me/entries${query({ scope, limit })}`
/** Inscritos confirmados do evento (aba Inscritos do D2, pública). */
export const publicEntriesPath = (eventId: number) => `/events/${eventId}/entries`

export const getEvent = (eventId: number) => request<EventDetail>(`/events/${eventId}`)
export const getEntry = (entryId: number) => request<MyEntry>(`/entries/${entryId}`)
/** Futebol: `teamId` do time representado; tênis e corrida: o próprio atleta (corpo vazio). */
export const createEntry = (eventId: number, teamId?: number | null) =>
  request<MyEntry>(`/events/${eventId}/entries`, 'POST', teamId ? { team_id: teamId } : {})
export const cancelEntry = (entryId: number) => request<void>(`/entries/${entryId}`, 'DELETE')
export function sendReceipt(entryId: number, file: File) {
  const form = new FormData()
  form.append('file', file, file.name || 'comprovante')
  return request<MyEntry>(`/entries/${entryId}/receipt`, 'PUT', form)
}
export const confirmRefund = (entryId: number) =>
  request<MyEntry>(`/entries/${entryId}/refund-response`, 'POST', { response: 'confirmar' })
export const contestRefund = (entryId: number, reason: string) =>
  request<MyEntry>(`/entries/${entryId}/refund-response`, 'POST', { response: 'contestar', reason })
/** Motivo da contestação da devolução: 5 a 500 caracteres. */
export const CONTEST_LIMITS = { min: 5, max: 500 } as const

/** Pix do evento no formato dos componentes (`PixBlock`, `PaymentInfoSheet`); sem chave, `null`. */
export function pixInfo(detail: Pick<EventDetail, 'pix' | 'organizer' | 'contact'>): PixInfo | null {
  const pix = detail.pix
  if (!pix?.key || !pix.key_type) return null
  return {
    holder: pix.beneficiary || detail.organizer.display_name,
    keyType: pix.key_type,
    key: pix.key,
    copyPaste: pix.copy_paste,
    instructions: pix.instructions,
    contact: detail.contact,
  }
}

