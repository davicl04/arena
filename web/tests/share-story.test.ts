import { describe, expect, it, vi } from 'vitest'
import {
  clampFraming, coverScale, INITIAL_FRAMING, keyFraming, MAX_ZOOM, MIN_ZOOM, PAN_STEP, panBy, photoRect, reducedSize, zoomBy,
} from '../src/components/share/storyFraming'
import type { Framing, PhotoSize } from '../src/components/share/storyFraming'
import { emptySpot, STICKER_HEIGHT, STICKER_WIDTH, stickerLayout } from '../src/components/share/stickerLayout'
import { photoBackground, shareOrDownload, stickerPng, storyJpeg, STORY_JPEG_QUALITY } from '../src/components/share/stickerCanvas'
import { stickerContent } from '../src/components/share/stickerContent'
import { loadPhoto, PhotoError } from '../src/components/share/storyPhoto'
import type { StoryPhoto } from '../src/components/share/storyPhoto'
import { coliseumSvg, fakeBitmap, fakeContext, FakePath2D, photoFile, shareMatch, shareRun } from './share-fixtures'

const landscape: PhotoSize = { width: 1600, height: 900 }
const portrait: PhotoSize = { width: 900, height: 2400 }

/** A foto cobre o quadro inteiro: nenhuma borda dela entra no quadro de 360×640. */
function covers(framing: Framing, photo: PhotoSize) {
  const rect = photoRect(framing, photo)
  const eps = 1e-9
  return rect.x <= eps && rect.y <= eps && rect.x + rect.w >= STICKER_WIDTH - eps && rect.y + rect.h >= STICKER_HEIGHT - eps
}

describe('enquadramento da foto', () => {
  it('cobre o quadro em 1× pelo lado mais justo e centraliza', () => {
    expect(coverScale(landscape)).toBeCloseTo(640 / 900)
    const rect = photoRect(INITIAL_FRAMING, landscape)
    expect(rect.h).toBeCloseTo(640)
    expect(rect.w).toBeCloseTo(1600 * (640 / 900))
    expect(rect.x).toBeCloseTo((360 - rect.w) / 2)
    expect(rect.y).toBeCloseTo(0)
    const tall = photoRect(INITIAL_FRAMING, portrait)
    expect(tall.w).toBeCloseTo(360)
    expect(tall.h).toBeCloseTo(960)
  })

  it('limita o zoom à faixa de 1× a 3× e o deslocamento ao que a foto cobre', () => {
    expect(clampFraming({ zoom: 0.4, x: 0, y: 0 }, landscape).zoom).toBe(MIN_ZOOM)
    expect(clampFraming({ zoom: 9, x: 0, y: 0 }, landscape).zoom).toBe(MAX_ZOOM)
    expect(clampFraming({ zoom: Number.NaN, x: 0, y: 0 }, landscape).zoom).toBe(MIN_ZOOM)
    // Em 1×, a foto deitada só sobra na largura: o deslocamento vertical volta a 0.
    const slack = (1600 * (640 / 900) - 360) / 2
    expect(clampFraming({ zoom: 1, x: 5000, y: 300 }, landscape)).toEqual({ zoom: 1, x: slack, y: 0 })
    expect(clampFraming({ zoom: 1, x: -5000, y: -300 }, landscape)).toEqual({ zoom: 1, x: -slack, y: 0 })
  })

  it('nunca deixa área vazia, por mais que se arraste, amplie ou reduza', () => {
    let framing = INITIAL_FRAMING
    const moves: [number, number, number][] = [[400, -900, 1.7], [-2000, 50, 0.3], [30, 3000, 4], [-15, -15, 0.8], [999, 999, 1]]
    for (const photo of [landscape, portrait, { width: 360, height: 640 }]) {
      for (const [dx, dy, factor] of moves) {
        framing = zoomBy(panBy(framing, dx, dy, photo), factor, photo, { x: dx / 10, y: dy / 10 })
        expect(covers(framing, photo)).toBe(true)
        expect(framing.zoom).toBeGreaterThanOrEqual(MIN_ZOOM)
        expect(framing.zoom).toBeLessThanOrEqual(MAX_ZOOM)
      }
    }
  })

  it('amplia em torno do ponto escolhido: o ponto da foto sob o cursor fica parado', () => {
    const anchor = { x: 60, y: -80 }
    const before = photoRect(INITIAL_FRAMING, landscape)
    const framing = zoomBy(INITIAL_FRAMING, 2, landscape, anchor)
    const after = photoRect(framing, landscape)
    // Coordenada da foto (0..1) sob o ponto, antes e depois.
    const u = (point: number, start: number, size: number) => (point - start) / size
    expect(u(180 + anchor.x, after.x, after.w)).toBeCloseTo(u(180 + anchor.x, before.x, before.w))
    expect(u(320 + anchor.y, after.y, after.h)).toBeCloseTo(u(320 + anchor.y, before.y, before.h))
    // Reduzir de volta a 1× recentraliza no eixo sem sobra.
    expect(zoomBy(framing, 0.1, landscape).y).toBe(0)
  })

  it('teclado: setas movem (Shift mais longe), + e − ampliam, outras teclas não fazem nada', () => {
    const zoomed = zoomBy(INITIAL_FRAMING, 2, landscape)
    expect(keyFraming(zoomed, 'ArrowRight', false, landscape)).toEqual({ ...zoomed, x: zoomed.x + PAN_STEP })
    expect(keyFraming(zoomed, 'ArrowLeft', true, landscape)).toEqual({ ...zoomed, x: zoomed.x - PAN_STEP * 4 })
    expect(keyFraming(zoomed, 'ArrowDown', false, landscape)?.y).toBe(PAN_STEP)
    expect(keyFraming(zoomed, 'ArrowUp', false, landscape)?.y).toBe(-PAN_STEP)
    expect(keyFraming(INITIAL_FRAMING, '+', false, landscape)?.zoom).toBeCloseTo(1.25)
    expect(keyFraming(INITIAL_FRAMING, '=', false, landscape)?.zoom).toBeCloseTo(1.25)
    expect(keyFraming(zoomed, '-', false, landscape)?.zoom).toBeCloseTo(1.6)
    expect(keyFraming(INITIAL_FRAMING, '-', false, landscape)?.zoom).toBe(MIN_ZOOM)
    expect(keyFraming(INITIAL_FRAMING, 'Enter', false, landscape)).toBeNull()
  })

  it('reduz a foto ao que cobre 1080×1920 em 1×, sem ampliar a pequena', () => {
    const cover = { width: 1080, height: 1920 }
    expect(reducedSize({ width: 4000, height: 3000 }, cover)).toEqual({ width: 2560, height: 1920 })
    expect(reducedSize({ width: 3024, height: 4032 }, cover)).toEqual({ width: 1440, height: 1920 })
    expect(reducedSize({ width: 3000, height: 9000 }, cover)).toEqual({ width: 1080, height: 3240 })
    expect(reducedSize({ width: 500, height: 400 }, cover)).toEqual({ width: 500, height: 400 })
  })
})

