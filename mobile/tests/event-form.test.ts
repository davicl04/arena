import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/api/client'
import {
  apiFormErrors, capacityError, CHECKLIST_STEP, closeDateMax, closesAt, draftInput, emptyForm, FIELD_STEP, firstErrorField, firstIncompleteStep,
  formFromDetail, LAST_STEP, parseCapacity, parsePrice, pixKeyError, priceText, startsAt, validateAll, validateDraft, validateStep, withCategory,
  WIZARD_STEPS,
} from '../src/components/organizer/eventForm'
import type { EventForm } from '../src/components/organizer/eventForm'
import { cancelledOnCancel, entriesTitle, entrantsUnit, eventRefusalText, posterProps, refundsOnCancel } from '../src/components/organizer/eventView'
import { card, detail, draftDetail } from './support/organizer'

vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))

/** Instante fixo dos testes: 12 de outubro de 2026, 10:00 (fuso local). */
const NOW = new Date(2026, 9, 12, 10, 0)
const complete = (over: Partial<EventForm> = {}): EventForm => ({
  ...emptyForm(), name: 'Copa Sudoeste', sport: 'futebol', format: 'society', competitionType: 'todos_contra_todos', capacity: '8',
  startDate: '2026-11-15', startTime: '09:00', closeDate: '2026-11-10', closeTime: '', cityId: 7, venue: 'Arena Sudoeste', paid: false, ...over,
})
const paidForm = (over: Partial<EventForm> = {}): EventForm => complete({
  paid: true, price: '240', pixBeneficiary: 'Liga Candanga', pixKeyType: 'email', pixKey: 'pix@liga.com', ...over,
})

