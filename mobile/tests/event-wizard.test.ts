import React from 'react'
import { act } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/api/client'
import { dayLabel } from '../src/utils/calendar'
import EventWizardScreen from '../src/screens/EventWizardScreen'
import { byLabel, enableAct, press, textOf, type } from './support/native'
import { calls, checklistItems, city, detail, draftDetail, mount, navigationMock, otherCity, routeRequest } from './support/organizer'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))

const h = React.createElement
const EVENTS = '/organizer/events'
const EVENT = '/organizer/events/5'
const onExpired = vi.fn()
let navigation = navigationMock()

const wizard = (params?: { eventId?: number; step?: number }) => mount(h(EventWizardScreen, { navigation: navigation as never, onExpired, params, title: 'Novo evento' } as never))
const question = (tree: ReactTestRenderer) => tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'header' && String(node.props.children).endsWith('?'))
  .map(node => String(node.props.children))[0]
const pressDay = async (tree: ReactTestRenderer, year: number, month: number, day: number) => {
  const target = tree.root.findAllByType('Pressable' as never).find(entry => entry.props.accessibilityLabel === dayLabel(new Date(year, month, day)))
  expect(target, `dia ${day}/${month + 1}`).toBeTruthy()
  await act(async () => { target!.props.onPress() })
}
/** Escolhe um dia nos campos de data: abre a folha, vai para o mês e toca no dia. */
async function pickDate(tree: ReactTestRenderer, field: string, year: number, month: number, day: number) {
  await press(tree, `${field}: não escolhida`)
  const today = new Date()
  for (let n = (year - today.getFullYear()) * 12 + month - today.getMonth(); n > 0; n -= 1) await press(tree, 'Próximo mês')
  await pressDay(tree, year, month, day)
}
const next = (tree: ReactTestRenderer) => press(tree, 'Próxima')
const input = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType('TextInput' as never).find(entry => entry.props.accessibilityLabel === label)
const state = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType('Pressable' as never).find(entry => entry.props.accessibilityLabel === label)!.props.accessibilityState

/** Rascunho já completo (gratuito, sem Pix), que o assistente abre no último passo. */
const fullDraft = (over: Record<string, unknown> = {}) => draftDetail({
  name: 'Copa Sudoeste', price_cents: null, starts_at: new Date(2026, 10, 15, 9, 0).toISOString(), registration_closes_at: new Date(2026, 10, 10, 23, 59).toISOString(),
  checklist: checklistItems(['nome_modalidade', 'formato_tipo', 'vagas_elos', 'datas', 'local']), ...over,
})
const baseRoutes = (over: Record<string, unknown> = {}) => ({ '/cities': [city, otherCity], ...over })

beforeEach(() => {
  enableAct()
  onExpired.mockClear()
  navigation = navigationMock()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
})
afterEach(() => { vi.useRealTimers() })

