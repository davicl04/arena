import { act } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import * as SecureStore from 'expo-secure-store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import { brandSvgs } from '../src/assets/brand-svgs'
import { dayLabel } from '../src/utils/calendar'
import { combineDateTime } from '../src/utils/dateKey'
import { enableAct } from './support/native'
import { toastText, toasts } from './support/toast'
import { matchRoutes, mountMatch, unmountAll } from './support/match'
import {
  arranging, athleteSide, caio, court, fromNow, matchDetail, memberPermissions, noPermissions, person, ricardo, scheduled, sides, teamSide, terms, walkover,
} from './support/play'
import { confirmed, report, result as resultOf, score } from './support/results'
import {
  allText, bodyOf, byId, callsTo, findButton, findByPrefix, flush, hasField, isDisabled, labelled, pressButton, pressPrefix, typeInto,
} from './support/review'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))

/*
 * Tela da partida (P2): cabeçalho, estados da tela, cartão de condições, folha "Propor condições" (data, horário, quadra e
 * quem reserva), aceite, reserva, cancelamento, W.O., a variante de campeonato e o encaixe do resultado. A tela obedece a
 * `detail.permissions` do servidor. O chat e as vagas têm arquivos próprios (match-chat e match-slots).
 */

beforeEach(() => {
  enableAct()
  vi.mocked(request).mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-token')
})
afterEach(async () => {
  await unmountAll()
  vi.useRealTimers()
})

const tierEmblems = (tree: ReactTestRenderer) => tree.root.findAllByType('SvgXml' as never)
  .map(node => node.props.xml).filter(xml => [brandSvgs.bronze, brandSvgs.prata, brandSvgs.ouro, brandSvgs.diamante, brandSvgs.lendario].includes(xml))
const opponentProposal = () => matchDetail({ terms: { current: null, pending: terms() }, permissions: { ...arranging, accept_terms: true }, needs_my_action: true })
/** Abre o cartão de uma partida agendada (que vem recolhido, com o resumo no cabeçalho). */
const openCard = (tree: ReactTestRenderer) => pressPrefix(tree, 'Partida agendada')

describe('cabeçalho da partida', () => {
  it('mostra "Ferrugem × Leões", a fase, quando/onde e o elo só do lado que o pareamento gravou', async () => {
    const { tree } = await mountMatch(matchRoutes(scheduled(72, { sides: sides({ tier: null }, { tier: 'prata' }) })))
    const text = allText(tree)
    expect(text).toContain('Ferrugem  ×  Leões')
    expect(text).toContain('Agendada')
    expect(byId(tree, 'match-when')[0].children.join('')).toMatch(/^\w{3}, \d{1,2} \w{3} · \d\d:\d\d · Arena Sudoeste$/)
    expect(byId(tree, 'team-mark')).toHaveLength(2)
    // Quem está em classificação não ganha elo: só o brasão Prata do adversário.
    expect(tierEmblems(tree)).toEqual([brandSvgs.prata])
    expect(tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'header' && node.props.accessibilityLabel === 'Ferrugem FC contra Leões do Cerrado')).toHaveLength(1)
  })

  it('o lado do titular vem primeiro e, se as primeiras palavras coincidem, os nomes completos', async () => {
    const guara = { id: 10, name: 'Real Guará', initials: 'RG', crest_url: null }
    const brasiliaTeam = { id: 20, name: 'Real Brasília', initials: 'RB', crest_url: null }
    const { tree } = await mountMatch(matchRoutes(matchDetail({
      my_side: 'b', sides: [teamSide('a', guara, { accepted_at: fromNow(-3) }), teamSide('b', brasiliaTeam, { accepted_at: fromNow(-2), is_mine: true })],
    })))
    expect(allText(tree)).toContain('Real Brasília  ×  Real Guará')
  })

  it('com um lado só (campeonato), o que falta aparece como "A definir"', async () => {
    const { tree } = await mountMatch(matchRoutes(matchDetail({ origin: 'campeonato', my_side: null, my_role: 'organizador', sides: sides({ is_mine: false }).slice(0, 1), permissions: noPermissions })))
    expect(allText(tree)).toContain('Ferrugem  ×  A definir')
    expect(findButton(tree, 'Voltar')).toBeTruthy()
  })

  it('no tênis, mostra os nomes dos atletas', async () => {
    const tennis = matchDetail({
      sport: 'tenis', format: null, my_role: 'atleta',
      sides: [athleteSide('a', ricardo, { is_mine: true, accepted_at: fromNow(-1) }), athleteSide('b', caio, { accepted_at: fromNow(-1) })],
    })
    const { tree } = await mountMatch(matchRoutes(tennis))
    expect(allText(tree)).toContain('Ricardo  ×  Caio')
  })

  it('"Voltar" volta pela navegação', async () => {
    const { tree, navigation } = await mountMatch(matchRoutes(matchDetail()))
    await pressButton(tree, 'Voltar')
    expect(navigation.back).toHaveBeenCalledOnce()
  })
})

describe('estados da tela', () => {
  it('mostra o carregamento e depois a partida', async () => {
    let finish!: () => void
    const wait = new Promise<void>(resolve => { finish = resolve })
    const { tree } = await mountMatch(matchRoutes(matchDetail(), { '/matches/1': async () => { await wait; return matchDetail() } }))
    expect(allText(tree)).toContain('Carregando partida…')
    expect(allText(tree)).not.toContain('Combinando')
    await act(async () => { finish() })
    await flush()
    expect(allText(tree)).toContain('Combinando')
    expect(allText(tree)).not.toContain('Carregando partida…')
  })

  it('partida inexistente ou sem acesso (404): estado vazio com "Voltar", sem chat', async () => {
    const { tree, navigation } = await mountMatch(matchRoutes(matchDetail(), { '/matches/1': new ApiError('Partida não encontrada.', 404) }))
    expect(allText(tree)).toContain('Partida não encontrada')
    expect(allText(tree)).toContain('Ela não existe ou você não participa dela.')
    expect(byId(tree, 'match-chat')).toHaveLength(0)
    await pressButton(tree, 'Voltar')
    expect(navigation.back).toHaveBeenCalledOnce()
  })

  it('sessão expirada (401) chama onExpired', async () => {
    const { onExpired } = await mountMatch(matchRoutes(matchDetail(), { '/matches/1': new ApiError('Sessão expirada.', 401) }))
    expect(onExpired).toHaveBeenCalled()
  })

  it('erro do servidor mostra o aviso e tenta de novo por "Tentar novamente"', async () => {
    let reads = 0
    const { tree } = await mountMatch(matchRoutes(matchDetail(), { '/matches/1': () => (++reads === 1 ? new ApiError('Falha no servidor.', 500) : matchDetail()) }))
    expect(allText(tree)).toContain('Falha no servidor.')
    expect(allText(tree)).not.toContain('Partida não encontrada')
    // Erro de tela (LoadError), não toast.
    expect(byId(tree, 'load-error-screen')).toHaveLength(1)
    expect(toasts()).toEqual([])
    await pressButton(tree, 'Tentar novamente')
    expect(allText(tree)).toContain('Combinando')
    expect(callsTo('GET', '/matches/1')).toHaveLength(2)
  })

  it('proposta ainda não aceita: aviso, sem chat e sem condições', async () => {
    const { tree } = await mountMatch(matchRoutes(matchDetail({ state: 'proposta', phase: 'proposta', permissions: noPermissions })))
    expect(allText(tree)).toContain('Proposta aguardando resposta')
    expect(allText(tree)).toContain('O chat e as condições abrem quando os dois lados aceitam. Responda pela placa do Jogar.')
    expect(byId(tree, 'match-chat')).toHaveLength(0)
    expect(byId(tree, 'conditions-card')).toHaveLength(0)
    expect(callsTo('GET', '/matches/1/messages')).toHaveLength(0)
  })

  it('proposta recusada ou expirada: a partida não aconteceu', async () => {
    const { tree } = await mountMatch(matchRoutes(matchDetail({ state: 'expirada', phase: 'expirada', permissions: noPermissions })))
    expect(allText(tree)).toContain('Proposta expirada')
    expect(allText(tree)).toContain('Esta partida não aconteceu. Os times podem buscar de novo pela placa do Jogar.')
  })

  it('chat fechado antes do aceite: estado vazio e nenhuma leitura de mensagens', async () => {
    const { tree } = await mountMatch(matchRoutes(matchDetail({ permissions: { ...arranging, read_chat: false, write_chat: false } })))
    expect(allText(tree)).toContain('O chat ainda não abriu')
    expect(allText(tree)).toContain('O chat abre quando os dois lados aceitam a proposta.')
    expect(callsTo('GET', '/matches/1/messages')).toHaveLength(0)
  })
})

