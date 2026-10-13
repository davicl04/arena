import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import ScreenHeader from '../components/ScreenHeader'
import VisitedProfile from '../components/VisitedProfile'
import { Button } from '../components/ui'
import { useSessionToken } from '../hooks/useSessionToken'
import { useVisitedProfile } from '../hooks/useVisitedProfile'
import type { ScreenProps } from '../navigation/screens'
import { cx, tw } from '../styles'

/**
 * Perfil de outro atleta (`user-profile` da web), empilhado sobre a tela de origem (elenco de Meus times, filas da
 * administração): o mesmo perfil visitado da Comunidade, em tela cheia e com a própria barra (‹ volta à tela de origem).
 * Antes de carregar, e se falhar, mostra o cabeçalho claro com o voltar.
 */
export default function UserProfileScreen({ user, params, navigation, onExpired }: ScreenProps<'user-profile'>) {
  const token = useSessionToken()
  const visited = useVisitedProfile(user.id, onExpired)
  const { open } = visited
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    void open(params.userId).then(message => { if (alive) setLoadError(message ?? '') })
    return () => { alive = false }
  }, [open, params.userId, attempt])

  if (!visited.profile) {
    return <View className={tw.screen}>
      <ScreenHeader title="Perfil" onBack={navigation.back} />
      <View className="px-5.5">
        {loadError
          ? <>
            <Text accessibilityRole="alert" className={cx(tw.error, 'mb-2')}>{loadError}</Text>
            <Button secondary title="Tentar novamente" onPress={() => { setLoadError(''); setAttempt(value => value + 1) }} />
          </>
          : <Text accessibilityLiveRegion="polite" className={tw.body}>Carregando o perfil…</Text>}
      </View>
    </View>
  }

  return <VisitedProfile profile={visited.profile} user={user} token={token} mutualText={visited.mutualText} error={visited.error}
    onClose={navigation.back} onFollow={person => void visited.follow(person)} onBlocked={navigation.back}
    onPostUpdate={() => undefined} onPostRemove={visited.postRemoved} onExpired={onExpired} />
}
