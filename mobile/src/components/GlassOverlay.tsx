import type { ReactNode } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

export const glass = { background: 'rgba(8,20,14,0.92)', text: '#ffffff', muted: '#ffffffb3', line: '#ffffff33', danger: '#ffb4a8', accent: '#8fe0b4' }

export function GlassButton({ label, glyph, onPress, disabled }: { label: string; glyph: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress} hitSlop={4}
    style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.45 : 1 }}>
    <Text style={{ color: glass.text, fontSize: 20 }}>{glyph}</Text>
  </Pressable>
}

// Linha de ação do vidro (menu ••• e ações da conta).
export function GlassRow({ label, onPress, danger, disabled }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress}
    style={{ minHeight: 48, justifyContent: 'center', borderBottomWidth: 1, borderColor: glass.line, opacity: disabled ? 0.5 : 1 }}>
    <Text style={{ color: danger ? glass.danger : glass.text, fontSize: 15, fontWeight: '600' }}>{label}</Text>
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
    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: glass.background, paddingHorizontal: screen ? 22 : 14, paddingTop: screen ? 16 : 6, paddingBottom: screen ? 22 : 10, zIndex: 20, elevation: 20 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {onBack ? <GlassButton label={backLabel} glyph="‹" onPress={onBack} /> : null}
      <Text accessibilityRole="header" numberOfLines={1} style={{ flex: 1, color: glass.text, fontSize: screen ? 19 : 16, fontWeight: '700' }}>{title}</Text>
      <GlassButton label={closeLabel} glyph="✕" onPress={onClose} />
    </View>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 6 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>{children}</ScrollView>
    {footer}
  </View>
}
