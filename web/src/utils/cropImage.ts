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
}

/**
 * Recorta `area` (em pixels da imagem original, já na proporção escolhida no
 * Cropper) e devolve um WebP. `maxWidth`/`maxHeight` reduzem, sem ampliar.
 */
export async function cropImage(source: string, area: Area, options: CropOptions = {}): Promise<Blob> {
  const { quality = 0.9, maxWidth = Infinity, maxHeight = Infinity } = options
  const image = new Image()
  image.src = source
  await image.decode()
  const scale = Math.min(1, maxWidth / area.width, maxHeight / area.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(area.width * scale))
  canvas.height = Math.max(1, Math.round(area.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Não foi possível preparar o recorte.')
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('Não foi possível preparar o recorte.')), 'image/webp', quality))
}
