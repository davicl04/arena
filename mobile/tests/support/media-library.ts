import { vi } from 'vitest'

/*
 * expo-media-library (API legada, a do `saveToLibraryAsync`) depende do runtime nativo. Padrão: a pessoa concede a
 * permissão só de gravação e a gravação dá certo; os testes trocam o retorno com `vi.mocked(...)`. `resetMediaLibrary`
 * volta ao padrão.
 */
export const grantedPermission = { status: 'granted', granted: true, canAskAgain: true, expires: 'never' as const, accessPrivileges: 'all' as const }
export const deniedPermission = { status: 'denied', granted: false, canAskAgain: false, expires: 'never' as const, accessPrivileges: 'none' as const }

export const requestPermissionsAsync = vi.fn()
export const getPermissionsAsync = vi.fn()
export const saveToLibraryAsync = vi.fn()

export function resetMediaLibrary() {
  requestPermissionsAsync.mockReset().mockResolvedValue(grantedPermission)
  getPermissionsAsync.mockReset().mockResolvedValue(grantedPermission)
  saveToLibraryAsync.mockReset().mockResolvedValue(undefined)
}
resetMediaLibrary()
