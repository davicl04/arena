import React from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as MediaLibrary from 'expo-media-library/legacy'
import { captureRef } from 'react-native-view-shot'
import { ApiError, request } from '../src/api/client'
import type { TimelineItem } from '../src/api/profile'
import { MatchTimeline } from '../src/components/profile-matches/MatchTimeline'
import { previewWidth } from '../src/components/share/ShareStoryModal'
import { appearance, byLabel, enableAct, press, textOf } from './support/native'
import { deniedPermission } from './support/media-library'
import { placementCategory, shareMatch, shareRun } from './support/share'
import { toasts, toastText } from './support/toast'
import { timelineMatch, timelineRun } from './support/timeline'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('react-native-safe-area-context', async () => (await import('./support/native')).safeAreaMock())
vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  apiUrl: (path: string) => path,
  getToken: vi.fn().mockResolvedValue('test-token'),
  request: vi.fn(),
}))
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))

const h = React.createElement
type Tree = ReturnType<typeof create>
const find = (tree: Tree, testID: string) => tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === testID)
const page = (items: TimelineItem[]) => ({ items, next_cursor: null, total: items.length })

const shareableMatch = timelineMatch({ id: 1, shareable: true, occurred_at: '2026-10-10T19:00:00Z' })
const shareableRun = timelineRun({ id: 2, shareable: true, date: '2026-10-05' })
const lockedMatch = timelineMatch({ id: 3, shareable: false, state: 'sem_resultado', outcome: null, score: null, points: null, occurred_at: '2026-09-20T19:00:00Z' })
const lockedRun = timelineRun({ id: 4, shareable: false, date: '2026-09-02' })
const items: TimelineItem[] = [shareableMatch, shareableRun, lockedMatch, lockedRun]

/** A linha do tempo responde `items`; as rotas do adesivo, o que o teste pedir. */
function api(share: (path: string) => Promise<unknown> = async path => (path.includes('/runs/') ? shareRun({ id: 2 }) : shareMatch({ id: 1 }))) {
  vi.mocked(request).mockImplementation(async path => (path.startsWith('/me/share/') ? share(path) : page(items)) as never)
}

async function render(element: React.ReactElement) {
  let tree!: Tree
  // A vista nativa simulada: o quadro capturado recebe um objeto no `ref`, como no aparelho.
  await act(async () => { tree = create(element, { createNodeMock: () => ({ native: true }) }) })
  return tree
}
const onExpired = vi.fn()
const onOpenMatch = vi.fn()
const mountTimeline = (own = true) => render(h(MatchTimeline, { userId: 1, own, onExpired, onOpenMatch, onPlay: vi.fn() }))
const duelCards = (tree: Tree) => find(tree, 'duel-card')
const runCards = (tree: Tree) => find(tree, 'run-duel-card')
const tap = async (node: { props: { onPress?: () => void } }) => { await act(async () => { node.props.onPress?.() }) }

async function openShare(tree: Tree, card: { props: { onPress?: () => void } }) {
  await tap(card)
  await press(tree, 'Compartilhar nos Stories')
}

describe('folha de ações na aba Partidas do perfil', () => {
  beforeEach(() => { enableAct(); vi.mocked(request).mockReset(); onExpired.mockReset(); onOpenMatch.mockReset(); api() })

  it('partida compartilhável abre a folha com "Compartilhar nos Stories" e "Ver partida"; "Ver partida" abre a partida', async () => {
    const tree = await mountTimeline()
    const card = duelCards(tree)[0]
    expect(card.props.accessibilityHint).toBe('Abre as opções: compartilhar nos Stories ou ver a partida')
    await tap(card)
    expect(onOpenMatch).not.toHaveBeenCalled()
    expect(find(tree, 'activity-actions')).toHaveLength(1)
    expect(textOf(tree)).toContain('Vitória · 3 × 1 · Society')
    expect(byLabel(tree, 'Compartilhar nos Stories')).toHaveLength(1)
    await press(tree, 'Ver partida')
    expect(onOpenMatch).toHaveBeenCalledWith(1)
    expect(find(tree, 'activity-actions')).toHaveLength(0)
    await act(async () => { tree.unmount() })
  })

  it('partida não compartilhável vai direto para a tela da partida, como antes', async () => {
    const tree = await mountTimeline()
    const card = duelCards(tree)[1]
    expect(card.props.accessibilityHint).toBe('Abre a partida')
    await tap(card)
    expect(onOpenMatch).toHaveBeenCalledWith(3)
    expect(find(tree, 'activity-actions')).toHaveLength(0)
    await act(async () => { tree.unmount() })
  })

  it('corrida compartilhável é tocável e a folha só compartilha; corrida não compartilhável não é tocável; Cancelar fecha', async () => {
    const tree = await mountTimeline()
    const [run, locked] = runCards(tree)
    expect(run.props.accessibilityRole).toBe('button')
    expect(run.props.accessibilityLabel).toContain('5 km em 25:12')
    expect(locked.props.onPress).toBeUndefined()
    await tap(run)
    expect(textOf(tree)).toContain('5 km · 25:12 · Treino')
    expect(byLabel(tree, 'Compartilhar nos Stories')).toHaveLength(1)
    expect(byLabel(tree, 'Ver partida')).toHaveLength(0)
    await press(tree, 'Cancelar')
    expect(find(tree, 'activity-actions')).toHaveLength(0)
    expect(request).toHaveBeenCalledTimes(1)
    await act(async () => { tree.unmount() })
  })

  it('no perfil visitado nada é tocável e não há opção de compartilhar, mesmo que o item venha compartilhável', async () => {
    const tree = await mountTimeline(false)
    expect([...duelCards(tree), ...runCards(tree)].every(card => card.props.onPress === undefined)).toBe(true)
    expect(byLabel(tree, 'Compartilhar nos Stories')).toHaveLength(0)
    await act(async () => { tree.unmount() })
  })
})