describe('condições: propor', () => {
  /** Relógio do teste em 12/10/2026 (só a data é simulada; os temporizadores e as promessas seguem reais). */
  const today = () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
  }
  const COURTS = '/courts?city_id=5300108&kind=society&match_id=1'
  async function fill(tree: ReactTestRenderer, day: number, time: string) {
    await pressButton(tree, 'Data: não escolhida')
    await pressButton(tree, dayLabel(new Date(2026, 9, day)))
    await typeInto(tree, 'Horário', time)
  }

  it('propõe data, horário, quadra do catálogo e quem reserva; a proposta aparece com os selos de aceite', async () => {
    today()
    const proposed = matchDetail({
      terms: { current: null, pending: terms({ id: 40, starts_at: combineDateTime('2026-10-20', '19:00')!, proposed_by: ricardo, proposed_by_side: 'a', booking_side: 'b', accepted_a_at: fromNow(0), accepted_b_at: null }) },
      permissions: { ...arranging, accept_terms: false },
    })
    const { tree, refreshPlayBoard } = await mountMatch(matchRoutes(matchDetail(), {
      [COURTS]: { items: [court(), court({ id: 8, name: 'Quadra do Lago', address: null })] },
      'POST /matches/1/terms': proposed,
    }))
    expect(allText(tree)).toContain('Os representantes combinam dia, horário e quadra.')
    await pressButton(tree, 'Propor condições')
    expect(allText(tree)).toContain('Ferrugem FC × Leões do Cerrado')
    await fill(tree, 20, '1900')
    await flush()
    await pressPrefix(tree, 'Arena Sudoeste')
    expect(findByPrefix(tree, 'Arena Sudoeste')!.props.accessibilityState.checked).toBe(true)
    // Quem reserva: por padrão o meu lado; escolhe o adversário.
    expect(findButton(tree, 'Ferrugem FC')!.props.accessibilityState.checked).toBe(true)
    await pressButton(tree, 'Leões do Cerrado')
    await pressButton(tree, 'Enviar proposta')

    expect(bodyOf('POST', '/matches/1/terms')).toEqual({ starts_at: combineDateTime('2026-10-20', '19:00'), court_id: 7, booking_side: 'b' })
    const text = allText(tree)
    expect(toasts().map(item => [item.tone, item.title])).toEqual([['success', 'Proposta enviada. Leões do Cerrado precisa aceitar.']])
    expect(hasField(tree, 'Horário')).toBe(false)
    expect(text).toContain('Proposta de Ferrugem FC')
    expect(text).toContain('Ferrugem FC aceitou')
    expect(text).toContain('Leões do Cerrado falta aceitar')
    expect(text).toContain('Aguardando Leões aceitar a proposta.')
    expect(findButton(tree, 'Aceitar condições')).toBeUndefined()
    expect(refreshPlayBoard).toHaveBeenCalledOnce()
  })

  it('não deixa escolher dias passados nem além de 60 dias, e o horário anda de 15 em 15 minutos', async () => {
    today()
    const { tree } = await mountMatch(matchRoutes(matchDetail(), { [COURTS]: { items: [] } }))
    await pressButton(tree, 'Propor condições')
    await pressButton(tree, 'Data: não escolhida')
    const day = (value: number) => findButton(tree, dayLabel(new Date(2026, 9, value)))!
    expect(day(11).props.disabled).toBe(true)
    expect(day(12).props.disabled).toBe(false)
    // O último dia é 11/12 (60 dias depois): dezembro, dois meses adiante.
    await pressButton(tree, 'Próximo mês')
    await pressButton(tree, 'Próximo mês')
    expect(findButton(tree, dayLabel(new Date(2026, 11, 11)))!.props.disabled).toBe(false)
    expect(findButton(tree, dayLabel(new Date(2026, 11, 12)))!.props.disabled).toBe(true)
    expect(isDisabled(tree, 'Próximo mês')).toBe(true)
    expect(findButton(tree, 'Horário: mais 15 minutos')).toBeTruthy()
  })

  it('confere data, horário, passo de 15 minutos e quadra antes de enviar, e mostra o erro do servidor sem fechar a folha', async () => {
    today()
    const { tree } = await mountMatch(matchRoutes(matchDetail(), {
      [COURTS]: { items: [court()] },
      'POST /matches/1/terms': new ApiError('Escolha uma quadra de society.', 422),
    }))
    await pressButton(tree, 'Propor condições')
    await flush()
    await pressButton(tree, 'Enviar proposta')
    expect(allText(tree)).toContain('Escolha a data da partida.')
    await pressButton(tree, 'Data: não escolhida')
    await pressButton(tree, dayLabel(new Date(2026, 9, 20)))
    await pressButton(tree, 'Enviar proposta')
    expect(allText(tree)).toContain('Escolha o horário da partida.')
    await typeInto(tree, 'Horário', '1910')
    await pressButton(tree, 'Enviar proposta')
    expect(allText(tree)).toContain('Use horários de 15 em 15 minutos.')
    await typeInto(tree, 'Horário', '1915')
    await pressButton(tree, 'Enviar proposta')
    expect(allText(tree)).toContain('Escolha a quadra do catálogo ou sugira uma.')
    await pressPrefix(tree, 'Arena Sudoeste')
    await pressButton(tree, 'Enviar proposta')
    expect(allText(tree)).toContain('Escolha uma quadra de society.')
    expect(callsTo('POST', '/matches/1/terms')).toHaveLength(1)
    expect(hasField(tree, 'Horário')).toBe(true)
  })

  it('busca quadras no catálogo da cidade pelo nome e mostra o estado vazio', async () => {
    const { tree } = await mountMatch(matchRoutes(matchDetail(), {
      [COURTS]: { items: [] },
      '/courts?city_id=5300108&kind=society&q=lago&match_id=1': { items: [court({ id: 8, name: 'Quadra do Lago' })] },
    }))
    await pressButton(tree, 'Propor condições')
    await flush()
    expect(allText(tree)).toContain('Ainda não há quadras publicadas em Brasília. Sugira a quadra onde vocês vão jogar.')
    await typeInto(tree, 'Buscar quadra', 'lago')
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)) })
    await flush()
    expect(findByPrefix(tree, 'Quadra do Lago')).toBeTruthy()
    expect(callsTo('GET', '/courts?city_id=5300108&kind=society&q=lago&match_id=1').length).toBeGreaterThan(0)
  })

  it('sugere outra quadra: fica "em revisão", vale só nesta partida e entra na proposta', async () => {
    today()
    const suggested = court({ id: 9, name: 'Quadra Nova', address: 'SQN 100', state: 'em_revisao', provisional: true })
    const { tree } = await mountMatch(matchRoutes(matchDetail(), {
      [COURTS]: { items: [] },
      'POST /courts/suggestions': { court: suggested, existing: false },
      'POST /matches/1/terms': matchDetail({ terms: { current: null, pending: terms({ id: 41, court: suggested, accepted_a_at: fromNow(0), accepted_b_at: null, proposed_by_side: 'a' }) } }),
    }))
    await pressButton(tree, 'Propor condições')
    await flush()
    await pressButton(tree, 'Sugerir outra quadra')
    // Nome curto demais.
    await typeInto(tree, 'Nome da quadra', 'A')
    await pressButton(tree, 'Sugerir quadra')
    expect(allText(tree)).toContain('O nome da quadra precisa ter de 2 a 80 caracteres.')
    expect(callsTo('POST', '/courts/suggestions')).toHaveLength(0)
    await typeInto(tree, 'Nome da quadra', 'Quadra Nova')
    await typeInto(tree, 'Endereço (opcional)', 'SQN 100')
    await pressButton(tree, 'Sugerir quadra')

    expect(bodyOf('POST', '/courts/suggestions')).toEqual({ match_id: 1, name: 'Quadra Nova', address: 'SQN 100' })
    const option = findByPrefix(tree, 'Quadra Nova')!
    expect(option.props.accessibilityState.checked).toBe(true)
    expect(allText(tree)).toContain('Sugestão em revisão')
    expect(allText(tree)).toContain('Quadra Nova foi sugerida: fica em revisão e vale só nesta partida.')

    await fill(tree, 20, '2000')
    await pressButton(tree, 'Enviar proposta')
    expect(bodyOf('POST', '/matches/1/terms')).toMatchObject({ court_id: 9 })
    // No cartão, a quadra segue com o selo "Sugestão em revisão".
    expect(allText(tree)).toContain('Sugestão em revisão')
    expect(allText(tree)).toContain('vale só para esta partida')
  })

  it('uma quadra que já existe é selecionada e avisada; o 401 da sugestão volta ao login', async () => {
    const { tree, onExpired } = await mountMatch(matchRoutes(matchDetail(), {
      [COURTS]: { items: [] },
      'POST /courts/suggestions': { court: court(), existing: true },
    }))
    await pressButton(tree, 'Propor condições')
    await flush()
    await pressButton(tree, 'Sugerir outra quadra')
    await typeInto(tree, 'Nome da quadra', 'Arena Sudoeste')
    await pressButton(tree, 'Sugerir quadra')
    expect(allText(tree)).toContain('Arena Sudoeste já estava no catálogo ou nesta partida e foi selecionada.')
    // Voltar da sugestão fecha o formulário.
    await pressButton(tree, 'Sugerir outra quadra')
    await pressButton(tree, 'Voltar da sugestão de quadra')
    expect(hasField(tree, 'Nome da quadra')).toBe(false)
    expect(onExpired).not.toHaveBeenCalled()
  })

  it('sem permissão para sugerir, a folha não oferece "Sugerir outra quadra"', async () => {
    const { tree } = await mountMatch(matchRoutes(matchDetail({ permissions: { ...arranging, suggest_court: false } }), { [COURTS]: { items: [court()] } }))
    await pressButton(tree, 'Propor condições')
    await flush()
    expect(findByPrefix(tree, 'Arena Sudoeste')).toBeTruthy()
    expect(findButton(tree, 'Sugerir outra quadra')).toBeUndefined()
  })

  it('o erro ao carregar o catálogo aparece sem travar a folha', async () => {
    const { tree } = await mountMatch(matchRoutes(matchDetail(), { [COURTS]: new ApiError('Catálogo indisponível.', 500) }))
    await pressButton(tree, 'Propor condições')
    await flush()
    expect(allText(tree)).toContain('Catálogo indisponível.')
    expect(findButton(tree, 'Sugerir outra quadra')).toBeTruthy()
  })

  it('pelo ícone do campo do chat, o representante abre a mesma folha', async () => {
    const { tree } = await mountMatch(matchRoutes(matchDetail(), { [COURTS]: { items: [] } }))
    await pressButton(tree, 'Propor dia, horário e quadra')
    expect(hasField(tree, 'Horário')).toBe(true)
  })

  it('no tênis, a folha oferece o super tie-break e envia a escolha', async () => {
    today()
    const tennis = matchDetail({
      sport: 'tenis', format: null, my_role: 'atleta',
      sides: [athleteSide('a', ricardo, { is_mine: true, accepted_at: fromNow(-1) }), athleteSide('b', caio, { accepted_at: fromNow(-1) })],
    })
    const { tree } = await mountMatch(matchRoutes(tennis, {
      '/courts?city_id=5300108&kind=tenis&match_id=1': { items: [court({ kind: 'tenis', name: 'Clube de Tênis' })] },
      'POST /matches/1/terms': tennis,
    }))
    await pressButton(tree, 'Propor condições')
    await flush()
    await fill(tree, 21, '0730')
    await pressPrefix(tree, 'Clube de Tênis')
    const toggle = findButton(tree, 'Super tie-break no lugar do 3º set')!
    expect(toggle.props.accessibilityRole).toBe('switch')
    expect(toggle.props.accessibilityState.checked).toBe(false)
    await pressButton(tree, 'Super tie-break no lugar do 3º set')
    await pressButton(tree, 'Enviar proposta')
    expect(bodyOf('POST', '/matches/1/terms')).toEqual({ starts_at: combineDateTime('2026-10-21', '07:30'), court_id: 7, booking_side: 'a', super_tiebreak: true })
  })

  it('fechar a folha não envia nada', async () => {
    const { tree } = await mountMatch(matchRoutes(matchDetail(), { [COURTS]: { items: [] } }))
    await pressButton(tree, 'Propor condições')
    expect(hasField(tree, 'Horário')).toBe(true)
    await pressButton(tree, 'Fechar')
    expect(hasField(tree, 'Horário')).toBe(false)
    expect(callsTo('POST', '/matches/1/terms')).toHaveLength(0)
  })
})

