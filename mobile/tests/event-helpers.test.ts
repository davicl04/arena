import { describe, expect, it, vi } from 'vitest'
import { enterableTeams, entryCta, isLocked } from '../src/components/events/entryCta'
import { placeText, refusalText, reservationDeadline, tiersText } from '../src/components/events/eventText'
import { toUploadFile, typeFromName } from '../src/utils/receiptFile'
import { formatPrice } from '../src/utils/format'
import type { TeamEligibility } from '../src/api/entries'
import { eventCard, eventDetail, myEntry, team } from './support/events'

vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))

const second: TeamEligibility = { team: { id: 4, name: 'Real Guará', initials: 'RG', crest_url: null }, tier: 'ouro', eligible: true, reason: null, entry_id: null }
const one: TeamEligibility = { team, tier: 'prata', eligible: true, reason: null, entry_id: null }
const eligibility = (teams = [one], extra: Partial<ReturnType<typeof eventDetail>['eligibility']> = {}): ReturnType<typeof eventDetail>['eligibility'] => ({ eligible: true, reason: null, message: null, tier: null, teams, ...extra })
const price = (cents: number) => formatPrice(cents, { compact: true, free: 'Grátis' })

describe('entryCta: o botão fixo do detalhe (contrato 0002, 6.5)', () => {
  it('o organizador não vê o botão', () => {
    expect(entryCta(eventDetail({ is_organizer: true }), null)).toBeNull()
  })

  it('o comprovante da inscrição em curso tem prioridade: "Enviar comprovante" ou "Enviar outro"', () => {
    expect(entryCta(eventDetail(), myEntry({ state: 'reservada' }))).toEqual({ kind: 'receipt', label: 'Enviar comprovante' })
    expect(entryCta(eventDetail(), myEntry({ state: 'rejeitada' }))).toEqual({ kind: 'receipt', label: 'Enviar outro' })
    // Inscrição em curso sem comprovante a enviar (o time já ocupa a vaga): nenhum botão.
    expect(entryCta(eventDetail({ eligibility: eligibility([{ ...one, entry_id: 9 }]) }), myEntry({ state: 'reservada', can_send_receipt: false }))).toBeNull()
  })

  it('futebol: o nome do time no rótulo, ou "time" com mais de um elegível (que abre a escolha)', () => {
    expect(entryCta(eventDetail({ eligibility: eligibility() }), null)).toEqual({ kind: 'enter', label: `Inscrever Ferrugem FC · ${price(24000)}`, teams: [one] })
    expect(entryCta(eventDetail({ price_cents: 0, eligibility: eligibility([one, second]) }), null)).toEqual({ kind: 'enter', label: 'Inscrever time · Grátis', teams: [one, second] })
  })

  it('tênis e corrida: "Inscrever-se · R$ …" ou "Grátis"', () => {
    const solo = { ...eligibility([], { tier: 'prata' }), teams: null }
    expect(entryCta(eventDetail({ sport: 'tenis', eligibility: solo }), null)).toEqual({ kind: 'enter', label: `Inscrever-se · ${price(24000)}`, teams: [] })
    expect(entryCta(eventDetail({ sport: 'corrida', price_cents: 0, eligibility: solo }), null)).toEqual({ kind: 'enter', label: 'Inscrever-se · Grátis', teams: [] })
  })

  it('quem já ocupa vaga não vê o botão, a não ser no futebol com outro time elegível; inscrição encerrada ou expirada permite de novo', () => {
    expect(entryCta(eventDetail({ sport: 'tenis', eligibility: eligibility([]) }), myEntry({ state: 'confirmada', can_send_receipt: false }))).toBeNull()
    expect(entryCta(eventDetail({ eligibility: eligibility() }), myEntry({ state: 'confirmada', can_send_receipt: false }))?.kind).toBe('enter')
    expect(entryCta(eventDetail({ eligibility: eligibility([{ ...one, entry_id: 9 }]) }), myEntry({ state: 'confirmada', can_send_receipt: false }))).toBeNull()
    expect(entryCta(eventDetail({ eligibility: eligibility() }), myEntry({ state: 'expirada', can_send_receipt: false }))?.kind).toBe('enter')
    expect(entryCta(eventDetail({ eligibility: eligibility() }), myEntry({ state: 'cancelada', can_send_receipt: false }))?.kind).toBe('enter')
  })

  it('só o evento publicado aceita inscrição; suspensa, encerrada e esgotada ficam desabilitadas com o motivo', () => {
    expect(entryCta(eventDetail({ state: 'em_andamento' }), null)).toBeNull()
    expect(entryCta(eventDetail({ state: 'cancelado' }), null)).toBeNull()
    expect(entryCta(eventDetail({ revocation_pending: true }), null)).toEqual({ kind: 'blocked', label: 'Inscrições suspensas' })
    expect(entryCta(eventDetail({ registration_open: false }), null)).toEqual({ kind: 'blocked', label: 'Inscrições encerradas' })
    expect(entryCta(eventDetail({ spots_left: 0 }), null)).toEqual({ kind: 'blocked', label: 'Vagas esgotadas' })
  })

  it('futebol sem time leva a Meus times; fora da faixa fica bloqueado com cadeado; sem motivo, nada', () => {
    expect(entryCta(eventDetail({ eligibility: eligibility([], { eligible: false, reason: 'sem_time' }) }), null)).toEqual({ kind: 'teams', label: 'Crie ou represente um time' })
    expect(entryCta(eventDetail({ eligibility: eligibility([], { eligible: false, reason: 'fora_da_faixa' }) }), null)).toEqual({ kind: 'blocked', label: 'Fora da faixa do evento', locked: true })
    expect(entryCta(eventDetail({ eligibility: eligibility([], { eligible: false, reason: 'em_classificacao' }) }), null)).toEqual({ kind: 'blocked', label: 'Fora da faixa do evento', locked: true })
    expect(entryCta(eventDetail({ eligibility: eligibility([], { eligible: false, reason: null }) }), null)).toBeNull()
  })

  it('só os times representados, elegíveis e sem inscrição podem se inscrever', () => {
    expect(enterableTeams({ eligibility: eligibility([one, { ...second, eligible: false, reason: 'fora_da_faixa' }, { ...second, team: { ...second.team, id: 5 }, entry_id: 12 }]) })).toEqual([one])
    expect(enterableTeams({ eligibility: { ...eligibility(), teams: null } })).toEqual([])
  })
})

