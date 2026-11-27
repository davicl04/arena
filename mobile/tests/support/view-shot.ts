import { vi } from 'vitest'

/*
 * react-native-view-shot depende do runtime nativo. Nos testes, `captureRef` devolve um arquivo temporário fictício com o
 * formato pedido; os testes trocam o retorno com `vi.mocked(...)`. `resetViewShot` volta ao padrão.
 */
export const captureRef = vi.fn()
export const releaseCapture = vi.fn()

export function resetViewShot() {
  captureRef.mockReset().mockImplementation(async (_view: unknown, options?: { format?: string }) => `file:///tmp/story.${options?.format ?? 'png'}`)
  releaseCapture.mockReset()
}
resetViewShot()