describe('Criar evento (V4): uma pergunta por vez', () => {
  it('avança e volta pelos cinco passos, valida cada um e publica o evento gratuito', async () => {
    routeRequest(baseRoutes({
      [`POST ${EVENTS}`]: (body: unknown) => draftDetail({ id: 5, name: (body as { name: string }).name }),
      [`POST ${EVENT}/submit`]: detail({ id: 5 }),
    }))
    const tree = await wizard()
    // Passo 1: o nome.
    expect(question(tree)).toBe('Qual é o nome do evento?')
    expect(textOf(tree)).toContain('1/5')
    expect(tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'step-done')).toHaveLength(1)
    expect(tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'step-todo')).toHaveLength(4)
    expect(textOf(tree)).toContain('Novo evento')
    expect(byLabel(tree, 'Voltar ao passo anterior')).toHaveLength(0)
    await next(tree)
    expect(textOf(tree)).toContain('Informe o nome do evento com 3 a 60 caracteres.')
    expect(textOf(tree)).toContain('Revise o campo indicado.')
    expect(question(tree)).toBe('Qual é o nome do evento?')
    await type(tree, 'Nome do evento', 'Copa Sudoeste')
    expect(textOf(tree)).not.toContain('Informe o nome do evento')
    expect(textOf(tree)).toContain('13/60')
    await next(tree)

    // Passo 2: modalidade, formato e tipo; voltar mantém o que foi digitado.
    expect(question(tree)).toBe('Qual modalidade?')
    expect(textOf(tree)).toContain('2/5')
    await press(tree, 'Voltar ao passo anterior')
    expect(question(tree)).toBe('Qual é o nome do evento?')
    expect(input(tree, 'Nome do evento')!.props.value).toBe('Copa Sudoeste')
    await next(tree)
    await next(tree)
    expect(textOf(tree)).toContain('Escolha a modalidade.')
    await press(tree, 'Futebol')
    expect(state(tree, 'Futebol')).toMatchObject({ checked: true })
    expect(byLabel(tree, 'Formato').length).toBeGreaterThan(0)
    await next(tree)
    expect(textOf(tree)).toContain('Escolha o formato.')
    expect(textOf(tree)).toContain('Escolha o tipo.')
    await press(tree, 'Society, 7 contra 7')
    await press(tree, 'Todos contra todos')
    expect(textOf(tree)).not.toContain('Escolha o formato.')
    await next(tree)

    // Passo 3: vagas (contador) e elos aceitos.
    expect(question(tree)).toBe('Quantas vagas e quem pode entrar?')
    await next(tree)
    expect(textOf(tree)).toContain('Informe as vagas.')
    for (let n = 0; n < 3; n += 1) await press(tree, 'Mais vagas')
    expect(input(tree, 'Vagas')!.props.value).toBe('5')
    await press(tree, 'Menos vagas')
    expect(input(tree, 'Vagas')!.props.value).toBe('4')
    await press(tree, 'Só alguns elos')
    await next(tree)
    expect(textOf(tree)).toContain('Escolha ao menos um elo ou deixe aberto a todos.')
    await press(tree, 'Ouro')
    expect(state(tree, 'Ouro')).toMatchObject({ checked: true })
    await press(tree, 'Aberto a todos')
    expect(byLabel(tree, 'Ouro')).toHaveLength(0)
    await next(tree)

    // Passo 4: data, hora, fim das inscrições, cidade e local.
    expect(question(tree)).toBe('Quando e onde?')
    await next(tree)
    const found = textOf(tree)
    for (const message of ['Escolha a data do evento.', 'Escolha até quando vão as inscrições.', 'Escolha a cidade.', 'Informe o local com 2 a 120 caracteres.']) expect(found).toContain(message)
    await pickDate(tree, 'Data do evento', 2026, 10, 15)
    await next(tree)
    expect(textOf(tree)).toContain('Informe a hora do início.')
    await type(tree, 'Hora do início', '0900')
    await pickDate(tree, 'Fim das inscrições', 2026, 10, 10)
    expect(textOf(tree)).toContain('Sem hora, fecham às 23:59.')
    await press(tree, 'Cidade: não escolhida')
    await press(tree, 'Brasília, DF')
    await type(tree, 'Local', 'Arena Sudoeste')
    await next(tree)

    // Passo 5: gratuita publica direto.
    expect(question(tree)).toBe('A inscrição é paga?')
    expect(textOf(tree)).toContain('5/5')
    expect(byLabel(tree, 'Publicar')).toHaveLength(1)
    await press(tree, 'Publicar')
    expect(textOf(tree)).toContain('Escolha se a inscrição é gratuita ou paga.')
    await press(tree, 'Gratuita')
    expect(textOf(tree)).toContain('Evento gratuito publica direto')
    await press(tree, 'Publicar')
    const body = calls('POST', EVENTS)[0][2] as Record<string, unknown>
    expect(body).toMatchObject({ name: 'Copa Sudoeste', sport: 'futebol', format: 'society', competition_type: 'todos_contra_todos', capacity: 4, accepted_tiers: null, city_id: 7, venue: 'Arena Sudoeste', price_cents: 0, pix_key: null })
    expect(body.starts_at).toBe(new Date(2026, 10, 15, 9, 0).toISOString())
    expect(body.registration_closes_at).toBe(new Date(2026, 10, 10, 23, 59).toISOString())
    expect(calls('POST', `${EVENT}/submit`)[0][2]).toEqual({})
    // Vai para a gestão do evento, substituindo a gestão que já estiver logo abaixo na pilha.
    expect(navigation.replace).toHaveBeenCalledTimes(1)
    const [entry, same] = navigation.replace.mock.calls[0]
    expect(entry).toEqual({ screen: 'event-manage', params: { eventId: 5 } })
    expect(same({ screen: 'event-manage', params: { eventId: 5 } })).toBe(true)
    expect(same({ screen: 'event-manage', params: { eventId: 6 } })).toBe(false)
    expect(same({ screen: 'organizer-events' })).toBe(false)
  })

  it('"Salvar rascunho" grava a qualquer momento: cria, depois atualiza o mesmo rascunho', async () => {
    routeRequest(baseRoutes({
      [`POST ${EVENTS}`]: (body: unknown) => draftDetail({ id: 5, name: (body as { name: string }).name }),
      [`PATCH ${EVENT}`]: (body: unknown) => draftDetail({ id: 5, name: (body as { name: string }).name }),
    }))
    const tree = await wizard()
    await press(tree, 'Salvar rascunho')
    expect(textOf(tree)).toContain('Informe o nome do evento com 3 a 60 caracteres.')
    expect(calls('POST', EVENTS)).toHaveLength(0)
    await type(tree, 'Nome do evento', 'Copa Sudoeste')
    await press(tree, 'Salvar rascunho')
    expect(calls('POST', EVENTS)[0][2]).toMatchObject({ name: 'Copa Sudoeste', sport: null, price_cents: null, starts_at: null, accepted_tiers: null })
    expect(textOf(tree)).toContain('Rascunho salvo. Ele fica em Meus eventos, com o checklist do que falta.')
    await type(tree, 'Nome do evento', 'Copa Sudoeste 2026')
    expect(textOf(tree)).not.toContain('Rascunho salvo.')
    await press(tree, 'Salvar rascunho')
    expect(calls('PATCH', EVENT)[0][2]).toMatchObject({ name: 'Copa Sudoeste 2026' })
    expect(calls('POST', EVENTS)).toHaveLength(1)
    // Rascunho com vagas ilegíveis ou dia sem hora não é guardado: o erro aparece no passo do campo.
    await next(tree)
    await press(tree, 'Futebol')
    await press(tree, 'Voltar ao passo anterior')
    expect(question(tree)).toBe('Qual é o nome do evento?')
    expect(calls('PATCH', EVENT)).toHaveLength(1)
  })

  it('o X e o voltar do Android perguntam antes de descartar; salvo ou intacto, saem direto', async () => {
    routeRequest(baseRoutes({ [`POST ${EVENTS}`]: draftDetail({ id: 5 }) }))
    const tree = await wizard()
    await press(tree, 'Fechar')
    expect(navigation.back).toHaveBeenCalledTimes(1)
    await type(tree, 'Nome do evento', 'Copa')
    await press(tree, 'Fechar')
    expect(textOf(tree)).toContain('Sair sem salvar?')
    expect(textOf(tree)).toContain('As mudanças desde o último rascunho salvo se perdem.')
    expect(navigation.back).toHaveBeenCalledTimes(1)
    await press(tree, 'Continuar editando')
    expect(textOf(tree)).not.toContain('Sair sem salvar?')
    // O botão voltar do Android chega pelo `onRequestClose` do Modal e faz o mesmo.
    await act(async () => { tree.root.findAllByType('Modal' as never)[0].props.onRequestClose() })
    expect(textOf(tree)).toContain('Sair sem salvar?')
    await press(tree, 'Sair sem salvar')
    expect(navigation.back).toHaveBeenCalledTimes(2)
    await press(tree, 'Salvar rascunho e sair')
    expect(calls('POST', EVENTS)).toHaveLength(1)
    expect(navigation.back).toHaveBeenCalledTimes(3)
    // Depois de salvo, nada se perde: o X sai direto.
    await press(tree, 'Fechar')
    expect(navigation.back).toHaveBeenCalledTimes(4)
  })

  describe('durante o envio', () => {
    /** Servidor em que o rascunho completo salva na hora, mas o envio (`submit`) só responde quando o teste liberar. */
    function holdSubmit() {
      let finish: (value: unknown) => void = () => undefined
      routeRequest(baseRoutes({
        [EVENT]: fullDraft({ price_cents: 0 }),
        [`PATCH ${EVENT}`]: fullDraft({ price_cents: 0 }),
        [`POST ${EVENT}/submit`]: () => new Promise(resolve => { finish = resolve }),
      }))
      return (value: unknown) => finish(value)
    }
    const closed = (tree: ReactTestRenderer) => tree.root.findAllByType('Pressable' as never).find(entry => entry.props.accessibilityLabel === 'Fechar')!

    it('o X e o voltar do Android não saem enquanto envia; a resposta leva à gestão do evento', async () => {
      const release = holdSubmit()
      const tree = await wizard({ eventId: 5 })
      await press(tree, 'Publicar')
      expect(textOf(tree)).toContain('Publicando…')
      expect(closed(tree).props.disabled).toBe(true)
      expect(closed(tree).props.accessibilityState).toMatchObject({ disabled: true })
      await press(tree, 'Fechar')
      await act(async () => { tree.root.findAllByType('Modal' as never)[0].props.onRequestClose() })
      expect(navigation.back).not.toHaveBeenCalled()
      expect(textOf(tree)).not.toContain('Sair sem salvar?')
      await act(async () => { release(detail({ id: 5 })) })
      expect(navigation.replace).toHaveBeenCalledTimes(1)
      expect(navigation.replace.mock.calls[0][0]).toEqual({ screen: 'event-manage', params: { eventId: 5 } })
      expect(navigation.back).not.toHaveBeenCalled()
    })

    it('com o assistente já desmontado, a resposta tardia do envio não navega (substituiria outra tela)', async () => {
      const release = holdSubmit()
      const tree = await wizard({ eventId: 5 })
      await press(tree, 'Publicar')
      await act(async () => { tree.unmount() })
      await act(async () => { release(detail({ id: 5 })) })
      expect(calls('POST', `${EVENT}/submit`)).toHaveLength(1)
      expect(navigation.replace).not.toHaveBeenCalled()
      expect(navigation.back).not.toHaveBeenCalled()
    })

    it('"Sair sem salvar" não sai enquanto "Salvar rascunho e sair" grava; a gravação termina e sai uma vez só', async () => {
      let finish: (value: unknown) => void = () => undefined
      routeRequest(baseRoutes({ [`POST ${EVENTS}`]: () => new Promise(resolve => { finish = resolve }) }))
      const tree = await wizard()
      await type(tree, 'Nome do evento', 'Copa Sudoeste')
      await press(tree, 'Fechar')
      await press(tree, 'Salvar rascunho e sair')
      const leave = tree.root.findAllByType('Pressable' as never).find(entry => entry.props.accessibilityLabel === 'Sair sem salvar')!
      expect(leave.props.disabled).toBe(true)
      await press(tree, 'Sair sem salvar')
      expect(navigation.back).not.toHaveBeenCalled()
      await act(async () => { finish(draftDetail({ id: 5 })) })
      expect(navigation.back).toHaveBeenCalledTimes(1)
    })

    it('"Salvar rascunho e sair" com o assistente desmontado antes da resposta não volta de outra tela', async () => {
      let finish: (value: unknown) => void = () => undefined
      routeRequest(baseRoutes({ [`POST ${EVENTS}`]: () => new Promise(resolve => { finish = resolve }) }))
      const tree = await wizard()
      await type(tree, 'Nome do evento', 'Copa Sudoeste')
      await press(tree, 'Fechar')
      await press(tree, 'Salvar rascunho e sair')
      await act(async () => { tree.unmount() })
      await act(async () => { finish(draftDetail({ id: 5 })) })
      expect(navigation.back).not.toHaveBeenCalled()
    })
  })

  it('salvar e sair com erro de validação continua no assistente', async () => {
    routeRequest(baseRoutes())
    const tree = await wizard()
    await type(tree, 'Nome do evento', 'x')
    await press(tree, 'Fechar')
    await press(tree, 'Salvar rascunho e sair')
    expect(navigation.back).not.toHaveBeenCalled()
    expect(textOf(tree)).toContain('Informe o nome do evento com 3 a 60 caracteres.')
  })

  it('eliminação simples oferece 4, 8 ou 16 vagas; a corrida tem distância, percurso e vagas em passos de 10', async () => {
    routeRequest(baseRoutes())
    const tree = await wizard()
    await type(tree, 'Nome do evento', 'Torneio de Tênis')
    await next(tree)
    await press(tree, 'Tênis')
    expect(byLabel(tree, 'Formato')).toHaveLength(0)
    await press(tree, 'Eliminação simples')
    expect(textOf(tree)).toContain('Tênis em simples, um contra um.')
    await next(tree)
    expect(byLabel(tree, '8 atletas').length).toBeGreaterThan(0)
    expect(byLabel(tree, 'Mais vagas')).toHaveLength(0)
    await press(tree, '16 atletas')
    expect(state(tree, '16 atletas')).toMatchObject({ checked: true })
    await press(tree, 'Voltar ao passo anterior')
    await press(tree, 'Corrida')
    expect(textOf(tree)).toContain('A prova não tem tipo.')
    await next(tree)
    expect(textOf(tree)).toContain('Escolha a distância.')
    await press(tree, '10 km')
    await next(tree)
    // As vagas da eliminação (16) continuam valendo na corrida, que sobe de 10 em 10.
    expect(input(tree, 'Vagas')!.props.value).toBe('16')
    await press(tree, 'Mais vagas')
    expect(input(tree, 'Vagas')!.props.value).toBe('26')
    await press(tree, 'Menos vagas')
    expect(input(tree, 'Vagas')!.props.value).toBe('16')
    await type(tree, 'Vagas', '99999')
    expect(input(tree, 'Vagas')!.props.value).toBe('9999')
    await type(tree, 'Vagas', 'ab1')
    expect(input(tree, 'Vagas')!.props.value).toBe('1')
    expect(textOf(tree)).toContain('corredores')
    await press(tree, 'Só alguns elos')
    expect(textOf(tree)).toContain('Vale o elo do corredor nos 10 km.')
    await next(tree)
    expect(textOf(tree)).toContain('Na corrida, as vagas vão de 2 a 5000.')
    await press(tree, 'Aberto a todos')
    await type(tree, 'Vagas', '100')
    await next(tree)
    expect(byLabel(tree, 'Percurso (opcional)').length).toBeGreaterThan(0)
  })

  it('trocar de modalidade limpa o que não se aplica: a corrida não tem tipo nem formato', async () => {
    routeRequest(baseRoutes())
    const tree = await wizard()
    await type(tree, 'Nome do evento', 'Copa')
    await next(tree)
    await press(tree, 'Futebol')
    await press(tree, 'Society, 7 contra 7')
    await press(tree, 'Eliminação simples')
    await next(tree)
    expect(byLabel(tree, '4 times').length).toBeGreaterThan(0)
    await press(tree, 'Voltar ao passo anterior')
    await press(tree, 'Corrida')
    await press(tree, 'Futebol')
    await next(tree)
    expect(textOf(tree)).toContain('Escolha o formato.')
    expect(textOf(tree)).toContain('Escolha o tipo.')
  })

  it('rascunho sem tipo escolhido: as vagas explicam e levam de volta à modalidade', async () => {
    routeRequest(baseRoutes({ [EVENT]: draftDetail({ competition_type: null, capacity: 8 }) }))
    const tree = await wizard({ eventId: 5, step: 2 })
    expect(question(tree)).toBe('Quantas vagas e quem pode entrar?')
    expect(textOf(tree)).toContain('Escolha o tipo antes das vagas.')
    expect(byLabel(tree, 'Mais vagas')).toHaveLength(0)
    await press(tree, 'Voltar à modalidade')
    expect(question(tree)).toBe('Qual modalidade?')
  })

  it('a prévia do cartaz acompanha o que foi digitado, com o aviso de aprovação nos eventos pagos', async () => {
    routeRequest(baseRoutes({ [EVENT]: fullDraft({ price_cents: 0 }) }))
    const tree = await wizard({ eventId: 5, step: 4 })
    const preview = () => textOf(tree)
    expect(preview()).toContain('PRÉVIA DO CARTAZ')
    expect(preview()).toContain('Copa Sudoeste')
    expect(preview()).toContain('Rascunho')
    expect(preview()).toContain('Gratuito')
    expect(preview()).toContain('0 de 8 times')
    await press(tree, 'Paga')
    expect(preview()).toContain('Vai para aprovação')
    expect(preview()).toContain('A definir')
    await type(tree, 'Valor por time (R$)', '240')
    expect(preview()).toContain('R$ 240')
    await press(tree, 'Gratuita')
    expect(preview()).toContain('Gratuito')
  })
})

