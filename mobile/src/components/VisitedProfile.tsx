import { useState } from 'react'
import { Modal, ScrollView, Text, View } from 'react-native'
import type { SocialUser, User } from '../api/client'
import { cx, tw } from '../styles'
import { connectionsText } from '../utils/profile'
import AccountActions from './AccountActions'
import { Avatar, Cover } from './media'
import type { PostUpdate } from './PostItem'
import ProfileGallery from './ProfileGallery'
import { MatchTimeline } from './profile-matches/MatchTimeline'
import { ProfileTabs } from './ProfileTabs'
import type { ProfileTab } from './ProfileTabs'
import ProfileTitle from './ProfileTitle'
import ProfileTopBar, { TopBarButton, useCondensedTopBar } from './ProfileTopBar'
import { Screen } from './Screen'
import { ToastViewport } from './toast/ToastViewport'
import { Button } from './ui'

const COVER_HEIGHT = 120

/**
 * Perfil visitado em tela cheia: topo fixo (‹ e •••), abas Fotos | Partidas e grade compartilhada com o visualizador.
 * Na Comunidade abre num `Modal` (`modal`); na tela empilhada `user-profile`, ocupa a área do shell, que já respeita a
 * margem segura.
 */
export default function VisitedProfile({ profile, user, token, mutualText, error, modal = false, onClose, onFollow, onBlocked, onPostUpdate, onPostRemove, onExpired }: {
  profile: SocialUser; user: User; token: string | null; mutualText: string | null; error: string
  /** Abre num `Modal` próprio, por cima da tela atual; sem isso, ocupa o espaço da tela. */
  modal?: boolean
  onClose: () => void; onFollow: (person: SocialUser) => void; onBlocked: () => void; onPostUpdate: PostUpdate; onPostRemove: (id: number) => void; onExpired: () => void
}) {
  const [tab, setTab] = useState<ProfileTab>('Fotos')
  const [actions, setActions] = useState(false)
  const { condensed, onScroll } = useCondensedTopBar(COVER_HEIGHT)
  const own = profile.id === user.id
  const canView = profile.social_public || profile.follow_state === 'approved' || own
  const content = <>
    <ScrollView onScroll={onScroll} scrollEventThrottle={16} keyboardShouldPersistTaps="handled" contentContainerClassName="pb-10">
      <View className="bg-white">
        <Cover path={profile.cover_url} token={token} height={COVER_HEIGHT} />
        <View className="px-5.5 pb-4.5">
          <View className="-mt-8 w-[72px] rounded-[36px] border-[3px] border-white"><Avatar path={profile.avatar_url} name={profile.name} token={token} size={66} /></View>
          <View className="mt-2.5"><ProfileTitle name={profile.name} username={profile.username} /></View>
          <Text className={tw.body}>{profile.social_public ? 'Perfil público' : 'Perfil privado'}</Text>
          <Text accessibilityLabel="Contagens do perfil" className={tw.body}>{canView ? `${profile.post_count} publicações · ` : ''}{connectionsText(profile.follower_count, profile.following_count)}</Text>
          {mutualText ? <Text className={tw.body}>{mutualText}</Text> : null}
          {!own ? <Button title={profile.follow_state === 'approved' ? 'Deixar de seguir' : profile.follow_state === 'pending' ? 'Cancelar solicitação' : profile.social_public ? 'Seguir' : 'Solicitar acesso'} onPress={() => onFollow(profile)} /> : null}
          {error ? <Text accessibilityRole="alert" className={tw.error}>{error}</Text> : null}
        </View>
      </View>
      {canView ? <>
        <ProfileTabs value={tab} onChange={setTab} />
        <View accessibilityLabel={tab} className="min-h-[280px]">
          {tab === 'Fotos'
            ? <ProfileGallery key={profile.id} userId={profile.id} ownerName={profile.name} ownerUsername={profile.username} viewerId={user.id} token={token} onPostUpdate={onPostUpdate} onPostRemove={onPostRemove} onExpired={onExpired} />
            : <MatchTimeline key={profile.id} userId={profile.id} own={false} onExpired={onExpired} />}
        </View>
      </> : <Text className={cx(tw.body, 'p-5.5')}>Esta conta é privada. Solicite acesso para ver as publicações; as listas de seguidores também ficam fechadas até lá.</Text>}
    </ScrollView>
    <ProfileTopBar condensed={condensed} username={profile.username}
      leading={<TopBarButton label="Voltar" glyph="‹" condensed={condensed} onPress={onClose} />}
      trailing={own ? undefined : <TopBarButton label="Ações da conta" glyph="•••" condensed={condensed} onPress={() => setActions(true)} />} />
    {actions ? <AccountActions person={profile} token={token} onClose={() => setActions(false)} onBlocked={onBlocked} onExpired={onExpired} /> : null}
  </>
  if (!modal) return <View className="grow basis-0 bg-app">{content}</View>
  return <Modal visible animationType="slide" onRequestClose={() => { if (actions) setActions(false); else onClose() }}>
    <Screen className={tw.screen}>{content}</Screen>
    <ToastViewport />
  </Modal>
}
