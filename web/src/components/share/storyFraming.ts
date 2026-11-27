import { STICKER_HEIGHT, STICKER_WIDTH } from './stickerLayout'

/*
 * Enquadramento da foto do Story montado, sem Canvas nem DOM: tudo no quadro de 360×640 (o mesmo do adesivo), para que a
 * prévia (escalada à tela) e a exportação (×3, 1080×1920) desenhem a foto no mesmo lugar. A foto sempre cobre o quadro
 * (cover): o zoom vai de 1× (a foto encosta nas bordas do quadro pelo lado mais justo) a 3×, e o deslocamento é limitado
 * para que nenhuma borda da foto entre no quadro. Nunca sobra área vazia.
 */

export const MIN_ZOOM = 1
export const MAX_ZOOM = 3
/** Fator de cada passo de zoom pelos botões e pelas teclas + e −. */
export const ZOOM_STEP = 1.25
/** Passo das setas do teclado, em pixels do quadro de 360×640 (Shift multiplica por 4). */
export const PAN_STEP = 12

/** Dimensões da foto (já decodificada e reduzida), em pixels da imagem. */
export interface PhotoSize { width: number; height: number }

/** Zoom e deslocamento do centro da foto em relação ao centro do quadro, em pixels do quadro. */
export interface Framing { zoom: number; x: number; y: number }

export const INITIAL_FRAMING: Framing = { zoom: MIN_ZOOM, x: 0, y: 0 }

/** Retângulo da foto no quadro de 360×640. */
export interface PhotoRect { x: number; y: number; w: number; h: number }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Escala que faz a foto cobrir o quadro em 1× (pixels do quadro por pixel da imagem). */
export function coverScale(photo: PhotoSize): number {
  return Math.max(STICKER_WIDTH / photo.width, STICKER_HEIGHT / photo.height)
}

/** Tamanho da foto no quadro com o zoom dado. */
export function photoSize(photo: PhotoSize, zoom: number): { w: number; h: number } {
  const scale = coverScale(photo) * zoom
  return { w: photo.width * scale, h: photo.height * scale }
}

/** Mantém o zoom na faixa e o deslocamento dentro do que a foto cobre; o resultado nunca deixa área vazia. */
export function clampFraming(framing: Framing, photo: PhotoSize): Framing {
  const zoom = clamp(Number.isFinite(framing.zoom) ? framing.zoom : MIN_ZOOM, MIN_ZOOM, MAX_ZOOM)
  const { w, h } = photoSize(photo, zoom)
  const maxX = Math.max(0, (w - STICKER_WIDTH) / 2)
  const maxY = Math.max(0, (h - STICKER_HEIGHT) / 2)
  // `|| 0` também troca o −0 do limite por 0.
  return { zoom, x: clamp(framing.x || 0, -maxX, maxX) || 0, y: clamp(framing.y || 0, -maxY, maxY) || 0 }
}

/** Move a foto `dx`/`dy` pixels do quadro. */
export function panBy(framing: Framing, dx: number, dy: number, photo: PhotoSize): Framing {
  return clampFraming({ ...framing, x: framing.x + dx, y: framing.y + dy }, photo)
}

/**
 * Amplia (fator > 1) ou reduz a foto em torno de um ponto do quadro (`anchor`, relativo ao centro; o centro por padrão):
 * o ponto da foto sob o dedo, o cursor ou o centro continua no mesmo lugar, até onde os limites deixam.
 */
export function zoomBy(framing: Framing, factor: number, photo: PhotoSize, anchor: { x: number; y: number } = { x: 0, y: 0 }): Framing {
  const zoom = clamp(framing.zoom * factor, MIN_ZOOM, MAX_ZOOM)
  const ratio = zoom / framing.zoom
  return clampFraming({ zoom, x: anchor.x - (anchor.x - framing.x) * ratio, y: anchor.y - (anchor.y - framing.y) * ratio }, photo)
}

/** Onde desenhar a foto no quadro de 360×640. */
export function photoRect(framing: Framing, photo: PhotoSize): PhotoRect {
  const { w, h } = photoSize(photo, framing.zoom)
  return { x: (STICKER_WIDTH - w) / 2 + framing.x, y: (STICKER_HEIGHT - h) / 2 + framing.y, w, h }
}

/** Teclas do quadro focado: setas movem, + e − ampliam. Devolve `null` para as demais teclas. */
export function keyFraming(framing: Framing, key: string, shift: boolean, photo: PhotoSize): Framing | null {
  const step = shift ? PAN_STEP * 4 : PAN_STEP
  switch (key) {
    case 'ArrowLeft': return panBy(framing, -step, 0, photo)
    case 'ArrowRight': return panBy(framing, step, 0, photo)
    case 'ArrowUp': return panBy(framing, 0, -step, photo)
    case 'ArrowDown': return panBy(framing, 0, step, photo)
    case '+': case '=': case 'Add': return zoomBy(framing, ZOOM_STEP, photo)
    case '-': case '_': case 'Subtract': return zoomBy(framing, 1 / ZOOM_STEP, photo)
    default: return null
  }
}

/** Maior tamanho útil da foto: o que cobre 1080×1920 em 1× (nunca amplia uma foto menor). */
export function reducedSize(photo: PhotoSize, cover: PhotoSize): PhotoSize {
  const scale = Math.min(1, Math.max(cover.width / photo.width, cover.height / photo.height))
  return { width: Math.max(1, Math.round(photo.width * scale)), height: Math.max(1, Math.round(photo.height * scale)) }
}
