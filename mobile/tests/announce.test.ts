import { AccessibilityInfo, Platform } from 'react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { announce } from '../src/utils/announce'

vi.mock('react-native', () => ({ Platform: { OS: 'android' }, AccessibilityInfo: { announceForAccessibility: vi.fn() } }))

describe('announce: anúncio das confirmações a leitores de tela', () => {
  beforeEach(() => { vi.mocked(AccessibilityInfo.announceForAccessibility).mockReset() })

  it('no iOS, que não tem região ao vivo, anuncia explicitamente', () => {
    Platform.OS = 'ios'
    announce('Comprovante enviado.')
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Comprovante enviado.')
  })

  it('no Android a região ao vivo da mensagem já anuncia: não duplica', () => {
    Platform.OS = 'android'
    announce('Comprovante enviado.')
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled()
  })

  it('mensagem vazia não é anunciada', () => {
    Platform.OS = 'ios'
    announce('')
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled()
  })
})
