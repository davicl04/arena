import { vi } from 'vitest'

/*
 * expo-location depende do runtime nativo. Nos testes, cada função é um `vi.fn` com o padrão de um aparelho que ainda não
 * decidiu a permissão (`undetermined`, pode perguntar) e sem posição; os testes trocam o retorno com `vi.mocked(...)`.
 * `resetLocation` volta ao padrão (o `restoreMocks` do Vitest limpa as implementações entre os testes).
 */
export enum Accuracy { Lowest = 1, Low = 2, Balanced = 3, High = 4, Highest = 5, BestForNavigation = 6 }
export enum PermissionStatus { DENIED = 'denied', GRANTED = 'granted', UNDETERMINED = 'undetermined' }

export const undetermined = { status: PermissionStatus.UNDETERMINED, granted: false, canAskAgain: true, expires: 'never' as const }
export const granted = { status: PermissionStatus.GRANTED, granted: true, canAskAgain: true, expires: 'never' as const }
export const denied = { status: PermissionStatus.DENIED, granted: false, canAskAgain: false, expires: 'never' as const }

export const getForegroundPermissionsAsync = vi.fn()
export const requestForegroundPermissionsAsync = vi.fn()
export const getLastKnownPositionAsync = vi.fn()
export const getCurrentPositionAsync = vi.fn()

export function resetLocation() {
  getForegroundPermissionsAsync.mockReset().mockResolvedValue(undetermined)
  requestForegroundPermissionsAsync.mockReset().mockResolvedValue(denied)
  getLastKnownPositionAsync.mockReset().mockResolvedValue(null)
  getCurrentPositionAsync.mockReset().mockRejectedValue(new Error('Posição indisponível.'))
}
resetLocation()
