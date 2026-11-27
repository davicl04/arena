import { EXPORT_SCALE, STICKER_HEIGHT, STICKER_WIDTH } from './stickerLayout'
import { reducedSize } from './storyFraming'
import type { PhotoSize } from './storyFraming'

/*
 * Foto do Story montado: lida do arquivo escolhido (`<input type="file" accept="image/*">`), decodificada e reduzida no
 * próprio navegador ao que cobre 1080×1920 em 1×. A foto nunca sai do aparelho: não há upload, só o arquivo final que a
 * pessoa compartilha ou baixa.
 */

/** Foto pronta para desenhar: um Canvas já reduzido e as dimensões dele. */
export interface StoryPhoto extends PhotoSize { source: CanvasImageSource }

/** Erro de foto com a mensagem para a pessoa. */
export class PhotoError extends Error {}

/** Quadro da exportação (1080×1920). */
const EXPORT_SIZE: PhotoSize = { width: STICKER_WIDTH * EXPORT_SCALE, height: STICKER_HEIGHT * EXPORT_SCALE }

type Decoded = { image: CanvasImageSource; width: number; height: number; release: () => void }

/** Decodifica pelo `createImageBitmap` (respeita a orientação da câmera) ou, sem ele, por um `<img>` com URL de Blob. */
async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    return { image: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return { image, width: image.naturalWidth, height: image.naturalHeight, release: () => undefined }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Lê a foto escolhida. Recusa o que não é imagem e explica quando o navegador não consegue abri-la. */
export async function loadPhoto(file: File): Promise<StoryPhoto> {
  if (!file.type.startsWith('image/')) throw new PhotoError('Escolha um arquivo de imagem (JPEG, PNG ou WebP).')
  let decoded: Decoded
  try {
    decoded = await decode(file)
  } catch {
    throw new PhotoError('Este navegador não conseguiu abrir a imagem. Escolha outra foto (JPEG, PNG ou WebP).')
  }
  try {
    if (!(decoded.width > 0) || !(decoded.height > 0)) throw new PhotoError('A imagem está vazia. Escolha outra foto.')
    const size = reducedSize(decoded, EXPORT_SIZE)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new PhotoError('Não foi possível preparar a foto. Tente de novo.')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(decoded.image, 0, 0, size.width, size.height)
    return { source: canvas, width: size.width, height: size.height }
  } finally {
    decoded.release()
  }
}
