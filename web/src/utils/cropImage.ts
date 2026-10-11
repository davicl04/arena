import type { Area } from 'react-easy-crop'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function validateImageFile(file: File): string | null {
  if (file.size > MAX_IMAGE_BYTES) return 'A imagem deve ter até 5 MiB.'
  if (file.type && !IMAGE_TYPES.includes(file.type)) return 'Use uma imagem JPEG, PNG ou WebP.'
  return null
}

interface CropOptions {
  quality?: number
  maxWidth?: number
  maxHeight?: number
  /** Giro em graus aplicado no Cropper; a área recortada é relativa à imagem já girada. */
  rotation?: number
}

/** Desenha a imagem girada numa tela do tamanho da caixa que a contém, como o Cropper calcula a área. */
function rotated(image: HTMLImageElement, rotation: number): CanvasImageSource {
  const radians = rotation * Math.PI / 180
  const sin = Math.abs(Math.sin(radians))
  const cos = Math.abs(Math.cos(radians))
  const { naturalWidth: width, naturalHeight: height } = image
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * cos + height * sin)
  canvas.height = Math.round(width * sin + height * cos)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Não foi possível preparar o recorte.')
  context.translate(canvas.width / 2, canvas.height / 2)
  context.rotate(radians)
  context.drawImage(image, -width / 2, -height / 2)
  return canvas
}

/**
 * Recorta `area` (em pixels da imagem original, já na proporção escolhida no
 * Cropper) e devolve um WebP. `maxWidth`/`maxHeight` reduzem, sem ampliar.
 */
export async function cropImage(source: string, area: Area, options: CropOptions = {}): Promise<Blob> {
  const { quality = 0.9, maxWidth = Infinity, maxHeight = Infinity, rotation = 0 } = options
  const image = new Image()
  image.src = source
  await image.decode()
  const drawable = rotation % 360 === 0 ? image : rotated(image, rotation)
  const scale = Math.min(1, maxWidth / area.width, maxHeight / area.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(area.width * scale))
  canvas.height = Math.max(1, Math.round(area.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Não foi possível preparar o recorte.')
  context.drawImage(drawable, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('Não foi possível preparar o recorte.')), 'image/webp', quality))
}
