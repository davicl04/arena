import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native'
import { Text } from './Text'
import { Button } from './ui'
import { ToastViewport } from './toast/ToastViewport'
import { cx, tw } from '../styles'
import { useBottomInset } from '../hooks/useBottomInset'
import { useThemeColors } from '../hooks/useTheme'
import { Icon } from './Icon'
import { KeyboardScrollView } from './KeyboardScrollView'

// Folha inferior: monte-a apenas enquanto estiver aberta.
// A base fica acima do indicador de início (área segura de baixo); com o teclado aberto, ele fica embaixo do teclado e vale só a folga de 22.
export default function Sheet({ title, onClose, onBack, children }: { title: string; onClose: () => void; onBack?: () => void; children: ReactNode }) {
  const colors = useThemeColors()
  const bottom = useBottomInset()
  return <Modal visible transparent animationType="slide" onRequestClose={onBack ?? onClose}>
    <KeyboardAvoidingView className="grow basis-0" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View className="grow basis-0 justify-end bg-scrim">
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar folha" className="grow basis-0" onPress={onClose} />
        <View className="max-h-[88%] rounded-t-sheet bg-sheet p-5.5" style={{ paddingBottom: Math.max(22, bottom + 8) }}>
          <View className="mb-1.5 flex-row items-center gap-2.5">
            {onBack ? <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onBack} className="min-h-11 min-w-11 justify-center"><Icon name="arrow-left" size={22} color={colors.brand} /></Pressable> : null}
            <Text accessibilityRole="header" className={cx(tw.headingInline, 'grow basis-0')}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} className="min-h-11 min-w-11 items-center justify-center"><Icon name="x" size={20} color={colors['ink-muted']} /></Pressable>
          </View>
          <KeyboardScrollView keyboardShouldPersistTaps="handled">{children}<Button secondary title={onBack ? 'Voltar' : 'Fechar'} onPress={onBack ?? onClose} /></KeyboardScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
    <ToastViewport />
  </Modal>
}
