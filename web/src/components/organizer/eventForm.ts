import type { Sport } from '@/api/client'
import { ApiError } from '@/api/client'
import { EVENT_LIMITS, fieldMessage } from '@/api/events'
import type { ChecklistKey, CompetitionType, EventDraftInput, OrganizerEventDetail, PixKeyType, RunDistance } from '@/api/events'
import { eliminationCapacities, rankingTiers } from '@/data/arena'
import type { FootballFormat, TierKey } from '@/data/arena'
import { combineDateTime, fromDateKey, splitDateTime } from '@/utils/dateKey'

/*
 * Regras do assistente "Criar evento" (V4): o formulário como digitado, a conversão para o rascunho da API, as
 * validações de cada passo (as mesmas do checklist do servidor, `event_rules.draft_checklist`) e a ligação dos erros
 * da API (campos do 422 e itens do checklist) ao passo e ao campo certos.
 */

/** Os cinco passos do V4, uma pergunta por vez. */
export const WIZARD_STEPS = [
  { key: 'nome', question: 'Qual é o nome do evento?' },
  { key: 'modalidade', question: 'Qual modalidade?' },
  { key: 'vagas', question: 'Quantas vagas e quem pode entrar?' },
  { key: 'quando', question: 'Quando e onde?' },
  { key: 'inscricao', question: 'A inscrição é paga?' },
] as const
export const LAST_STEP = WIZARD_STEPS.length - 1

export interface EventForm {
  name: string
  sport: Sport | null
  format: FootballFormat | null
  distanceKm: RunDistance | null
  competitionType: CompetitionType | null
  /** Vagas como digitadas. */
  capacity: string
  /** Só alguns elos (RN18); falso é "aberto a todos". */
  restricted: boolean
  tiers: TierKey[]
  /** Dia local ("2026-11-15") e hora ("09:00") do início. */
  startDate: string
  startTime: string
  /** Fim das inscrições; sem hora, vale 23:59 no fuso do aparelho. */
  closeDate: string
  closeTime: string
  cityId: number | null
  venue: string
  courseNotes: string
  /** Nulo até escolher "Gratuita" ou "Paga". */
  paid: boolean | null
  /** Valor em reais como digitado ("240" ou "240,50"). */
  price: string
  pixBeneficiary: string
  pixKeyType: PixKeyType | null
  pixKey: string
  pixCopyPaste: string
  pixInstructions: string
  contact: string
}
export type FormField = keyof EventForm
export type FormErrors = Partial<Record<FormField, string>>

/** Passo de cada campo (para levar o erro da API ao passo certo). */
export const FIELD_STEP: Record<FormField, number> = {
  name: 0,
  sport: 1, format: 1, distanceKm: 1, competitionType: 1,
  capacity: 2, restricted: 2, tiers: 2,
  startDate: 3, startTime: 3, closeDate: 3, closeTime: 3, cityId: 3, venue: 3, courseNotes: 3,
  paid: 4, price: 4, pixBeneficiary: 4, pixKeyType: 4, pixKey: 4, pixCopyPaste: 4, pixInstructions: 4, contact: 4,
}
/** Ordem dos campos na tela, para focar o primeiro com erro. */
const FIELD_ORDER = Object.keys(FIELD_STEP) as FormField[]

export function emptyForm(): EventForm {
  return {
    name: '', sport: null, format: null, distanceKm: null, competitionType: null, capacity: '', restricted: false, tiers: [],
    startDate: '', startTime: '', closeDate: '', closeTime: '', cityId: null, venue: '', courseNotes: '',
    paid: null, price: '', pixBeneficiary: '', pixKeyType: null, pixKey: '', pixCopyPaste: '', pixInstructions: '', contact: '',
  }
}

/** Centavos → texto do campo de valor ("240" ou "240,50"). */
export function priceText(cents: number): string {
  const reais = cents / 100
  return Number.isInteger(reais) ? String(reais) : reais.toFixed(2).replace('.', ',')
}

