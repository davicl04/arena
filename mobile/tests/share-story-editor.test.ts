import React from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as ImagePicker from 'expo-image-picker'
import * as MediaLibrary from 'expo-media-library/legacy'
import * as Sharing from 'expo-sharing'
import { captureRef } from 'react-native-view-shot'
import { request } from '../src/api/client'
import { clampFraming, coverSize, coversFrame, initialFraming, nudgeFraming, ZOOM } from '../src/components/share/framing'
import type { Framing, FramingAction, Size } from '../src/components/share/framing'
import { ShareStoryModal } from '../src/components/share/ShareStoryModal'
import type { GestureMock } from './support/gesture-handler'
import { deniedPermission } from './support/media-library'
import { byLabel, enableAct, press, textOf } from './support/native'
import { shareMatch } from './support/share'
import { toasts, toastText } from './support/toast'

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
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: vi.fn() }))

const h = React.createElement
type Tree = ReturnType<typeof create>
type Node = ReturnType<Tree['root']['findAll']>[number]
const find = (tree: Tree, testID: string) => tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === testID)

/** Prévia de 390×844 (o `useWindowDimensions` simulado): quadro de 322×572 pontos. */
const FRAME: Size = { width: 322, height: 572 }

const picked = (uri: string, width = 3000, height = 4000) => ({ canceled: false, assets: [{ uri, width, height, type: 'image', mimeType: 'image/jpeg', fileName: 'foto.jpg', fileSize: 900_000 }] }) as unknown as ImagePicker.ImagePickerResult
const cancelled = { canceled: true, assets: null } as unknown as ImagePicker.ImagePickerResult

/** Promessas, `import()` e o quadro seguinte (setTimeout no Node) terminam antes da próxima conferência. */
const settle = () => act(async () => { for (let i = 0; i < 3; i++) await new Promise(done => setTimeout(done, 0)) })
const pressAndSettle = async (tree: Tree, label: string) => { await press(tree, label); await settle() }

async function open() {
  let tree!: Tree
  await act(async () => { tree = create(h(ShareStoryModal, { target: { kind: 'partida', id: 1 }, onClose: vi.fn(), onExpired: vi.fn() }), { createNodeMock: () => ({ native: true }) }) })
  return tree
}

const photoImage = (tree: Tree) => find(tree, 'story-photo')[0]?.findByType('Image' as never) as Node | undefined
/** A foto escolhida termina de carregar (o `onLoad` da `Image`, como no aparelho). */
async function loadPhoto(tree: Tree) { await act(async () => { photoImage(tree)!.props.onLoad() }) }

async function choosePhoto(tree: Tree, uri = 'file:///galeria/foto.jpg', width?: number, height?: number) {
  vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce(picked(uri, width, height))
  await pressAndSettle(tree, 'Escolher foto')
  await loadPhoto(tree)
}

/** Números arredondados a milésimos (a cobertura vem de uma divisão em ponto flutuante). */
const r = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).map(([key, item]) => [key, typeof item === 'number' ? Math.round(item * 1000) / 1000 + 0 : item])) as T
const disabled = (tree: Tree, label: string) => byLabel(tree, label)[0].props.accessibilityState.disabled
const flatten = (style: unknown): Record<string, any> => (Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : (style as Record<string, unknown>) ?? {})
/** Deslocamento e ampliação aplicados à camada da foto. */
function transformOf(tree: Tree): Framing {
  const [tx, ty, scale] = flatten(find(tree, 'story-photo')[0].props.style).transform as [{ translateX: number }, { translateY: number }, { scale: number }]
  return r({ x: tx.translateX, y: ty.translateY, zoom: scale.scale })
}
function gestures(tree: Tree) {
  const detector = tree.root.findByType('GestureDetector' as never)
  const [pan, pinch] = (detector.props.gesture as { gestures: GestureMock[] }).gestures
  return { pan, pinch }
}

