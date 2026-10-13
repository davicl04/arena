import React from 'react'
import * as SecureStore from 'expo-secure-store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { RankingCategory } from '../src/api/results'
import LegendsScreen, { legendsRule } from '../src/screens/LegendsScreen'
import { enableAct } from './support/native'
import { allText, byId, callsTo, labelled, me, navigationMock, pressButton, render, serve } from './support/review'
import { playContext } from './support/play'
import { athleteRow, rankingPage, rankingRow, tierCounts } from './support/results'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))

const h = React.createElement
const TEAMS: RankingCategory = { sport: 'futebol', kind: 'time', format: 'society' }
const HALL = '/rankings?sport=futebol&kind=time&format=society&tier=lendario&limit=20'

beforeEach(() => {
  enableAct()
  vi.mocked(request).mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-token')
})

function mount(category: RankingCategory = TEAMS, onExpired = vi.fn()) {
  const navigation = navigationMock()
  return render(h(LegendsScreen as unknown as React.ComponentType<Record<string, unknown>>, {
    user: me, navigation, onExpired, params: { category }, title: 'Salão dos Lendários', ...playContext(),
  })).then(tree => ({ tree, navigation, onExpired }))
}
const legends = (n: number, mineAt = 0) => Array.from({ length: n }, (_, i) => rankingRow(i + 1, mineAt === i + 1 ? 'Ferrugem FC' : `Lendário ${i + 1}`, { tier: 'lendario', is_mine: mineAt === i + 1, metric_value: 90 - i }))