/** Valor digitado em reais → centavos. Aceita "240", "240,5", "1.234,56" e "240.50"; inválido ou vazio → `null`. */
export function parsePrice(text: string): number | null {
  const clean = text.replace(/R\$|\s/g, '')
  if (!clean) return null
  let value: string
  if (clean.includes(',')) value = clean.replace(/\./g, '').replace(',', '.')
  else if (/^\d+\.\d{1,2}$/.test(clean)) value = clean
  else value = clean.replace(/\./g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null
  return Math.round(Number(value) * 100)
}

/** Vagas digitadas → número inteiro positivo ou `null`. */
export function parseCapacity(text: string): number | null {
  const value = text.trim()
  return /^\d+$/.test(value) ? Number(value) : null
}

/** Rascunho da API → formulário (editar um rascunho). */
export function formFromDetail(detail: OrganizerEventDetail): EventForm {
  const start = splitDateTime(detail.starts_at)
  const close = splitDateTime(detail.registration_closes_at)
  const pix = detail.pix
  return {
    name: detail.name,
    sport: detail.sport,
    format: detail.format,
    distanceKm: detail.distance_km,
    competitionType: detail.competition_type,
    capacity: detail.capacity == null ? '' : String(detail.capacity),
    restricted: detail.accepted_tiers != null,
    tiers: detail.accepted_tiers ?? [],
    startDate: start?.date ?? '',
    startTime: start?.time ?? '',
    closeDate: close?.date ?? '',
    closeTime: close?.time ?? '',
    cityId: detail.city?.id ?? null,
    venue: detail.venue ?? '',
    courseNotes: detail.course_notes ?? '',
    paid: detail.price_cents == null ? null : detail.price_cents > 0,
    price: detail.price_cents ? priceText(detail.price_cents) : '',
    pixBeneficiary: pix?.beneficiary ?? '',
    pixKeyType: pix?.key_type ?? null,
    pixKey: pix?.key ?? '',
    pixCopyPaste: pix?.copy_paste ?? '',
    pixInstructions: pix?.instructions ?? '',
    contact: detail.contact ?? '',
  }
}

/**
 * Troca de modalidade ou de tipo: limpa o que não se aplica (como `event_rules.normalize_category`), incluindo vagas
 * que a eliminação simples não aceita.
 */
export function withCategory(form: EventForm, change: Partial<Pick<EventForm, 'sport' | 'format' | 'distanceKm' | 'competitionType'>>): EventForm {
  const next = { ...form, ...change }
  if (next.sport !== 'futebol') next.format = null
  if (next.sport !== 'corrida') { next.distanceKm = null; next.courseNotes = '' }
  if (next.sport === 'corrida' || next.sport === null) next.competitionType = null
  const capacity = parseCapacity(next.capacity)
  if (next.competitionType === 'eliminacao_simples' && capacity !== null && !(eliminationCapacities as readonly number[]).includes(capacity))
    next.capacity = ''
  return next
}

const trimmedOrNull = (value: string) => value.trim() || null
const tierOrder = rankingTiers.map(tier => tier.image) as TierKey[]

/** Início do evento (ISO) ou `null` sem dia e hora. */
export const startsAt = (form: EventForm) => (form.startDate && form.startTime ? combineDateTime(form.startDate, form.startTime) : null)
/** Fim das inscrições (ISO) ou `null`; sem hora escolhida, 23:59. */
export const closesAt = (form: EventForm) => (form.closeDate ? combineDateTime(form.closeDate, form.closeTime || '23:59') : null)

/** Corpo completo do rascunho (POST e PATCH): campos que não se aplicam vão nulos. */
export function draftInput(form: EventForm): EventDraftInput & { name: string } {
  const paid = form.paid === true
  const capacity = parseCapacity(form.capacity)
  return {
    name: form.name.trim(),
    sport: form.sport,
    format: form.sport === 'futebol' ? form.format : null,
    distance_km: form.sport === 'corrida' ? form.distanceKm : null,
    competition_type: form.sport === 'futebol' || form.sport === 'tenis' ? form.competitionType : null,
    capacity,
    accepted_tiers: form.restricted ? tierOrder.filter(tier => form.tiers.includes(tier)) : null,
    city_id: form.cityId,
    venue: trimmedOrNull(form.venue),
    course_notes: form.sport === 'corrida' ? trimmedOrNull(form.courseNotes) : null,
    starts_at: startsAt(form),
    registration_closes_at: closesAt(form),
    price_cents: form.paid === null ? null : paid ? parsePrice(form.price) : 0,
    pix_beneficiary: paid ? trimmedOrNull(form.pixBeneficiary) : null,
    pix_key_type: paid ? form.pixKeyType : null,
    pix_key: paid ? trimmedOrNull(form.pixKey) : null,
    pix_copy_paste: paid ? trimmedOrNull(form.pixCopyPaste) : null,
    pix_instructions: paid ? trimmedOrNull(form.pixInstructions) : null,
    contact: trimmedOrNull(form.contact),
  }
}

/* ----- Chave Pix (as mesmas regras de `event_rules.normalize_pix_key`) ----- */

function validCpf(digits: string): boolean {
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false
  for (const size of [9, 10]) {
    let total = 0
    for (let index = 0; index < size; index++) total += Number(digits[index]) * (size + 1 - index)
    if (((total * 10) % 11) % 10 !== Number(digits[size])) return false
  }
  return true
}

/** Mensagem do servidor para uma chave inválida do tipo escolhido, ou `null`. */
export function pixKeyError(type: PixKeyType | null, key: string): string | null {
  const value = key.trim()
  if (type === 'cpf') return validCpf(value.replace(/\D/g, '')) ? null : 'Informe um CPF válido.'
  if (type === 'email') {
    const email = value.toLowerCase()
    return email.length <= 77 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? null : 'Informe um e-mail válido.'
  }
  if (type === 'telefone') {
    let digits = value.replace(/\D/g, '')
    if (value.startsWith('+')) {
      if (!digits.startsWith('55')) return 'Use um telefone do Brasil, com DDD.'
      digits = digits.slice(2)
    }
    return (digits.length === 10 || digits.length === 11) && digits[0] !== '0' ? null : 'Informe o telefone com DDD.'
  }
  if (type === 'aleatoria')
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.toLowerCase())
      ? null : 'Copie a chave aleatória completa, como aparece no app do banco.'
  return 'Escolha o tipo de chave Pix.'
}