describe('assistente Criar evento: passos e conversões', () => {
  it('tem cinco passos, uma pergunta por vez, e cada campo pertence a um passo', () => {
    expect(WIZARD_STEPS.map(step => step.question)).toEqual([
      'Qual é o nome do evento?', 'Qual modalidade?', 'Quantas vagas e quem pode entrar?', 'Quando e onde?', 'A inscrição é paga?',
    ])
    expect(LAST_STEP).toBe(4)
    expect(FIELD_STEP.name).toBe(0)
    expect(FIELD_STEP.competitionType).toBe(1)
    expect(FIELD_STEP.tiers).toBe(2)
    expect(FIELD_STEP.closeDate).toBe(3)
    expect(FIELD_STEP.pixKey).toBe(4)
    expect(CHECKLIST_STEP).toEqual({ nome_modalidade: 0, formato_tipo: 1, vagas_elos: 2, datas: 3, local: 3, inscricao: 4 })
  })

  it('lê o valor em reais em vários formatos e escreve de volta', () => {
    expect(parsePrice('240')).toBe(24000)
    expect(parsePrice('R$ 240,5')).toBe(24050)
    expect(parsePrice('1.234,56')).toBe(123456)
    expect(parsePrice('240.50')).toBe(24050)
    expect(parsePrice('1.234')).toBe(123400)
    expect(parsePrice('')).toBeNull()
    expect(parsePrice('abc')).toBeNull()
    expect(parsePrice('1,234')).toBeNull()
    expect(priceText(24000)).toBe('240')
    expect(priceText(24050)).toBe('240,50')
    expect(parseCapacity(' 8 ')).toBe(8)
    expect(parseCapacity('8,5')).toBeNull()
    expect(parseCapacity('')).toBeNull()
  })

  it('troca de modalidade ou tipo limpa o que não se aplica', () => {
    const futebol = complete({ courseNotes: 'x' })
    const tenis = withCategory(futebol, { sport: 'tenis' })
    expect(tenis).toMatchObject({ sport: 'tenis', format: null, courseNotes: '', competitionType: 'todos_contra_todos' })
    const corrida = withCategory(complete({ competitionType: 'eliminacao_simples', capacity: '8' }), { sport: 'corrida', distanceKm: 10 })
    expect(corrida).toMatchObject({ sport: 'corrida', competitionType: null, distanceKm: 10, format: null })
    expect(withCategory(corrida, { sport: 'futebol' }).distanceKm).toBeNull()
    expect(withCategory(complete({ capacity: '6' }), { competitionType: 'eliminacao_simples' }).capacity).toBe('')
    expect(withCategory(complete({ capacity: '8' }), { competitionType: 'eliminacao_simples' }).capacity).toBe('8')
  })

  it('monta o corpo do rascunho: gratuito sem Pix, pago com Pix, elos na ordem do ranking', () => {
    const free = draftInput(complete({ pixKey: 'sobra@x.com', contact: ' copa@example.com ' }))
    expect(free).toMatchObject({
      name: 'Copa Sudoeste', sport: 'futebol', format: 'society', distance_km: null, competition_type: 'todos_contra_todos', capacity: 8, accepted_tiers: null,
      city_id: 7, venue: 'Arena Sudoeste', course_notes: null, price_cents: 0, pix_beneficiary: null, pix_key_type: null, pix_key: null, contact: 'copa@example.com',
    })
    expect(free.starts_at).toBe(new Date(2026, 10, 15, 9, 0).toISOString())
    expect(free.registration_closes_at).toBe(new Date(2026, 10, 10, 23, 59).toISOString())
    const paid = draftInput(paidForm({ restricted: true, tiers: ['ouro', 'bronze'], pixCopyPaste: ' 000201 ', pixInstructions: '' }))
    expect(paid).toMatchObject({ price_cents: 24000, pix_beneficiary: 'Liga Candanga', pix_key_type: 'email', pix_key: 'pix@liga.com', pix_copy_paste: '000201', pix_instructions: null, accepted_tiers: ['bronze', 'ouro'] })
    const run = draftInput(complete({ sport: 'corrida', format: null, distanceKm: 10, competitionType: null, courseNotes: ' Largada na praça ' }))
    expect(run).toMatchObject({ sport: 'corrida', distance_km: 10, competition_type: null, course_notes: 'Largada na praça' })
    expect(draftInput(emptyForm())).toMatchObject({ name: '', sport: null, price_cents: null, starts_at: null, registration_closes_at: null, accepted_tiers: null })
    expect(startsAt(complete({ startTime: '' }))).toBeNull()
    expect(closesAt(complete({ closeDate: '' }))).toBeNull()
  })

  it('preenche o formulário a partir do rascunho da API', () => {
    const form = formFromDetail(draftDetail({
      price_cents: 24050, accepted_tiers: ['prata'], pix: { beneficiary: 'Liga', key_type: 'cpf', key: '12345678909', copy_paste: 'cola', instructions: 'Envie' },
      starts_at: new Date(2026, 10, 15, 9, 0).toISOString(), registration_closes_at: new Date(2026, 10, 10, 18, 30).toISOString(),
    }))
    expect(form).toMatchObject({
      name: 'Copa Sudoeste', sport: 'futebol', capacity: '8', restricted: true, tiers: ['prata'], startDate: '2026-11-15', startTime: '09:00', closeDate: '2026-11-10', closeTime: '18:30',
      cityId: 7, paid: true, price: '240,50', pixBeneficiary: 'Liga', pixKeyType: 'cpf', pixKey: '12345678909', pixCopyPaste: 'cola', pixInstructions: 'Envie',
    })
    const bare = formFromDetail(draftDetail({ capacity: null, accepted_tiers: null, starts_at: null, registration_closes_at: null, city: null, venue: null, price_cents: null, pix: null, contact: null, course_notes: null }))
    expect(bare).toMatchObject({ capacity: '', restricted: false, startDate: '', closeDate: '', cityId: null, venue: '', paid: null, price: '', pixKey: '', contact: '' })
    expect(formFromDetail(draftDetail({ price_cents: 0 })).paid).toBe(false)
  })
})

