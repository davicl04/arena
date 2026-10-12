import { describe, expect, it } from 'vitest'
import { ApiError } from '../src/api/client'
import { fieldMessage } from '../src/api/events'
import {
  apiFormErrors, capacityError, draftInput, emptyForm, firstIncompleteStep, formFromDetail, parsePrice, pixKeyError, priceText,
  validateAll, validateDraft, validateStep, withCategory,
} from '../src/components/organizer/eventForm'
import type { EventForm } from '../src/components/organizer/eventForm'
import { toDateKey } from '../src/utils/dateKey'
import { brasilia, draftDetail, eventDetail, inDays } from './events-fixtures'

const now = new Date()
const dayKey = (days: number) => { const date = new Date(); date.setDate(date.getDate() + days); return toDateKey(date) }

/** Formulário completo de um evento gratuito de tênis, daqui a 20 dias. */
function complete(overrides: Partial<EventForm> = {}): EventForm {
  return {
    ...emptyForm(), name: 'Desafio Saibro', sport: 'tenis', competitionType: 'todos_contra_todos', capacity: '8',
    startDate: dayKey(20), startTime: '09:00', closeDate: dayKey(18), closeTime: '', cityId: brasilia.id, venue: 'Clube do Saibro', paid: false,
    ...overrides,
  }
}

describe('valor e vagas', () => {
  it.each([['240', 24000], ['240,5', 24050], ['1.234,56', 123456], ['240.50', 24050], ['R$ 60', 6000], ['', null], ['12a', null], ['1,234', null]])(
    'lê "%s" como %s centavos', (text, cents) => { expect(parsePrice(text)).toBe(cents) })
  it('mostra os centavos no campo', () => {
    expect(priceText(24000)).toBe('240')
    expect(priceText(24050)).toBe('240,50')
  })
  it('valida as vagas conforme a modalidade e o tipo', () => {
    expect(capacityError(complete({ capacity: '' }))).toBe('Informe as vagas.')
    expect(capacityError(complete({ capacity: '25' }))).toBe('No todos contra todos, as vagas vão de 3 a 20.')
    expect(capacityError(complete({ competitionType: 'eliminacao_simples', capacity: '6' }))).toBe('Na eliminação simples, as vagas são 4, 8 ou 16.')
    expect(capacityError(complete({ sport: 'corrida', competitionType: null, capacity: '1' }))).toBe('Na corrida, as vagas vão de 2 a 5000.')
    expect(capacityError(complete({ competitionType: null }))).toBe('Escolha o tipo antes das vagas.')
    expect(capacityError(complete({ competitionType: 'eliminacao_simples', capacity: '16' }))).toBeNull()
  })
})

describe('chave Pix (mesmas regras do servidor)', () => {
  it.each([
    ['cpf', '529.982.247-25', null], ['cpf', '111.111.111-11', 'Informe um CPF válido.'],
    ['email', 'Liga@Example.com', null], ['email', 'liga@', 'Informe um e-mail válido.'],
    ['telefone', '(61) 98888-1234', null], ['telefone', '+1 202 555 0100', 'Use um telefone do Brasil, com DDD.'], ['telefone', '0800', 'Informe o telefone com DDD.'],
    ['aleatoria', '123E4567-E89B-12D3-A456-426614174000', null], ['aleatoria', 'abc', 'Copie a chave aleatória completa, como aparece no app do banco.'],
    [null, 'x', 'Escolha o tipo de chave Pix.'],
  ] as const)('%s "%s" → %s', (type, key, error) => { expect(pixKeyError(type, key)).toBe(error) })
})

describe('troca de categoria', () => {
  it('limpa o que não se aplica à modalidade e as vagas que a eliminação não aceita', () => {
    const football = withCategory(complete({ sport: 'futebol', format: 'society', capacity: '6' }), { competitionType: 'eliminacao_simples' })
    expect(football.capacity).toBe('')
    const race = withCategory(football, { sport: 'corrida' })
    expect(race).toMatchObject({ format: null, competitionType: null })
    const tennis = withCategory({ ...race, distanceKm: 10, courseNotes: 'Orla' }, { sport: 'tenis' })
    expect(tennis).toMatchObject({ distanceKm: null, courseNotes: '' })
  })
})