describe('Salão dos Lendários', () => {
  it('lê tier=lendario e mostra a categoria, a regra, as vagas, a lista numerada de 1 a N e o rodapé', async () => {
    serve({ [HALL]: rankingPage({ classified_count: 80, legend_slots: 12, tier_counts: tierCounts({ lendario: 3 }), items: legends(3, 2) }) })
    const { tree } = await mount()
    expect(callsTo('GET', HALL)).toHaveLength(1)
    const text = allText(tree)
    expect(text).toContain('SALÃO DOS LENDÁRIOS')
    expect(text).toContain('Futebol · Society 7×7 · Times')
    expect(text).toContain('Topo 12 (15% dos classificados) com os pontos de Diamante. 3 de 12 vagas ocupadas.')
    expect(text).toContain('Quem sai do topo 15% ou perde os pontos de Diamante volta ao Diamante no próximo cálculo.')
    const rows = byId(tree, 'ranking-row')
    expect(rows).toHaveLength(3)
    expect(rows.map(row => /Posição (\d+) no elo/.exec(String(row.props.accessibilityLabel))![1])).toEqual(['1', '2', '3'])
    expect(rows[1].props.accessibilityLabel).toMatch(/^Seu time\. Posição 2 no elo, Ferrugem FC/)
    expect(rows[1].props.accessibilityState.selected).toBe(false)
    expect(labelled(tree, 'Voltar')).toHaveLength(1)
    expect(labelled(tree, 'Notificações')).toHaveLength(0)
  })

  it('o voltar da subtela volta à tela de origem', async () => {
    serve({ [HALL]: rankingPage({ legend_slots: 1, tier_counts: tierCounts({ lendario: 1 }), items: legends(1) }) })
    const { tree, navigation } = await mount()
    await pressButton(tree, 'Voltar')
    expect(navigation.back).toHaveBeenCalled()
    expect(allText(tree)).toContain('Topo 1 (15% dos classificados) com os pontos de Diamante. 1 de 1 vaga ocupada.')
  })

  it('"Carregar mais" lê a próxima página pelo cursor; atleta abre o perfil', async () => {
    const TENIS = '/rankings?sport=tenis&tier=lendario&limit=20'
    serve({
      [TENIS]: rankingPage({ ranking: 'tenis', format: null, legend_slots: 3, tier_counts: tierCounts({ lendario: 3 }), items: [athleteRow(1, 31, 'Ana Souza', { tier: 'lendario' })], next_cursor: 'c1' }),
      [`${TENIS}&cursor=c1`]: rankingPage({ ranking: 'tenis', format: null, items: [athleteRow(2, 32, 'Beatriz Lima', { tier: 'lendario' })] }),
    })
    const { tree, navigation } = await mount({ sport: 'tenis' })
    await pressButton(tree, 'Carregar mais')
    expect(callsTo('GET', `${TENIS}&cursor=c1`)).toHaveLength(1)
    expect(byId(tree, 'ranking-row')).toHaveLength(2)
    await pressButton(tree, 'Abrir perfil de Beatriz Lima. Posição 2 no elo, Beatriz Lima, Últimos resultados: vitória, empate, derrota, vitória, vitória, 38 pontos')
    expect(navigation.go).toHaveBeenLastCalledWith('user-profile', { userId: 32 })
  })

  it('corrida: tempo e "melhor marca em dd/mm"; sem Lendários, o estado vazio explica as vagas', async () => {
    const RUN = '/rankings?sport=corrida&distance_km=5&tier=lendario&limit=20'
    serve({ [RUN]: rankingPage({ ranking: 'corrida_5', distance_km: 5, legend_slots: 1, tier_counts: tierCounts({ lendario: 1 }), items: [athleteRow(1, 5, 'Bia Rocha', { tier: 'lendario', metric_value: 1452, form: null, best_mark_on: '2026-09-03' })] }) })
    const { tree } = await mount({ sport: 'corrida', distance_km: 5 })
    expect(allText(tree)).toContain('Corrida · 5 km')
    expect(allText(tree)).toContain('24:12')
    expect(allText(tree)).toContain('melhor marca em 03/09')
    serve({ [HALL]: rankingPage({ legend_slots: 0, tier_counts: tierCounts(), items: [] }) })
    const empty = await mount()
    expect(byId(empty.tree, 'legends-empty')).toHaveLength(1)
    expect(allText(empty.tree)).toContain('Nenhum Lendário ainda')
    expect(allText(empty.tree)).toContain('Topo 15% com os pontos de Diamante.')
  })

  it('carregando, erro com "Tentar novamente" e 401', async () => {
    let fail = true
    serve({ [HALL]: () => (fail ? new ApiError('Não foi possível carregar o ranking.', 500) : rankingPage({ legend_slots: 1, tier_counts: tierCounts({ lendario: 1 }), items: legends(1) })) })
    const { tree } = await mount()
    expect(allText(tree)).toContain('Não foi possível carregar o ranking.')
    fail = false
    await pressButton(tree, 'Tentar novamente')
    expect(byId(tree, 'ranking-row')).toHaveLength(1)
    serve({ [HALL]: new ApiError('Sessão expirada', 401) })
    const expired = vi.fn()
    await mount(TEAMS, expired)
    expect(expired).toHaveBeenCalled()
  })

  it('falha ao carregar mais mostra o erro e mantém a lista', async () => {
    serve({ [HALL]: rankingPage({ legend_slots: 3, tier_counts: tierCounts({ lendario: 3 }), items: legends(1), next_cursor: 'c1' }), [`${HALL}&cursor=c1`]: new ApiError('Sem conexão com o servidor.', 0) })
    const { tree } = await mount()
    await pressButton(tree, 'Carregar mais')
    expect(allText(tree)).toContain('Sem conexão com o servidor.')
    expect(byId(tree, 'ranking-row')).toHaveLength(1)
  })

  it('a regra do elo conta as vagas no singular e no plural', () => {
    expect(legendsRule(0, 0)).toBe('Topo 15% com os pontos de Diamante.')
    expect(legendsRule(1, 1)).toBe('Topo 1 (15% dos classificados) com os pontos de Diamante. 1 de 1 vaga ocupada.')
    expect(legendsRule(12, 11)).toBe('Topo 12 (15% dos classificados) com os pontos de Diamante. 11 de 12 vagas ocupadas.')
  })
})
