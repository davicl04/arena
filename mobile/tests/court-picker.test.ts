import React, { useState } from 'react'
import * as SecureStore from 'expo-secure-store'
import { act } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { CourtOut } from '../src/api/matches'
import { CourtPicker, DEFERRED_COURT_ID } from '../src/components/match/CourtPicker'
import type { CourtPickerMatch } from '../src/components/match/CourtPicker'
import { enableAct } from './support/native'
import { toasts } from './support/toast'
import { brasilia, court } from './support/play'
import { allText, bodyOf, callsTo, findButton, findByPrefix, flush, hasField, pressButton, pressPrefix, render, serve, typeInto } from './support/review'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))

/*
 * `CourtPicker` é a peça compartilhada da quadra: a folha "Propor condições" da partida e a agenda do campeonato (organizador)
 * usam o mesmo seletor. Estes testes o montam sozinho, com o recorte mínimo da partida que ele lê (`CourtPickerMatch`).
 */

const h = React.createElement
const trees: ReactTestRenderer[] = []
afterEach(async () => { for (const tree of trees.splice(0)) await act(async () => { tree.unmount() }) })
beforeEach(() => {
  enableAct()
  vi.mocked(request).mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-token')
})

const society: CourtPickerMatch = { id: 12, city: brasilia, sport: 'futebol', format: 'society' }
const COURTS = '/courts?city_id=5300108&kind=society&match_id=12'

/** O seletor com o estado da escolha numa tela mínima, como a folha que o usa: a quadra escolhida volta para ele. */
function Harness({ detail = society, canSuggest = true, deferSuggestion = false, onChosen, onExpired }: {
  detail?: CourtPickerMatch; canSuggest?: boolean; deferSuggestion?: boolean; onChosen: (court: CourtOut) => void; onExpired: () => void
}) {
  const [selected, setSelected] = useState<CourtOut | null>(null)
  return h(CourtPicker, { detail, selected, canSuggest, deferSuggestion, onExpired, onSelect: (next: CourtOut) => { setSelected(next); onChosen(next) } })
}
async function mount(props: Partial<React.ComponentProps<typeof Harness>> = {}) {
  const onChosen = vi.fn()
  const onExpired = vi.fn()
  const tree = await render(h(Harness, { onChosen, onExpired, ...props }))
  trees.push(tree)
  return { tree, onChosen, onExpired }
}

describe('CourtPicker: catálogo e escolha', () => {
  it('lista as quadras da cidade (o tipo da partida) e devolve a escolhida; a escolhida fica marcada e no topo', async () => {
    serve({ [COURTS]: { items: [court(), court({ id: 8, name: 'Quadra do Lago', address: null })] } })
    const { tree, onChosen } = await mount()
    expect(allText(tree)).toContain('Quadra em Brasília')
    expect(allText(tree)).toContain('SQSW 304, Bloco B')
    expect(allText(tree)).toContain('Sem endereço informado')
    await pressPrefix(tree, 'Quadra do Lago')
    expect(onChosen).toHaveBeenCalledWith(expect.objectContaining({ id: 8, name: 'Quadra do Lago' }))
    expect(findByPrefix(tree, 'Quadra do Lago')!.props.accessibilityState.checked).toBe(true)
    expect(findByPrefix(tree, 'Arena Sudoeste')!.props.accessibilityState.checked).toBe(false)
  })

  it('no tênis a busca é pelo tipo "tenis", sem formato', async () => {
    serve({ '/courts?city_id=5300108&kind=tenis&match_id=3': { items: [court({ kind: 'tenis', name: 'Clube de Tênis' })] } })
    const { tree } = await mount({ detail: { id: 3, city: brasilia, sport: 'tenis', format: null } })
    expect(findByPrefix(tree, 'Clube de Tênis')).toBeTruthy()
  })

  it('catálogo vazio convida a sugerir, e sem permissão de sugerir não convida', async () => {
    serve({ [COURTS]: { items: [] } })
    const withSuggestion = await mount()
    expect(allText(withSuggestion.tree)).toContain('Ainda não há quadras publicadas em Brasília. Sugira a quadra onde vocês vão jogar.')
    expect(findButton(withSuggestion.tree, 'Sugerir outra quadra')).toBeTruthy()
    const without = await mount({ canSuggest: false })
    expect(allText(without.tree)).toContain('Ainda não há quadras publicadas em Brasília.')
    expect(findButton(without.tree, 'Sugerir outra quadra')).toBeUndefined()
  })

  it('o erro do catálogo aparece e o 401 volta ao login', async () => {
    serve({ [COURTS]: new ApiError('Sessão expirada.', 401) })
    const { tree, onExpired } = await mount()
    expect(onExpired).toHaveBeenCalledOnce()
    expect(allText(tree)).toContain('Sessão expirada.')
  })
})

