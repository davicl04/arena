import { AccessibilityInfo, Platform } from 'react-native'

/**
 * Anuncia uma mensagem a leitores de tela (confirmações de envio, como "Comprovante enviado"). No Android, a região ao
 * vivo (`accessibilityLiveRegion`) da própria mensagem já a anuncia; o iOS não tem região ao vivo, e o anúncio é
 * explícito. Mensagens vazias não são anunciadas.
 */
export function announce(message: string) {
  if (Platform.OS === 'ios' && message) AccessibilityInfo.announceForAccessibility(message)
}
