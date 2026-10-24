import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useThemeColors } from '../hooks/useTheme'
import { Icon } from './Icon'
import { Button } from './ui'
import { ToastViewport } from './toast/ToastViewport'
import { cx, tw } from '../styles'

// Folha inferior: monte-a apenas enquanto estiver aberta.
export default function Sheet({ title, onClose, onBack, children }: { title: string; onClose: () => void; onBack?: () => void; children: ReactNode }) {
  const colors = useThemeColors()
  const { bottom: inset } = useSafeAreaInsets()
  return <Modal visible transparent animationType="slide" onRequestClose={onBack ?? onClose}>
    <KeyboardAvoidingView className="grow basis-0" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View className="grow basis-0 justify-end bg-scrim">
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar folha" className="grow basis-0" onPress={onClose} />
        <View className="max-h-[88%] rounded-t-sheet bg-sheet p-5.5" style={{ paddingBottom: 22 + inset }}>
          <View className="mb-1.5 flex-row items-center gap-2.5">
            {onBack ? <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onBack} className="min-h-11 min-w-11 justify-center"><Icon name="arrow-left" size={22} color={colors.brand} /></Pressable> : null}
            <Text accessibilityRole="header" className={cx(tw.headingInline, 'grow basis-0')}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} className="min-h-11 min-w-11 items-center justify-center"><Icon name="x" size={20} color={colors['ink-muted']} /></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">{children}<Button secondary title={onBack ? 'Voltar' : 'Fechar'} onPress={onBack ?? onClose} /></ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
    <ToastViewport />
  </Modal>
}