describe('posição da placa', () => {
  const content = stickerContent({ kind: 'partida', match: shareMatch() })

  it('topo, centro e base deslocam a placa e a barra; a assinatura continua embaixo', () => {
    const [topo, centro, base] = (['topo', 'centro', 'base'] as const).map(position => stickerLayout(content, { position }))
    expect(topo.plate.box.y).toBeLessThan(centro.plate.box.y)
    expect(centro.plate.box.y).toBeLessThan(base.plate.box.y)
    expect(base.bar!.box.y + base.bar!.box.h).toBeLessThan(base.signature.mark.y)
    expect(new Set([topo, centro, base].map(layout => JSON.stringify(layout.signature))).size).toBe(1)
  })

  it('o "Escolher foto" fica na faixa livre, fora da placa e da barra, em toda posição', () => {
    for (const position of ['topo', 'centro', 'base'] as const) {
      for (const sticker of [content, stickerContent({ kind: 'corrida', run: shareRun({ category: null, standard_distance_km: null }) })]) {
        const layout = stickerLayout(sticker, { position })
        const y = emptySpot(layout) * STICKER_HEIGHT
        const bottom = layout.bar ? layout.bar.box.y + layout.bar.box.h : layout.plate.box.y + layout.plate.box.h
        expect(y < layout.plate.box.y - 20 || (y > bottom + 20 && y < layout.signature.mark.y - 20)).toBe(true)
      }
    }
  })
})

describe('fundo com a foto e exportação', () => {
  const photo: StoryPhoto = { source: {} as CanvasImageSource, width: 1600, height: 900 }
  const framing: Framing = { zoom: 1.8, x: -40, y: 25 }

  it('desenha a foto no mesmo lugar na prévia e no arquivo (só muda a escala)', () => {
    const draw = (width: number) => {
      const { ctx } = fakeContext()
      photoBackground(photo, framing)(ctx as unknown as CanvasRenderingContext2D, width, width * (16 / 9))
      return ctx.drawImage.mock.calls[0].slice(1) as number[]
    }
    const preview = draw(288)
    const exported = draw(1080)
    const rect = photoRect(framing, photo)
    expect(exported).toEqual([rect.x * 3, rect.y * 3, rect.w * 3, rect.h * 3])
    preview.forEach((value, index) => expect(value * (1080 / 288)).toBeCloseTo(exported[index]))
  })

  it('o Story montado sai em JPEG 1080×1920 com a foto atrás do adesivo', async () => {
    const { ctx, texts } = fakeContext()
    vi.stubGlobal('Path2D', FakePath2D)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => coliseumSvg })))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as never)
    const blobs: [number, number, string | undefined, number | undefined][] = []
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback, type, quality) {
      blobs.push([this.width, this.height, type, quality])
      callback(new Blob(['x'], { type }))
    })
    const content = stickerContent({ kind: 'partida', match: shareMatch() })
    const blob = await storyJpeg(content, 'base', photo, framing)
    expect(blob.type).toBe('image/jpeg')
    expect(blobs).toEqual([[1080, 1920, 'image/jpeg', STORY_JPEG_QUALITY]])
    const rect = photoRect(framing, photo)
    expect(ctx.drawImage).toHaveBeenCalledWith(photo.source, rect.x * 3, rect.y * 3, rect.w * 3, rect.h * 3)
    // A placa desenhada é a da posição escolhida.
    const base = stickerLayout(content, { position: 'base' })
    const label = texts.find(item => item.text === 'RESULTADO')!
    expect(label.y).toBeGreaterThan(base.plate.box.y * 3)
    expect(label.y).toBeLessThan((base.plate.box.y + base.plate.box.h) * 3)
    // O adesivo sozinho continua transparente, também na posição escolhida.
    ctx.drawImage.mockClear()
    texts.length = 0
    await stickerPng(content, 'centro')
    expect(blobs[1]).toEqual([1080, 1920, 'image/png', undefined])
    expect(ctx.drawImage).not.toHaveBeenCalled()
    const centro = stickerLayout(content, { position: 'centro' })
    expect(texts.find(item => item.text === 'RESULTADO')!.y).toBeGreaterThan(centro.plate.box.y * 3)
  })
})