describe('condições: aceitar', () => {
  it('mostra a proposta do adversário com os selos e aceita: a partida fica agendada e a placa é relida', async () => {
    const { tree, refreshPlayBoard } = await mountMatch(matchRoutes(opponentProposal(), { 'PUT /matches/1/terms/31/accept': scheduled(72, { permissions: { ...arranging, cancel: true } }) }))
    const text = allText(tree)
    expect(text).toContain('Proposta de Leões do Cerrado')
    expect(text).toContain('Arena Sudoeste')
    expect(text).toContain('Reserva: Leões do Cerrado')
    expect(text).toContain('Ferrugem FC falta aceitar')
    expect(text).toContain('Leões do Cerrado aceitou')
    await pressButton(tree, 'Aceitar condições')
    expect(bodyOf('PUT', '/matches/1/terms/31/accept')).toEqual({})
    expect(toasts().map(item => [item.tone, item.title])).toEqual([['success', 'Partida agendada. As condições estão valendo.']])
    expect(allText(tree)).toContain('Agendada')
    expect(findByPrefix(tree, 'Partida agendada')).toBeTruthy()
    expect(refreshPlayBoard).toHaveBeenCalledOnce()
  })

  it('mostra o erro do servidor ao aceitar condições substituídas, sem perder a tela', async () => {
    const { tree, refreshPlayBoard } = await mountMatch(matchRoutes(opponentProposal(), { 'PUT /matches/1/terms/31/accept': new ApiError('Estas condições foram substituídas. Confira a proposta atual.', 409) }))
    await pressButton(tree, 'Aceitar condições')
    expect(toastText()).toContain('Estas condições foram substituídas. Confira a proposta atual.')
    expect(findButton(tree, 'Aceitar condições')).toBeTruthy()
    expect(refreshPlayBoard).not.toHaveBeenCalled()
  })

  it('"Propor outra" abre a folha já com a proposta atual (horário, quadra e quem reserva)', async () => {
    const { tree } = await mountMatch(matchRoutes(opponentProposal(), { '/courts?city_id=5300108&kind=society&match_id=1': { items: [court()] } }))
    await pressButton(tree, 'Propor outra')
    await flush()
    const time = tree.root.findAllByType('TextInput' as never).find(input => input.props.accessibilityLabel === 'Horário')!
    expect(time.props.value).toMatch(/^\d\d:\d\d$/)
    expect(findByPrefix(tree, 'Arena Sudoeste')!.props.accessibilityState.checked).toBe(true)
    expect(findButton(tree, 'Leões do Cerrado')!.props.accessibilityState.checked).toBe(true)
  })

  it('qualquer alteração depois do aceite exige novo aceite dos dois lados', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
    const base = scheduled(24 * 8)
    const changed = {
      ...base,
      terms: { current: base.terms.current, pending: terms({ id: 55, starts_at: combineDateTime('2026-10-21', '20:00')!, proposed_by: ricardo, proposed_by_side: 'a', accepted_a_at: fromNow(0), accepted_b_at: null }) },
      permissions: { ...base.permissions, accept_terms: false },
    }
    const { tree } = await mountMatch(matchRoutes(base, { '/courts?city_id=5300108&kind=society&match_id=1': { items: [court()] }, 'POST /matches/1/terms': changed }))
    // Agendada: o cartão vem recolhido, com o resumo.
    expect(findByPrefix(tree, 'Partida agendada')!.props.accessibilityState.expanded).toBe(false)
    await openCard(tree)
    await pressButton(tree, 'Alterar')
    await flush()
    await pressButton(tree, 'Data: ' + dayLabel(new Date(base.starts_at!)))
    await pressButton(tree, dayLabel(new Date(2026, 9, 21)))
    await typeInto(tree, 'Horário', '2000')
    await pressButton(tree, 'Enviar proposta')
    expect(callsTo('POST', '/matches/1/terms')).toHaveLength(1)
    // A partida continua agendada, com as condições antigas valendo e a nova esperando o aceite do outro lado.
    const text = allText(tree)
    expect(text).toContain('Nova proposta')
    expect(text).toContain('Continua valendo:')
    expect(text).toContain('Ferrugem FC aceitou')
    expect(text).toContain('Leões do Cerrado falta aceitar')
    expect(text).toContain('Aguardando Leões aceitar a proposta.')
    expect(text).toContain('Agendada')
    expect(findButton(tree, 'Aceitar condições')).toBeUndefined()
  })

  it('o membro não aceita nem propõe: "Só os representantes aceitam"', async () => {
    const { tree } = await mountMatch(matchRoutes(matchDetail({ my_role: 'membro', permissions: memberPermissions, terms: { current: null, pending: terms() } })))
    expect(allText(tree)).toContain('Só os representantes aceitam. Combinem as condições no chat.')
    expect(allText(tree)).toContain('Proposta de Leões do Cerrado')
    for (const title of ['Aceitar condições', 'Propor outra', 'Propor condições', 'Cancelar partida', 'Ajustar vagas para avulsos']) expect(findButton(tree, title)).toBeUndefined()
    // O membro conversa: o campo do chat existe, sem o atalho de propor.
    expect(hasField(tree, 'Mensagem')).toBe(true)
    expect(findButton(tree, 'Propor dia, horário e quadra')).toBeUndefined()
  })

  it('agendada, o membro vê "Só os representantes alteram a partida" ao abrir o cartão', async () => {
    const { tree } = await mountMatch(matchRoutes(scheduled(72, { my_role: 'membro', permissions: memberPermissions })))
    await openCard(tree)
    expect(allText(tree)).toContain('Só os representantes alteram a partida.')
    expect(findButton(tree, 'Alterar')).toBeUndefined()
  })

  it('a administração só lê: sem ações e sem campo de mensagem', async () => {
    const { tree } = await mountMatch(matchRoutes(matchDetail({ my_role: 'administracao', my_side: null, permissions: { ...noPermissions, read_chat: true } })))
    expect(allText(tree)).toContain('A administração só lê o chat.')
    expect(hasField(tree, 'Mensagem')).toBe(false)
    expect(findButton(tree, 'Propor condições')).toBeUndefined()
  })
})

