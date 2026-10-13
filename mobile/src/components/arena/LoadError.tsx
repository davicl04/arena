import { Text, View } from 'react-native'
import { ApiError } from '../../api/client'
import { colors } from '../../theme'
import { useThemeColors } from '../../hooks/useTheme'
import { Button } from '../ui'
import { ArenaMark } from './ArenaMark'
import { ActionButton, TextAction } from './controls'

/*
 * Erro de carregamento (porta de `LoadError` da web; plano de toasts, C3): o conteúdo da tela ou da seção não veio.
 * `size="screen"` ocupa a tela, com o Coliseu em `ink` a 15% (12% de branco no `tone="dark"`), título de 16 pt, texto e o
 * botão primário "Tentar novamente"; `size="section"` é a variante compacta, para uma seção dentro de uma tela
 * (comentários, histórico, elenco): sem o Coliseu, título de 14 pt e botão de texto. Se a falha foi de conexão (`cause` é
 * um `ApiError` com `isConnection`), o texto vira "Sem conexão com a ARENA. Vamos tentar de novo assim que voltar.":
 * `useResource` e `usePagedList` já recarregam sozinhos, uma vez, quando a conexão volta. É `alert`, como os blocos que substitui.
 */
export const CONNECTION_LOAD_TEXT = 'Sem conexão com a ARENA. Vamos tentar de novo assim que voltar.'

export function LoadError({ title = 'Não foi possível carregar', text, onRetry, size, tone = 'light', cause }: {
  title?: string
  /** O que aconteceu; ignorado quando `cause` é uma falha de conexão. */
  text: string
  onRetry: () => void
  size: 'screen' | 'section'
  tone?: 'light' | 'dark'
  /** O erro lançado pelo carregamento (para reconhecer a falta de conexão). */
  cause?: unknown
}) {
  const c = useThemeColors()
  const dark = tone === 'dark'
  const screen = size === 'screen'
  const offline = cause instanceof ApiError && cause.isConnection
  return <View accessibilityRole="alert" testID={`load-error-${size}`}
    style={{ alignItems: 'center', gap: screen ? 8 : 4, paddingHorizontal: screen ? 24 : 12, paddingVertical: screen ? 48 : 20 }}>
    {screen ? <View testID="load-error-mark" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ marginBottom: 8, opacity: dark ? 0.12 : 0.15 }}>
      <ArenaMark width={150} height={86} color={dark ? '#ffffff' : c.ink} />
    </View> : null}
    <Text accessibilityRole="header" style={{ textAlign: 'center', color: dark ? '#ffffff' : c.ink, fontSize: screen ? 16 : 14, fontWeight: '700' }}>{title}</Text>
    <Text style={{ maxWidth: 280, textAlign: 'center', color: dark ? colors['glass-muted'] : c['ink-muted'], fontSize: 12, lineHeight: 19 }}>{offline ? CONNECTION_LOAD_TEXT : text}</Text>
    {screen
      ? dark ? <ActionButton tone="mint" title="Tentar novamente" onPress={onRetry} fit /> : <Button title="Tentar novamente" onPress={onRetry} />
      : <TextAction title="Tentar novamente" surface={dark ? 'dark' : 'light'} onPress={onRetry} />}
  </View>
}
