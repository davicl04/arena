import React from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatChips } from '../src/components/play/formatChips'
import { formatOptions } from '../src/components/play/PlateChips'
import { plateButton, searchHint } from '../src/components/play/plateView'
import type { PlateButtonInput } from '../src/components/play/plateView'
import { RunArea } from '../src/components/play/RunArea'
import { SlotSteppers } from '../src/components/play/SlotSteppers'
import { emptySlots } from '../src/components/play/slots'
import { byLabel, enableAct, textOf } from './support/native'
import { proposal, search, slotOffer } from './support/play'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))

const h = React.createElement

/** Entrada do botão no caso comum: futebol com o time, perfil pronto, tudo carregado e nada em andamento. */
const base = (overrides: Partial<PlateButtonInput> = {}): PlateButtonInput => ({
  sport: 'futebol', mode: 'time', sportLabel: 'Futebol', profilesLoading: false, profilesFailed: false, hasProfile: true, timeMode: true,
  standingsLoaded: true, standingsLoading: false, hasTeam: true, boardLoaded: true, boardLoading: false, search: undefined,
  heldProposal: undefined, heldOffer: undefined, hint: 'Times de Brasília de qualquer nível', starting: false, ...overrides,
})

describe('searchHint: quem a busca encontra', () => {
  it('times, avulso por posição ou qualquer posição e tênis, com ou sem elos', () => {
    expect(searchHint('futebol', 'time', 'Brasília', 'qualquer', 'qualquer nível')).toBe('Times de Brasília de qualquer nível')
    expect(searchHint('futebol', 'time', 'Brasília', 'qualquer', 'Bronze, Prata ou Ouro')).toBe('Times de Brasília Bronze, Prata ou Ouro')
    expect(searchHint('futebol', 'avulso', 'Brasília', 'meio_campo', 'qualquer nível')).toBe('Vagas de meio de campo em partidas de Brasília')
    expect(searchHint('futebol', 'avulso', 'Brasília', 'goleiro', 'Prata ou Ouro')).toBe('Vagas de goleiro em partidas de Brasília (Prata ou Ouro)')
    expect(searchHint('futebol', 'avulso', 'Brasília', 'qualquer', 'qualquer nível')).toBe('Vagas em partidas de Brasília')
    expect(searchHint('tenis', 'time', 'Brasília', 'qualquer', 'qualquer nível')).toBe('Tenistas de Brasília de qualquer nível')
    expect(searchHint('tenis', 'time', 'Brasília', 'qualquer', 'Ouro')).toBe('Tenistas de Brasília Ouro')
  })
})

describe('plateButton: o estado do botão redondo', () => {
  it('carregando e falhando as modalidades, o botão fica parado e diz por quê', () => {
    expect(plateButton(base({ profilesLoading: true }))).toMatchObject({ action: null, note: 'Carregando suas modalidades…', label: 'Encontrar partida' })
    expect(plateButton(base({ profilesFailed: true }))).toMatchObject({ action: null, note: 'Não foi possível carregar suas modalidades.' })
  })

  it('sem perfil: PREPARAR, inclusive na corrida', () => {
    expect(plateButton(base({ hasProfile: false, sport: 'tenis', sportLabel: 'Tênis' }))).toMatchObject({
      verb: 'PREPARAR', action: 'prepare', label: 'Preparar perfil de Tênis',
      note: 'Prepare seu perfil de tênis: o Arena usa a sua cidade para encontrar partidas perto de você.',
    })
    expect(plateButton(base({ hasProfile: false, sport: 'corrida', sportLabel: 'Corrida' }))?.note).toContain('mostrar as provas perto de você')
  })

  it('sem time representado leva a Meus times; só o "Com meu time" pede time', () => {
    expect(plateButton(base({ hasTeam: false }))).toMatchObject({ verb: 'MEU TIME', action: 'teams' })
    expect(plateButton(base({ hasTeam: false, mode: 'avulso', timeMode: false }))).toMatchObject({ verb: 'ENCONTRAR', caption: 'vaga', action: 'start' })
    expect(plateButton(base({ hasTeam: false, standingsLoaded: false, standingsLoading: true }))).toMatchObject({ action: null, note: 'Carregando seus times…' })
  })

  it('a corrida com perfil não usa o botão', () => {
    expect(plateButton(base({ sport: 'corrida', sportLabel: 'Corrida', timeMode: false }))).toBeNull()
  })

  it('buscando: cancela quando pode, com o formato e as vagas na nota', () => {
    const active = search({ started_at: '2026-10-12T12:00:00Z' })
    expect(plateButton(base({ search: active }))).toMatchObject({
      verb: 'BUSCANDO', action: 'cancel', since: '2026-10-12T12:00:00Z',
      note: 'Times de Brasília de qualquer nível · Society. 2 vagas para avulsos: goleiro, atacante.',
    })
    expect(plateButton(base({ search: search({ can_cancel: false }) }))?.action).toBeNull()
    const direct = search({ kind: 'avulso', team: null, format: null, open_slots: null })
    expect(plateButton(base({ search: direct, mode: 'avulso', timeMode: false, hint: 'Vagas em partidas de Brasília' }))?.note).toBe('Vagas em partidas de Brasília.')
  })

  it('pareada: responde à proposta ou à oferta, ou espera o adversário', () => {
    const paired = search({ state: 'pareada', match_id: 50 })
    expect(plateButton(base({ search: paired, heldProposal: proposal() }))).toMatchObject({ verb: 'RESPONDER', caption: 'proposta', action: 'held' })
    expect(plateButton(base({ search: paired, heldOffer: slotOffer() }))).toMatchObject({ caption: 'oferta de vaga', label: 'Responder à oferta de vaga', action: 'held' })
    expect(plateButton(base({ search: paired, heldProposal: proposal({ can_respond: false }) }))).toMatchObject({ verb: 'AGUARDANDO', action: 'held' })
    expect(plateButton(base({ search: paired }))).toMatchObject({ verb: 'RESPONDER', action: null })
  })

  it('times ou placa que não chegaram deixam o botão parado', () => {
    expect(plateButton(base({ standingsLoaded: false, standingsLoading: true }))?.note).toBe('Carregando seus times…')
    expect(plateButton(base({ standingsLoaded: false }))?.note).toBe('Não foi possível carregar seus times. Tente novamente.')
    expect(plateButton(base({ boardLoaded: false, boardLoading: true }))?.note).toBe('Carregando a placa…')
    expect(plateButton(base({ boardLoaded: false }))?.note).toBe('Não foi possível carregar a placa do Jogar. Tente novamente.')
  })

  it('pronto: busca; iniciando, espera', () => {
    expect(plateButton(base())).toMatchObject({ verb: 'ENCONTRAR', caption: 'partida', label: 'Encontrar partida', action: 'start', note: 'Times de Brasília de qualquer nível.' })
    expect(plateButton(base({ starting: true }))).toMatchObject({ action: null, note: 'Iniciando a busca…' })
    expect(plateButton(base({ sport: 'tenis', timeMode: false }))).toMatchObject({ caption: 'partida', action: 'start' })
  })
})