describe('reserva', () => {
  const booking = (state: 'a_confirmar' | 'confirmada', side: 'a' | 'b') => {
    const base = scheduled(72, { booking: { side, state, confirmed_at: state === 'confirmada' ? fromNow(-2) : null }, permissions: { ...arranging, confirm_booking: side === 'a', cancel: true } })
    base.terms.current = { ...base.terms.current!, booking_side: side }
    return base
  }

  it('quem reserva confirma com o interruptor e a reserva volta a "a confirmar"', async () => {
    const base = booking('a_confirmar', 'a')
    const confirmedBooking = { ...base, booking: { side: 'a' as const, state: 'confirmada' as const, confirmed_at: fromNow(0) } }
    const { tree, refreshPlayBoard } = await mountMatch(matchRoutes(base, { 'PUT /matches/1/booking': confirmedBooking }))
    await openCard(tree)
    expect(allText(tree)).toContain('Reserva: Ferrugem FC')
    expect(allText(tree)).toContain('a confirmar com o local')
    const toggle = findButton(tree, 'Reserva confirmada')!
    expect(toggle.props.accessibilityRole).toBe('switch')
    expect(toggle.props.accessibilityState.checked).toBe(false)
    await pressButton(tree, 'Reserva confirmada')
    expect(bodyOf('PUT', '/matches/1/booking')).toEqual({ confirmed: true })
    expect(toastText()).toContain('Reserva confirmada.')
    expect(findButton(tree, 'Reserva confirmada')!.props.accessibilityState.checked).toBe(true)
    expect(allText(tree)).toContain('confirmada com o local')
    // A reserva não muda a placa do Jogar.
    expect(refreshPlayBoard).not.toHaveBeenCalled()
  })

  it('desfazer a confirmação marca a reserva como a confirmar', async () => {
    const base = booking('confirmada', 'a')
    const { tree } = await mountMatch(matchRoutes(base, { 'PUT /matches/1/booking': booking('a_confirmar', 'a') }))
    await openCard(tree)
    await pressButton(tree, 'Reserva confirmada')
    expect(bodyOf('PUT', '/matches/1/booking')).toEqual({ confirmed: false })
    expect(toastText()).toContain('Reserva marcada como a confirmar.')
  })

  it('quando o adversário reserva, mostra só o estado, sem o interruptor', async () => {
    const { tree } = await mountMatch(matchRoutes(booking('confirmada', 'b')))
    await openCard(tree)
    expect(allText(tree)).toContain('Reserva: Leões do Cerrado')
    expect(allText(tree)).toContain('confirmada com o local')
    expect(tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'switch')).toHaveLength(0)
  })

  it('o erro do servidor aparece como toast', async () => {
    const { tree } = await mountMatch(matchRoutes(booking('a_confirmar', 'a'), { 'PUT /matches/1/booking': new ApiError('A reserva só muda com a partida agendada e antes do início.', 409) }))
    await openCard(tree)
    await pressButton(tree, 'Reserva confirmada')
    expect(toastText()).toContain('A reserva só muda com a partida agendada e antes do início.')
    expect(findButton(tree, 'Reserva confirmada')!.props.accessibilityState.checked).toBe(false)
  })
})

