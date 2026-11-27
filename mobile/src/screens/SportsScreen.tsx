import { ActivityIndicator, ScrollView } from 'react-native'
import { request } from '../api/client'
import type { Profile, ProfileInput, Sport } from '../api/client'
import { LoadError } from '../components/arena/LoadError'
import { SportsProfiles } from '../components/sports-profile/SportsProfiles'
import { loadProfiles } from '../hooks/useCities'
import { useResource } from '../hooks/useResource'
import { useThemeColors } from '../hooks/useTheme'
import type { ScreenProps } from '../navigation/screens'
import { tw } from '../styles'

/**
 * Suas modalidades (o `sports` da web): os cartões de futebol, tênis e corrida, com a folha de cada modalidade. Aberta pela linha
 * "Minhas modalidades" do perfil e do menu, pelo "Preparar perfis" do Início e pelos convites para configurar uma modalidade.
 */
export default function SportsScreen({ onExpired }: ScreenProps<'sports'>) {
  const colors = useThemeColors()
  const profiles = useResource(loadProfiles, onExpired)
  async function save(sport: Sport, input: ProfileInput) {
    // As falhas sobem para a folha da modalidade, que mostra o 422 e classifica o resto (reportActionError).
    const saved = await request<Profile>(`/me/sports-profiles/${sport}`, 'PUT', input)
    profiles.setData(old => [...(old ?? []).filter(item => item.sport !== sport), saved])
    return saved
  }
  return <ScrollView contentContainerClassName={tw.content} keyboardShouldPersistTaps="handled">
    {profiles.loading ? <ActivityIndicator accessibilityLabel="Carregando modalidades" color={colors.brand} />
      : profiles.error ? <LoadError size="section" title="Não foi possível carregar suas modalidades" text={profiles.error} cause={profiles.errorCause} onRetry={profiles.reload} />
        : <SportsProfiles profiles={profiles.data ?? []} onSave={save} onExpired={onExpired} />}
  </ScrollView>
}