describe('formatOptions, SlotSteppers e RunArea', () => {
  beforeEach(() => { enableAct() })
  afterEach(() => { vi.useRealTimers() })

  it('os formatos viram opções com o tamanho e o nome falado', () => {
    expect(formatOptions(formatChips)).toEqual([
      { value: 'futsal', label: 'Futsal', detail: '5×5', accessibilityLabel: 'Futsal 5 contra 5' },
      { value: 'society', label: 'Society', detail: '7×7', accessibilityLabel: 'Society 7 contra 7' },
      { value: 'campo', label: 'Campo', detail: '11×11', accessibilityLabel: 'Campo 11 contra 11' },
    ])
  })

  it('os contadores respeitam o formato: no futsal cabem 4 vagas, com no máximo 1 de goleiro', async () => {
    const onChange = vi.fn()
    let tree!: ReturnType<typeof create>
    await act(async () => { tree = create(h(SlotSteppers, { format: 'futsal', value: { goleiro: 1, defesa: 2, meio_campo: 0, atacante: 1 }, onChange, error: 'Erro do servidor.' })) })
    expect(textOf(tree)).toContain('4 de 4 vagas · no máximo 1 de goleiro')
    expect(textOf(tree)).toContain('Erro do servidor.')
    // Cheio: ninguém aumenta; diminuir libera.
    expect(byLabel(tree, 'Vagas de atacante')[0].props.accessibilityValue).toMatchObject({ now: 1, max: 1 })
    expect(byLabel(tree, 'Vagas de defesa')[0].props.accessibilityValue).toMatchObject({ now: 2, max: 2 })
    await act(async () => { byLabel(tree, 'Vagas de defesa')[0].props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }) })
    expect(onChange).toHaveBeenCalledWith({ goleiro: 1, defesa: 1, meio_campo: 0, atacante: 1 })
    await act(async () => { tree.unmount() })
    await act(async () => { tree = create(h(SlotSteppers, { format: 'campo', value: emptySlots, onChange, disabled: true })) })
    expect(textOf(tree)).toContain('0 de 10 vagas')
    expect(byLabel(tree, 'Vagas de meio de campo')[0].props.accessibilityState).toMatchObject({ disabled: true })
    await act(async () => { tree.unmount() })
  })

  it('a área da corrida: na placa, o registro; abaixo dela, "Suas marcas"', async () => {
    const bests = { items: [], loaded: true, loading: false, error: '', reload: vi.fn(), refresh: vi.fn(async () => undefined) }
    const props = { distance: 5 as const, onDistance: vi.fn(), bests: bests as never, navigation: { go: vi.fn() } as never, onExpired: vi.fn() }
    let tree!: ReturnType<typeof create>
    await act(async () => { tree = create(h(RunArea, { ...props, part: 'plate' })) })
    expect(byLabel(tree, 'Registrar corrida')).toHaveLength(1)
    expect(textOf(tree)).not.toContain('chega na próxima atualização')
    await act(async () => { tree.update(h(RunArea, { ...props, part: 'marks' })) })
    expect(textOf(tree)).toContain('Suas marcas')
    await act(async () => { tree.unmount() })
  })
})