describe('cancelamento', () => {
  it('cancela antes de 24 h, com motivo opcional: a partida fica cancelada, o chat só leitura e a placa é relida', async () => {
    const base = scheduled(72)
    const cancelled = matchDetail({
      ...base, state: 'cancelada', phase: 'cancelada', permissions: { ...noPermissions, read_chat: true },
      cancellation: { at: fromNow(0), by: ricardo, reason: 'A quadra caiu para manutenção.' },
    })
    const { tree, refreshPlayBoard } = await mountMatch(matchRoutes(base, { 'POST /matches/1/cancel': cancelled }))
    await openCard(tree)
    expect(allText(tree)).toContain('Dá para cancelar até')
    await pressButton(tree, 'Cancelar partida')
    expect(allText(tree)).toContain('Os dois elencos e os avulsos escalados são avisados.')
    await typeInto(tree, 'Motivo (opcional)', '  A quadra caiu para manutenção.  ')
    await pressButton(tree, 'Confirmar cancelamento')
    expect(bodyOf('POST', '/matches/1/cancel')).toEqual({ reason: 'A quadra caiu para manutenção.' })
    const text = allText(tree)
    expect(toastText()).toContain('Partida cancelada. Os dois lados foram avisados.')
    expect(text).toContain('Cancelada')
    expect(text).toContain('Ricardo Moura cancelou a partida. Motivo: A quadra caiu para manutenção.')
    expect(text).toContain('O chat desta partida está fechado.')
    expect(hasField(tree, 'Motivo (opcional)')).toBe(false)
    expect(refreshPlayBoard).toHaveBeenCalledOnce()
  })

  it('o motivo é opcional: sem texto, envia reason nulo', async () => {
    const { tree } = await mountMatch(matchRoutes(matchDetail(), { 'POST /matches/1/cancel': matchDetail({ state: 'cancelada', phase: 'cancelada', permissions: noPermissions, cancellation: { at: fromNow(0), by: ricardo, reason: null } }) }))
    await pressButton(tree, 'Cancelar partida')
    expect(allText(tree)).toContain('A partida combinada é encerrada e os dois lados são avisados.')
    await pressButton(tree, 'Confirmar cancelamento')
    expect(bodyOf('POST', '/matches/1/cancel')).toEqual({ reason: null })
  })

  it('o erro do servidor aparece na folha, que continua aberta, e a placa não é relida', async () => {
    const { tree, refreshPlayBoard } = await mountMatch(matchRoutes(scheduled(72), { 'POST /matches/1/cancel': new ApiError('Faltam menos de 24 h para a partida. Quem não comparecer perde por W.O.', 409) }))
    await openCard(tree)
    await pressButton(tree, 'Cancelar partida')
    await pressButton(tree, 'Confirmar cancelamento')
    expect(allText(tree)).toContain('Faltam menos de 24 h para a partida.')
    expect(hasField(tree, 'Motivo (opcional)')).toBe(true)
    expect(refreshPlayBoard).not.toHaveBeenCalled()
  })

  it('com menos de 24 h para a partida não há botão de cancelar e o aviso explica o W.O.', async () => {
    const { tree } = await mountMatch(matchRoutes(scheduled(10)))
    await openCard(tree)
    expect(allText(tree)).toContain('Faltam menos de 24 h: não dá mais para cancelar. Quem não comparecer perde por W.O.')
    expect(findButton(tree, 'Cancelar partida')).toBeUndefined()
  })
})