describe('compartilhar ou baixar', () => {
  const blob = new Blob(['jpeg'], { type: 'image/jpeg' })

  function stubDownload() {
    const downloads: string[] = []
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:story'), revokeObjectURL: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download) })
    return downloads
  }

  it('usa o menu do navegador quando ele aceita o arquivo', async () => {
    const downloads = stubDownload()
    const share = vi.fn(async () => undefined)
    const canShare = vi.fn(() => true)
    expect(await shareOrDownload(blob, 'arena-story-partida-50.jpg', { share, canShare })).toBe('shared')
    const files = (canShare.mock.calls[0] as unknown as [{ files: File[] }])[0].files
    expect(files[0].name).toBe('arena-story-partida-50.jpg')
    expect(files[0].type).toBe('image/jpeg')
    expect(share).toHaveBeenCalledWith({ files })
    expect(downloads).toEqual([])
  })

  it('baixa o arquivo quando o navegador não compartilha arquivos', async () => {
    const downloads = stubDownload()
    expect(await shareOrDownload(blob, 'a.jpg', { share: vi.fn(), canShare: vi.fn(() => false) })).toBe('downloaded')
    expect(await shareOrDownload(blob, 'b.jpg', { share: vi.fn() })).toBe('downloaded')
    expect(await shareOrDownload(blob, 'c.jpg', {})).toBe('downloaded')
    expect(await shareOrDownload(blob, 'd.jpg', { share: vi.fn(), canShare: () => { throw new TypeError('sem suporte') } })).toBe('downloaded')
    expect(downloads).toEqual(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'])
  })

  it('cancelar o menu não é erro; outra falha é repassada', async () => {
    const downloads = stubDownload()
    const canShare = () => true
    const abort = vi.fn(async () => { throw new DOMException('Cancelado', 'AbortError') })
    expect(await shareOrDownload(blob, 'a.jpg', { share: abort, canShare })).toBe('cancelled')
    const denied = vi.fn(async () => { throw new DOMException('Sem permissão', 'NotAllowedError') })
    await expect(shareOrDownload(blob, 'a.jpg', { share: denied, canShare })).rejects.toThrow('Sem permissão')
    expect(downloads).toEqual([])
  })
})

describe('foto escolhida', () => {
  it('recusa o arquivo que não é imagem', async () => {
    await expect(loadPhoto(photoFile('notas.txt', 'text/plain'))).rejects.toBeInstanceOf(PhotoError)
  })

  it('decodifica e reduz no navegador ao que cobre 1080×1920', async () => {
    const bitmap = fakeBitmap(4000, 3000)
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
    const { ctx } = fakeContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as never)
    const photo = await loadPhoto(photoFile())
    expect(photo).toMatchObject({ width: 2560, height: 1920 })
    expect((photo.source as HTMLCanvasElement).width).toBe(2560)
    expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 2560, 1920)
    expect(bitmap.close).toHaveBeenCalled()
  })

  it('explica quando o navegador não abre a imagem', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new DOMException('Formato', 'InvalidStateError') }))
    await expect(loadPhoto(photoFile('foto.heic', 'image/heic'))).rejects.toThrow('Este navegador não conseguiu abrir a imagem')
    vi.stubGlobal('createImageBitmap', vi.fn(async () => fakeBitmap(0, 0)))
    await expect(loadPhoto(photoFile())).rejects.toThrow('A imagem está vazia')
  })

  it('sem createImageBitmap, decodifica por um <img> e libera a URL', async () => {
    vi.stubGlobal('createImageBitmap', undefined)
    class FakeImage { src = ''; naturalWidth = 800; naturalHeight = 1200; decode = vi.fn(async () => undefined) }
    vi.stubGlobal('Image', FakeImage)
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:foto'), revokeObjectURL })
    const { ctx } = fakeContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as never)
    expect(await loadPhoto(photoFile())).toMatchObject({ width: 800, height: 1200 })
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:foto')
  })
})