describe('Criar evento (V4): evento pago e Pix', () => {
  it('pago pede valor, favorecido e chave do tipo escolhido e vai para a aprovação', async () => {
    routeRequest(baseRoutes({
      [EVENT]: fullDraft(),
      [`PATCH ${EVENT}`]: (body: unknown) => draftDetail({ id: 5, price_cents: (body as { price_cents: number }).price_cents }),
      [`POST ${EVENT}/submit`]: detail({ id: 5, state: 'em_aprovacao', phase: 'em_aprovacao', price_cents: 24000 }),
    }))
    const tree = await wizard({ eventId: 5 })
    expect(textOf(tree)).toContain('Editar rascunho')
    expect(question(tree)).toBe('A inscrição é paga?')
    await press(tree, 'Paga')
    expect(byLabel(tree, 'Pix para receber').length).toBeGreaterThan(0)
    expect(textOf(tree)).toContain('Evento pago passa pela administração')
    expect(byLabel(tree, 'Enviar para aprovação')).toHaveLength(1)
    expect(byLabel(tree, 'Publicar')).toHaveLength(0)
    await press(tree, 'Enviar para aprovação')
    const errors = textOf(tree)
    expect(errors).toContain('O valor vai de R$ 1,00 a R$ 10.000,00.')
    expect(errors).toContain('Informe o favorecido com 2 a 80 caracteres.')
    expect(errors).toContain('Escolha o tipo de chave Pix.')
    expect(errors).toContain('Complete este passo para publicar.')
    expect(calls('PATCH', EVENT)).toHaveLength(0)
    await type(tree, 'Valor por time (R$)', '240')
    await type(tree, 'Favorecido', 'Liga Candanga')
    await press(tree, 'E-mail')
    expect(input(tree, 'Chave Pix')!.props.keyboardType).toBe('email-address')
    expect(input(tree, 'Chave Pix')!.props.placeholder).toBe('nome@email.com')
    await type(tree, 'Chave Pix', 'sem-arroba')
    await press(tree, 'Enviar para aprovação')
    expect(textOf(tree)).toContain('Informe um e-mail válido.')
    await type(tree, 'Chave Pix', 'pix@liga.com')
    await type(tree, 'Pix Copia e Cola (opcional)', '00020126')
    await type(tree, 'Instruções (opcional)', 'Envie o comprovante em até 48 h.')
    await type(tree, 'Contato para dúvidas (opcional)', 'liga@example.com')
    await press(tree, 'Telefone')
    expect(input(tree, 'Chave Pix')!.props.keyboardType).toBe('phone-pad')
    await press(tree, 'E-mail')
    await type(tree, 'Chave Pix', 'pix@liga.com')
    await press(tree, 'Enviar para aprovação')
    expect(calls('PATCH', EVENT)[0][2]).toMatchObject({
      price_cents: 24000, pix_beneficiary: 'Liga Candanga', pix_key_type: 'email', pix_key: 'pix@liga.com', pix_copy_paste: '00020126',
      pix_instructions: 'Envie o comprovante em até 48 h.', contact: 'liga@example.com',
    })
    expect(calls('POST', `${EVENT}/submit`)).toHaveLength(1)
    expect(navigation.replace).toHaveBeenCalledTimes(1)
    expect(navigation.replace.mock.calls[0][0]).toEqual({ screen: 'event-manage', params: { eventId: 5 } })
  })

  it('o tipo de chave define o teclado do campo: CPF numérico, aleatória livre', async () => {
    routeRequest(baseRoutes({ [EVENT]: fullDraft() }))
    const tree = await wizard({ eventId: 5 })
    await press(tree, 'Paga')
    await press(tree, 'CPF')
    expect(input(tree, 'Chave Pix')!.props.keyboardType).toBe('number-pad')
    await press(tree, 'Aleatória')
    expect(input(tree, 'Chave Pix')!.props.keyboardType).toBe('default')
    expect(input(tree, 'Chave Pix')!.props.autoCapitalize).toBe('none')
  })
})

