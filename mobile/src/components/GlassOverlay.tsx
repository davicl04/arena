import type { ReactNode } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { cx } from '../styles'
export function GlassButton({ label, glyph, onPress, disabled }: { label: string; glyph: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress} hitSlop={4}
    className={cx('min-h-11 min-w-11 items-center justify-center', disabled && 'opacity-45')}>
    <Text className="text-[20px] text-white">{glyph}</Text>
  </Pressable>
}
// Linha de ação do vidro (menu ••• e ações da conta).
export function GlassRow({ label, onPress, danger, disabled }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress}
    className={cx('min-h-12 justify-center border-b border-glass-line', disabled && 'opacity-50')}>
    <Text className={cx('text-[15px] font-semibold', danger ? 'text-glass-danger' : 'text-white')}>{label}</Text>
  </Pressable>
}
/**
 * Vidro escuro absoluto: sobre a foto (`media`) ou sobre a tela inteira (`screen`).
 * Sem `expo-blur`: o efeito é uma View translúcida. O conteúdo rola dentro do vidro.
 */
export default function GlassOverlay({ title, onClose, onBack, backLabel = 'Voltar', closeLabel = 'Fechar', variant = 'media', footer, children }: {
  title: string; onClose: () => void; onBack?: () => void; backLabel?: string; closeLabel?: string; variant?: 'media' | 'screen'; footer?: ReactNode; children: ReactNode
}) {
  const screen = variant === 'screen'
  return <View accessibilityViewIsModal accessibilityLabel={title}
    className={cx('absolute top-0 right-0 bottom-0 left-0 z-20 bg-glass elevation-overlay', screen ? 'px-5.5 pt-4 pb-5.5' : 'px-3.5 pt-1.5 pb-2.5')}>
    <View className="flex-row items-center gap-1.5">
      {onBack ? <GlassButton label={backLabel} glyph="‹" onPress={onBack} /> : null}
      <Text accessibilityRole="header" numberOfLines={1} className={cx('grow basis-0 font-bold text-white', screen ? 'text-[19px]' : 'text-[16px]')}>{title}</Text>
      <GlassButton label={closeLabel} glyph="✕" onPress={onClose} />
    </View>
    <ScrollView className="grow basis-0" contentContainerClassName="py-1.5" keyboardShouldPersistTaps="handled" nestedScrollEnabled>{children}</ScrollView>
    {footer}
  </View>
}