describe('corpo do rascunho', () => {
  it('envia nulos no que não se aplica, 23:59 sem hora de fechamento e os elos na ordem', () => {
    const body = draftInput(complete({ restricted: true, tiers: ['ouro', 'bronze'], format: 'campo', contact: '  ' }))
    expect(body).toMatchObject({ name: 'Desafio Saibro', sport: 'tenis', format: null, distance_km: null, competition_type: 'todos_contra_todos',
      capacity: 8, accepted_tiers: ['bronze', 'ouro'], city_id: brasilia.id, price_cents: 0, pix_key: null, contact: null })
    expect(new Date(body.registration_closes_at!).getHours()).toBe(23)
    expect(new Date(body.registration_closes_at!).getMinutes()).toBe(59)
    expect(draftInput(emptyForm())).toMatchObject({ price_cents: null, starts_at: null, accepted_tiers: null, capacity: null })
  })
  it('leva o Pix só no pago', () => {
    const body = draftInput(complete({ paid: true, price: '60', pixBeneficiary: ' Rafa ', pixKeyType: 'email', pixKey: 'r@x.com', pixCopyPaste: '', pixInstructions: 'Até 48 h' }))
    expect(body).toMatchObject({ price_cents: 6000, pix_beneficiary: 'Rafa', pix_key_type: 'email', pix_key: 'r@x.com', pix_copy_paste: null, pix_instructions: 'Até 48 h' })
  })
  it('lê o rascunho da API de volta para o formulário', () => {
    const form = formFromDetail(eventDetail({ starts_at: inDays(10, 16), registration_closes_at: inDays(8, 20) }))
    expect(form).toMatchObject({ sport: 'futebol', format: 'society', competitionType: 'eliminacao_simples', capacity: '8', restricted: true,
      tiers: ['prata', 'ouro'], startTime: '16:00', closeTime: '20:00', cityId: brasilia.id, paid: true, price: '240', pixKeyType: 'email' })
    expect(formFromDetail(draftDetail())).toMatchObject({ paid: null, price: '', restricted: false, startDate: '', cityId: null })
  })
})

describe('validações por passo', () => {
  it('exige o nome com 3 a 60 caracteres', () => {
    expect(validateStep(complete({ name: 'Oi' }), 0, now).name).toMatch(/3 a 60/)
    expect(validateStep(complete(), 0, now)).toEqual({})
  })
  it('exige formato e tipo no futebol, tipo no tênis e distância na corrida', () => {
    expect(validateStep({ ...emptyForm() }, 1, now)).toEqual({ sport: 'Escolha a modalidade.' })
    expect(validateStep(complete({ sport: 'futebol', competitionType: null }), 1, now)).toEqual({ format: 'Escolha o formato.', competitionType: 'Escolha o tipo.' })
    expect(validateStep(complete({ competitionType: null }), 1, now)).toEqual({ competitionType: 'Escolha o tipo.' })
    expect(validateStep(complete({ sport: 'corrida', competitionType: null }), 1, now)).toEqual({ distanceKm: 'Escolha a distância.' })
  })
  it('exige ao menos um elo quando restrito', () => {
    expect(validateStep(complete({ restricted: true, tiers: [] }), 2, now).tiers).toMatch(/ao menos um elo/)
  })
  it('valida datas, cidade e local', () => {
    expect(validateStep(complete({ startDate: '', closeDate: '', cityId: null, venue: 'x' }), 3, now)).toEqual({
      startDate: 'Escolha a data do evento.', closeDate: 'Escolha até quando vão as inscrições.', cityId: 'Escolha a cidade.', venue: 'Informe o local com 2 a 120 caracteres.',
    })
    expect(validateStep(complete({ startTime: '' }), 3, now).startTime).toBe('Informe a hora do início.')
    expect(validateStep(complete({ closeDate: dayKey(21) }), 3, now).closeDate).toBe('As inscrições precisam fechar antes do início do evento.')
    expect(validateStep(complete({ startDate: dayKey(-1), closeDate: dayKey(-2) }), 3, now)).toMatchObject({ startDate: 'A data do evento já passou.', closeDate: 'O fim das inscrições já passou.' })
    const soon = new Date(now.getTime() + 6 * 3_600_000)
    expect(validateStep(complete({ paid: true, startDate: toDateKey(soon), startTime: `${String(soon.getHours()).padStart(2, '0')}:00`, closeDate: dayKey(0) }), 3, now).startDate)
      .toMatch(/12 h antes do início/)
  })
  it('valida a inscrição paga e o Pix', () => {
    expect(validateStep(complete({ paid: null }), 4, now)).toEqual({ paid: 'Escolha se a inscrição é gratuita ou paga.' })
    expect(validateStep(complete({ paid: true, price: '0,50' }), 4, now)).toMatchObject({
      price: 'O valor vai de R$ 1,00 a R$ 10.000,00.', pixBeneficiary: 'Informe o favorecido com 2 a 80 caracteres.', pixKeyType: 'Escolha o tipo de chave Pix.',
    })
    expect(validateStep(complete({ paid: true, price: '60', pixBeneficiary: 'Rafa', pixKeyType: 'cpf', pixKey: '123' }), 4, now)).toEqual({ pixKey: 'Informe um CPF válido.' })
  })
  it('aponta o primeiro passo incompleto (para publicar e para abrir um rascunho)', () => {
    expect(validateAll(complete(), now)).toBeNull()
    expect(validateAll(complete({ cityId: null }), now)).toMatchObject({ step: 3, errors: { cityId: 'Escolha a cidade.' } })
    expect(firstIncompleteStep(complete({ capacity: '' }), now)).toBe(2)
    expect(firstIncompleteStep(complete(), now)).toBe(4)
  })
  it('para salvar o rascunho, exige só o nome e o que não daria para guardar', () => {
    expect(validateDraft(complete())).toEqual({})
    expect(validateDraft({ ...emptyForm(), name: 'Copa', capacity: 'oito', startDate: dayKey(3), paid: true, price: 'abc' })).toEqual({
      capacity: 'Informe as vagas em número inteiro.', startTime: 'Informe a hora do início para guardar a data.', price: 'Informe o valor em reais, como 240 ou 240,50.',
    })
  })
})

