import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { Platform } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connection } from '../src/api/connection'
import { ConnectionNotice } from '../src/components/ConnectionNotice'
import { accessibility, appState, byLabel, enableAct, press, textOf } from './support/native'
import { motion } from './support/reanimated'
import { track, unmountToastTrees } from './support/toast'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  enableAct()
  appState.reset()
  accessibility.announcements.length = 0
  motion.reduced = false
  Platform.OS = 'android'
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-13T12:00:00Z'))
  fetchMock = vi.fn().mockRejectedValue(new TypeError('network'))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(async () => { await unmountToastTrees(); vi.useRealTimers() })

async function mount(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => { tree = track(create(React.createElement(ConnectionNotice))) })
  return tree
}
const strip = (tree: ReactTestRenderer) => tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'connection-strip')
const modals = (tree: ReactTestRenderer) => tree.root.findAllByType('Modal' as never)
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

describe('ConnectionNotice: faixa e folha de "Sem conexão"', () => {
  it('online, não desenha nada', async () => {
    const tree = await mount()
    expect(strip(tree)).toHaveLength(0)
    expect(modals(tree)).toHaveLength(0)
  })

  it('uma leitura que falha liga só a faixa, presa à navegação (82 pt da base, 52 de altura), com a contagem andando', async () => {
    const tree = await mount()
    await act(async () => { connection.lost({ mutating: false }) })
    expect(strip(tree)).toHaveLength(1)
    expect(strip(tree)[0].props.style[0]).toMatchObject({ position: 'absolute', bottom: 82, height: 52 })
    expect(strip(tree)[0].props.accessibilityRole).toBe('alert')
    expect(modals(tree)).toHaveLength(0)
    expect(textOf(tree)).toContain('Sem conexão com a ARENA')
    expect(textOf(tree)).toContain('Nova tentativa em 5 s.')
    await advance(2000)
    expect(textOf(tree)).toContain('Nova tentativa em 3 s.')
    expect(byLabel(tree, 'Tentar agora')).toHaveLength(1)
  })

  it('no iOS a faixa é anunciada ao ligar e ao restabelecer', async () => {
    Platform.OS = 'ios'
    await mount()
    await act(async () => { connection.lost({ mutating: false }) })
    await act(async () => { connection.reached() })
    expect(accessibility.announcements).toEqual(['Sem conexão com a ARENA', 'Conexão restabelecida'])
  })

  it('uma ação que falha abre a folha escura; "Continuar sem conexão" a dispensa e a faixa fica', async () => {
    const tree = await mount()
    await act(async () => { connection.attempted() })
    expect(modals(tree)).toHaveLength(1)
    expect(textOf(tree)).toContain('Suas ações não chegam ao servidor agora. Nova tentativa em 5 s.')
    expect(textOf(tree)).toContain('OFFLINE')
    expect(byLabel(tree, 'Continuar sem conexão')).toHaveLength(1)
    await press(tree, 'Continuar sem conexão')
    expect(modals(tree)).toHaveLength(0)
    expect(connection.getState()).toMatchObject({ sheetDismissed: true, sheetOpen: false })
    expect(strip(tree)).toHaveLength(1)
  })

  it('com a folha dispensada, uma nova ação não a reabre: a faixa treme (e não treme com "reduzir movimento")', async () => {
    const tree = await mount()
    await act(async () => { connection.attempted() })
    await press(tree, 'Continuar sem conexão')
    await act(async () => { connection.attempted() })
    expect(modals(tree)).toHaveLength(0)
    expect(connection.getState().nudge).toBe(1)
    motion.reduced = true
    await act(async () => { connection.attempted() })
    expect(connection.getState().nudge).toBe(2)
    expect(strip(tree)).toHaveLength(1)
  })

  it('fechar a folha pelo X, pelo fundo ou pelo botão voltar equivale a dispensá-la', async () => {
    const tree = await mount()
    await act(async () => { connection.attempted() })
    await press(tree, 'Fechar')
    expect(connection.getState().sheetDismissed).toBe(true)
    expect(modals(tree)).toHaveLength(0)
  })

  it('"Tentar agora" (na folha e na faixa) consulta o servidor e mostra "Tentando agora…" enquanto espera', async () => {
    let finish!: (response: Response) => void
    fetchMock.mockImplementation(() => new Promise<Response>(resolve => { finish = resolve }))
    const tree = await mount()
    await act(async () => { connection.attempted() })
    await press(tree, 'Tentar agora')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(textOf(tree)).toContain('Tentando agora…')
    expect(byLabel(tree, 'Tentar agora').every(node => node.props.accessibilityState.disabled)).toBe(true)
    await act(async () => { finish(new Response('{}', { status: 503 })); await vi.advanceTimersByTimeAsync(0) })
    expect(textOf(tree)).toContain('Nova tentativa em 10 s.')
    await advance(0)
  })

  it('a conexão volta: a faixa vira "Conexão restabelecida" em menta por 2,5 s e some; a folha fecha', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    const tree = await mount()
    await act(async () => { connection.attempted() })
    await press(tree, 'Tentar agora')
    await advance(0)
    expect(modals(tree)).toHaveLength(0)
    expect(textOf(tree)).toContain('Conexão restabelecida')
    expect(byLabel(tree, 'Tentar agora')).toHaveLength(0)
    expect(strip(tree)[0].props.accessibilityRole).toBeUndefined()
    expect(tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'connection-dot')[0].props.style[0].backgroundColor).toBe('#8fe0b4')
    await advance(2500)
    expect(strip(tree)).toHaveLength(0)
    expect(connection.getState()).toMatchObject({ status: 'online', sheetDismissed: false })
  })

  it('voltar ao primeiro plano com o aviso ligado consulta na hora; sem aviso, não faz nada; desmontar solta o ouvinte', async () => {
    const tree = await mount()
    await act(async () => { appState.set('active') })
    expect(fetchMock).not.toHaveBeenCalled()
    await act(async () => { connection.lost({ mutating: false }) })
    await act(async () => { appState.set('background') })
    expect(fetchMock).not.toHaveBeenCalled()
    await act(async () => { appState.set('active') })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => { tree.unmount() })
    expect(appState.listeners).toHaveLength(0)
  })

  it('com "reduzir movimento" o ponto não pulsa e o aviso aparece do mesmo jeito', async () => {
    motion.reduced = true
    const tree = await mount()
    await act(async () => { connection.lost({ mutating: false }) })
    expect(strip(tree)).toHaveLength(1)
  })
})
