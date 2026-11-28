import { vi } from 'vitest'

/** Área de transferência (expo-clipboard): os testes conferem o texto copiado e simulam a falha. */
export const setStringAsync = vi.fn(async (_text: string) => true)