describe('tela imersiva: Prévia do Story', () => {
  beforeEach(() => { enableAct(); vi.mocked(request).mockReset(); onExpired.mockReset(); onOpenMatch.mockReset() })
  afterEach(() => { appearance.reset() })

  it('carrega uma vez e mostra o adesivo real sobre o xadrez, com fundo night nos dois temas; fechar volta à linha do tempo', async () => {
    let resolve!: (value: unknown) => void
    api(() => new Promise(done => { resolve = done }))
    const tree = await mountTimeline()
    await openShare(tree, duelCards(tree)[0])
    expect(find(tree, 'activity-actions')).toHaveLength(0)
    expect(textOf(tree)).toContain('Prévia do Story')
    expect(byLabel(tree, 'Carregando o adesivo')).toHaveLength(1)
    expect(byLabel(tree, 'Salvar só o adesivo')[0].props.accessibilityState.disabled).toBe(true)
    await act(async () => { resolve(shareMatch({ id: 1 })) })
    expect(vi.mocked(request).mock.calls.filter(([path]) => path.startsWith('/me/share/'))).toEqual([['/me/share/matches/1']])
    const text = textOf(tree)
    for (const piece of ['Vitória', '3 × 1', '1 G · 1 A', 'Prata', '+3 pts', '3º na Prata · faltam 71 para Ouro']) expect(text).toContain(piece)
    expect(find(tree, 'story-checkerboard')).toHaveLength(1)
    expect(find(tree, 'story-canvas')[0].props.accessibilityLabel).toContain('Adesivo de resultado. Resultado: Vitória')
    expect(find(tree, 'share-story')[0].props.style.backgroundColor).toBe('#08140e')
    await act(async () => { appearance.setSystem('dark') })
    expect(find(tree, 'share-story')[0].props.style.backgroundColor).toBe('#08140e')
    await press(tree, 'Fechar')
    expect(find(tree, 'share-story')).toHaveLength(0)
    await act(async () => { tree.unmount() })
  })

  it('corrida: lê a rota da corrida; em classificação mostra "Em classificação" e as marcas', async () => {
    api(async () => shareRun({ id: 2, category: placementCategory({ ranking: 'corrida_5', played: 0, required: 1, progress: 0 }) }))
    const tree = await mountTimeline()
    await openShare(tree, runCards(tree)[0])
    expect(request).toHaveBeenCalledWith('/me/share/runs/2')
    expect(textOf(tree)).toContain('Em classificação')
    expect(textOf(tree)).toContain('0 de 1 marca')
    await act(async () => { tree.unmount() })
  })

  it('erro mostra a mensagem e "Tentar de novo" lê de novo', async () => {
    let calls = 0
    api(async () => { calls++; if (calls === 1) throw new Error('Falha de rede.'); return shareMatch({ id: 1 }) })
    const tree = await mountTimeline()
    await openShare(tree, duelCards(tree)[0])
    expect(textOf(tree)).toContain('Não foi possível carregar o adesivo')
    expect(textOf(tree)).toContain('Falha de rede.')
    await press(tree, 'Tentar de novo')
    expect(calls).toBe(2)
    expect(textOf(tree)).toContain('1 G · 1 A')
    await act(async () => { tree.unmount() })
  })

  it('404: atividade não encontrada, sem tentar de novo; "Voltar" fecha', async () => {
    api(async () => { throw new ApiError('Atividade não encontrada.', 404) })
    const tree = await mountTimeline()
    await openShare(tree, duelCards(tree)[0])
    expect(textOf(tree)).toContain('Atividade não encontrada')
    expect(byLabel(tree, 'Tentar de novo')).toHaveLength(0)
    expect(byLabel(tree, 'Salvar só o adesivo')[0].props.accessibilityState.disabled).toBe(true)
    await press(tree, 'Voltar')
    expect(find(tree, 'share-story')).toHaveLength(0)
    expect(onExpired).not.toHaveBeenCalled()
    await act(async () => { tree.unmount() })
  })

  it('401 sai da sessão pelo fluxo existente', async () => {
    api(async () => { throw new ApiError('Sessão expirada.', 401) })
    const tree = await mountTimeline()
    await openShare(tree, duelCards(tree)[0])
    expect(onExpired).toHaveBeenCalledOnce()
    expect(textOf(tree)).toContain('Sua sessão expirou')
    await act(async () => { tree.unmount() })
  })

  it('a prévia 9:16 cabe na largura e na altura da tela', () => {
    expect(previewWidth({ width: 390, height: 844 }, { top: 0, bottom: 0 })).toBe(322)
    expect(previewWidth({ width: 390, height: 700 }, { top: 40, bottom: 20 })).toBe(208)
    expect(previewWidth({ width: 320, height: 400 }, { top: 0, bottom: 0 })).toBe(120)
  })
})

