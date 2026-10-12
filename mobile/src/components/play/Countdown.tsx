import { useEffect, useRef } from 'react'
import { AccessibilityInfo, Text } from 'react-native'
import type { TextStyle } from 'react-native'
import { useNow } from '../../hooks/useNow'
import { formatCountdown, spokenDuration } from '../../utils/clock'
import { parseIso } from '../../utils/format'

/** Texto lido quando o prazo passa. */
export const COUNTDOWN_OVER = 'Prazo encerrado'

/**
 * Contagem regressiva até `until` (ISO), "1:59:42". É um `timer` com nome acessível fixo por minuto ("1 hora e 59 minutos
 * restantes"): o leitor de tela não anuncia cada segundo. Quando o prazo passa durante o uso, anuncia "Prazo encerrado"
 * (`AccessibilityInfo`) e chama `onElapsed` uma vez (a placa lê de novo e a proposta ou a oferta sai da lista). Sem animação:
 * só o texto muda a cada segundo, e o relógio é relido ao voltar ao primeiro plano (`useNow`).
 */
export function Countdown({ until, onElapsed, style }: { until: string; onElapsed?: () => void; style?: TextStyle }) {
  const end = parseIso(until)?.getTime() ?? 0
  const now = useNow(1000)
  const left = Math.max(0, end - now)
  const over = left <= 0
  const notify = useRef(onElapsed)
  useEffect(() => { notify.current = onElapsed }, [onElapsed])
  // Só anuncia a virada: um prazo que já abriu vencido não interrompe quem acabou de chegar à tela.
  const startedOver = useRef(over)
  useEffect(() => {
    if (!over) return
    notify.current?.()
    if (!startedOver.current) AccessibilityInfo.announceForAccessibility(COUNTDOWN_OVER)
  }, [over])
  return <Text testID="countdown" accessibilityRole="timer" accessibilityLabel={over ? COUNTDOWN_OVER : `${spokenDuration(left)} restantes`}
    style={[{ fontVariant: ['tabular-nums'] }, style]}>{formatCountdown(left)}</Text>
}