describe('validação por passo (as regras do servidor)', () => {
  it('passo 1: o nome tem de 3 a 60 caracteres', () => {
    expect(validateStep(emptyForm(), 0, NOW).name).toMatch(/3 a 60/)
    expect(validateStep({ ...emptyForm(), name: ' ab ' }, 0, NOW).name).toBeDefined()
    expect(validateStep({ ...emptyForm(), name: 'x'.repeat(61) }, 0, NOW).name).toBeDefined()
    expect(validateStep({ ...emptyForm(), name: 'Copa' }, 0, NOW)).toEqual({})
  })

  it('passo 2: modalidade, formato, tipo e distância conforme a modalidade', () => {
    expect(validateStep(emptyForm(), 1, NOW)).toEqual({ sport: 'Escolha a modalidade.' })
    expect(validateStep({ ...emptyForm(), sport: 'futebol' }, 1, NOW)).toEqual({ format: 'Escolha o formato.', competitionType: 'Escolha o tipo.' })
    expect(validateStep({ ...emptyForm(), sport: 'tenis' }, 1, NOW)).toEqual({ competitionType: 'Escolha o tipo.' })
    expect(validateStep({ ...emptyForm(), sport: 'corrida' }, 1, NOW)).toEqual({ distanceKm: 'Escolha a distância.' })
    expect(validateStep(complete(), 1, NOW)).toEqual({})
  })

  it('passo 3: vagas por modalidade e tipo; elos pedem ao menos um', () => {
    expect(capacityError(complete({ capacity: '' }))).toBe('Informe as vagas.')
    expect(capacityError(complete({ capacity: '2' }))).toMatch(/3 a 20/)
    expect(capacityError(complete({ capacity: '21' }))).toMatch(/3 a 20/)
    expect(capacityError(complete({ capacity: '3' }))).toBeNull()
    expect(capacityError(complete({ competitionType: 'eliminacao_simples', capacity: '6' }))).toBe('Na eliminação simples, as vagas são 4, 8 ou 16.')
    expect(capacityError(complete({ competitionType: 'eliminacao_simples', capacity: '16' }))).toBeNull()
    expect(capacityError(complete({ sport: 'corrida', competitionType: null, capacity: '1' }))).toMatch(/2 a 5000/)
    expect(capacityError(complete({ sport: 'corrida', competitionType: null, capacity: '300' }))).toBeNull()
    expect(capacityError(complete({ competitionType: null }))).toBe('Escolha o tipo antes das vagas.')
    expect(validateStep(complete({ restricted: true }), 2, NOW).tiers).toMatch(/ao menos um elo/)
    expect(validateStep(complete({ restricted: true, tiers: ['ouro'] }), 2, NOW)).toEqual({})
  })

  it('passo 4: datas no futuro, fim das inscrições antes do início, cidade e local', () => {
    expect(validateStep(complete(), 3, NOW)).toEqual({})
    const none = validateStep(complete({ startDate: '', closeDate: '', cityId: null, venue: '' }), 3, NOW)
    expect(Object.keys(none).sort()).toEqual(['cityId', 'closeDate', 'startDate', 'venue'])
    expect(validateStep(complete({ startTime: '' }), 3, NOW).startTime).toBe('Informe a hora do início.')
    expect(validateStep(complete({ startDate: '2026-10-11' }), 3, NOW).startDate).toBe('A data do evento já passou.')
    expect(validateStep(complete({ startDate: '2026-10-12', startTime: '21:00', closeDate: '2026-10-12', paid: true }), 3, NOW).startDate).toMatch(/12 h antes/)
    expect(validateStep(complete({ closeDate: '2026-11-16' }), 3, NOW).closeDate).toBe('As inscrições precisam fechar antes do início do evento.')
    expect(validateStep(complete({ closeDate: '2026-10-11', startDate: '2026-11-15' }), 3, NOW).closeDate).toBe('O fim das inscrições já passou.')
    expect(validateStep(complete({ venue: 'A' }), 3, NOW).venue).toMatch(/2 a 120/)
    expect(validateStep(complete({ courseNotes: 'x'.repeat(501) }), 3, NOW).courseNotes).toMatch(/500/)
    expect(closeDateMax(complete())).toBe('2026-11-15')
    expect(closeDateMax(complete({ startDate: '' }))).toBeUndefined()
  })

  it('passo 5: pago exige valor, favorecido e chave Pix válida do tipo escolhido', () => {
    expect(validateStep(complete({ paid: null }), 4, NOW)).toEqual({ paid: 'Escolha se a inscrição é gratuita ou paga.' })
    expect(validateStep(complete({ paid: false }), 4, NOW)).toEqual({})
    expect(validateStep(paidForm(), 4, NOW)).toEqual({})
    const empty = validateStep(complete({ paid: true }), 4, NOW)
    expect(Object.keys(empty).sort()).toEqual(['pixBeneficiary', 'pixKeyType', 'price'])
    expect(validateStep(paidForm({ price: '0,50' }), 4, NOW).price).toBe('O valor vai de R$ 1,00 a R$ 10.000,00.')
    expect(validateStep(paidForm({ price: '10001' }), 4, NOW).price).toBeDefined()
    expect(validateStep(paidForm({ pixKey: 'sem-arroba' }), 4, NOW).pixKey).toBe('Informe um e-mail válido.')
    expect(validateStep(paidForm({ pixCopyPaste: 'x'.repeat(1001), pixInstructions: 'x'.repeat(501), contact: 'x'.repeat(121) }), 4, NOW))
      .toMatchObject({ pixCopyPaste: expect.any(String), pixInstructions: expect.any(String), contact: expect.any(String) })
  })

  it('valida cada tipo de chave Pix com as mensagens do servidor', () => {
    expect(pixKeyError('cpf', '529.982.247-25')).toBeNull()
    expect(pixKeyError('cpf', '111.111.111-11')).toBe('Informe um CPF válido.')
    expect(pixKeyError('cpf', '529.982.247-24')).toBe('Informe um CPF válido.')
    expect(pixKeyError('email', 'Pix@Liga.com')).toBeNull()
    expect(pixKeyError('email', `${'a'.repeat(80)}@x.com`)).toBe('Informe um e-mail válido.')
    expect(pixKeyError('telefone', '(61) 98888-7777')).toBeNull()
    expect(pixKeyError('telefone', '+55 61 98888-7777')).toBeNull()
    expect(pixKeyError('telefone', '+1 202 555 0100')).toBe('Use um telefone do Brasil, com DDD.')
    expect(pixKeyError('telefone', '98888-7777')).toBe('Informe o telefone com DDD.')
    expect(pixKeyError('aleatoria', '123e4567-e89b-12d3-a456-426614174000')).toBeNull()
    expect(pixKeyError('aleatoria', 'abc')).toMatch(/chave aleatória completa/)
    expect(pixKeyError(null, 'qualquer')).toBe('Escolha o tipo de chave Pix.')
  })

  it('validateAll acha o primeiro passo incompleto; o rascunho só exige o que se perderia', () => {
    expect(validateAll(complete(), NOW)).toBeNull()
    expect(validateAll(complete({ capacity: '' }), NOW)).toMatchObject({ step: 2 })
    expect(validateAll(emptyForm(), NOW)?.step).toBe(0)
    expect(firstIncompleteStep(complete({ venue: '' }), NOW)).toBe(3)
    expect(firstIncompleteStep(complete(), NOW)).toBe(LAST_STEP)
    expect(validateDraft(emptyForm())).toEqual({ name: expect.any(String) })
    expect(validateDraft({ ...emptyForm(), name: 'Copa' })).toEqual({})
    expect(validateDraft({ ...emptyForm(), name: 'Copa', capacity: '8,5', startDate: '2026-11-15', paid: true, price: 'abc' }))
      .toMatchObject({ capacity: 'Informe as vagas em número inteiro.', startTime: 'Informe a hora do início para guardar a data.', price: expect.stringContaining('Informe o valor') })
    expect(firstErrorField({ pixKey: 'x', name: 'y' })).toBe('name')
    expect(firstErrorField({})).toBeNull()
  })
})

