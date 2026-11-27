import React, { useLayoutEffect, useState } from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { enableAct } from './support/native'
import { TeamsPlate } from '../src/components/arena/TeamsPlate'
import { TopAreaProvider, useTopArea } from '../src/navigation/topArea'
import type { TopArea } from '../src/navigation/topArea'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())

/** Faixa da barra de status como o shell a lê: o último topo declarado pela tela. */
const last: { area: TopArea } = { area: 'app' }
function Shell({ children }: { children: React.ReactNode }) {
  const [area, setArea] = useState<TopArea>('app')
  useLayoutEffect(() => { last.area = area }, [area])
  return React.createElement(TopAreaProvider, { value: setArea }, children)
}
/** A placa com só as props do teste (os filhos não importam aqui). */
const Plate = TeamsPlate as unknown as React.FC<{ round?: number }>
const Probe = ({ area }: { area: TopArea | null }) => { useTopArea(area); return null }

async function render(child: React.ReactElement): Promise<ReactTestRenderer> {
  enableAct()
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(React.createElement(Shell, null, child)) })
  return tree
}

describe('faixa da barra de status (topArea)', () => {
  it('a tela declara o topo enquanto está montada e o devolve ao padrão ao sair', async () => {
    const tree = await render(React.createElement(Probe, { area: 'bleed' }))
    expect(last.area).toBe('bleed')
    await act(async () => { tree.update(React.createElement(Shell, null, null)) })
    expect(last.area).toBe('app')
  })

  it('`null` não declara nada', async () => {
    await render(React.createElement(Probe, { area: null }))
    expect(last.area).toBe('app')
  })

  it('a placa de ponta a ponta pinta a faixa de forest; a placa arredondada (dentro da tela) não mexe nela', async () => {
    await render(React.createElement(Plate))
    expect(last.area).toBe('forest')
    await render(React.createElement(Plate, { round: 22 }))
    expect(last.area).toBe('app')
  })
})