describe('isLocked: cartaz apagado com cadeado', () => {
  it('fora da faixa ou em classificação em evento restrito, sem inscrição que ocupa vaga', () => {
    const out = (extra: Partial<ReturnType<typeof eventCard>> = {}) => eventCard(5, { eligibility: eligibility([], { eligible: false, reason: 'fora_da_faixa' }), ...extra })
    expect(isLocked(out())).toBe(true)
    expect(isLocked(eventCard(5, { eligibility: eligibility([], { eligible: false, reason: 'em_classificacao' }) }))).toBe(true)
    expect(isLocked(eventCard(5, { eligibility: eligibility([], { eligible: false, reason: 'sem_time' }) }))).toBe(false)
    expect(isLocked(eventCard(5))).toBe(false)
    expect(isLocked(out({ my_entry: { id: 1, state: 'confirmada', team, reserved_until: null } }))).toBe(false)
    expect(isLocked(out({ my_entry: { id: 1, state: 'expirada', team, reserved_until: null } }))).toBe(true)
  })
})

describe('textos do evento', () => {
  it('motivo da recusa dentro de uma frase', () => {
    expect(refusalText({ reason_code: 'valor_diferente', reason_detail: 'faltaram R$ 40.' })).toBe('Valor diferente: faltaram R$ 40')
    expect(refusalText({ reason_code: 'outro', reason_detail: 'Imagem cortada' })).toBe('Imagem cortada')
    expect(refusalText(null)).toBe('motivo não informado')
  })

  it('prazo da reserva: 48 h depois ou 12 h antes do início, o que vier primeiro', () => {
    const now = Date.parse('2026-10-12T12:00:00Z')
    expect(reservationDeadline('2026-10-30T12:00:00Z', now)).toBe('2026-10-14T12:00:00.000Z')
    expect(reservationDeadline('2026-10-13T12:00:00Z', now)).toBe('2026-10-13T00:00:00.000Z')
    expect(reservationDeadline(null, now)).toBeNull()
    expect(reservationDeadline('data inválida', now)).toBeNull()
  })

  it('elos aceitos em ordem de progressão e o local completo', () => {
    expect(tiersText(['ouro', 'prata'])).toBe('Prata e Ouro')
    expect(tiersText(['ouro', 'bronze', 'prata'])).toBe('Bronze, Prata e Ouro')
    expect(tiersText(['ouro'])).toBe('Ouro')
    expect(tiersText([])).toBe('')
    expect(placeText({ venue: 'Arena Guará', city: { id: 1, name: 'Brasília', state: 'DF' } })).toBe('Arena Guará · Brasília/DF')
    expect(placeText({ venue: null, city: { id: 1, name: 'Brasília', state: 'DF' } })).toBe('Brasília/DF')
    expect(placeText({ venue: null, city: null })).toBe('')
  })
})

describe('arquivo do comprovante', () => {
  it('o tipo vem da extensão quando o seletor não informa', () => {
    expect(typeFromName('pix.PDF')).toBe('application/pdf')
    expect(typeFromName('foto.jpeg')).toBe('image/jpeg')
    expect(typeFromName('foto.jpg')).toBe('image/jpeg')
    expect(typeFromName('print.png')).toBe('image/png')
    expect(typeFromName('print.webp')).toBe('image/webp')
    expect(typeFromName('planilha.xlsx')).toBe('')
    expect(typeFromName('semextensao')).toBe('')
    expect(typeFromName(null)).toBe('')
  })

  it('monta o arquivo do envio com nome, tipo e tamanho', () => {
    expect(toUploadFile({ uri: 'file:///a.pdf', name: ' a.pdf ', mimeType: 'Application/PDF', size: 10 })).toEqual({ uri: 'file:///a.pdf', name: 'a.pdf', type: 'application/pdf', size: 10 })
    expect(toUploadFile({ uri: 'file:///b.jpg', name: 'b.jpg' })).toEqual({ uri: 'file:///b.jpg', name: 'b.jpg', type: 'image/jpeg', size: null })
    expect(toUploadFile({ uri: 'file:///c', name: null, mimeType: null, size: undefined })).toEqual({ uri: 'file:///c', name: 'comprovante', type: '', size: null })
  })
})