/* ----- Validação por passo ----- */

const { nameMin, nameMax, venueMin, venueMax, courseNotesMax, beneficiaryMin, beneficiaryMax, copyPasteMax, instructionsMax,
  contactMax, priceMinCents, priceMaxCents, roundRobinMin, roundRobinMax, raceMin, raceMax, paidCloseHours } = EVENT_LIMITS

function nameError(form: EventForm): string | null {
  const length = form.name.trim().length
  return length < nameMin || length > nameMax ? `Informe o nome do evento com ${nameMin} a ${nameMax} caracteres.` : null
}

/** Mensagem das vagas conforme a modalidade e o tipo (`event_rules.capacity_error`). */
export function capacityError(form: EventForm): string | null {
  const capacity = parseCapacity(form.capacity)
  if (capacity === null) return 'Informe as vagas.'
  if (form.sport === 'corrida')
    return capacity >= raceMin && capacity <= raceMax ? null : `Na corrida, as vagas vão de ${raceMin} a ${raceMax}.`
  if (form.competitionType === 'eliminacao_simples')
    return (eliminationCapacities as readonly number[]).includes(capacity) ? null : 'Na eliminação simples, as vagas são 4, 8 ou 16.'
  if (form.competitionType === 'todos_contra_todos')
    return capacity >= roundRobinMin && capacity <= roundRobinMax ? null : `No todos contra todos, as vagas vão de ${roundRobinMin} a ${roundRobinMax}.`
  return 'Escolha o tipo antes das vagas.'
}