describe('W.O.', () => {
  /** Partida que começou há 2 h, com o placar ainda aguardando. */
  const started = (overrides: Partial<ReturnType<typeof scheduled>> = {}) => scheduled(-2, {
    result: resultOf(), phase: 'informar_resultado', result_deadline: fromNow(46), cancel_until: fromNow(-26),
    permissions: { ...noPermissions, read_chat: true, write_chat: true, report_result: true, register_walkover: true }, ...overrides,
  })

  it('registra o W.O. depois do horário: confirma, grava e o estado aparece no cartão de resultado', async () => {
    const registered = started({
      walkover: walkover(), phase: 'wo_registrado', result: resultOf({ state: 'wo_registrado' }),
      permissions: { ...noPermissions, read_chat: true, write_chat: true, withdraw_walkover: true },
    })
    const { tree, refreshPlayBoard } = await mountMatch(matchRoutes(started(), { 'POST /matches/1/walkover': registered }))
    await openCard(tree)
    expect(allText(tree)).toContain('Leões do Cerrado não compareceu? Registre o W.O. até')
    await pressButton(tree, 'Registrar W.O.')
    expect(allText(tree)).toContain('3 × 0')
    expect(allText(tree)).toContain('Registre só se Leões do Cerrado não compareceu.')
    await pressButton(tree, 'Registrar W.O.')
    expect(bodyOf('POST', '/matches/1/walkover')).toEqual({})
    const text = allText(tree)
    expect(toastText()).toContain('W.O. registrado. O outro lado pode contestar até o fim do prazo.')
    // O estado do W.O. fica no cartão de resultado; os botões, no de condições.
    expect(text).toContain('W.O. registrado contra Leões do Cerrado')
    expect(findButton(tree, 'Registrar W.O.')).toBeUndefined()
    expect(findButton(tree, 'Retirar W.O.')).toBeTruthy()
    expect(refreshPlayBoard).toHaveBeenCalledOnce()
  })

  it('no tênis o W.O. vale 6-0 6-0', async () => {
    const tennis = started({ sport: 'tenis', format: null, my_role: 'atleta' })
    const { tree } = await mountMatch(matchRoutes(tennis))
    await openCard(tree)
    await pressButton(tree, 'Registrar W.O.')
    expect(allText(tree)).toContain('6-0 6-0')
  })

  it('retira o W.O. registrado pelo meu lado e relê a partida', async () => {
    let reads = 0
    const withWalkover = started({ walkover: walkover(), phase: 'wo_registrado', result: resultOf({ state: 'wo_registrado' }), permissions: { ...noPermissions, read_chat: true, write_chat: true, withdraw_walkover: true } })
    const { tree } = await mountMatch(matchRoutes(withWalkover, { '/matches/1': () => (++reads === 1 ? withWalkover : started()), 'DELETE /matches/1/walkover': undefined }))
    // Com W.O. registrado o cartão de condições já abre.
    expect(allText(tree)).toContain('W.O. registrado contra Leões do Cerrado')
    await pressButton(tree, 'Retirar W.O.')
    expect(allText(tree)).toContain('O W.O. deixa de valer e a partida volta a aguardar o placar dos dois lados.')
    await pressButton(tree, 'Retirar W.O.')
    expect(callsTo('DELETE', '/matches/1/walkover')).toHaveLength(1)
    expect(toastText()).toContain('W.O. retirado. A partida volta a aguardar o placar.')
    expect(allText(tree)).not.toContain('W.O. registrado contra Leões do Cerrado')
  })

  it('o lado ausente contesta com motivo de 5 a 500 caracteres; a administração decide', async () => {
    const asAbsent = started({
      my_side: 'b', sides: sides({ is_mine: false }, { is_mine: true }), walkover: walkover({ registered_by: caio, absent_side: 'b' }), phase: 'wo_registrado',
      result: resultOf({ state: 'wo_registrado' }), permissions: { ...noPermissions, read_chat: true, write_chat: true, contest_walkover: true }, needs_my_action: true,
    })
    const contested = {
      ...asAbsent, phase: 'wo_contestado' as const, result: resultOf({ state: 'wo_contestado' }),
      walkover: walkover({ absent_side: 'b', registered_by: caio, contested_by: ricardo, contested_at: fromNow(0), contest_reason: 'Estávamos na quadra.' }),
      permissions: { ...noPermissions, read_chat: true, write_chat: true },
    }
    const { tree } = await mountMatch(matchRoutes(asAbsent, { 'POST /matches/1/walkover/contest': contested }))
    await pressButton(tree, 'Contestar W.O.')
    expect(allText(tree)).toContain('Caio Ramos registrou que o seu lado não compareceu.')
    await typeInto(tree, 'O que aconteceu?', 'Não')
    await pressButton(tree, 'Contestar W.O.')
    expect(allText(tree)).toContain('Conte o que aconteceu.')
    expect(callsTo('POST', '/matches/1/walkover/contest')).toHaveLength(0)
    await typeInto(tree, 'O que aconteceu?', 'Não Estávamos na quadra.')
    await pressButton(tree, 'Contestar W.O.')
    expect(bodyOf('POST', '/matches/1/walkover/contest')).toEqual({ reason: 'Não Estávamos na quadra.' })
    expect(toastText()).toContain('Contestação enviada à administração.')
    expect(allText(tree)).toContain('W.O. contestado')
    expect(allText(tree)).toContain('A administração decide; até lá a partida fica sem resultado.')
    expect(findButton(tree, 'Contestar W.O.')).toBeUndefined()
  })

  it('mostra a decisão da administração sobre o W.O.', async () => {
    const { tree } = await mountMatch(matchRoutes(started({
      state: 'encerrada', phase: 'encerrada', permissions: { ...noPermissions, read_chat: true },
      result: resultOf({ state: 'confirmado', source: 'administracao', final: score(3, 0), decision_reason: 'Sem provas de presença.' }),
      walkover: walkover({ contested_by: caio, contested_at: fromNow(-3), contest_reason: 'Estávamos lá.', decision: 'mantido', decision_reason: 'Sem provas de presença.' }),
    })))
    expect(allText(tree)).toContain('Placar confirmado · 3 × 0')
    expect(allText(tree)).toContain('A administração decidiu o resultado. Sem provas de presença.')
  })

  it('o erro do servidor ao registrar fica na folha', async () => {
    const { tree } = await mountMatch(matchRoutes(started(), { 'POST /matches/1/walkover': new ApiError('O outro lado já informou o placar. Informe o seu ou converse no chat.', 409) }))
    await openCard(tree)
    await pressButton(tree, 'Registrar W.O.')
    await pressButton(tree, 'Registrar W.O.')
    expect(allText(tree)).toContain('O outro lado já informou o placar.')
  })
})