describe('Criar evento (V4): erros da API no passo e no campo certos', () => {
  it('422 ao salvar volta ao passo do campo recusado, com a mensagem no campo', async () => {
    routeRequest(baseRoutes({
      [EVENT]: fullDraft({ price_cents: 0 }),
      [`PATCH ${EVENT}`]: () => { throw new ApiError('Revise os campos informados.', 422, [{ field: 'name', message: 'Value error, Já existe um evento com esse nome.' }]) },
    }))
    const tree = await wizard({ eventId: 5 })
    expect(question(tree)).toBe('A inscrição é paga?')
    await press(tree, 'Publicar')
    expect(question(tree)).toBe('Qual é o nome do evento?')
    expect(textOf(tree)).toContain('Já existe um evento com esse nome.')
    expect(textOf(tree)).toContain('Revise o campo indicado.')
    expect(textOf(tree)).toContain('1/5')
    expect(input(tree, 'Nome do evento')!.props.accessibilityHint).toBe('Já existe um evento com esse nome.')
    expect(calls('POST', `${EVENT}/submit`)).toHaveLength(0)
    await type(tree, 'Nome do evento', 'Copa Sudoeste 2026')
    expect(textOf(tree)).not.toContain('Já existe um evento com esse nome.')
  })

  it('o checklist do envio (422) leva ao passo do item incompleto', async () => {
    routeRequest(baseRoutes({
      [EVENT]: fullDraft({ price_cents: 0 }),
      [`PATCH ${EVENT}`]: fullDraft({ price_cents: 0 }),
      [`POST ${EVENT}/submit`]: () => { throw new ApiError('Complete o rascunho para publicar.', 422, [{ field: 'datas', message: 'Value error, As inscrições precisam fechar antes do início.' }]) },
    }))
    const tree = await wizard({ eventId: 5 })
    await press(tree, 'Publicar')
    expect(question(tree)).toBe('Quando e onde?')
    expect(textOf(tree)).toContain('As inscrições precisam fechar antes do início.')
    expect(textOf(tree)).toContain('Complete este passo para publicar.')
    expect(navigation.replace).not.toHaveBeenCalled()
  })

  it('erro sem campo (409) e queda de conexão ficam no passo atual; 401 expira a sessão', async () => {
    routeRequest(baseRoutes({
      [EVENT]: fullDraft({ price_cents: 0 }),
      [`PATCH ${EVENT}`]: () => { throw new ApiError('Retire o evento da aprovação para editar.', 409) },
    }))
    const tree = await wizard({ eventId: 5 })
    await press(tree, 'Publicar')
    expect(question(tree)).toBe('A inscrição é paga?')
    expect(textOf(tree)).toContain('Retire o evento da aprovação para editar.')
    routeRequest(baseRoutes({
      [EVENT]: fullDraft({ price_cents: 0 }),
      [`PATCH ${EVENT}`]: fullDraft({ price_cents: 0 }),
      [`POST ${EVENT}/submit`]: () => { throw new ApiError('Sessão expirada', 401) },
    }))
    await press(tree, 'Publicar')
    expect(onExpired).toHaveBeenCalledTimes(1)
    expect(textOf(tree)).toContain('Sessão expirada')
    expect(navigation.replace).not.toHaveBeenCalled()
    routeRequest(baseRoutes({ [EVENT]: fullDraft({ price_cents: 0 }), [`PATCH ${EVENT}`]: () => { throw new Error('') } }))
    await press(tree, 'Publicar')
    expect(textOf(tree)).toContain('Não foi possível salvar o evento.')
  })

  it('erro ao criar o rascunho do zero mostra a mensagem geral e não perde o formulário', async () => {
    routeRequest(baseRoutes({ [`POST ${EVENTS}`]: () => { throw new ApiError('Você precisa ser organizador para criar eventos.', 403) } }))
    const tree = await wizard()
    await type(tree, 'Nome do evento', 'Copa Sudoeste')
    await press(tree, 'Salvar rascunho')
    expect(textOf(tree)).toContain('Você precisa ser organizador para criar eventos.')
    expect(input(tree, 'Nome do evento')!.props.value).toBe('Copa Sudoeste')
    expect(textOf(tree)).not.toContain('Rascunho salvo.')
  })
})