describe('CourtPicker: sugerir quadra', () => {
  it('envia a sugestão à partida e seleciona a quadra devolvida, que fica em revisão', async () => {
    const suggested = court({ id: 9, name: 'Quadra Nova', address: null, state: 'em_revisao', provisional: true })
    serve({ [COURTS]: { items: [] }, 'POST /courts/suggestions': { court: suggested, existing: false } })
    const { tree, onChosen } = await mount()
    await pressButton(tree, 'Sugerir outra quadra')
    await typeInto(tree, 'Nome da quadra', '  Quadra Nova  ')
    await pressButton(tree, 'Sugerir quadra')
    expect(bodyOf('POST', '/courts/suggestions')).toEqual({ match_id: 12, name: 'Quadra Nova', address: null })
    expect(onChosen).toHaveBeenCalledWith(suggested)
    expect(toasts().map(item => [item.tone, item.title])).toEqual([['success', 'Quadra Nova foi sugerida: fica em revisão e vale só nesta partida.']])
    expect(hasField(tree, 'Nome da quadra')).toBe(false)
  })

  it('o erro do servidor sai em toast e o formulário continua aberto; o 401 volta ao login sem toast', async () => {
    serve({ [COURTS]: { items: [] }, 'POST /courts/suggestions': new ApiError('Esta partida já tem 3 sugestões de quadra em revisão.', 409) })
    const { tree } = await mount()
    await pressButton(tree, 'Sugerir outra quadra')
    await typeInto(tree, 'Nome da quadra', 'Quadra Nova')
    await pressButton(tree, 'Sugerir quadra')
    // 409 sem conflito de agenda: o recurso mudou, então é aviso; o formulário não perde o que foi digitado.
    expect(toasts().map(item => [item.tone, item.title])).toEqual([['warning', 'Esta partida já tem 3 sugestões de quadra em revisão.']])
    expect(hasField(tree, 'Nome da quadra')).toBe(true)
    serve({ [COURTS]: { items: [] }, 'POST /courts/suggestions': new ApiError('Sessão expirada.', 401) })
    const expired = await mount()
    await pressButton(expired.tree, 'Sugerir outra quadra')
    await typeInto(expired.tree, 'Nome da quadra', 'Quadra Nova')
    await pressButton(expired.tree, 'Sugerir quadra')
    expect(expired.onExpired).toHaveBeenCalledOnce()
    expect(toasts()).toHaveLength(1)
  })

  it('deferSuggestion (agenda do campeonato): não chama a API; devolve uma quadra provisória que segue no agendamento', async () => {
    serve({ [COURTS]: { items: [] } })
    const { tree, onChosen } = await mount({ deferSuggestion: true })
    await pressButton(tree, 'Sugerir outra quadra')
    await typeInto(tree, 'Nome da quadra', 'A')
    await pressButton(tree, 'Sugerir quadra')
    expect(allText(tree)).toContain('O nome da quadra precisa ter de 2 a 80 caracteres.')
    await typeInto(tree, 'Nome da quadra', 'Ginásio do Guará')
    await typeInto(tree, 'Endereço (opcional)', 'QE 12')
    await pressButton(tree, 'Sugerir quadra')
    expect(callsTo('POST', '/courts/suggestions')).toHaveLength(0)
    expect(onChosen).toHaveBeenCalledWith({ id: DEFERRED_COURT_ID, name: 'Ginásio do Guará', address: 'QE 12', kind: 'society', city: brasilia, state: 'em_revisao', provisional: true })
    expect(DEFERRED_COURT_ID).toBe(0)
    expect(toasts().map(item => [item.tone, item.title])).toEqual([['info', 'Ginásio do Guará será sugerida ao agendar: fica em revisão e vale só nesta partida.']])
    expect(findByPrefix(tree, 'Ginásio do Guará')!.props.accessibilityState.checked).toBe(true)
  })

  it('"Voltar" fecha o formulário sem enviar nada', async () => {
    serve({ [COURTS]: { items: [] } })
    const { tree } = await mount()
    await pressButton(tree, 'Sugerir outra quadra')
    await flush()
    await pressButton(tree, 'Voltar da sugestão de quadra')
    expect(hasField(tree, 'Nome da quadra')).toBe(false)
    expect(findButton(tree, 'Sugerir outra quadra')).toBeTruthy()
    expect(callsTo('POST', '/courts/suggestions')).toHaveLength(0)
  })
})
