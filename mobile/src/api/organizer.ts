import { request, sports } from './client'
import type { City, Person, Sport } from './client'

/** Contrato: docs/decisoes/0003-times-campeonatos.md, seção 6 (pedido de organizador). */

export type OrganizerRefusalReason = 'contato_nao_funciona' | 'pouca_informacao' | 'pedido_repetido' | 'outro'
export const ORGANIZER_REFUSAL_REASONS: { value: OrganizerRefusalReason; label: string }[] = [
  { value: 'contato_nao_funciona', label: 'Contato não funciona' },
  { value: 'pouca_informacao', label: 'Pouca informação' },
  { value: 'pedido_repetido', label: 'Pedido repetido' },
  { value: 'outro', label: 'Outro' },
]

/** Limites do pedido e das decisões, os mesmos validados pelo servidor. */
export const ORGANIZER_LIMITS = {
  nameMin: 3, nameMax: 80, experienceMax: 1000, contactMin: 5, contactMax: 120, linkMax: 300,
  detailMin: 5, detailMax: 500,
} as const

export interface OrganizerRequestInput {
  display_name: string
  city_id: number
  sports: Sport[]
  experience?: string | null
  contact: string
  link?: string | null
  accept_terms: boolean
}

export interface OrganizerRequest {
  id: number
  display_name: string
  city: City
  sports: Sport[]
  experience: string | null
  contact: string
  link: string | null
  state: 'em_analise' | 'aprovado' | 'recusado' | 'cancelado'
  reason_code: OrganizerRefusalReason | null
  reason_detail: string | null
  created_at: string
  decided_at: string | null
}

export type OrganizerState = 'sem_pedido' | 'em_analise' | 'recusado' | 'aprovado' | 'revogado'
/** Estado do cartão P3 do Menu. */
export interface OrganizerStatus {
  state: OrganizerState
  request: OrganizerRequest | null
  organizer: { id: number; display_name: string; approved_at: string } | null
  revocation: { revoked_at: string; reason: string } | null
}

export interface AdminOrganizerRequest extends OrganizerRequest { requester: Person; decided_by: Person | null }
export interface AdminOrganizer {
  id: number
  user: Person
  display_name: string
  approved_at: string
  approved_by: Person | null
  request_id: number | null
}

export const getOrganizerStatus = () => request<OrganizerStatus>('/me/organizer-request')
export const sendOrganizerRequest = (input: OrganizerRequestInput) => request<OrganizerRequest>('/me/organizer-request', 'POST', input)
export const cancelOrganizerRequest = () => request<void>('/me/organizer-request', 'DELETE')

/** Rótulo do motivo de recusa; com detalhe, "Pouca informação · detalhe" (em "Outro", só o detalhe). */
export function refusalText(code: OrganizerRefusalReason | null | undefined, detail?: string | null) {
  const label = ORGANIZER_REFUSAL_REASONS.find(reason => reason.value === code)?.label
  const extra = detail?.trim()
  if (code === 'outro' && extra) return extra
  if (label && extra) return `${label} · ${extra}`
  return label ?? extra ?? 'Motivo não informado'
}

/** Texto terminado em ponto final, sem duplicar a pontuação que já vier no motivo. */
export const sentence = (text: string) => (/[.!?…]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`)

/** Nomes das modalidades do pedido, na ordem do catálogo ("Futebol, Corrida"). */
export const sportNames = (list: readonly Sport[]) =>
  sports.filter(sport => list.includes(sport.value)).map(sport => sport.label).join(', ')

/** Rascunho do formulário P5 (campos como digitados). */
export interface OrganizerRequestDraft {
  display_name: string
  city_id: number | null
  sports: Sport[]
  experience: string
  contact: string
  link: string
  accept_terms: boolean
}
export type OrganizerRequestErrors = Partial<Record<keyof OrganizerRequestDraft, string>>

const linkPattern = /^https?:\/\/[^\s/$.?#][^\s]*$/i

/** Mesmas regras do servidor (seção 6 do contrato); devolve só os campos com erro. */
export function validateOrganizerRequest(draft: OrganizerRequestDraft, cityIds?: ReadonlySet<number>): OrganizerRequestErrors {
  const errors: OrganizerRequestErrors = {}
  const name = draft.display_name.trim()
  if (name.length < ORGANIZER_LIMITS.nameMin || name.length > ORGANIZER_LIMITS.nameMax)
    errors.display_name = `Informe o nome do organizador, de ${ORGANIZER_LIMITS.nameMin} a ${ORGANIZER_LIMITS.nameMax} caracteres.`
  if (!draft.city_id || (cityIds && !cityIds.has(draft.city_id))) errors.city_id = 'Selecione uma cidade do catálogo.'
  if (!draft.sports.length) errors.sports = 'Escolha ao menos uma modalidade.'
  if (draft.experience.trim().length > ORGANIZER_LIMITS.experienceMax)
    errors.experience = `Use até ${ORGANIZER_LIMITS.experienceMax} caracteres.`
  const contact = draft.contact.trim()
  if (contact.length < ORGANIZER_LIMITS.contactMin || contact.length > ORGANIZER_LIMITS.contactMax)
    errors.contact = `Informe um contato (telefone, e-mail ou perfil), de ${ORGANIZER_LIMITS.contactMin} a ${ORGANIZER_LIMITS.contactMax} caracteres.`
  const link = draft.link.trim()
  if (link && (link.length > ORGANIZER_LIMITS.linkMax || !linkPattern.test(link)))
    errors.link = `Informe um endereço que comece com http:// ou https://, com até ${ORGANIZER_LIMITS.linkMax} caracteres.`
  if (!draft.accept_terms) errors.accept_terms = 'Aceite as responsabilidades do organizador para enviar o pedido.'
  return errors
}

/** Corpo do `POST /me/organizer-request`: textos aparados e opcionais vazios como null. */
export function organizerRequestInput(draft: OrganizerRequestDraft): OrganizerRequestInput {
  const experience = draft.experience.trim()
  const link = draft.link.trim()
  return {
    display_name: draft.display_name.trim(),
    city_id: draft.city_id ?? 0,
    sports: sports.map(sport => sport.value).filter(value => draft.sports.includes(value)),
    experience: experience || null,
    contact: draft.contact.trim(),
    link: link || null,
    accept_terms: draft.accept_terms,
  }
}
