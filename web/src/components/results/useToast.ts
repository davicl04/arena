import { useCallback, useEffect, useRef, useState } from 'react'

export interface ToastState { id: number; text: string; icon: 'ok' | 'info' }

export function useToast(duration = 4200) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((text: string, icon: ToastState['icon'] = 'ok') => {
    window.clearTimeout(timer.current)
    setToast({ id: Date.now(), text, icon })
    timer.current = window.setTimeout(() => setToast(null), duration)
  }, [duration])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return { toast, show }
}