describe('enquadramento: matemática pura', () => {
  const portrait: Size = { width: 3000, height: 4000 }
  const landscape: Size = { width: 4000, height: 3000 }

  it('a cobertura preenche o quadro pelo lado que falta e mantém a proporção da foto', () => {
    expect(r(coverSize(portrait, FRAME))).toEqual({ width: 429, height: 572 })
    const wide = coverSize(landscape, FRAME)
    expect(wide.height).toBe(572)
    expect(wide.width).toBeCloseTo(762.67, 2)
    expect(coverSize({ width: 1080, height: 1920 }, { width: 360, height: 640 })).toEqual({ width: 360, height: 640 })
  })

  it('limita ampliação e deslocamento: nunca sobra área vazia, mesmo com valores extremos', () => {
    const cover = coverSize(portrait, FRAME)
    expect(r(clampFraming({ zoom: 0.2, x: 500, y: -500 }, cover, FRAME))).toEqual({ zoom: 1, x: 53.5, y: 0 })
    expect(r(clampFraming({ zoom: 9, x: -9999, y: 9999 }, cover, FRAME))).toEqual({ zoom: ZOOM.max, x: -(429 * 3 - 322) / 2, y: (572 * 3 - 572) / 2 })
    for (const framing of [{ zoom: 0, x: 1e6, y: 1e6 }, { zoom: 1.7, x: -300, y: 120 }, { zoom: 2.5, x: 0, y: -1e6 }]) {
      expect(coversFrame(clampFraming(framing, cover, FRAME), cover, FRAME)).toBe(true)
    }
    expect(coversFrame({ zoom: 1, x: 60, y: 0 }, cover, FRAME)).toBe(false)
    // Sem sobra (a foto já tem o formato do quadro), o deslocamento é zero e não vira −0.
    expect(Object.is(clampFraming({ zoom: 1, x: -40, y: -40 }, FRAME, FRAME).x, 0)).toBe(true)
  })

  it('as ações de acessibilidade ampliam e movem um passo por vez, dentro dos limites', () => {
    const cover = coverSize(landscape, FRAME)
    const step = (framing: Framing, action: FramingAction) => nudgeFraming(framing, action, cover, FRAME)
    expect(step(initialFraming, 'increment').zoom).toBe(1.25)
    expect(step(initialFraming, 'decrement')).toEqual(initialFraming)
    expect(step(initialFraming, 'esquerda').x).toBeCloseTo(-32.2, 5)
    expect(step(initialFraming, 'direita').x).toBeCloseTo(32.2, 5)
    // Na ampliação 1× a foto deitada não sobra na altura: subir e descer não saem do lugar.
    expect(step(initialFraming, 'cima').y).toBe(0)
    const zoomed = { zoom: 2, x: 0, y: 0 }
    expect(step(zoomed, 'cima').y).toBeCloseTo(-32.2, 5)
    expect(step(zoomed, 'baixo').y).toBeCloseTo(32.2, 5)
  })
})