describe('Salvar só o adesivo', () => {
  beforeEach(() => { enableAct(); vi.mocked(request).mockReset(); onExpired.mockReset(); api() })

  async function openPreview() {
    const tree = await mountTimeline()
    await openShare(tree, duelCards(tree)[0])
    return tree
  }

  it('com a permissão só de gravação, captura o PNG 1080×1920 transparente do quadro, grava na galeria e avisa "Imagem salva"', async () => {
    let finish!: () => void
    vi.mocked(MediaLibrary.saveToLibraryAsync).mockImplementation(() => new Promise<void>(done => { finish = done }))
    const tree = await openPreview()
    await press(tree, 'Salvar só o adesivo')
    expect(MediaLibrary.requestPermissionsAsync).toHaveBeenCalledWith(true)
    const [view, options] = vi.mocked(captureRef).mock.calls[0]
    expect(options).toEqual({ format: 'png', quality: 1, width: 1080, height: 1920, result: 'tmpfile' })
    expect((view as { current: unknown }).current).toEqual({ native: true })
    expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalledWith('file:///tmp/story.png')
    // Exportando: o botão fica ocupado até a gravação terminar.
    const busy = byLabel(tree, 'Salvando…')[0]
    expect(busy.props.accessibilityState).toMatchObject({ busy: true, disabled: true })
    await act(async () => { finish() })
    expect(toastText()).toContain('Imagem salva')
    expect(toasts().map(item => item.tone)).toEqual(['success'])
    expect(byLabel(tree, 'Salvar só o adesivo')[0].props.accessibilityState.busy).toBe(false)
    await act(async () => { tree.unmount() })
  })

  it('negada a permissão, explica como liberar e não captura', async () => {
    vi.mocked(MediaLibrary.requestPermissionsAsync).mockResolvedValue(deniedPermission as never)
    const tree = await openPreview()
    await press(tree, 'Salvar só o adesivo')
    expect(captureRef).not.toHaveBeenCalled()
    expect(MediaLibrary.saveToLibraryAsync).not.toHaveBeenCalled()
    expect(toasts().map(item => item.tone)).toEqual(['warning'])
    expect(toastText()).toContain('Sem permissão para salvar')
    expect(toastText()).toContain('nas configurações do aparelho')
    await act(async () => { tree.unmount() })
  })

  it('falha na captura ou na gravação vira um aviso de erro', async () => {
    vi.mocked(captureRef).mockRejectedValue(new Error('falhou'))
    const tree = await openPreview()
    await press(tree, 'Salvar só o adesivo')
    expect(toasts().map(item => item.tone)).toEqual(['error'])
    expect(toastText()).toContain('Não foi possível salvar a imagem.')
    expect(MediaLibrary.saveToLibraryAsync).not.toHaveBeenCalled()
    await act(async () => { tree.unmount() })
  })
})
