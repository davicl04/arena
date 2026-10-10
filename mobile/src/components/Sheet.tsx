import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { Button, styles } from './ui'

// Folha inferior: monte-a apenas enquanto estiver aberta.
export default function Sheet({ title, onClose, onBack, children }: { title: string; onClose: () => void; onBack?: () => void; children: ReactNode }) {
  return <Modal visible transparent animationType="slide" onRequestClose={onBack ?? onClose}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0008' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar folha" style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 22, maxHeight: '88%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            {onBack ? <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onBack} style={{ minHeight: 44, minWidth: 44, justifyContent: 'center' }}><Text style={{ fontSize: 22, color: '#005a36' }}>‹</Text></Pressable> : null}
            <Text accessibilityRole="header" style={[styles.heading, { flex: 1, marginBottom: 0 }]}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 18, color: '#606965' }}>✕</Text></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">{children}<Button secondary title={onBack ? 'Voltar' : 'Fechar'} onPress={onBack ?? onClose} /></ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>
}