function stepErrors(form: EventForm, step: number, now: Date): FormErrors {
  const errors: FormErrors = {}
  if (step === 0) {
    const name = nameError(form)
    if (name) errors.name = name
  } else if (step === 1) {
    if (!form.sport) errors.sport = 'Escolha a modalidade.'
    else if (form.sport === 'futebol') {
      if (!form.format) errors.format = 'Escolha o formato.'
      if (!form.competitionType) errors.competitionType = 'Escolha o tipo.'
    } else if (form.sport === 'tenis') {
      if (!form.competitionType) errors.competitionType = 'Escolha o tipo.'
    } else if (!form.distanceKm) errors.distanceKm = 'Escolha a distância.'
  } else if (step === 2) {
    const capacity = capacityError(form)
    if (capacity) errors.capacity = capacity
    if (form.restricted && !form.tiers.length) errors.tiers = 'Escolha ao menos um elo ou deixe aberto a todos.'
  } else if (step === 3) {
    const start = startsAt(form)
    const close = closesAt(form)
    if (!form.startDate) errors.startDate = 'Escolha a data do evento.'
    else if (!form.startTime) errors.startTime = 'Informe a hora do início.'
    else if (start && new Date(start) <= now) errors.startDate = 'A data do evento já passou.'
    else if (start && form.paid && new Date(start).getTime() - paidCloseHours * 3_600_000 <= now.getTime())
      errors.startDate = 'Inscrições pagas fecham 12 h antes do início; escolha outra data.'
    if (!form.closeDate) errors.closeDate = 'Escolha até quando vão as inscrições.'
    else if (close && start && close > start) errors.closeDate = 'As inscrições precisam fechar antes do início do evento.'
    else if (close && new Date(close) <= now) errors.closeDate = 'O fim das inscrições já passou.'
    if (form.cityId === null) errors.cityId = 'Escolha a cidade.'
    const venue = form.venue.trim().length
    if (venue < venueMin || venue > venueMax) errors.venue = `Informe o local com ${venueMin} a ${venueMax} caracteres.`
    if (form.courseNotes.trim().length > courseNotesMax) errors.courseNotes = `Use até ${courseNotesMax} caracteres.`
  } else if (step === 4) {
    if (form.paid === null) errors.paid = 'Escolha se a inscrição é gratuita ou paga.'
    if (form.paid) {
      const cents = parsePrice(form.price)
      if (cents === null || cents < priceMinCents || cents > priceMaxCents) errors.price = 'O valor vai de R$ 1,00 a R$ 10.000,00.'
      const beneficiary = form.pixBeneficiary.trim().length
      if (beneficiary < beneficiaryMin || beneficiary > beneficiaryMax)
        errors.pixBeneficiary = `Informe o favorecido com ${beneficiaryMin} a ${beneficiaryMax} caracteres.`
      if (!form.pixKeyType) errors.pixKeyType = 'Escolha o tipo de chave Pix.'
      else {
        const key = pixKeyError(form.pixKeyType, form.pixKey)
        if (key) errors.pixKey = key
      }
      if (form.pixCopyPaste.trim().length > copyPasteMax) errors.pixCopyPaste = `Use até ${copyPasteMax} caracteres.`
      if (form.pixInstructions.trim().length > instructionsMax) errors.pixInstructions = `Use até ${instructionsMax} caracteres.`
    }
    if (form.contact.trim().length > contactMax) errors.contact = `Use até ${contactMax} caracteres.`
  }
  return errors
}

/** Erros do passo (para avançar). */
export function validateStep(form: EventForm, step: number, now: Date = new Date()): FormErrors {
  return stepErrors(form, step, now)
}

/** Primeiro passo com erro e os erros dele (para publicar), ou `null` se tudo estiver completo. */
export function validateAll(form: EventForm, now: Date = new Date()): { step: number; errors: FormErrors } | null {
  for (let step = 0; step <= LAST_STEP; step++) {
    const errors = stepErrors(form, step, now)
    if (Object.keys(errors).length) return { step, errors }
  }
  return null
}

/**
 * Validação mínima para salvar o rascunho (incompleto vale): o nome, que o servidor exige, e o que não daria para
 * guardar sem perder o que foi digitado (valor ou vagas ilegíveis, dia sem hora).
 */
export function validateDraft(form: EventForm): FormErrors {
  const errors: FormErrors = {}
  const name = nameError(form)
  if (name) errors.name = name
  if (form.capacity.trim() && parseCapacity(form.capacity) === null) errors.capacity = 'Informe as vagas em número inteiro.'
  if (form.startDate && !form.startTime) errors.startTime = 'Informe a hora do início para guardar a data.'
  if (form.paid && form.price.trim() && parsePrice(form.price) === null) errors.price = 'Informe o valor em reais, como 240 ou 240,50.'
  return errors
}

/** Primeiro campo com erro, na ordem da tela. */
export function firstErrorField(errors: FormErrors): FormField | null {
  return FIELD_ORDER.find(field => errors[field]) ?? null
}

/* ----- Erros da API ----- */

