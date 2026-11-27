import { Component, Fragment } from 'react'
import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { Text } from './Text'
import { Logo } from './Brand'
import { StatusBar } from 'expo-status-bar'
import { colors } from '../theme'

/** Estado de erro da árvore inteira: placa `forest` com um cartão e o botão que tenta de novo. Sem detalhes técnicos. */
export function ErrorPlate({ onRetry }: { onRetry: () => void }) {
  return <View testID="error-plate" style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.forest }}>
    <StatusBar style="light" />
    <View style={{ marginBottom: 20 }}><Logo tone="dark" /></View>
    <View style={{ borderRadius: 20, backgroundColor: '#ffffff', padding: 20 }}>
      <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 20, fontWeight: '800' }}>Algo deu errado</Text>
      <Text accessibilityRole="alert" style={{ marginTop: 8, color: colors['ink-muted'], fontSize: 14, lineHeight: 21 }}>
        Não foi possível mostrar esta tela. Tente de novo; se continuar, feche e abra o aplicativo.
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Tentar de novo" onPress={onRetry}
        style={{ marginTop: 16, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: colors.brand, paddingHorizontal: 16 }}>
        <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>Tentar de novo</Text>
      </Pressable>
    </View>
  </View>
}

/**
 * Rede de segurança do app: um erro ao desenhar qualquer tela troca a árvore por `ErrorPlate`, em vez de deixar o app
 * fechar. "Tentar de novo" remonta a árvore do zero (a conta e o login continuam, porque o estado deles fica acima).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 }
  static getDerivedStateFromError() { return { failed: true } }
  retry = () => this.setState(old => ({ failed: false, attempt: old.attempt + 1 }))
  render() {
    if (this.state.failed) return <ErrorPlate onRetry={this.retry} />
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>
  }
}
