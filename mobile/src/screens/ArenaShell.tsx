import { useCallback, useEffect, useRef } from 'react'
import { Text, View } from 'react-native'
import type { User } from '../api/client'
import BottomNav from '../components/BottomNav'
import ScreenHeader from '../components/ScreenHeader'
import { usePlayBoard } from '../hooks/usePlayBoard'
import { screens } from '../navigation/screens'
import type { ScreenComponent } from '../navigation/screens'
import { activeNavFor, hasOwnHeader, isRootScreen, titleFor } from '../navigation/routes'
import type { ScreenName } from '../navigation/routes'
import { currentOf } from '../navigation/stack'
import { useNavigation } from '../navigation/useNavigation'
import { cx, tw } from '../styles'

/**
 * Área logada: a pilha de telas (`useNavigation`), a barra superior e a navegação inferior. As abas
 * (Início | Ranking | JOGAR | Comunidade | Perfil) zeram a pilha; as demais telas empilham com voltar, inclusive o botão
 * voltar do Android. `joinToken` é o token do link do time recebido pelo sistema: abre a tela `join` uma vez e só existe
 * em memória; se a sessão expirar com ela ainda aberta, o token volta ao App para o próximo login reabri-la.
 *
 * O shell também lê a placa do Jogar (`usePlayBoard`, `GET /me/play`): acende o ponto do JOGAR na navegação e entrega
 * `playBoard` e `refreshPlayBoard` a toda tela (`ScreenContext`).
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
  const Body = screens[current.screen] as ScreenComponent<ScreenName>
  const title = titleFor(current)
  return <>
    {/* O Início e o Jogar desenham o próprio topo, e as telas com placa escura ou capa trazem o voltar e o título dentro delas
        (`hasOwnHeader`); as outras abas mantêm a marca no topo e as demais telas, o cabeçalho com voltar. */}
    {hasOwnHeader(current.screen) ? null
      : isRootScreen(current.screen) ? <View className="px-5.5 pt-3.5"><Text className={cx(tw.brand, 'mb-2')}>arena.</Text></View>
        : <ScreenHeader title={title} onBack={navigation.back} />}
    <View className="grow basis-0"><Body key={`${stack.length}-${current.screen}`} user={user} navigation={navigation} onUser={onUser} onLogout={onLogout} onExpired={onExpired}
      playBoard={playBoard} refreshPlayBoard={playBoard.reload} params={current.params as never} title={title} /></View>
    <BottomNav active={activeNavFor(current.screen, root)} onGo={tab => navigation.go(tab)} playAttention={Boolean(playBoard.board?.attention)} />
  </>
}
