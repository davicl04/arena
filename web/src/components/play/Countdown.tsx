import { useEffect, useRef } from 'react'
import { useNow } from '@/hooks/useNow'
import { cn } from '@/lib/utils'
import { formatCountdown, spokenDuration } from '@/utils/clock'
import { parseIso } from '@/utils/format'

/**
 * Contagem regressiva até `until` (ISO), "1:59:42". É um `timer` (sem anúncio a cada segundo): o leitor de tela lê
 * "1 hora e 59 minutos restantes" quando alguém chega até ele. Quando o prazo passa, chama `onElapsed` uma vez
 * (a placa lê de novo e a proposta ou a oferta sai da lista).
 */
export function Countdown({ until, onElapsed, className }: { until: string; onElapsed?: () => void; className?: string }) {
  const end = parseIso(until)?.getTime() ?? 0
  const now = useNow(1000)
  const left = Math.max(0, end - now)
  const over = left <= 0
  const notify = useRef(onElapsed)
  useEffect(() => { notify.current = onElapsed }, [onElapsed])
  useEffect(() => { if (over) notify.current?.() }, [over])
  return <span role="timer" data-slot="countdown" className={cn('tabular-nums', className)}>
    <span aria-hidden="true">{formatCountdown(left)}</span>
    <span className="sr-only">{over ? 'Prazo encerrado' : `${spokenDuration(left)} restantes`}</span>
  </span>
}
