import { act } from 'react-test-renderer'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import * as SecureStore from 'expo-secure-store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import { enableAct } from './support/native'
import { toastText } from './support/toast'
import { matchRoutes, mountMatch, unmountAll } from './support/match'
import { arranging, fromNow, marcos, matchDetail, memberPermissions, noPermissions, scheduled, sides, slot } from './support/play'
import { allText, bodyOf, byId, callsTo, findButton, pressButton, pressPrefix } from './support/review'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))

/*
 * Vagas para avulsos (representante): um contador por posição (no máximo um goleiro e o formato menos um) e a lista dos
 * avulsos escalados com "Remover", com confirmação. A tela obedece a `permissions.manage_slots`.
 */

beforeEach(() => {
  enableAct()
  vi.mocked(request).mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-token')
})
afterEach(unmountAll)

const withSlots = (overrides: Partial<ReturnType<typeof scheduled>> = {}) => scheduled(72, {
  slots: [
    slot(1, { position: 'goleiro' }), slot(2, { position: 'defesa', state: 'oferecida' }),
    slot(3, { position: 'atacante', state: 'preenchida', guest: marcos, filled_at: fromNow(-3) }),
    slot(4, { side: 'b', position: 'meio_campo' }),
  ],
  permissions: { ...arranging, cancel: true, manage_slots: true }, ...overrides,
})
const MESSAGES = '/matches/1/messages'
const open = async (tree: ReactTestRenderer) => {
  await pressPrefix(tree, 'Partida agendada')
  await pressButton(tree, 'Ajustar vagas para avulsos')
}
const stepper = (tree: ReactTestRenderer, position: string): ReactTestInstance => {
  const found = tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'adjustable' && node.props.accessibilityLabel === `Vagas de ${position}`)
  expect(found, `contador de ${position}`).toHaveLength(1)
  return found[0]
}
const count = (tree: ReactTestRenderer, position: string) => stepper(tree, position).props.accessibilityValue.now as number
const max = (tree: ReactTestRenderer, position: string) => stepper(tree, position).props.accessibilityValue.max as number
/** Muda o contador pelas ações de acessibilidade (deslizar para cima e para baixo), como o leitor de tela faz. */
const bump = (tree: ReactTestRenderer, position: string, action: 'increment' | 'decrement') =>
  act(async () => { stepper(tree, position).props.onAccessibilityAction({ nativeEvent: { actionName: action } }) })

