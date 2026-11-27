import { useState } from 'react'
import { Modal, ScrollView, View } from 'react-native'
import { Text } from './Text'
import type { SocialUser, User } from '../api/client'
import { cx, tw } from '../styles'
import AccountActions from './AccountActions'
import { Avatar, Cover } from './media'
import { ProfileHeader } from './ProfileHeader'
import { ActionButton } from './arena/controls'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTopArea } from '../navigation/topArea'
import type { PostUpdate } from './PostItem'
import ProfileGallery from './ProfileGallery'
import { MatchTimeline } from './profile-matches/MatchTimeline'
import { ProfileTabs } from './ProfileTabs'
import type { ProfileTab } from './ProfileTabs'
import ProfileTopBar, { TopBarButton, useCondensedTopBar } from './ProfileTopBar'
import { Screen } from './Screen'
import { ToastViewport } from './toast/ToastViewport'

/** Altura da capa, a mesma da web (158 px), sem contar a barra de status. */
const COVER_HEIGHT = 158

/**
 * Perfil visitado em tela cheia: topo fixo (‹ e •••), abas Fotos | Partidas e grade compartilhada com o visualizador.
 * Na Comunidade abre num `Modal` (`modal`); na tela empilhada `user-profile`, ocupa a área do shell, que já respeita a
 * margem segura. As falhas de Seguir (e da releitura do perfil) saem em toast; o `Modal` monta o próprio viewport.
 */
export default function VisitedProfile({ profile, user, token, mutualText, modal = false, onClose, onFollow, onBlocked, onPostUpdate, onPostRemove, onExpired }: {
  profile: SocialUser; user: User; token: string | null; mutualText: string | null
  /** Abre num `Modal` próprio, por cima da tela atual; sem isso, ocupa o espaço da tela. */
  modal?: boolean
  onClose: () => void; onFollow: (person: SocialUser) => void; onBlocked: () => void; onPostUpdate: PostUpdate; onPostRemove: (id: number) => void; onExpired: () => void
}) {
  const [tab, setTab] = useState<ProfileTab>('Fotos')
  const [actions, setActions] = useState(false)
  const { condensed, onScroll } = useCondensedTopBar(COVER_HEIGHT)
  // A capa sobe por baixo da barra de status: na tela, pelo shell (navigation/topArea); no Modal, que já cobre a tela inteira.
  useTopArea(modal ? null : 'bleed')
  const insets = useSafeAreaInsets()
  const own = profile.id === user.id
  const canView = profile.social_public || profile.follow_state === 'approved' || own
  const content = <>
    <ScrollView onScroll={onScroll} scrollEventThrottle={16} keyboardShouldPersistTaps="handled" contentContainerClassName="pb-10">
      {/* Capa e cabeçalho do perfil de outra pessoa, como o `ProfileHeader` da web no modo visitante: o Seguir fica à direita, acima do @. */}
      <Cover hero path={profile.cover_url} token={token} height={COVER_HEIGHT + insets.top} />
      <ProfileHeader name={profile.name} username={profile.username} isPublic={profile.social_public} followerCount={profile.follower_count} followingCount={profile.following_count}
        avatar={<Avatar path={profile.avatar_url} name={profile.name} token={token} size={80} />} mutualText={mutualText}
        actions={own ? undefined : <ActionButton fit size="sm" tone={profile.follow_state === 'none' ? 'brand' : 'outline'}
          title={profile.follow_state === 'approved' ? 'Deixar de seguir' : profile.follow_state === 'pending' ? 'Cancelar solicitação' : profile.social_public ? 'Seguir' : 'Solicitar acesso'} onPress={() => onFollow(profile)} />} />
      {canView ? <>
        <ProfileTabs value={tab} onChange={setTab} />
        <View accessibilityLabel={tab} className="min-h-[280px]">
          {tab === 'Fotos'
            ? <ProfileGallery key={profile.id} userId={profile.id} ownerName={profile.name} ownerUsername={profile.username} viewerId={user.id} token={token} onPostUpdate={onPostUpdate} onPostRemove={onPostRemove} onExpired={onExpired} />
            : <MatchTimeline key={profile.id} userId={profile.id} own={false} onExpired={onExpired} />}
        </View>
      </> : <Text className={cx(tw.body, 'p-5 text-center')}>Esta conta é privada. Solicite acesso para ver as publicações; as listas de seguidores também ficam fechadas até lá.</Text>}
    </ScrollView>
    <ProfileTopBar condensed={condensed} username={profile.username}
      leading={<TopBarButton label="Voltar" glyph="‹" condensed={condensed} onPress={onClose} />}
      trailing={own ? undefined : <TopBarButton label="Ações da conta" glyph="•••" condensed={condensed} onPress={() => setActions(true)} />} />
    {actions ? <AccountActions person={profile} token={token} onClose={() => setActions(false)} onBlocked={onBlocked} onExpired={onExpired} /> : null}
  </>
  if (!modal) return <View className="grow basis-0 bg-app">{content}</View>
  return <Modal visible animationType="slide" onRequestClose={() => { if (actions) setActions(false); else onClose() }}>
    {/* A capa sobe por baixo da barra de status também no Modal: a área segura de cima fica com a capa e a barra do perfil. */}
    <Screen className={tw.screen} edges={['right', 'bottom', 'left']}>{content}</Screen>
    <ToastViewport />
  </Modal>
}