describe('partida de campeonato', () => {
  const eventRef = { id: 5, name: 'Copa Sudoeste Society' }
  const organizerPermissions = { ...noPermissions, read_chat: true, write_chat: true }
  /** Partida de campeonato combinando, vista por um representante (lado A): sem data, sem condições e sem propostas. */
  const championship = (overrides: Parameters<typeof matchDetail>[0] = {}) => matchDetail({
    origin: 'campeonato', event: eventRef, round_number: 1, permissions: { ...noPermissions, read_chat: true, write_chat: true }, ...overrides,
  })
  /** A mesma partida vista pelo organizador (sem lado). */
  const asOrganizer = (overrides: Parameters<typeof matchDetail>[0] = {}) => championship({
    my_side: null, my_role: 'organizador', sides: sides({ is_mine: false }, { is_mine: false }), permissions: organizerPermissions, ...overrides,
  })
  const forbidden = ['Propor outra', 'Propor condições', 'Alterar', 'Aceitar condições', 'Cancelar partida', 'Registrar W.O.', 'Ajustar vagas para avulsos']

  it('sem data: o organizador ainda vai definir; nada de propor, aceitar, reserva ou cancelar', async () => {
    const { tree } = await mountMatch(matchRoutes(championship()))
    const text = allText(tree)
    expect(findByPrefix(tree, 'Data e quadra')!.props.accessibilityState.expanded).toBe(true)
    expect(text).toContain('O organizador ainda vai definir data, horário e quadra. Você é avisado quando estiver agendada.')
    expect(text).toContain('Copa Sudoeste Society · fase 1')
    expect(text).toContain('Data, horário e quadra são do organizador. A reserva é com o local; o Arena só registra.')
    for (const title of forbidden) expect(findButton(tree, title)).toBeUndefined()
    expect(text).not.toContain('Reserva:')
    // Sem "Propor dia, horário e quadra" no campo do chat.
    expect(findButton(tree, 'Propor dia, horário e quadra')).toBeUndefined()
  })

  it('espera os jogos anteriores quando falta um lado', async () => {
    const { tree } = await mountMatch(matchRoutes(championship({ my_side: null, my_role: 'organizador', sides: sides({ is_mine: false }).slice(0, 1), permissions: organizerPermissions })))
    expect(allText(tree)).toContain('Esta partida espera o resultado dos jogos anteriores. O organizador agenda quando os dois lados estiverem definidos.')
  })

  it('agendada pelo organizador: mostra a data e a quadra do cartão, sem reserva nem aceite', async () => {
    const { tree } = await mountMatch(matchRoutes(championship({
      state: 'agendada', phase: 'agendada', starts_at: fromNow(72), court: court({ name: 'Quadra Central', address: 'SQSW 304' }), result_deadline: fromNow(120), terms: { current: null, pending: null }, booking: null,
    })))
    const trigger = findByPrefix(tree, 'Partida agendada')!
    expect(trigger.props.accessibilityState.expanded).toBe(false)
    expect(trigger.props.accessibilityLabel).toContain('Quadra Central')
    await pressPrefix(tree, 'Partida agendada')
    expect(allText(tree)).toContain('SQSW 304')
    for (const title of forbidden) expect(findButton(tree, title)).toBeUndefined()
    expect(allText(tree)).not.toContain('Reserva:')
  })

  it('quadra sugerida pelo organizador fica "em revisão" e vale só nesta partida', async () => {
    const { tree } = await mountMatch(matchRoutes(championship({ state: 'agendada', phase: 'agendada', starts_at: fromNow(48), result_deadline: fromNow(96), court: court({ name: 'Ginásio do Guará', state: 'em_revisao', provisional: true }) })))
    await pressPrefix(tree, 'Partida agendada')
    expect(allText(tree)).toContain('Sugestão em revisão')
    expect(allText(tree)).toContain('vale só para esta partida')
  })

  it('partida cancelada pelo evento mostra o motivo e esconde o texto do organizador', async () => {
    const { tree } = await mountMatch(matchRoutes(championship({ state: 'cancelada', phase: 'cancelada', cancellation: { at: fromNow(-1), by: null, reason: 'Evento cancelado: quadra interditada.' } })))
    expect(allText(tree)).toContain('Partida cancelada')
    expect(allText(tree)).toContain('Motivo: Evento cancelado: quadra interditada.')
    expect(allText(tree)).not.toContain('ainda vai definir')
  })

  it('o placar divergente avisa que o organizador decide, e não que a partida fica sem resultado', async () => {
    const { tree } = await mountMatch(matchRoutes(championship({
      state: 'agendada', phase: 'divergente', starts_at: fromNow(-3), result_deadline: fromNow(45), court: court(),
      permissions: { ...noPermissions, read_chat: true, write_chat: true, report_result: true },
      result: resultOf({ state: 'divergente', deadline: fromNow(45), reports: { a: report('a', 2, 0), b: report('b', 1, 1) } }),
    })))
    expect(allText(tree)).toContain('o organizador decide se os placares seguirem diferentes.')
    expect(allText(tree)).not.toContain('não pontua')
  })

  it('"Agendar" (os dois lados, combinando) leva à agenda do evento com a partida', async () => {
    const { tree, navigation } = await mountMatch(matchRoutes(asOrganizer({ permissions: { ...organizerPermissions, schedule_match: true } })))
    await pressButton(tree, 'Agendar')
    expect(navigation.go).toHaveBeenCalledWith('event-matches', { eventId: 5, matchId: 1 })
    expect(findButton(tree, 'Decidir resultado')).toBeUndefined()
  })

  it('agendada antes do início: "Reagendar"; depois do início: "Decidir resultado" leva à decisão', async () => {
    const decide = asOrganizer({
      state: 'agendada', phase: 'informar_resultado', starts_at: fromNow(-2), court: court(), result_deadline: fromNow(46),
      result: resultOf({ deadline: fromNow(46) }), permissions: { ...organizerPermissions, decide_result: true },
    })
    const first = await mountMatch(matchRoutes(decide))
    await pressButton(first.tree, 'Decidir resultado')
    expect(first.navigation.go).toHaveBeenCalledWith('result-decision', { matchId: 1 })
    expect(findButton(first.tree, 'Agendar')).toBeUndefined()
    await unmountAll()

    const before = await mountMatch(matchRoutes(asOrganizer({ state: 'agendada', phase: 'agendada', starts_at: fromNow(30), court: court(), result_deadline: fromNow(78), permissions: { ...organizerPermissions, schedule_match: true } })))
    await pressPrefix(before.tree, 'Partida agendada')
    await pressButton(before.tree, 'Reagendar')
    expect(before.navigation.go).toHaveBeenCalledWith('event-matches', { eventId: 5, matchId: 1 })
  })

  it('sem permissão de agendar nem de decidir, não há botões do organizador', async () => {
    const { tree } = await mountMatch(matchRoutes(asOrganizer()))
    expect(findButton(tree, 'Agendar')).toBeUndefined()
    expect(findButton(tree, 'Reagendar')).toBeUndefined()
    expect(findButton(tree, 'Decidir resultado')).toBeUndefined()
  })

  it('os elencos de uma partida de campeonato não agendam nem decidem, mesmo vendo o cartão', async () => {
    const { tree } = await mountMatch(matchRoutes(championship({ my_role: 'representante' })))
    for (const title of ['Agendar', 'Reagendar', 'Decidir resultado', ...forbidden]) expect(findButton(tree, title)).toBeUndefined()
  })
})

