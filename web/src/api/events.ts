import { request } from './client'
import type { City, Page, Person, Sport } from './client'
import type {
  EntryState,
  EventPhase,
  EventRefusalReason,
  EventState,
  EventType,
  FootballFormat,
  PixKeyType,
  ReceiptRefusalReason,
  RunDistance,
  TierKey,
} from '../data/arena'

/*
 * Cliente dos eventos do lado do organizador (docs/decisoes/0003-times-campeonatos.md, seções 13 e 14; código em
 * backend/app/routers/events.py). Os tipos comuns da etapa 2 (cartaz, Pix, inscrição, comprovante, aviso) ficam
 * exportados daqui para o lado do atleta e para as filas da administração. Ações enviam JSON (mesmo `{}`);
 * `DELETE` não tem corpo. Os rótulos e tons ficam em `data/arena.ts`.
 */

export type { EntryState, EventPhase, EventRefusalReason, EventState, PixKeyType, ReceiptRefusalReason, RunDistance }
/** "Todos contra todos" ou "Eliminação simples" (futebol e tênis). */
export type CompetitionType = EventType
export type ChecklistKey = 'nome_modalidade' | 'formato_tipo' | 'vagas_elos' | 'datas' | 'local' | 'inscricao'
export type NextActionKind = 'aguardar_revogacao' | 'corrigir_recusa' | 'completar_rascunho' | 'publicar'
  | 'aguardar_aprovacao' | 'analisar_comprovantes' | 'enviar_devolucoes' | 'aguardar_devolucoes'
  | 'acompanhar_inscricoes' | 'aguardar_inicio' | 'nenhuma'
export type RevocationDecision = 'pendente' | 'seguir' | 'cancelado'

/** Time resumido (o `team` de `MeStandings`, contrato 0002). */
export interface TeamRef { id: number; name: string; initials: string; crest_url: string | null }

/** Cartaz (O3, E2, AD1 e topo de G3 e D2). Datas em ISO (UTC). */
export interface EventPoster {
  id: number
  name: string
  /** Nula só em rascunho. */
  sport: Sport | null
  format: FootballFormat | null
  distance_km: RunDistance | null
  competition_type: CompetitionType | null
  capacity: number | null
  /** Vagas ocupadas (reservada, em análise, confirmada e recusada dentro do prazo). */
  entries_count: number
  confirmed_count: number
  starts_at: string | null
  registration_closes_at: string | null
  /** Pago: o menor entre o fim das inscrições e 12 h antes do início. */
  registration_deadline: string | null
  city: City | null
  venue: string | null
  /** 0 = gratuito; nulo no rascunho sem a escolha. */
  price_cents: number | null
  /** Nulo = aberto a todos (globo). */
  accepted_tiers: TierKey[] | null
  state: EventState
  phase: EventPhase
  /** Inscrições suspensas enquanto a administração decide sobre o organizador revogado. */
  revocation_pending: boolean
}

/** "Pix para receber" (organizador) e "Pix do organizador" (atleta). Só eventos pagos. */
export interface EventPix {
  beneficiary: string | null
  key_type: PixKeyType | null
  /** Normalizada: CPF só dígitos, e-mail minúsculo, telefone +55…, aleatória minúscula. */
  key: string | null
  copy_paste: string | null
  instructions: string | null
}

export interface EntrySubject { kind: 'time' | 'atleta'; team: TeamRef | null; athlete: Person | null }

/** Envio de comprovante (pagamento, pelo participante; devolução, pelo organizador). */
export interface Receipt {
  id: number
  kind: 'pagamento' | 'devolucao'
  /** `/api/v1/receipts/{id}/file` (rota autorizada). */
  file_url: string
  file_type: 'imagem' | 'pdf'
  size_bytes: number
  uploaded_by: Person | null
  created_at: string
  decision: 'aprovado' | 'recusado' | null
  reason_code: ReceiptRefusalReason | null
  reason_detail: string | null
  decided_at: string | null
  participant_response: 'confirmada' | 'contestada' | 'automatica' | null
  responded_at: string | null
  contest_reason: string | null
  /** Devolução sem resposta: envio + 7 dias. */
  auto_confirm_at: string | null
  resolution: 'devolvida' | 'pendente' | null
  resolution_reason: string | null
  resolved_at: string | null
}

/** Aviso do canal do evento; `evento_cancelado` é o aviso automático do cancelamento. */
export interface EventMessage {
  id: number
  kind: 'aviso' | 'evento_cancelado' | (string & {})
  body: string
  /** Nulo: aviso automático da administração ou conta indisponível. */
  author: Person | null
  created_at: string
}
export interface ChecklistItem { key: ChecklistKey; label: string; done: boolean; message: string | null }
export interface PendingCounts {
  /** Inscrições em análise (comprovante para analisar). */
  receipts: number
  /** Devolução pendente sem comprovante de devolução em aberto. */
  refunds_to_send: number
  /** Devolução enviada, aguardando o participante (ou os 7 dias). */
  refunds_awaiting: number
  /** Devolução contestada (decide a administração). */
  refund_disputes: number
  /** receipts + refunds_to_send: o alerta do cartaz. */
  total: number
}
export interface NextAction { kind: NextActionKind; count: number | null; deadline: string | null }
/** RN16, só no tênis. */
export interface TennisBonus { champion: number; runner_up: number; semifinalist: number; min_entries: number; applies: boolean }

