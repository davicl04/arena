import { vi } from 'vitest'

/** Recorte de imagem (expo-image-manipulator): guarda o último recorte pedido e devolve um arquivo com as medidas dele. */
export const SaveFormat = { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' } as const
export const crops: { originX: number; originY: number; width: number; height: number }[] = []
export const ImageManipulator = {
  manipulate: vi.fn((uri: string) => {
    let rect = { originX: 0, originY: 0, width: 0, height: 0 }
    const context = {
      crop: (next: typeof rect) => { rect = next; crops.push(next); return context },
      renderAsync: async () => ({ saveAsync: async () => ({ uri: `${uri}#recorte`, width: rect.width, height: rect.height }) }),
    }
    return context
  }),
}
