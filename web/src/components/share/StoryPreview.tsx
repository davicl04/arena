import { useEffect, useId, useRef, useState } from 'react'
import type { Dispatch, KeyboardEvent, PointerEvent, ReactNode, SetStateAction } from 'react'
import { drawSticker, measuredLayout, photoBackground, prepareSticker } from './stickerCanvas'
import type { StickerAssets } from './stickerCanvas'
import type { StickerContent } from './stickerContent'
import { emptySpot, STICKER_HEIGHT, STICKER_WIDTH, stickerLayout } from './stickerLayout'
import type { PlatePosition } from './stickerLayout'
import { keyFraming, panBy, zoomBy } from './storyFraming'
import type { Framing } from './storyFraming'
import type { StoryPhoto } from './storyPhoto'

/** Largura da prévia quando o espaço disponível ainda não foi medido. */
const FALLBACK_WIDTH = 288
/** Sensibilidade da roda do mouse (e da pinça do trackpad, que chega como roda com Ctrl). */
const WHEEL_ZOOM = 0.0015

/** Maior caixa 9:16 que cabe no espaço da prévia. */
function fitStory(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return FALLBACK_WIDTH
  return Math.floor(Math.min(width, (height * STICKER_WIDTH) / STICKER_HEIGHT))
}

type Point = { x: number; y: number }

/**
 * Prévia 9:16 do Story: o mesmo desenho da exportação (`drawSticker`), escalado ao espaço da tela e à densidade de
 * pixels. Sem foto, o adesivo aparece sobre o xadrez escuro do fundo transparente, com `empty` (o "Escolher foto") por
 * cima; com foto, o quadro vira o enquadramento: arrastar move, pinça e roda do mouse ampliam e, com o quadro focado, as
 * setas movem e + e − ampliam. A foto e a placa entram pelo mesmo fundo (`photoBackground`) e pela mesma posição da
 * exportação, então a prévia e o arquivo coincidem.
 */
export function StoryPreview({ content, position, photo, framing, onFraming, busy = false, empty }: {
  content: StickerContent
  position: PlatePosition
  photo: StoryPhoto | null
  framing: Framing
  onFraming: Dispatch<SetStateAction<Framing>>
  busy?: boolean
  empty?: ReactNode
}) {
  const areaRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointers = useRef(new Map<number, Point>())
  const hintId = useId()
  const [width, setWidth] = useState(FALLBACK_WIDTH)
  const [assets, setAssets] = useState<StickerAssets | null>(null)
  const height = Math.round((width * STICKER_HEIGHT) / STICKER_WIDTH)

  useEffect(() => {
    const area = areaRef.current
    if (!area) return
    const measure = () => setWidth(fitStory(area.clientWidth, area.clientHeight))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(area)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let alive = true
    void prepareSticker().then(ready => { if (alive) setAssets(ready) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = assets ? canvas?.getContext('2d') : null
    if (!canvas || !ctx || !assets) return
    const ratio = typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    drawSticker(ctx, measuredLayout(ctx, content, position), assets, {
      scale: canvas.width / STICKER_WIDTH,
      background: photo ? photoBackground(photo, framing) : 'checker',
    })
  }, [assets, content, position, photo, framing, width, height])

  // A roda precisa de um ouvinte não passivo para não rolar a página enquanto amplia.
  useEffect(() => {
    const frame = frameRef.current
    if (!frame || !photo) return
    function onWheel(event: WheelEvent) {
      if (!photo || !frame) return
      event.preventDefault()
      const box = frame.getBoundingClientRect()
      const unit = STICKER_WIDTH / (box.width || width)
      const anchor = { x: (event.clientX - box.left - box.width / 2) * unit, y: (event.clientY - box.top - box.height / 2) * unit }
      const factor = Math.exp(-event.deltaY * WHEEL_ZOOM)
      onFraming(current => zoomBy(current, factor, photo, anchor))
    }
    frame.addEventListener('wheel', onWheel, { passive: false })
    return () => frame.removeEventListener('wheel', onWheel)
  }, [photo, width, onFraming])

  /** Converte pixels da tela em pixels do quadro de 360×640, relativos ao centro do quadro. */
  function toFrame(point: Point): Point {
    const box = frameRef.current?.getBoundingClientRect()
    const boxWidth = box?.width || width
    const unit = STICKER_WIDTH / boxWidth
    const left = box?.left ?? 0
    const top = box?.top ?? 0
    const boxHeight = box?.height || height
    return { x: (point.x - left - boxWidth / 2) * unit, y: (point.y - top - boxHeight / 2) * unit }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!photo || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const map = pointers.current
    const previous = map.get(event.pointerId)
    if (!photo || !previous) return
    const before = [...map.values()]
    map.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const after = [...map.values()]
    if (after.length === 1) {
      const from = toFrame(previous)
      const to = toFrame({ x: event.clientX, y: event.clientY })
      onFraming(current => panBy(current, to.x - from.x, to.y - from.y, photo))
      return
    }
    // Pinça: os dois primeiros dedos. O zoom segue a distância entre eles, em torno do ponto médio, que também arrasta.
    const [a0, b0] = before.map(toFrame)
    const [a1, b1] = after.map(toFrame)
    const distance0 = Math.hypot(a0.x - b0.x, a0.y - b0.y)
    const distance1 = Math.hypot(a1.x - b1.x, a1.y - b1.y)
    if (!(distance0 > 0) || !(distance1 > 0)) return
    const mid0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 }
    const mid1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 }
    onFraming(current => panBy(zoomBy(current, distance1 / distance0, photo, mid0), mid1.x - mid0.x, mid1.y - mid0.y, photo))
  }

  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!photo || event.altKey || event.ctrlKey || event.metaKey) return
    if (keyFraming(framing, event.key, event.shiftKey, photo) === null) return
    event.preventDefault()
    onFraming(current => keyFraming(current, event.key, event.shiftKey, photo) ?? current)
  }

  const canvas = <canvas ref={canvasRef} role="img" aria-label={photo ? `Story com a sua foto. ${content.spoken}` : content.spoken}
    data-slot="story-preview" className="block size-full" />

  return <div ref={areaRef} data-slot="story-frame" className="grid size-full min-h-0 place-items-center">
    <div className="relative overflow-hidden rounded-[20px] shadow-[0_10px_30px_rgb(0_0_0/0.35)]" style={{ width, height }} aria-busy={busy}>
      {photo
        ? <div ref={frameRef} tabIndex={0} role="group" aria-label="Enquadramento da foto" aria-describedby={hintId} data-slot="story-framing"
          className="size-full cursor-grab touch-none rounded-[20px] outline-none select-none focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-mint focus-visible:outline-solid active:cursor-grabbing"
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}
          onLostPointerCapture={onPointerEnd} onKeyDown={onKeyDown}>
          {canvas}
          <span id={hintId} className="sr-only">Arraste para mover a foto; pinça ou roda do mouse ampliam. Pelo teclado, as setas movem e + e − ampliam.</span>
        </div>
        : <>{canvas}{empty && <div className="absolute inset-x-0 flex -translate-y-1/2 justify-center px-2"
          style={{ top: `${emptySpot(stickerLayout(content, { position })) * 100}%` }}>{empty}</div>}</>}
    </div>
  </div>
}