describe('erros da API levados ao passo e ao campo certos', () => {
  const form = complete()
  const invalid = (...fields: { field: string; message: string }[]) => new ApiError('Revise os campos informados.', 422, fields)

  it('mapeia os campos do 422, tira o prefixo do Pydantic e aponta o passo do primeiro', () => {
    const mapped = apiFormErrors(invalid({ field: 'pix_key', message: 'Value error, Informe um CPF válido.' }, { field: 'name', message: 'Value error, Escolha outro nome.' }), form, 'Falhou')
    expect(mapped).toEqual({ errors: { pixKey: 'Informe um CPF válido.', name: 'Escolha outro nome.' }, step: 0, general: '' })
    expect(apiFormErrors(invalid({ field: 'starts_at', message: 'Data inválida.' }), form, 'x')).toMatchObject({ errors: { startDate: 'Data inválida.' }, step: 3 })
    expect(apiFormErrors(invalid({ field: 'accepted_tiers.0', message: 'Elo inválido.' }), form, 'x')).toMatchObject({ errors: { tiers: 'Elo inválido.' }, step: 2 })
  })

  it('leva os itens do checklist (resposta do envio) ao campo certo do formulário', () => {
    const at = (key: string, message: string, over: Partial<EventForm> = {}) => apiFormErrors(invalid({ field: key, message }), { ...form, ...over }, 'x')
    expect(at('nome_modalidade', 'Informe o nome.', { name: '' })).toMatchObject({ errors: { name: 'Informe o nome.' }, step: 0 })
    expect(at('nome_modalidade', 'Escolha a modalidade.', { sport: null })).toMatchObject({ errors: { sport: 'Escolha a modalidade.' }, step: 1 })
    expect(at('formato_tipo', 'Escolha o formato.', { format: null })).toMatchObject({ errors: { format: expect.any(String) }, step: 1 })
    expect(at('formato_tipo', 'Escolha o tipo.')).toMatchObject({ errors: { competitionType: expect.any(String) } })
    expect(at('formato_tipo', 'Escolha a distância.', { sport: 'corrida' })).toMatchObject({ errors: { distanceKm: expect.any(String) } })
    expect(at('formato_tipo', 'Escolha a modalidade.', { sport: null })).toMatchObject({ errors: { sport: expect.any(String) } })
    expect(at('vagas_elos', 'Escolha ao menos um elo.')).toMatchObject({ errors: { tiers: expect.any(String) }, step: 2 })
    expect(at('vagas_elos', 'Informe as vagas.')).toMatchObject({ errors: { capacity: expect.any(String) } })
    expect(at('datas', 'Escolha a data.', { startDate: '' })).toMatchObject({ errors: { startDate: expect.any(String) }, step: 3 })
    expect(at('datas', 'Escolha o fim.', { closeDate: '' })).toMatchObject({ errors: { closeDate: expect.any(String) } })
    expect(at('datas', 'As inscrições precisam fechar antes do início.')).toMatchObject({ errors: { closeDate: expect.any(String) } })
    expect(at('datas', 'A data já passou.')).toMatchObject({ errors: { startDate: expect.any(String) } })
    expect(at('local', 'Escolha a cidade.', { cityId: null })).toMatchObject({ errors: { cityId: expect.any(String) } })
    expect(at('local', 'Informe o local.')).toMatchObject({ errors: { venue: expect.any(String) } })
    expect(at('inscricao', 'Escolha gratuita ou paga.', { paid: null })).toMatchObject({ errors: { paid: expect.any(String) }, step: 4 })
    expect(at('inscricao', 'Informe o valor.', { paid: true })).toMatchObject({ errors: { price: expect.any(String) } })
    expect(at('inscricao', 'Informe o favorecido.', { paid: true, pixBeneficiary: '' })).toMatchObject({ errors: { pixBeneficiary: expect.any(String) } })
    expect(at('inscricao', 'Informe o favorecido.', { paid: true, pixBeneficiary: 'Liga' })).toMatchObject({ errors: { pixKeyType: expect.any(String) } })
    expect(at('inscricao', 'Chave inválida.', { paid: true })).toMatchObject({ errors: { pixKey: expect.any(String) } })
  })

  it('erros sem campo viram mensagem geral; os de detalhe que citam um campo vão para ele', () => {
    expect(apiFormErrors(new ApiError('Depois de publicado, só local pode mudar.', 409), form, 'x')).toEqual({ errors: {}, step: null, general: 'Depois de publicado, só local pode mudar.' })
    expect(apiFormErrors(new Error(''), form, 'Não foi possível salvar.')).toEqual({ errors: {}, step: null, general: 'Não foi possível salvar.' })
    expect(apiFormErrors('falha', form, 'Não foi possível salvar.').general).toBe('Não foi possível salvar.')
    expect(apiFormErrors(new ApiError('As inscrições precisam fechar antes do início do evento.', 422), form, 'x')).toMatchObject({ errors: { closeDate: expect.any(String) }, step: 3 })
    expect(apiFormErrors(new ApiError('Selecione uma cidade do catálogo.', 422), form, 'x')).toMatchObject({ errors: { cityId: expect.any(String) }, step: 3 })
    expect(apiFormErrors(new ApiError('Algo deu errado.', 422), form, 'x')).toEqual({ errors: {}, step: null, general: 'Algo deu errado.' })
    expect(apiFormErrors(invalid({ field: 'campo_desconhecido', message: 'Ruim.' }), form, 'x')).toEqual({ errors: {}, step: null, general: 'Revise os campos informados.' })
  })
})

