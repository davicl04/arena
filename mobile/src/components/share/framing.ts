/*
 * Enquadramento da foto do Story montado, em matemática pura (sem React): a foto cobre o quadro 9:16 (cover) e pode ser
 * arrastada e ampliada, sem nunca deixar área vazia. O deslocamento é o do centro da foto em relação ao centro do quadro,
 * em pontos da prévia; a ampliação vai de `ZOOM.min` a `ZOOM.max` sobre o tamanho de cobertura. As funções chamadas
 * pelos gestos são worklets (rodam na thread de UI com o Reanimated) e também funcionam no JavaScript comum.
 */

export interface Size { width: number; height: number }
export interface Framing { zoom: number; x: number; y: number }

/** Faixa de ampliação sobre o tamanho de cobertura (1× já preenche o quadro). */
export const ZOOM = { min: 1, max: 3, step: 0.25 } as const
/** Passo dos botões de acessibilidade para mover a foto, em fração da largura do quadro. */
export const MOVE_STEP = 0.1

export const initialFraming: Framing = { zoom: 1, x: 0, y: 0 }

/** Tamanho da foto que cobre o quadro inteiro na ampliação 1× (o menor que não deixa área vazia). */
export function coverSize(photo: Size, frame: Size): Size {
  'worklet'
  const scale = Math.max(frame.width / photo.width, frame.height / photo.height)
  return { width: photo.width * scale, height: photo.height * scale }
}

export function clampZoom(zoom: number): number {
  'worklet'
  return Math.min(ZOOM.max, Math.max(ZOOM.min, zoom))
}

/** Limita o deslocamento de um eixo a metade da sobra da foto sobre o quadro (`+ 0` evita o −0). */
export function clampOffset(offset: number, displayed: number, frame: number): number {
  'worklet'
  const limit = Math.max(0, (displayed - frame) / 2)
  return Math.min(limit, Math.max(-limit, offset)) + 0
}

/** Ampliação e deslocamento dentro dos limites: a foto sempre cobre o quadro. */
export function clampFraming(framing: Framing, cover: Size, frame: Size): Framing {
  'worklet'
  const zoom = clampZoom(framing.zoom)
  return { zoom, x: clampOffset(framing.x, cover.width * zoom, frame.width), y: clampOffset(framing.y, cover.height * zoom, frame.height) }
}

/** Ações de acessibilidade do enquadramento (leitor de tela): ampliar, reduzir e mover nas quatro direções. */
export type FramingAction = 'increment' | 'decrement' | 'esquerda' | 'direita' | 'cima' | 'baixo'

export const framingActions: { name: FramingAction; label: string }[] = [
  { name: 'increment', label: 'Ampliar a foto' },
  { name: 'decrement', label: 'Reduzir a foto' },
  { name: 'esquerda', label: 'Mover a foto para a esquerda' },
  { name: 'direita', label: 'Mover a foto para a direita' },
  { name: 'cima', label: 'Mover a foto para cima' },
  { name: 'baixo', label: 'Mover a foto para baixo' },
]

/** Um passo de uma ação de acessibilidade, já limitado. */
export function nudgeFraming(framing: Framing, action: FramingAction, cover: Size, frame: Size): Framing {
  const move = frame.width * MOVE_STEP
  const next = { ...framing }
  if (action === 'increment') next.zoom += ZOOM.step
  else if (action === 'decrement') next.zoom -= ZOOM.step
  else if (action === 'esquerda') next.x -= move
  else if (action === 'direita') next.x += move
  else if (action === 'cima') next.y -= move
  else next.y += move
  return clampFraming(next, cover, frame)
}

/** Se a foto, assim enquadrada, cobre o quadro inteiro (nenhuma borda aparece). */
export function coversFrame(framing: Framing, cover: Size, frame: Size): boolean {
  const width = cover.width * framing.zoom
  const height = cover.height * framing.zoom
  const slack = 1e-6
  return width + slack >= frame.width && height + slack >= frame.height
    && Math.abs(framing.x) <= (width - frame.width) / 2 + slack && Math.abs(framing.y) <= (height - frame.height) / 2 + slack
}