/** Corpo de POST (com `name`) e PATCH (ao menos um campo). Ausente: não muda; null: limpa. */
export interface EventDraftInput {
  name?: string
  sport?: Sport | null
  format?: FootballFormat | null
  distance_km?: RunDistance | null
  competition_type?: CompetitionType | null
  capacity?: number | null
  accepted_tiers?: TierKey[] | null
  city_id?: number | null
  venue?: string | null
  course_notes?: string | null
  starts_at?: string | null
  registration_closes_at?: string | null
  price_cents?: number | null
  pix_beneficiary?: string | null
  pix_key_type?: PixKeyType | null
  pix_key?: string | null
  pix_copy_paste?: string | null
  pix_instructions?: string | null
  contact?: string | null
}
export type EventDraftField = keyof EventDraftInput

/** Cartaz do O3. */
export interface OrganizerEventCard extends EventPoster { pending: PendingCounts; next_action: NextAction }

/** Gestão G3 (e a base das telas de seção). */
export interface OrganizerEventDetail extends OrganizerEventCard {
  course_notes: string | null
  contact: string | null
  /** Pagos, inclusive rascunho com valor > 0. */
  pix: EventPix | null
  /** Só em rascunho; [] nos demais. */
  checklist: ChecklistItem[]
  /** Rascunho com checklist completo e permissão ativa. */
  can_submit: boolean
  refusal: { reason_code: EventRefusalReason; reason_detail: string | null; reviewed_at: string } | null
  submitted_at: string | null
  published_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  revocation_decision: RevocationDecision | null
  /** Só os estados que ocorrem (estado efetivo). */
  entries_by_state: Partial<Record<EntryState, number>>
  /** Vazio enquanto a administração decide (revogação) ou sem permissão no rascunho. */
  editable_fields: EventDraftField[]
  tennis_bonus: TennisBonus | null
}

/** Linha de "Times inscritos" / "Inscritos". */
export interface OrganizerEntry {
  id: number
  subject: EntrySubject
  /** Estado efetivo (a reserva vencida já sai como `expirada`). */
  state: EntryState
  price_cents: number
  reserved_until: string | null
  created_at: string
  confirmed_at: string | null
  registered_by: Person | null
  latest_payment: Receipt | null
  refund: Receipt | null
}

/** Linha e folha do A2. */
export interface ReceiptReview {
  receipt: Receipt
  entry: OrganizerEntry
  /** 1 = primeiro envio; 2 = "2ª tentativa"… */
  attempt: number
  previous: Receipt[]
}

/** Limites do contrato e do servidor (`schemas/organizer_events.py` e `services/event_rules.py`). */
export const EVENT_LIMITS = {
  nameMin: 3, nameMax: 60,
  venueMin: 2, venueMax: 120, courseNotesMax: 500,
  beneficiaryMin: 2, beneficiaryMax: 80, pixKeyMax: 100, copyPasteMax: 1000, instructionsMax: 500, contactMax: 120,
  priceMinCents: 100, priceMaxCents: 1_000_000,
  roundRobinMin: 3, roundRobinMax: 20, raceMin: 2, raceMax: 5000,
  cancelReasonMin: 5, cancelReasonMax: 500, messageMax: 1000,
  /** Inscrição paga fecha 12 h antes do início. */
  paidCloseHours: 12,
} as const

/** Estados em que o evento aparece aos atletas e o canal de avisos aceita mensagens. */
export const PUBLISHED_STATES: readonly EventState[] = ['publicado', 'em_andamento', 'encerrado', 'cancelado']

export type OrganizerEventScope = 'abertos' | 'encerrados'
/** Lista O3 (`abertos`: uma página só; `encerrados`: paginada). Caminho para `usePagedList`. */
export const organizerEventsPath = (scope: OrganizerEventScope) => `/organizer/events?scope=${scope}`
export const listOpenOrganizerEvents = () => request<Page<OrganizerEventCard>>(organizerEventsPath('abertos'))
export const getOrganizerEvent = (id: number) => request<OrganizerEventDetail>(`/organizer/events/${id}`)
export const createEvent = (input: EventDraftInput & { name: string }) =>
  request<OrganizerEventDetail>('/organizer/events', 'POST', input)
export const updateEvent = (id: number, input: EventDraftInput) =>
  request<OrganizerEventDetail>(`/organizer/events/${id}`, 'PATCH', input)
export const deleteEvent = (id: number) => request<void>(`/organizer/events/${id}`, 'DELETE')
/** Gratuito publica; pago vai para a aprovação da administração. */
export const submitEvent = (id: number) => request<OrganizerEventDetail>(`/organizer/events/${id}/submit`, 'POST', {})
export const withdrawEvent = (id: number) => request<OrganizerEventDetail>(`/organizer/events/${id}/withdraw`, 'POST', {})
export const cancelEvent = (id: number, reason: string) =>
  request<OrganizerEventDetail>(`/organizer/events/${id}/cancel`, 'POST', { reason: reason.trim() })

/** Inscrições do evento, em ordem de inscrição; `state` filtra pelo estado efetivo. */
export const eventEntriesPath = (id: number, state?: EntryState) =>
  `/organizer/events/${id}/entries${state ? `?state=${state}` : ''}`
/* Comprovantes do A2 (`eventReceiptsPath`, `decideReceipt`) e devoluções: rotas em `api/receipts.ts`. */

/** Canal de avisos: do mais recente ao mais antigo. */
export const eventMessagesPath = (id: number) => `/events/${id}/messages`
export const postEventMessage = (id: number, body: string) =>
  request<EventMessage>(`/events/${id}/messages`, 'POST', { body: body.trim() })

/** Mensagem de campo do 422 sem o prefixo do Pydantic ("Value error, …"). */
export const fieldMessage = (message: string) => message.replace(/^Value error,\s*/i, '')
