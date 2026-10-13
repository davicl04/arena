import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import type { SocialUser } from '../api/client'
import type { AthleteSearch } from '../hooks/useAthleteSearch'
import { usePagedList } from '../hooks/usePagedList'
import { Avatar } from './media'
import { Button } from './ui'
import { cx, tw } from '../styles'
import { colors } from '../theme'

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name

/** Texto visível do botão de vínculo (Seguir, Solicitar, Solicitado ou Seguindo). */
export function followLabel(person: SocialUser) {
  if (person.follow_state === 'approved') return 'Seguindo'
  if (person.follow_state === 'pending') return 'Solicitado'
  return person.social_public ? 'Seguir' : 'Solicitar'
}

/** Fileira horizontal com quem a conta segue (primeira página de `/users/{id}/following`). */
function FollowingRow({ userId, token, onOpenProfile, onExpired }: { userId: number; token: string | null; onOpenProfile: (id: number) => void; onExpired: () => void }) {
  const list = usePagedList<{ user: SocialUser }>(`/users/${userId}/following`, onExpired)
  if (!list.items.length) return null
  return <View className="pt-4">
    <Text accessibilityRole="header" className="px-4 text-[13px] font-bold text-ink">Quem você segue · {list.items.length}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3.5 px-4 py-3" accessibilityLabel="Quem você segue">
      {list.items.map(({ user: person }) => <Pressable key={person.id} accessibilityRole="button" accessibilityLabel={`Abrir perfil de ${person.name}`} onPress={() => onOpenProfile(person.id)} className="w-16 items-center">
        <View className="rounded-full border-2 border-brand p-0.5"><Avatar path={person.avatar_url} name={person.name} token={token} size={56} /></View>
        <Text numberOfLines={1} className="mt-1 text-[12px] text-ink">{firstName(person.name)}</Text>
      </Pressable>)}
    </ScrollView>
  </View>
}

function PersonRow({ person, token, pending, onFollow, onOpenProfile }: {
  person: SocialUser; token: string | null; pending: boolean; onFollow: (person: SocialUser) => void; onOpenProfile: (id: number) => void
}) {
  const label = followLabel(person)
  const active = person.follow_state === 'approved' || person.follow_state === 'pending'
  return <View className="flex-row items-center gap-2 border-b border-line bg-white px-4 py-2">
    <Pressable accessibilityRole="button" accessibilityLabel={`Abrir perfil de ${person.name}`} onPress={() => onOpenProfile(person.id)} className="min-h-11 grow basis-0 flex-row items-center gap-3">
      <Avatar path={person.avatar_url} name={person.name} token={token} size={44} />
      <View className="shrink grow basis-0">
        <Text numberOfLines={1} className="font-semibold text-ink">{person.name}</Text>
        <Text numberOfLines={1} className="text-[13px] text-ink-muted">@{person.username} · {person.social_public ? 'Conta pública' : 'Conta privada'}</Text>
        {person.follows_you ? <View className="mt-1 self-start rounded-full bg-brand-soft px-2 py-0.5"><Text className="text-[11px] font-semibold text-brand">Segue você</Text></View> : null}
      </View>
    </Pressable>
    {person.follow_state !== 'self' ? <Pressable accessibilityRole="button" accessibilityLabel={`${label}: @${person.username}`} accessibilityState={{ disabled: pending, selected: active }} disabled={pending} onPress={() => onFollow(person)}
      className={cx('min-h-11 min-w-[104px] items-center justify-center rounded-control px-3', active ? 'border border-line bg-white' : 'bg-brand', pending && 'opacity-50')}>
      <Text className={cx('text-[13px] font-bold', active ? 'text-ink' : 'text-white')}>{label}</Text>
    </Pressable> : null}
  </View>
}

/** Aba Atletas: antes de buscar, quem você segue e uma dica; com busca, a lista de pessoas. */
export default function CommunityPeople({ userId, token, search, pendingIds, onFollow, onOpenProfile, onExpired }: {
  userId: number; token: string | null; search: AthleteSearch; pendingIds: number[]
  onFollow: (person: SocialUser) => void; onOpenProfile: (id: number) => void; onExpired: () => void
}) {
  if (!search.active) return <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="pb-8">
    <FollowingRow userId={userId} token={token} onOpenProfile={onOpenProfile} onExpired={onExpired} />
    <View className="m-4 rounded-card bg-white p-5">
      <Text accessibilityRole="header" className="mb-1.5 text-[17px] font-bold text-ink">Encontre atletas</Text>
      <Text className="text-[14px] leading-[21px] text-ink-muted">Busque pelo nome ou pelo @ no campo acima. Contas privadas recebem um pedido para seguir.</Text>
    </View>
  </ScrollView>

  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="pb-8" accessibilityLabel="Resultados da busca">
    {search.loading ? <ActivityIndicator accessibilityLabel="Buscando atletas" color={colors.brand} className="my-6" />
      : search.error ? <Text accessibilityRole="alert" className={cx(tw.error, 'px-4')}>{search.error}</Text>
        : !search.items.length ? <View className="items-center px-6 pt-8">
          <Text accessibilityRole="header" className="text-[17px] font-bold text-ink">Nenhum atleta encontrado</Text>
          <Text className="mt-1 text-center text-[14px] text-ink-muted">Confira a grafia ou busque pelo @ exato.</Text>
        </View>
          : search.items.map(person => <PersonRow key={person.id} person={person} token={token} pending={pendingIds.includes(person.id)} onFollow={onFollow} onOpenProfile={onOpenProfile} />)}
    {search.moreError ? <Text accessibilityRole="alert" className={cx(tw.error, 'px-4')}>{search.moreError}</Text> : null}
    {search.hasMore && !search.loading ? <View className="px-4"><Button secondary title={search.busy ? 'Carregando…' : 'Carregar mais atletas'} disabled={search.busy} onPress={() => void search.loadMore()} /></View> : null}
  </ScrollView>
}
