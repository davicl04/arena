import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { colors } from '../../theme'
import { useThemeColors } from '../../hooks/useTheme'
import { Icon } from '../Icon'
import { ToastViewport } from '../toast/ToastViewport'

/**
 * Folha inferior das ações e confirmações de Meus times e do Jogar: clara (atleta, sair do time, encerrar) ou escura
 * (convites recebidos, proposta, oferta de vaga, busca). Diferente da `Sheet` comum, não traz o botão "Fechar" no rodapé:
 * as ações ficam no conteúdo. Monte-a apenas enquanto estiver aberta. O fundo e o botão do Android fecham, a menos que
 * `locked` (ação em andamento).
 */
export function ActionSheet({ title, onClose, dark = false, locked = false, children }: { title: string; onClose: () => void; dark?: boolean; locked?: boolean; children: ReactNode }) {
  const theme = useThemeColors()
  const close = () => { if (!locked) onClose() }
  const ink = dark ? '#ffffff' : theme.heading
  return <Modal visible transparent animationType="slide" onRequestClose={close}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar folha" onPress={close} style={{ flex: 1 }} />
        <View accessibilityViewIsModal style={{ maxHeight: '88%', borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: dark ? colors.forest : theme.sheet, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Text accessibilityRole="header" style={{ flex: 1, color: ink, fontSize: 18, fontWeight: '800' }}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar" accessibilityState={{ disabled: locked }} disabled={locked} onPress={close}
              style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', opacity: locked ? 0.5 : 1 }}>
              <Icon name="x" size={20} color={dark ? 'rgba(255,255,255,0.7)' : theme['ink-muted']} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
    <ToastViewport />
  </Modal>
}