describe('ponte entre a API e os componentes (eventView)', () => {
  it('monta as props do cartaz: sem barra de inscrições antes de publicar e no cancelado', () => {
    expect(posterProps(card())).toMatchObject({ name: 'Copa Sudoeste', sport: 'futebol', entries: { count: 3, capacity: 8 }, state: 'publicado', phase: 'inscricoes_abertas', stateLabel: undefined })
    expect(posterProps(card({ state: 'rascunho', phase: 'rascunho' })).entries).toBeNull()
    expect(posterProps(card({ state: 'cancelado', phase: 'cancelado' })).entries).toBeNull()
    expect(posterProps(card({ capacity: null })).entries).toBeNull()
    expect(posterProps(card({ revocation_pending: true })).stateLabel).toBe('Inscrições suspensas')
  })

  it('nomes por modalidade e textos de recusa e cancelamento', () => {
    expect(entriesTitle('futebol')).toBe('Times inscritos')
    expect(entriesTitle('corrida')).toBe('Inscritos')
    expect(entriesTitle(null)).toBe('Inscritos')
    expect(entrantsUnit('tenis')).toBe('atletas')
    expect(entrantsUnit(null)).toBe('vagas')
    expect(eventRefusalText('pix_incompleto', null)).toBe('Dados do Pix incompletos')
    expect(eventRefusalText('preco_ou_datas', 'Data antiga')).toBe('Preço ou datas inconsistentes · Data antiga')
    expect(eventRefusalText('outro', ' Sem local ')).toBe('Sem local')
    expect(eventRefusalText('x' as never, null)).toBe('Motivo não informado')
    const paid = detail({ price_cents: 5000, entries_by_state: { confirmada: 2, em_analise: 1, reservada: 3, rejeitada: 1 } })
    expect(refundsOnCancel(paid)).toBe(3)
    expect(cancelledOnCancel(paid)).toBe(4)
    const free = detail({ price_cents: 0, entries_by_state: { confirmada: 2, em_analise: 1, reservada: 3 } })
    expect(refundsOnCancel(free)).toBe(0)
    expect(cancelledOnCancel(free)).toBe(6)
  })
})
