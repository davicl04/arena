import { useCallback, useEffect, useRef, useState } from 'react'
import { announce } from '../../utils/announce'

export interface ToastState { id: number; text: string; icon: 'ok' | 'info' }

/**
 * Aviso passageiro do cartão de resultado (porta de `useToast` da web): `show` mostra a pílula por `duration` ms e, no
 * iOS (que não tem região viva), anuncia o texto aos leitores de tela. O temporizador é limpo ao desmontar.
 */
export function useToast(duration = 4200) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const counter = useRef(0)
  const show = useCallback((text: string, icon: ToastState['icon'] = 'ok') => {
    clearTimeout(timer.current)
    announce(text)
    counter.current += 1
    setToast({ id: counter.current, text, icon })
    timer.current = setTimeout(() => setToast(null), duration)
  }, [duration])
  useEffect(() => () => clearTimeout(timer.current), [])
  return { toast, show }
}