const API_FIELDS: Record<string, FormField> = {
  name: 'name', sport: 'sport', format: 'format', distance_km: 'distanceKm', competition_type: 'competitionType',
  capacity: 'capacity', accepted_tiers: 'tiers', city_id: 'cityId', venue: 'venue', course_notes: 'courseNotes',
  starts_at: 'startDate', registration_closes_at: 'closeDate', price_cents: 'price', pix_beneficiary: 'pixBeneficiary',
  pix_key_type: 'pixKeyType', pix_key: 'pixKey', pix_copy_paste: 'pixCopyPaste', pix_instructions: 'pixInstructions',
  contact: 'contact',
}
/** Erros sem lista de campos (`HTTPException` 422) que pertencem a um campo. */
const DETAIL_FIELDS: [RegExp, FormField][] = [
  [/inscrições precisam fechar antes do início/i, 'closeDate'],
  [/cidade do catálogo/i, 'cityId'],
]

/** Campo que recebe a mensagem de um item do checklist (o servidor responde a chave do item). */
function checklistField(key: ChecklistKey, message: string, form: EventForm): FormField {
  switch (key) {
    case 'nome_modalidade': return nameError(form) ? 'name' : 'sport'
    case 'formato_tipo':
      if (!form.sport) return 'sport'
      if (form.sport === 'corrida') return 'distanceKm'
      return form.sport === 'futebol' && !form.format ? 'format' : 'competitionType'
    case 'vagas_elos': return /elo/i.test(message) ? 'tiers' : 'capacity'
    case 'datas':
      if (!form.startDate) return 'startDate'
      if (!form.closeDate) return 'closeDate'
      return /fim das inscrições|precisam fechar/i.test(message) ? 'closeDate' : 'startDate'
    case 'local': return form.cityId === null ? 'cityId' : 'venue'
    case 'inscricao':
      if (form.paid === null) return 'paid'
      if (/valor/i.test(message)) return 'price'
      if (/favorecido/i.test(message)) return form.pixBeneficiary.trim().length < beneficiaryMin ? 'pixBeneficiary' : 'pixKeyType'
      return 'pixKey'
  }
}
const CHECKLIST_KEYS: readonly string[] = ['nome_modalidade', 'formato_tipo', 'vagas_elos', 'datas', 'local', 'inscricao']

export interface ApiFormErrors {
  errors: FormErrors
  /** Passo do primeiro campo com erro, ou `null` quando o erro é geral. */
  step: number | null
  /** Mensagem geral (sem campo), como um `409` ou a falta de conexão. */
  general: string
}

/** Leva um erro da API (POST, PATCH ou envio) aos campos do formulário e ao passo do primeiro deles. */
export function apiFormErrors(cause: unknown, form: EventForm, fallback: string): ApiFormErrors {
  const message = cause instanceof Error && cause.message ? cause.message : fallback
  if (!(cause instanceof ApiError) || cause.status !== 422) return { errors: {}, step: null, general: message }
  const errors: FormErrors = {}
  for (const item of cause.fields) {
    const text = fieldMessage(item.message)
    const key = item.field.split('.')[0]
    const field = CHECKLIST_KEYS.includes(key) ? checklistField(key as ChecklistKey, text, form) : API_FIELDS[key]
    if (field && !errors[field]) errors[field] = text
  }
  if (!cause.fields.length) {
    const match = DETAIL_FIELDS.find(([pattern]) => pattern.test(message))
    if (match) errors[match[1]] = message
  }
  const first = firstErrorField(errors)
  return first ? { errors, step: FIELD_STEP[first], general: '' } : { errors: {}, step: null, general: message }
}

/** Passo inicial ao editar um rascunho: o primeiro incompleto, ou o último. */
export function firstIncompleteStep(form: EventForm, now: Date = new Date()): number {
  return validateAll(form, now)?.step ?? LAST_STEP
}

/** Passo do item do checklist (G3 → "Preencher"). */
export const CHECKLIST_STEP: Record<ChecklistKey, number> = {
  nome_modalidade: 0, formato_tipo: 1, vagas_elos: 2, datas: 3, local: 3, inscricao: 4,
}

/** Dia mínimo do fim das inscrições e máximo permitido (o dia do evento). */
export const closeDateMax = (form: EventForm) => (fromDateKey(form.startDate) ? form.startDate : undefined)