describe('vagas para avulsos', () => {
  it('mostra o resumo no cartão e as vagas do meu lado nos contadores (abertas e reservadas)', async () => {
    const { tree } = await mountMatch(matchRoutes(withSlots()))
    await pressPrefix(tree, 'Partida agendada')
    // 3 abertas ou reservadas (as 2 de A e a de B) e 1 avulso escalado.
    expect(allText(tree)).toContain('3 vagas abertas · 1 avulso escalado · seu time: Marcos')
    await pressButton(tree, 'Ajustar vagas para avulsos')
    expect(allText(tree)).toContain('Ferrugem · Society 7×7 · até 6 vagas')
    expect(['Goleiro', 'Defesa', 'Meio de campo', 'Atacante'].map(position => count(tree, position))).toEqual([1, 1, 0, 0])
    expect(allText(tree)).toContain('3 de 6 vagas, contando 1 avulso escalado')
    expect(allText(tree)).toContain('1 vaga está reservada para avulsos que ainda vão responder.')
    expect(allText(tree)).toContain('Avulsos da cidade recebem a vaga por 2 h e entram só nesta partida.')
  })

  it('no máximo um goleiro e o total até o formato menos um', async () => {
    const { tree } = await mountMatch(matchRoutes(withSlots({ slots: [slot(3, { position: 'atacante', state: 'preenchida', guest: marcos })] })))
    await open(tree)
    expect(max(tree, 'Goleiro')).toBe(1)
    await bump(tree, 'Goleiro', 'increment')
    expect(count(tree, 'Goleiro')).toBe(1)
    await bump(tree, 'Goleiro', 'increment')
    expect(count(tree, 'Goleiro')).toBe(1)
    // Society: 7 jogadores, até 6 vagas contando o avulso escalado (1): sobram 5, um deles o goleiro.
    for (let step = 0; step < 6; step++) await bump(tree, 'Defesa', 'increment')
    expect(count(tree, 'Defesa')).toBe(4)
    expect(allText(tree)).toContain('6 de 6 vagas, contando 1 avulso escalado')
    expect(max(tree, 'Meio de campo')).toBe(0)
    await bump(tree, 'Meio de campo', 'increment')
    expect(count(tree, 'Meio de campo')).toBe(0)
    await bump(tree, 'Defesa', 'decrement')
    expect(max(tree, 'Meio de campo')).toBe(1)
  })

  it('o goleiro já escalado como avulso fecha a vaga de goleiro', async () => {
    const { tree } = await mountMatch(matchRoutes(withSlots({ slots: [slot(3, { position: 'goleiro', state: 'preenchida', guest: marcos })] })))
    await open(tree)
    expect(max(tree, 'Goleiro')).toBe(0)
    expect(max(tree, 'Defesa')).toBe(5)
  })

  it('salva as vagas do meu lado e mostra o resultado, sem reler a placa do Jogar', async () => {
    const saved = withSlots({ slots: [slot(1, { position: 'goleiro' }), slot(9, { position: 'defesa' }), slot(3, { position: 'atacante', state: 'preenchida', guest: marcos })] })
    const { tree, refreshPlayBoard } = await mountMatch(matchRoutes(withSlots(), { 'PUT /matches/1/slots': saved }))
    await open(tree)
    expect(findButton(tree, 'Salvar vagas')!.props.disabled).toBe(true)
    await bump(tree, 'Defesa', 'increment')
    await bump(tree, 'Goleiro', 'decrement')
    expect(findButton(tree, 'Salvar vagas')!.props.disabled).toBe(false)
    await pressButton(tree, 'Salvar vagas')
    expect(bodyOf('PUT', '/matches/1/slots')).toEqual({ open_slots: { goleiro: 0, defesa: 2, meio_campo: 0, atacante: 0 } })
    expect(toastText()).toContain('Vagas para avulsos atualizadas.')
    expect(findButton(tree, 'Salvar vagas')).toBeUndefined()
    expect(refreshPlayBoard).not.toHaveBeenCalled()
  })

  it('mostra o erro do servidor na folha sem fechar', async () => {
    const { tree } = await mountMatch(matchRoutes(withSlots(), { 'PUT /matches/1/slots': new ApiError('No máximo uma vaga de goleiro.', 422) }))
    await open(tree)
    await bump(tree, 'Meio de campo', 'increment')
    await pressButton(tree, 'Salvar vagas')
    expect(allText(tree)).toContain('No máximo uma vaga de goleiro.')
    expect(findButton(tree, 'Salvar vagas')).toBeTruthy()
  })

  it('lista os avulsos escalados e remove com confirmação: "Voltar" desiste, "Remover" tira e relê a partida', async () => {
    let reads = 0
    const after = withSlots({ slots: [slot(1, { position: 'goleiro' })] })
    const { tree } = await mountMatch(matchRoutes(withSlots(), { '/matches/1': () => (++reads === 1 ? withSlots() : after), 'DELETE /matches/1/guests/5': undefined, [MESSAGES]: { items: [], has_more: false, last_id: null } }))
    await open(tree)
    expect(byId(tree, 'guest-row')).toHaveLength(1)
    expect(allText(tree)).toContain('Marcos Ribeiro')
    expect(allText(tree)).toContain('Avulso · Atacante')
    await pressButton(tree, 'Remover Marcos Ribeiro da partida')
    expect(allText(tree)).toContain('Marcos Ribeiro sai da partida e deixa de ver o chat.')
    // "Voltar" da confirmação volta às vagas sem remover.
    await pressButton(tree, 'Voltar')
    expect(callsTo('DELETE', '/matches/1/guests/5')).toHaveLength(0)
    expect(findButton(tree, 'Salvar vagas')).toBeTruthy()
    await pressButton(tree, 'Remover Marcos Ribeiro da partida')
    await pressButton(tree, 'Remover')
    expect(callsTo('DELETE', '/matches/1/guests/5')).toHaveLength(1)
    expect(toastText()).toContain('Marcos Ribeiro saiu da partida.')
    expect(findButton(tree, 'Remover')).toBeUndefined()
    expect(callsTo('GET', '/matches/1')).toHaveLength(2)
  })

  it('o erro ao remover (depois do início, por exemplo) fica na confirmação', async () => {
    const { tree } = await mountMatch(matchRoutes(withSlots(), { 'DELETE /matches/1/guests/5': new ApiError('Depois do início, o avulso só fica de fora pela presença.', 409) }))
    await open(tree)
    await pressButton(tree, 'Remover Marcos Ribeiro da partida')
    await pressButton(tree, 'Remover')
    expect(allText(tree)).toContain('Depois do início, o avulso só fica de fora pela presença.')
    expect(findButton(tree, 'Remover')).toBeTruthy()
  })

  it('em "combinando" avisa que as vagas abrem quando a partida for agendada', async () => {
    const { tree } = await mountMatch(matchRoutes(matchDetail({ permissions: { ...arranging, manage_slots: true } })))
    expect(allText(tree)).toContain('Nenhuma vaga declarada · abrem para avulsos quando a partida for agendada')
    await pressButton(tree, 'Ajustar vagas para avulsos')
    expect(allText(tree)).toContain('As vagas abrem para avulsos quando a partida for agendada.')
    expect(allText(tree)).toContain('Nenhum avulso escalado no seu time.')
  })

  it('em "combinando" mostra as vagas declaradas na busca (declared_slots) e as ajusta', async () => {
    const declared = { goleiro: 1, defesa: 0, meio_campo: 0, atacante: 2 }
    const detail = matchDetail({ sides: sides({ declared_slots: declared }), permissions: { ...arranging, manage_slots: true } })
    const { tree } = await mountMatch(matchRoutes(detail, { 'PUT /matches/1/slots': detail }))
    expect(allText(tree)).toContain('3 vagas declaradas · abrem para avulsos quando a partida for agendada')
    await pressButton(tree, 'Ajustar vagas para avulsos')
    expect(count(tree, 'Goleiro')).toBe(1)
    expect(count(tree, 'Atacante')).toBe(2)
    await bump(tree, 'Defesa', 'increment')
    await pressButton(tree, 'Salvar vagas')
    expect(bodyOf('PUT', '/matches/1/slots')).toEqual({ open_slots: { goleiro: 1, defesa: 1, meio_campo: 0, atacante: 2 } })
  })

  it('sem permissão de ajustar, o cartão só resume as vagas', async () => {
    const { tree } = await mountMatch(matchRoutes(withSlots({ my_role: 'membro', permissions: memberPermissions })))
    await pressPrefix(tree, 'Partida agendada')
    expect(allText(tree)).toContain('3 vagas abertas · 1 avulso escalado')
    expect(findButton(tree, 'Ajustar vagas para avulsos')).toBeUndefined()
  })

  it('não há vagas em partida de tênis, de campeonato nem depois do início', async () => {
    const tennis = await mountMatch(matchRoutes(scheduled(72, { sport: 'tenis', format: null, my_role: 'atleta', permissions: { ...arranging, manage_slots: false } })))
    await pressPrefix(tennis.tree, 'Partida agendada')
    expect(allText(tennis.tree)).not.toContain('Vagas para avulsos')
    await unmountAll()
    const championship = await mountMatch(matchRoutes(withSlots({ origin: 'campeonato', event: { id: 5, name: 'Copa' }, permissions: { ...noPermissions, read_chat: true, write_chat: true, manage_slots: true } })))
    await pressPrefix(championship.tree, 'Partida agendada')
    expect(allText(championship.tree)).not.toContain('Vagas para avulsos')
    await unmountAll()
    const started = await mountMatch(matchRoutes(withSlots({ starts_at: fromNow(-1), phase: 'informar_resultado' })))
    await pressPrefix(started.tree, 'Partida agendada')
    expect(allText(started.tree)).not.toContain('Vagas para avulsos')
  })
})
