import { useCallback, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import type { User } from '../api/client'
import BottomNav from '../components/BottomNav'
import { ConnectionNotice } from '../components/ConnectionNotice'
import ScreenHeader from '../components/ScreenHeader'
import { useKeyboardVisible } from '../hooks/useBottomInset'
import { useNotificationSummary } from '../hooks/useNotificationSummary'
import { ToastViewport } from '../components/toast/ToastViewport'
import { usePlayBoard } from '../hooks/usePlayBoard'
import { screens } from '../navigation/screens'
import type { ScreenComponent } from '../navigation/screens'
import { activeNavFor, hasOwnHeader, titleFor } from '../navigation/routes'
import { TopAreaProvider } from '../navigation/topArea'
import type { TopArea } from '../navigation/topArea'
import { useThemeColors } from '../hooks/useTheme'
import { colors as fixedColors } from '../theme'
import type { ScreenName } from '../navigation/routes'
import { currentOf } from '../navigation/stack'
import { useNavigation } from '../navigation/useNavigation'

/**
 * Área logada: a pilha de telas (`useNavigation`), a barra superior e a navegação inferior. As abas
 * (Início | Ranking | JOGAR | Comunidade | Perfil) zeram a pilha; as demais telas empilham com voltar, inclusive o botão
 * voltar do Android. `joinToken` é o token do link do time recebido pelo sistema: abre a tela `join` uma vez e só existe
 * em memória; se a sessão expirar com ela ainda aberta, o token volta ao App para o próximo login reabri-la.
 *
 * O shell também lê a placa do Jogar (`usePlayBoard`, `GET /me/play`): acende o ponto do JOGAR na navegação e entrega
 * `playBoard` e `refreshPlayBoard` a toda tela (`ScreenContext`). Lê ainda o resumo das notificações (`useNotificationSummary`, relido na troca de aba
 * raiz, na volta ao primeiro plano e a cada 60 s), entregue como `notificationSummary`.
 */
export default function ArenaShell({ user, onUser, onLogout, onExpired: expireSession, joinToken, onJoinOpened }: {
  user: User; onUser: (user: User) => void; onLogout: () => void
  /** Sessão expirada; `pendingJoinToken` devolve ao App o link do time ainda aberto. */
  onExpired: (pendingJoinToken?: string) => void
  joinToken?: string | null
  /** Consome o token, para um novo login na mesma sessão do app não reabrir o link. */
  onJoinOpened?: () => void
}) {
  const { stack, current, root, navigation } = useNavigation()
  useEffect(() => {
    if (!joinToken) return
    navigation.go('join', { token: joinToken })
    onJoinOpened?.()
  }, [joinToken, onJoinOpened, navigation])
  const stackRef = useRef(stack)
  useEffect(() => { stackRef.current = stack }, [stack])
  const onExpired = useCallback(() => {
    // Só o link do time que está aberto agora volta à memória; um `join` mais abaixo na pilha já ficou para trás.
    const top = currentOf(stackRef.current)
    expireSession(top.screen === 'join' ? top.params.token : undefined)
  }, [expireSession])
  // Placa do Jogar (GET /me/play): alimenta as telas do Jogar e o ponto do JOGAR; relida ao abrir o Jogar ou o Início.
  const playBoard = usePlayBoard(onExpired, current.screen === 'play' || current.screen === 'home')
  // Resumo das notificações (GET /me/notifications/summary): o sino de cada aba raiz e a tela de notificações; relido a cada troca de aba
  // e ao entrar ou voltar à aba vindo de uma subtela (uma ação lá pode ter resolvido uma pendência).
  const notificationSummary = useNotificationSummary(onExpired, current.screen === root ? root : `${root}:subtela`)
  const Body = screens[current.screen] as ScreenComponent<ScreenName>
  const title = titleFor(current)
  // Faixa da barra de status (navigation/topArea): cada tela declara o próprio topo; a capa do perfil sobe por baixo dela.
  const insets = useSafeAreaInsets()
  const themeColors = useThemeColors()
  const [topArea, setTopArea] = useState<TopArea>('app')
  // Com o teclado aberto a navegação inferior sai de cena: o `KeyboardAvoidingView` do App leva o shell até a borda do
  // teclado, e a barra ficaria entre o campo em foco (justificativa, chat da partida) e o teclado.
  const keyboard = useKeyboardVisible()
  return <TopAreaProvider value={setTopArea}>
    {topArea === 'bleed' ? null : <View testID="status-area" style={{ height: insets.top, backgroundColor: topArea === 'forest' ? fixedColors.forest : themeColors.app }} />}
    {topArea === 'forest' ? <StatusBar style="light" /> : null}
    {/* As abas e as telas com placa escura ou capa desenham o próprio topo (`hasOwnHeader`), como o `ArenaPage` da web; as
        demais telas usam o cabeçalho com voltar. */}
    {hasOwnHeader(current.screen) ? null : <ScreenHeader title={title} onBack={navigation.back} />}
    <View className="grow basis-0"><Body key={`${stack.length}-${current.screen}`} user={user} navigation={navigation} onUser={onUser} onLogout={onLogout} onExpired={onExpired}
      playBoard={playBoard} refreshPlayBoard={playBoard.reload} notificationSummary={notificationSummary} params={current.params as never} title={title} /></View>
    {keyboard ? null : <BottomNav active={activeNavFor(current.screen, root)} onGo={tab => navigation.go(tab)} playAttention={Boolean(playBoard.board?.attention)} />}
    {/* Faixa e folha de "Sem conexão" e os toasts: absolutos sobre a navegação inferior (o toast sobe com a faixa). */}
    <ConnectionNotice />
    <ToastViewport placement="nav" />
  </TopAreaProvider>
}