describe('Editar rascunho', () => {
  it('abre no primeiro passo incompleto, ou no passo pedido pelo "Preencher" do checklist', async () => {
    routeRequest(baseRoutes({ [EVENT]: draftDetail({ starts_at: null, registration_closes_at: null }) }))
    const first = await wizard({ eventId: 5 })
    expect(question(first)).toBe('Quando e onde?')
    expect(input(first, 'Local')!.props.value).toBe('Arena Sudoeste')
    expect(byLabel(first, 'Cidade: Brasília, DF').length).toBeGreaterThan(0)
    const chosen = await wizard({ eventId: 5, step: 1 })
    expect(question(chosen)).toBe('Qual modalidade?')
    expect(state(chosen, 'Futebol')).toMatchObject({ checked: true })
    const clamped = await wizard({ eventId: 5, step: 9 })
    expect(question(clamped)).toBe('A inscrição é paga?')
    const negative = await wizard({ eventId: 5, step: -2 })
    expect(question(negative)).toBe('Qual é o nome do evento?')
  })

  it('não abre o que deixou de ser rascunho e explica o motivo; falha ao carregar também avisa', async () => {
    routeRequest(baseRoutes({ [EVENT]: detail({ state: 'em_aprovacao' }) }))
    const waiting = await wizard({ eventId: 5 })
    expect(textOf(waiting)).toContain('Retire o evento da aprovação para editar.')
    expect(byLabel(waiting, 'Salvar rascunho')).toHaveLength(0)
    await press(waiting, 'Voltar')
    expect(navigation.back).toHaveBeenCalledTimes(1)
    routeRequest(baseRoutes({ [EVENT]: detail({ state: 'publicado' }) }))
    expect(textOf(await wizard({ eventId: 5 }))).toContain('Este evento não é mais um rascunho. Edite os dados pela gestão do evento.')
    routeRequest(baseRoutes({ [EVENT]: () => { throw new ApiError('Evento não encontrado.', 404) } }))
    expect(textOf(await wizard({ eventId: 5 }))).toContain('Evento não encontrado.')
    routeRequest(baseRoutes({ [EVENT]: () => { throw new ApiError('Sessão expirada', 401) } }))
    await wizard({ eventId: 5 })
    expect(onExpired).toHaveBeenCalledTimes(1)
    routeRequest(baseRoutes({ [EVENT]: () => { throw new Error('') } }))
    expect(textOf(await wizard({ eventId: 5 }))).toContain('Não foi possível carregar o rascunho.')
  })

  it('mostra "Carregando o rascunho…" até a resposta e o catálogo de cidades falho avisa no passo do local', async () => {
    let release: (value: unknown) => void = () => undefined
    routeRequest(baseRoutes({ [EVENT]: () => new Promise(resolve => { release = resolve }), '/cities': () => { throw new ApiError('Catálogo fora do ar', 500) } }))
    const tree = await wizard({ eventId: 5, step: 3 })
    expect(textOf(tree)).toContain('Carregando o rascunho…')
    expect(byLabel(tree, 'Próxima')).toHaveLength(0)
    await act(async () => { release(draftDetail()) })
    expect(question(tree)).toBe('Quando e onde?')
    expect(textOf(tree)).toContain('Catálogo fora do ar')
    const city = tree.root.findAllByType('Pressable' as never).find(entry => String(entry.props.accessibilityLabel).startsWith('Cidade:'))!
    expect(city.props.disabled).toBe(true)
    expect(state(tree, 'Voltar ao passo anterior')).toBeDefined()
  })
})
