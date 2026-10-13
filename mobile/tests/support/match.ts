import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { expect, vi } from 'vitest'
import type { Mock } from 'vitest'
import type { MatchDetail } from '../../src/api/matches'
import MatchScreen from '../../src/screens/MatchScreen'
import { findButton, flush, me, navigationMock, serve } from './review'
import type { Route } from './review'
import { messagePage, playContext } from './play'

/*
 * Auxiliares dos testes da tela da partida (P2 + C1): monta a `MatchScreen` com o servidor simulado do `request`, guarda as
 * árvores para desmontá-las no fim de cada teste (a leitura do chat e o relógio têm temporizadores) e dá as rotas-padrão da
 * partida 1. Os `vi.mock` (react-native, react-native-svg, expo-secure-store, `request`) ficam em cada arquivo de teste.
 */

const h = React.createElement
const trees: ReactTestRenderer[] = []

/** Rotas-padrão da partida 1: o detalhe e um chat vazio; `extra` acrescenta ou troca rotas. */
export const matchRoutes = (detail: MatchDetail, extra: Record<string, Route> = {}): Record<string, Route> => ({
  '/matches/1': detail, '/matches/1/messages': messagePage([]), ...extra,
})

export interface Mounted {
  tree: ReactTestRenderer
  navigation: ReturnType<typeof navigationMock>
  onExpired: Mock
  /** `refreshPlayBoard` do shell (espião). */
  refreshPlayBoard: Mock
}

/**
 * Monta a tela da partida `matchId`. Com `fake`, os temporizadores já estão simulados (`vi.useFakeTimers`): a montagem avança
 * o relógio em vez de esperar o `setTimeout` real. `nodes` devolve a instância simulada de cada elemento nativo (por exemplo,
 * `{ focus }` para o `TextInput` e `{ scrollToEnd }` para o `ScrollView`), que a árvore de testes não cria sozinha.
 */
export async function mountMatch(routes: Record<string, Route>, { matchId = 1, fake = false, nodes }: { matchId?: number; fake?: boolean; nodes?: (type: string) => object | null } = {}): Promise<Mounted> {
  serve(routes)
  const context = playContext()
  const navigation = navigationMock()
  const onExpired = vi.fn()
  let tree!: ReactTestRenderer
  await act(async () => {
    tree = create(h(MatchScreen, { user: me, navigation, onUser: vi.fn(), onLogout: vi.fn(), ...context, onExpired, params: { matchId }, title: 'Partida' }),
      nodes ? { createNodeMock: element => nodes(String(element.type)) } : undefined)
  })
  trees.push(tree)
  if (fake) await act(async () => { await vi.advanceTimersByTimeAsync(50) })
  else await flush()
  return { tree, navigation, onExpired, refreshPlayBoard: context.refreshPlayBoard as Mock }
}

/** Desmonta as telas montadas (chame no `afterEach`). */
export async function unmountAll() {
  for (const tree of trees.splice(0)) await act(async () => { tree.unmount() })
}

/** Avança o relógio simulado dentro do `act`. */
export const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

/** Toca no botão de rótulo `label` com o relógio simulado (o `pressButton` do `review` espera um `setTimeout` real e travaria). */
export async function pressFake(tree: ReactTestRenderer, label: string) {
  const target = findButton(tree, label)
  expect(target, `botão "${label}"`).toBeTruthy()
  await act(async () => { target!.props.onPress() })
  await tick(10)
}