describe('editor do Story: foto, posição e exportação', () => {
  beforeEach(() => {
    enableAct()
    vi.mocked(request).mockReset().mockResolvedValue(shareMatch({ id: 1 }) as never)
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockReset()
  })

  it('sem foto: xadrez, "Escolher foto" na prévia, Compartilhar e Salvar imagem desabilitados; o adesivo pode ser salvo', async () => {
    const tree = await open()
    expect(find(tree, 'story-checkerboard')).toHaveLength(1)
    expect(find(tree, 'story-photo')).toHaveLength(0)
    expect(byLabel(tree, 'Escolher foto')).toHaveLength(1)
    expect(disabled(tree, 'Compartilhar nos Stories')).toBe(true)
    expect(byLabel(tree, 'Compartilhar nos Stories')[0].props.accessibilityHint).toBe('Escolha uma foto para montar o Story')
    expect(disabled(tree, 'Salvar imagem')).toBe(true)
    expect(disabled(tree, 'Trocar foto')).toBe(true)
    expect(disabled(tree, 'Salvar só o adesivo')).toBe(false)
    // "Escolher foto" fica fora do quadro capturado.
    expect(find(tree, 'story-canvas')[0].findAll(node => node.props.accessibilityLabel === 'Escolher foto')).toHaveLength(0)
    expect(gestures(tree).pan.isEnabled).toBe(false)
    await press(tree, 'Compartilhar nos Stories')
    expect(Sharing.shareAsync).not.toHaveBeenCalled()
    await act(async () => { tree.unmount() })
  })

  it('escolhe a foto na galeria (só no aparelho), que cobre o quadro atrás do adesivo; Compartilhar só depois de carregada', async () => {
    const tree = await open()
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce(picked('file:///galeria/foto.jpg'))
    await pressAndSettle(tree, 'Escolher foto')
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['images'], allowsMultipleSelection: false, allowsEditing: false }))
    const layer = find(tree, 'story-photo')[0]
    expect(photoImage(tree)!.props.source).toEqual({ uri: 'file:///galeria/foto.jpg' })
    // Cobertura: 429×572 centralizada no quadro de 322×572, dentro do quadro capturado e antes do adesivo.
    expect(r(flatten(layer.props.style))).toMatchObject({ position: 'absolute', left: -53.5, top: 0, width: 429, height: 572 })
    const canvas = find(tree, 'story-canvas')[0]
    expect(canvas.findAll(node => node.props.testID === 'story-photo' && typeof node.type === 'string')).toHaveLength(1)
    expect(byLabel(tree, 'Escolher foto')).toHaveLength(0)
    expect(disabled(tree, 'Compartilhar nos Stories')).toBe(true)
    await loadPhoto(tree)
    expect(disabled(tree, 'Compartilhar nos Stories')).toBe(false)
    expect(disabled(tree, 'Salvar imagem')).toBe(false)
    expect(disabled(tree, 'Trocar foto')).toBe(false)
    // Com foto, o quadro vira o enquadramento ajustável, com as ações de mover.
    expect(canvas.props.accessibilityRole).toBe('adjustable')
    expect(canvas.props.accessibilityValue).toEqual({ text: 'Ampliação de 100%' })
    expect(canvas.props.accessibilityActions.map((action: { label: string }) => action.label)).toContain('Mover a foto para a esquerda')
    // Nenhuma requisição além da leitura do adesivo: a foto não vai ao servidor.
    expect(vi.mocked(request).mock.calls).toEqual([['/me/share/matches/1']])
    await act(async () => { tree.unmount() })
  })

  it('cancelar a galeria não muda nada; falha ao abrir as fotos vira aviso; foto que não abre volta ao estado sem foto', async () => {
    const tree = await open()
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce(cancelled)
    await pressAndSettle(tree, 'Escolher foto')
    expect(find(tree, 'story-photo')).toHaveLength(0)
    expect(toasts()).toEqual([])
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockRejectedValueOnce(new Error('sem acesso'))
    await pressAndSettle(tree, 'Escolher foto')
    expect(toasts().map(item => item.tone)).toEqual(['error'])
    expect(toastText()).toContain('Não foi possível abrir as fotos.')
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce(picked('file:///galeria/quebrada.heic'))
    await pressAndSettle(tree, 'Escolher foto')
    await act(async () => { photoImage(tree)!.props.onError() })
    expect(find(tree, 'story-photo')).toHaveLength(0)
    expect(toastText()).toContain('Não foi possível abrir a foto.')
    expect(byLabel(tree, 'Escolher foto')).toHaveLength(1)
    await act(async () => { tree.unmount() })
  })

  it('Topo / Centro / Base é um grupo de opções com o estado marcado; a placa se move e a posição continua ao trocar a foto', async () => {
    const tree = await open()
    const group = tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'radiogroup' && node.props.accessibilityLabel === 'Posição da placa')
    expect(group).toHaveLength(1)
    const checked = () => byLabel(tree, 'Topo').concat(byLabel(tree, 'Centro'), byLabel(tree, 'Base')).filter(node => node.props.accessibilityState.checked).map(node => node.props.accessibilityLabel)
    expect(checked()).toEqual(['Topo'])
    expect(find(tree, 'sticker-block-topo')).toHaveLength(1)
    await press(tree, 'Base')
    expect(checked()).toEqual(['Base'])
    expect(byLabel(tree, 'Base')[0].props.accessibilityRole).toBe('radio')
    expect(find(tree, 'sticker-block-base')).toHaveLength(1)
    await press(tree, 'Centro')
    expect(find(tree, 'sticker-block-centro')).toHaveLength(1)
    await choosePhoto(tree, 'file:///galeria/primeira.jpg')
    // Ampliar e trocar a foto: a nova foto volta à cobertura, a placa continua no centro.
    await act(async () => { find(tree, 'story-canvas')[0].props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }) })
    expect(transformOf(tree).zoom).toBe(1.25)
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce(picked('file:///galeria/segunda.jpg', 4000, 3000))
    await pressAndSettle(tree, 'Trocar foto')
    expect(photoImage(tree)!.props.source).toEqual({ uri: 'file:///galeria/segunda.jpg' })
    expect(transformOf(tree)).toEqual({ x: 0, y: 0, zoom: 1 })
    expect(find(tree, 'sticker-block-centro')).toHaveLength(1)
    expect(checked()).toEqual(['Centro'])
    // A troca espera a nova foto carregar antes de liberar a exportação.
    expect(disabled(tree, 'Compartilhar nos Stories')).toBe(true)
    await act(async () => { tree.unmount() })
  })

  it('arrastar e pinçar seguem o gesto e param na borda da foto, sem área vazia', async () => {
    const tree = await open()
    await choosePhoto(tree)
    const { pan, pinch } = gestures(tree)
    expect(pan.isEnabled).toBe(true)
    // Foto em pé (429×572): na ampliação 1× só sobra na largura (53,5 de cada lado).
    await act(async () => { pan.handlers.change({ changeX: 30, changeY: 40 }) })
    await act(async () => { pan.handlers.change({ changeX: 400, changeY: 0 }); pan.handlers.end({}) })
    expect(transformOf(tree)).toEqual({ x: 53.5, y: 0, zoom: 1 })
    await act(async () => { pinch.handlers.change({ scaleChange: 2 }); pinch.handlers.end({}) })
    expect(transformOf(tree).zoom).toBe(2)
    await act(async () => { pan.handlers.change({ changeX: -5000, changeY: 5000 }); pan.handlers.end({}) })
    expect(transformOf(tree)).toEqual({ zoom: 2, x: -(429 * 2 - 322) / 2, y: (572 * 2 - 572) / 2 })
    // Reduzir abaixo da cobertura volta a 1× e recoloca a foto dentro do quadro.
    await act(async () => { pinch.handlers.change({ scaleChange: 0.1 }); pinch.handlers.end({}) })
    expect(transformOf(tree)).toEqual({ zoom: 1, x: -53.5, y: 0 })
    expect(find(tree, 'story-canvas')[0].props.accessibilityValue).toEqual({ text: 'Ampliação de 100%' })
    await act(async () => { pinch.handlers.change({ scaleChange: 10 }); pinch.handlers.end({}) })
    expect(transformOf(tree).zoom).toBe(ZOOM.max)
    expect(find(tree, 'story-canvas')[0].props.accessibilityValue).toEqual({ text: 'Ampliação de 300%' })
    expect(coversFrame(transformOf(tree), { width: 429, height: 572 }, FRAME)).toBe(true)
    await act(async () => { tree.unmount() })
  })

  it('Compartilhar nos Stories captura o JPEG 1080×1920 do quadro e abre o menu do sistema; enviar ou cancelar não é erro', async () => {
    let close!: () => void
    vi.mocked(Sharing.shareAsync).mockImplementationOnce(() => new Promise<void>(done => { close = done }))
    const tree = await open()
    await choosePhoto(tree)
    await press(tree, 'Compartilhar nos Stories')
    const [view, options] = vi.mocked(captureRef).mock.calls[0]
    expect(options).toEqual({ format: 'jpg', quality: 0.92, width: 1080, height: 1920, result: 'tmpfile' })
    expect((view as { current: unknown }).current).toEqual({ native: true })
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///tmp/story.jpg', { mimeType: 'image/jpeg', UTI: 'public.jpeg', dialogTitle: 'Compartilhar nos Stories' })
    // A foto está no quadro capturado.
    expect(find(tree, 'story-photo')).toHaveLength(1)
    // Exportando: o botão fica ocupado e as demais exportações esperam.
    expect(byLabel(tree, 'Preparando…')[0].props.accessibilityState).toMatchObject({ busy: true, disabled: true })
    expect(disabled(tree, 'Salvar imagem')).toBe(true)
    expect(disabled(tree, 'Salvar só o adesivo')).toBe(true)
    await act(async () => { close() })
    expect(toasts()).toEqual([])
    expect(byLabel(tree, 'Compartilhar nos Stories')[0].props.accessibilityState).toMatchObject({ busy: false, disabled: false })
    // O menu fecha da mesma forma quando a pessoa cancela: nenhum aviso de erro.
    await pressAndSettle(tree, 'Compartilhar nos Stories')
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(2)
    expect(toasts()).toEqual([])
    expect(MediaLibrary.saveToLibraryAsync).not.toHaveBeenCalled()
    await act(async () => { tree.unmount() })
  })

  it('sem menu de compartilhar no aparelho, orienta a salvar; falha na captura ou no menu vira erro', async () => {
    const tree = await open()
    await choosePhoto(tree)
    vi.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false)
    await pressAndSettle(tree, 'Compartilhar nos Stories')
    expect(captureRef).not.toHaveBeenCalled()
    expect(toasts().map(item => item.tone)).toEqual(['warning'])
    expect(toastText()).toContain('Compartilhamento indisponível')
    vi.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error('falhou'))
    await pressAndSettle(tree, 'Compartilhar nos Stories')
    expect(toasts().map(item => item.tone)).toEqual(['warning', 'error'])
    expect(toastText()).toContain('Não foi possível compartilhar a imagem.')
    await act(async () => { tree.unmount() })
  })

  it('Salvar imagem grava o JPEG 1080×1920 na galeria com a permissão só de gravação; negada, explica e não captura', async () => {
    const tree = await open()
    await choosePhoto(tree)
    await pressAndSettle(tree, 'Salvar imagem')
    expect(MediaLibrary.requestPermissionsAsync).toHaveBeenCalledWith(true)
    expect(vi.mocked(captureRef).mock.calls[0][1]).toEqual({ format: 'jpg', quality: 0.92, width: 1080, height: 1920, result: 'tmpfile' })
    expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalledWith('file:///tmp/story.jpg')
    expect(toasts().map(item => item.tone)).toEqual(['success'])
    expect(toastText()).toContain('Imagem salva')
    expect(toastText()).toContain('O Story está na galeria.')
    vi.mocked(captureRef).mockClear()
    vi.mocked(MediaLibrary.requestPermissionsAsync).mockResolvedValueOnce(deniedPermission as never)
    await pressAndSettle(tree, 'Salvar imagem')
    expect(captureRef).not.toHaveBeenCalled()
    expect(toasts().map(item => item.tone)).toEqual(['success', 'warning'])
    expect(toastText()).toContain('Para salvar a imagem, permita')
    await act(async () => { tree.unmount() })
  })

  it('Salvar só o adesivo, com foto escolhida, captura o PNG transparente sem a foto, na posição escolhida, e devolve a foto', async () => {
    const tree = await open()
    await press(tree, 'Base')
    await choosePhoto(tree)
    let photoAtCapture: number | null = null
    vi.mocked(captureRef).mockImplementationOnce(async () => {
      photoAtCapture = find(tree, 'story-photo').length
      return 'file:///tmp/adesivo.png'
    })
    await press(tree, 'Salvar só o adesivo')
    expect(byLabel(tree, 'Salvando…')[0].props.accessibilityState).toMatchObject({ busy: true })
    await settle()
    expect(photoAtCapture).toBe(0)
    expect(vi.mocked(captureRef).mock.calls[0][1]).toEqual({ format: 'png', quality: 1, width: 1080, height: 1920, result: 'tmpfile' })
    expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalledWith('file:///tmp/adesivo.png')
    expect(find(tree, 'sticker-block-base')).toHaveLength(1)
    expect(toastText()).toContain('O adesivo está na galeria, com fundo transparente.')
    // Depois da captura, a foto volta à prévia.
    expect(find(tree, 'story-photo')).toHaveLength(1)
    expect(textOf(tree)).toContain('Prévia do Story')
    await act(async () => { tree.unmount() })
  })
})
