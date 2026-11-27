import { vi } from 'vitest'

/*
 * expo-sharing depende do runtime nativo. Padrão: o aparelho oferece o menu de compartilhar e o menu fecha sem erro (a
 * promessa termina igual quando a pessoa envia ou cancela, como no aparelho); os testes trocam o retorno com
 * `vi.mocked(...)`. `resetSharing` volta ao padrão.
 */
export const isAvailableAsync = vi.fn()
export const shareAsync = vi.fn()

export function resetSharing() {
  isAvailableAsync.mockReset().mockResolvedValue(true)
  shareAsync.mockReset().mockResolvedValue(undefined)
}
resetSharing()