describe('erros da API no passo certo', () => {
  const form = complete({ paid: true, price: '60', pixBeneficiary: 'Rafa', pixKeyType: 'cpf', pixKey: '111' })
  it('campos do 422 (sem o prefixo do Pydantic)', () => {
    const error = new ApiError('Revise os campos informados.', 422, [{ field: 'pix_key', message: 'Value error, Informe um CPF válido.' }, { field: 'accepted_tiers.0', message: 'Escolha cada elo uma vez.' }])
    expect(apiFormErrors(error, form, 'x')).toEqual({ step: 2, general: '', errors: { pixKey: 'Informe um CPF válido.', tiers: 'Escolha cada elo uma vez.' } })
    expect(fieldMessage('Value error, Algo.')).toBe('Algo.')
  })
  it('itens do checklist do envio', () => {
    const error = new ApiError('Complete o rascunho para publicar.', 422, [
      { field: 'datas', message: 'O fim das inscrições já passou.' }, { field: 'inscricao', message: 'Informe um CPF válido.' },
      { field: 'local', message: 'Informe a cidade e o local.' }, { field: 'vagas_elos', message: 'Escolha ao menos um elo ou deixe aberto a todos.' },
      { field: 'formato_tipo', message: 'Escolha o tipo.' }, { field: 'nome_modalidade', message: 'Informe o nome.' },
    ])
    expect(apiFormErrors(error, form, 'x')).toMatchObject({ step: 1, errors: {
      closeDate: 'O fim das inscrições já passou.', pixKey: 'Informe um CPF válido.', venue: 'Informe a cidade e o local.',
      tiers: 'Escolha ao menos um elo ou deixe aberto a todos.', competitionType: 'Escolha o tipo.', sport: 'Informe o nome.',
    } })
    const unpaid = new ApiError('Complete o rascunho para publicar.', 422, [{ field: 'inscricao', message: 'Escolha se a inscrição é gratuita ou paga.' }])
    expect(apiFormErrors(unpaid, complete({ paid: null }), 'x').errors).toEqual({ paid: 'Escolha se a inscrição é gratuita ou paga.' })
    const beneficiary = new ApiError('Complete o rascunho para publicar.', 422, [{ field: 'inscricao', message: 'Preencha o favorecido e o tipo de chave Pix.' }])
    expect(apiFormErrors(beneficiary, complete({ paid: true, pixBeneficiary: '' }), 'x').errors).toEqual({ pixBeneficiary: 'Preencha o favorecido e o tipo de chave Pix.' })
    const value = new ApiError('Complete o rascunho para publicar.', 422, [{ field: 'inscricao', message: 'O valor vai de R$ 1,00 a R$ 10.000,00.' }])
    expect(apiFormErrors(value, form, 'x').errors).toEqual({ price: 'O valor vai de R$ 1,00 a R$ 10.000,00.' })
  })
  it('422 só com a mensagem, conflito e falha de rede', () => {
    const dates = new ApiError('As inscrições precisam fechar antes do início do evento.', 422)
    expect(apiFormErrors(dates, form, 'x')).toMatchObject({ step: 3, errors: { closeDate: 'As inscrições precisam fechar antes do início do evento.' } })
    expect(apiFormErrors(new ApiError('Retire o evento da aprovação para editar.', 409), form, 'x')).toEqual({ step: null, errors: {}, general: 'Retire o evento da aprovação para editar.' })
    expect(apiFormErrors(new ApiError('Algo estranho.', 422), form, 'x')).toEqual({ step: null, errors: {}, general: 'Algo estranho.' })
    expect(apiFormErrors('falha', form, 'Não foi possível salvar.')).toEqual({ step: null, errors: {}, general: 'Não foi possível salvar.' })
  })
})
