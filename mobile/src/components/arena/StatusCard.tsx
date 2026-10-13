import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { colors } from '../../theme'
import { useNow } from '../../hooks/useNow'
import { formatRemaining, parseIso } from '../../utils/format'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'
import { ActionButton } from './controls'

/*
 * Cartão S1 do Jogar: verde-escuro, com o anel das horas restantes no estado "aguardando" e, nos demais,
 * o ícone do estado. Serve à vaga reservada e ao comprovante (etapa 2) e ao resultado da partida (etapa 3).
 * O texto ("fecha seg, 20 out · 16:00") vem de quem usa, com `formatDeadline`.
 */
export type StatusTone = 'aguardando' | 'confirmado' | 'divergente' | 'neutro'

const toneIcon: Record<StatusTone, IconName> = { aguardando: 'hourglass', confirmado: 'check', divergente: 'alert', neutro: 'info' }
const toneCircle: Record<StatusTone, { bg: string; fg: string }> = {
  aguardando: { bg: 'rgba(246,194,107,0.15)', fg: colors.amber },
  confirmado: { bg: colors.mint, fg: colors.night },
  divergente: { bg: 'rgba(255,138,154,0.15)', fg: colors['danger-soft'] },
  neutro: { bg: 'rgba(255,255,255,0.1)', fg: colors.mint },
}

const RING_RADIUS = 20
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

export interface DeadlineRingProps {
  /** Prazo (ISO). */
  deadline: string
  /** Início da janela do prazo (ISO), como a reserva ou o início da partida; sem ele, `windowHours` antes do prazo. */
  windowStart?: string | null
  /** Duração da janela, quando não há `windowStart` (48 h na reserva e no resultado). */
  windowHours?: number
}

/** Anel âmbar com as horas restantes ("46 h"); o texto completo fica para leitores de tela. */
export function DeadlineRing({ deadline, windowStart, windowHours = 48 }: DeadlineRingProps) {
  const now = useNow(60_000)
  const end = parseIso(deadline)?.getTime() ?? now
  const start = parseIso(windowStart)?.getTime() ?? end - windowHours * 3_600_000
  const total = Math.max(1, end - start)
  const left = end - now
  const fraction = Math.min(1, Math.max(0, left / total))
  const remaining = formatRemaining(left)
  return <View accessible accessibilityRole="timer" accessibilityLabel={remaining.long} testID="deadline-ring" style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
    <Svg width={48} height={48} viewBox="0 0 48 48" style={{ position: 'absolute' }}>
      <Circle cx={24} cy={24} r={RING_RADIUS} fill="none" stroke="#ffffff22" strokeWidth={4} />
      <Circle cx={24} cy={24} r={RING_RADIUS} fill="none" stroke={colors.amber} strokeWidth={4} strokeLinecap="round"
        strokeDasharray={[RING_LENGTH * fraction, RING_LENGTH]} rotation={-90} origin="24, 24" />
    </Svg>
    <Text style={{ color: colors.amber, fontSize: 10, fontWeight: '800' }}>{remaining.short}</Text>
  </View>
}

export interface StatusCardProps {
  tone: StatusTone
  title: string
  /** Texto do cartão; use `<Text className="font-bold text-white">` para o prazo ou os placares. */
  children?: ReactNode
  /** Prazo (ISO): no tom "aguardando", troca o ícone pelo anel das horas restantes. */
  deadline?: string | null
  windowStart?: string | null
  windowHours?: number
  /** Ícone no lugar do padrão do tom. */
  icon?: IconName
  /** Pílula menta à direita, como "+3 pts" ou o nome do time inscrito. */
  pill?: string
  /** Botões do cartão (`StatusCardButton`). */
  actions?: ReactNode
}

/** Cartão de estado S1 (aguardando, confirmado, divergente ou genérico). */
export function StatusCard({ tone, title, children, deadline, windowStart, windowHours, icon, pill, actions }: StatusCardProps) {
  const circle = toneCircle[tone]
  const ring = tone === 'aguardando' && parseIso(deadline) ? deadline : null
  return <View testID="status-card"
    style={{ flexDirection: 'row', gap: 12, borderRadius: 16, backgroundColor: colors.forest, padding: 14, alignItems: tone === 'divergente' || actions ? 'flex-start' : 'center' }}>
    {ring ? <DeadlineRing deadline={ring} windowStart={windowStart} windowHours={windowHours} />
      : <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: circle.bg, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon ?? toneIcon[tone]} size={20} color={circle.fg} /></View>}
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text accessibilityRole="header" className="text-[13px] font-bold text-white">{title}</Text>
      {children ? <Text className="mt-[3px] text-[10.5px] leading-[15px]" style={{ color: 'rgba(255,255,255,0.7)' }}>{children}</Text> : null}
      {actions ? <View className="mt-2.5 flex-row flex-wrap gap-2">{actions}</View> : null}
    </View>
    {pill ? <View style={{ borderRadius: 999, backgroundColor: colors.mint, paddingHorizontal: 10, paddingVertical: 5 }}><Text style={{ color: colors.night, fontSize: 11, fontWeight: '800' }}>{pill}</Text></View> : null}
  </View>
}

/** Botão do cartão S1: `primary` em menta e `secondary` com contorno claro. */
export function StatusCardButton({ title, onPress, variant = 'primary', disabled }: { title: string; onPress: () => void; variant?: 'primary' | 'secondary'; disabled?: boolean }) {
  return <ActionButton size="sm" tone={variant === 'primary' ? 'mint' : 'line'} title={title} onPress={onPress} disabled={disabled} />
}
