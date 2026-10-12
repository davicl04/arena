import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { placementRequired } from '../../data/arena'
import { colors } from '../../theme'

/*
 * Círculo tracejado "n/3". Tamanhos: xs 16 (pílulas) · sm 26 (cabeçalho da partida) · md 30 (célula de formato) ·
 * lg 44 (linha do elo). Tons: `mint` (linha do elo na placa: número menta), `dark` (pílulas e carteirinha sobre a
 * placa) e `light` (fundos claros).
 */
const badgeSizes = {
  xs: { box: 16, border: 1, font: 6.5 },
  sm: { box: 26, border: 1.5, font: 8.5 },
  md: { box: 30, border: 1.5, font: 9 },
  lg: { box: 44, border: 2, font: 12 },
} as const
const badgeTones = {
  mint: { border: 'rgba(255,255,255,0.35)', text: colors.mint, opacity: 1 },
  dark: { border: '#ffffff', text: '#ffffff', opacity: 0.75 },
  light: { border: colors['ink-muted'], text: colors['ink-muted'], opacity: 1 },
} as const

export type PlacementBadgeSize = keyof typeof badgeSizes
export type PlacementTone = keyof typeof badgeTones

/** Partidas contadas, limitadas a 0…required. */
const clampPlayed = (played: number, required: number) => Math.min(Math.max(0, Math.floor(played)), required)

export interface PlacementBadgeProps {
  /** Partidas confirmadas na classificação. */
  played: number
  /** Partidas exigidas para sair da classificação (3 no futebol e no tênis). */
  required?: number
  size?: PlacementBadgeSize
  tone?: PlacementTone
  /** Use quando "n de 3 partidas" já aparece no texto vizinho. */
  decorative?: boolean
}

/** Círculo tracejado com "n/3", no lugar do elo enquanto a classificação não termina. */
export function PlacementBadge({ played, required = placementRequired, size = 'sm', tone = 'dark', decorative = false }: PlacementBadgeProps) {
  const done = clampPlayed(played, required)
  const measure = badgeSizes[size]
  const look = badgeTones[tone]
  return <View accessible={!decorative} accessibilityRole={decorative ? undefined : 'image'} accessibilityLabel={decorative ? undefined : `${done} de ${required} partidas de classificação`}
    importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
    style={{ width: measure.box, height: measure.box, borderRadius: measure.box / 2, borderWidth: measure.border, borderStyle: 'dashed', borderColor: look.border, opacity: look.opacity, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: look.text, fontSize: measure.font, fontWeight: '800' }}>{done}/{required}</Text>
  </View>
}

export interface PlacementMeterProps {
  played: number
  required?: number
  /** Título da linha, como "Em classificação" ou "Em classificação como goleiro". */
  title?: ReactNode
  /** Complemento depois de "n de 3 partidas", como "enfrenta qualquer nível" (linha do elo do Jogar). */
  hint?: string
  /** `dark` sobre a placa `forest` (padrão) ou `light` sobre fundos claros. */
  tone?: 'dark' | 'light'
}

/**
 * Linha da classificação (H1 do Jogar): "n/3" no círculo tracejado, título, "n de 3 partidas" e três
 * barrinhas. É o que aparece no lugar do elo para quem ainda não tem classificação.
 */
export function PlacementMeter({ played, required = placementRequired, title = 'Em classificação', hint, tone = 'dark' }: PlacementMeterProps) {
  const done = clampPlayed(played, required)
  const dark = tone === 'dark'
  const text = `${done} de ${required} partidas${hint ? ` · ${hint}` : ''}`
  return <View accessible accessibilityLabel={`${typeof title === 'string' ? title : 'Em classificação'}, ${text}`} className="flex-row items-center gap-2.5">
    <PlacementBadge played={done} required={required} size="lg" tone={dark ? 'mint' : 'light'} decorative />
    <View className="shrink">
      {title ? <Text className={dark ? 'text-[14px] font-bold text-white' : 'text-[14px] font-bold text-ink'}>{title}</Text> : null}
      <Text className="mt-0.5 text-[10.5px]" style={{ color: dark ? 'rgba(255,255,255,0.65)' : colors['ink-muted'] }}>{text}</Text>
      <View className="mt-1.5 flex-row gap-1">
        {Array.from({ length: required }, (_, index) => <View key={index} testID={index < done ? 'placement-bar-on' : 'placement-bar'}
          style={{ height: 5, width: 22, borderRadius: 3, backgroundColor: index < done ? (dark ? colors.mint : colors.brand) : (dark ? 'rgba(255,255,255,0.15)' : colors.line) }} />)}
      </View>
    </View>
  </View>
}
