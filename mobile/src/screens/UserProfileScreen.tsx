import { useCallback, useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { ApiError } from '../api/client'
import { connection } from '../api/connection'
import { LoadError } from '../components/arena/LoadError'
import ScreenHeader from '../components/ScreenHeader'
import VisitedProfile from '../components/VisitedProfile'
import { useSessionToken } from '../hooks/useSessionToken'
import { useVisitedProfile } from '../hooks/useVisitedProfile'
import type { OpenFailure } from '../hooks/useVisitedProfile'
import type { ScreenProps } from '../navigation/screens'
import { tw } from '../styles'

/**
 * Perfil de outro atleta (`user-profile` da web), empilhado sobre a tela de origem (elenco de Meus times, filas da
 * administração): o mesmo perfil visitado da Comunidade, em tela cheia e com a própria barra (‹ volta à tela de origem).
 * Antes de carregar, e se falhar, mostra o cabeçalho claro com o voltar.
 */
export default function UserProfileScreen({ user, params, navigation, onExpired }: ScreenProps<'user-profile'>) {
  const token = useSessionToken()
  const visited = useVisitedProfile(user.id, onExpired)
  const { open } = visited
  const [loadError, setLoadError] = useState<OpenFailure | null>(null)
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => { setLoadError(null); setAttempt(value => value + 1) }, [])

  useEffect(() => {
    let alive = true
    void open(params.userId).then(failure => { if (alive) setLoadError(failure) })
    return () => { alive = false }
  }, [open, params.userId, attempt])

  // Falha por conexão: lê o perfil de novo uma única vez quando ela volta (as demais esperam o "Tentar novamente").
  const connectionLost = loadError?.cause instanceof ApiError && loadError.cause.isConnection
  useEffect(() => {
    if (!connectionLost) return
    return connection.onRestored(retry)
  }, [connectionLost, retry])

  if (!visited.profile) {
    return <View className={tw.screen}>
      <ScreenHeader title="Perfil" onBack={navigation.back} />
      {loadError
        ? <LoadError size="screen" title="Não foi possível carregar este perfil" text={loadError.message} cause={loadError.cause} onRetry={retry} />
        : <View className="px-5.5"><Text accessibilityLiveRegion="polite" className={tw.body}>Carregando o perfil…</Text></View>}
    </View>
  }

  return <VisitedProfile profile={visited.profile} user={user} token={token} mutualText={visited.mutualText}
    onClose={navigation.back} onFollow={person => void visited.follow(person)} onBlocked={navigation.back}
    onPostUpdate={() => undefined} onPostRemove={visited.postRemoved} onExpired={onExpired} />
}