describe('resultado: cartão dentro da tela da partida', () => {
  it('antes do início, a tela não desenha o cartão do resultado', async () => {
    const { tree } = await mountMatch(matchRoutes(scheduled(72)))
    expect(byId(tree, 'match-result')).toHaveLength(0)
  })

  it('combinando (sem resultado nem agendamento), o cartão não aparece', async () => {
    const { tree } = await mountMatch(matchRoutes(matchDetail()))
    expect(byId(tree, 'match-result')).toHaveLength(0)
  })

  it('depois do início, quem age pelo lado informa o placar na própria tela; o cartão continua montado ao trocar o detalhe', async () => {
    const waiting = scheduled(-1, { result: resultOf(), phase: 'informar_resultado', permissions: { ...arranging, report_result: true } })
    const sent = { ...waiting, result: resultOf({ reports: { a: report('a', 3, 1), b: { ...report('b', 0, 0), score: null } } }) }
    const { tree } = await mountMatch(matchRoutes(waiting, { '/matches/1/stats': { items: [] }, 'PUT /matches/1/result': sent }))
    expect(allText(tree)).toContain('Informe o placar')
    const goals = (label: string) => labelled(tree, label).find(node => node.props.testID === 'stepper')
    for (let index = 0; index < 3; index++) await act(async () => { goals('Gols do Ferrugem FC')!.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }) })
    await act(async () => { goals('Gols do Leões do Cerrado')!.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }) })
    await pressButton(tree, 'Enviar placar')
    expect(bodyOf('PUT', '/matches/1/result')).toEqual({ goals_a: 3, goals_b: 1 })
    expect(toasts().map(item => item.tone)).toEqual(['success'])
    expect(toastText()).toContain('Placar enviado. Falta o outro lado.')
    expect(allText(tree)).toContain('Aguardando')
  })

  it('confirmado: o placar do meu ponto de vista, a origem e os pontos', async () => {
    const { tree } = await mountMatch(matchRoutes(scheduled(-3, { state: 'realizada', phase: 'confirmado', result: confirmed(3, 1, 3), permissions: { ...noPermissions, read_chat: true, write_chat: true } })))
    expect(allText(tree)).toContain('Placar confirmado · 3 × 1')
    expect(allText(tree)).toContain('+3 pts')
  })

  it('decidido pelo organizador: mostra quem decidiu e a justificativa', async () => {
    const { tree } = await mountMatch(matchRoutes(scheduled(-3, {
      origin: 'campeonato', event: { id: 5, name: 'Copa' }, state: 'encerrada', phase: 'encerrada',
      result: confirmed(2, 1, null, { source: 'organizador', decision_reason: 'Vídeo do jogo conferido.' }), permissions: { ...noPermissions, read_chat: true },
    })))
    expect(allText(tree)).toContain('O organizador decidiu o resultado. Vídeo do jogo conferido.')
  })

  it('divergente num amistoso: avisa o prazo para corrigir e "Conversar" leva o foco ao campo do chat', async () => {
    const detail = scheduled(-3, {
      phase: 'divergente', result: resultOf({ state: 'divergente', reports: { a: report('a', 2, 0), b: report('b', 1, 1) } }),
      permissions: { ...noPermissions, read_chat: true, write_chat: true, report_result: true },
    })
    const focus = vi.fn()
    const { tree } = await mountMatch(matchRoutes(detail), { nodes: type => (type === 'TextInput' ? { focus } : null) })
    expect(allText(tree)).toContain('Placares diferentes')
    expect(allText(tree)).toContain('Sem acordo até')
    expect(focus).not.toHaveBeenCalled()
    await pressButton(tree, 'Conversar')
    expect(focus).toHaveBeenCalledOnce()
  })

  it('sem resultado e W.O. contestado: o texto honesto de cada estado', async () => {
    const none = await mountMatch(matchRoutes(scheduled(-60, { state: 'sem_resultado', phase: 'sem_resultado', result: resultOf({ state: 'sem_resultado' }), permissions: { ...noPermissions, read_chat: true } })))
    expect(allText(none.tree)).toContain('Partida sem resultado')
    expect(allText(none.tree)).toContain('A partida não pontua.')
    await unmountAll()
    const contested = await mountMatch(matchRoutes(scheduled(-5, { phase: 'wo_contestado', result: resultOf({ state: 'wo_contestado' }), walkover: walkover({ contested_by: caio }) })))
    expect(allText(contested.tree)).toContain('A administração decide; até lá a partida fica sem resultado.')
  })

  it('mudança de fase lida do detalhe relê a placa do Jogar (diferença entre a leitura nova e a anterior)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    let reads = 0
    const agreed = matchDetail({ terms: { current: null, pending: terms({ proposed_by_side: 'a', proposed_by: ricardo, accepted_a_at: fromNow(-1), accepted_b_at: null }) } })
    const { tree, refreshPlayBoard } = await mountMatch(matchRoutes(agreed, {
      '/matches/1': () => (++reads === 1 ? agreed : scheduled(72)),
      '/matches/1/messages': { items: [{ id: 1, kind: 'texto', event_type: null, body: 'Oi', removed: false, author: caio, side: 'b', author_role: 'representante', is_mine: false, payload: null, created_at: fromNow(-1) }], has_more: false, last_id: 1 },
      '/matches/1/messages?after=1': {
        items: [{ id: 2, kind: 'evento', event_type: 'partida_agendada', body: 'Partida agendada na quadra Arena Sudoeste.', removed: false, author: null, side: 'b', author_role: null, is_mine: false, payload: null, created_at: fromNow(0) }],
        has_more: false, last_id: 2,
      },
      '/matches/1/messages?after=2': { items: [], has_more: false, last_id: 2 },
    }), { fake: true })
    expect(allText(tree)).toContain('Aguardando Leões aceitar a proposta.')
    await act(async () => { await vi.advanceTimersByTimeAsync(4100) })
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    expect(allText(tree)).toContain('Agendada')
    expect(callsTo('GET', '/matches/1')).toHaveLength(2)
    expect(refreshPlayBoard).toHaveBeenCalledOnce()
  })
})

describe('tênis', () => {
  it('lados por atleta: a proposta e a reserva usam o nome do atleta adversário', async () => {
    const rival = person(9, 'Beatriz Lima')
    const tennis = matchDetail({
      sport: 'tenis', format: null, my_role: 'atleta',
      sides: [athleteSide('a', ricardo, { is_mine: true, accepted_at: fromNow(-1) }), athleteSide('b', rival, { accepted_at: fromNow(-1) })],
      terms: { current: null, pending: terms({ proposed_by: rival, proposed_by_side: 'b', accepted_b_at: fromNow(-1) }) }, permissions: { ...arranging, accept_terms: true },
    })
    const { tree } = await mountMatch(matchRoutes(tennis))
    expect(allText(tree)).toContain('Proposta de Beatriz Lima')
    expect(allText(tree)).toContain('Reserva: Beatriz Lima')
  })
})
