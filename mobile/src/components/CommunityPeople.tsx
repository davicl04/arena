import { Pressable, ScrollView, View } from 'react-native'
import { Text } from './Text'
import type { SocialUser } from '../api/client'
import type { AthleteSearch } from '../hooks/useAthleteSearch'
import { usePagedList } from '../hooks/usePagedList'
import { LoadError } from './arena/LoadError'
import { Avatar } from './media'
import { ActionButton } from './arena/controls'
import { Icon } from './Icon'
import { cx, tw } from '../styles'
import { useThemeColors } from '../hooks/useTheme'

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name

/** Texto visível do botão de vínculo (Seguir, Solicitar, Solicitado ou Seguindo). */
export function followLabel(person: SocialUser) {
  if (person.follow_state === 'approved') return 'Seguindo'
  if (person.follow_state === 'pending') return 'Solicitado'
  return person.social_public ? 'Seguir' : 'Solicitar'
}

/** Título de seção da aba (9,5, maiúsculas e espaçado), como o da web. */
const sectionTitle = 'mt-4 mb-1 text-[9.5px] font-bold uppercase tracking-[0.95px] text-ink-muted'

/** Fileira horizontal com quem a conta segue (primeira página de `/users/{id}/following`): foto de 56 com anel verde e o primeiro nome. */
function FollowingRow({ userId, token, onOpenProfile, onExpired }: { userId: number; token: string | null; onOpenProfile: (id: number) => void; onExpired: () => void }) {
  const list = usePagedList<{ user: SocialUser }>(`/users/${userId}/following`, onExpired)
  const colors = useThemeColors()
  if (!list.items.length) return null
  return <View>
    <Text accessibilityRole="header" className={sectionTitle}>Quem você segue · <Text className="text-ink">{list.items.length}{list.hasMore ? '+' : ''}</Text></Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5" contentContainerClassName="gap-3.5 px-5 pt-1.5 pb-1" accessibilityLabel="Quem você segue">
      {list.items.map(({ user: person }) => <Pressable key={person.id} accessibilityRole="button" accessibilityLabel={`Abrir perfil de ${person.name}`} onPress={() => onOpenProfile(person.id)} className="w-[62px] items-center gap-[5px]">
        {/* O anel da web (2 de verde, afastado 2 da foto pelo fundo da tela). */}
        <View style={{ borderWidth: 2, borderColor: colors.brand, borderRadius: 32, padding: 2, backgroundColor: colors.app }}><Avatar path={person.avatar_url} name={person.name} token={token} size={52} /></View>
        <Text numberOfLines={1} accessible={false} className="max-w-full text-[10px] font-semibold text-ink">{firstName(person.name)}</Text>
      </Pressable>)}
    </ScrollView>
  </View>
}

/** Estado centralizado da aba (dica antes de buscar e busca sem resultado): ícone verde, título em Sora e texto curto. */
function Hint({ icon, title, text, compact = false }: { icon: 'search' | 'search-x'; title: string; text: string; compact?: boolean }) {
  const colors = useThemeColors()
  return <View className={cx('items-center gap-1.5 px-5', compact ? 'py-10' : 'pt-8 pb-1.5')}>
    <Icon name={icon} size={compact ? 26 : 28} color={colors.brand} />
    <Text accessibilityRole="header" display className={cx('font-bold text-ink', compact ? 'text-[14px]' : 'text-[15px]')}>{title}</Text>
    <Text className="text-center text-[11.5px] leading-[17px] text-ink-muted">{text}</Text>
  </View>
}

/** Linha de pessoa da web (`PersonRow`): foto de 42, nome, @ em verde, a conta e o "Segue você", e o botão compacto de vínculo. */
function PersonRow({ person, token, pending, first, onFollow, onOpenProfile }: {
  person: SocialUser; token: string | null; pending: boolean; first: boolean; onFollow: (person: SocialUser) => void; onOpenProfile: (id: number) => void
}) {
  const colors = useThemeColors()
  const label = followLabel(person)
  const active = person.follow_state === 'approved' || person.follow_state === 'pending'
  const info = [person.social_public ? 'Conta pública' : 'Conta privada', person.follows_you ? 'Segue você' : null].filter(Boolean).join(' · ')
  return <View className={cx('flex-row items-center gap-2.5 py-2.5', !first && 'border-t border-line')}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Abrir perfil de ${person.name}`} onPress={() => onOpenProfile(person.id)} className="min-h-11 grow basis-0 flex-row items-center gap-3">
      <Avatar path={person.avatar_url} name={person.name} token={token} size={42} />
      <View className="shrink grow basis-0 gap-px">
        <Text className="text-[12.5px] font-bold text-ink">{person.name}</Text>
        <Text className="text-[10.5px] text-brand">@{person.username}</Text>
        <Text className="text-[10.5px] text-ink-muted">{info}</Text>
      </View>
    </Pressable>
    {person.follow_state !== 'self' ? <Pressable accessibilityRole="button" accessibilityLabel={`${label}: @${person.username}`} accessibilityState={{ disabled: pending, selected: active }} disabled={pending} onPress={() => onFollow(person)}
      style={{ borderWidth: 1.5, borderColor: active ? colors['line-strong'] : 'transparent', backgroundColor: active ? 'transparent' : colors.brand }}
      className={cx('min-h-[38px] flex-row items-center justify-center gap-2 rounded-control px-2.5 py-1.5', pending && 'opacity-60')}>
      {active ? null : <Icon name="user-round-plus" size={16} color={colors['on-brand']} />}
      <Text className={cx('text-[10px] font-bold', active ? 'text-ink' : 'text-on-brand')}>{label}</Text>
    </Pressable> : null}
  </View>
}

/** Aba Atletas (a `CommunityPeople` da web): antes de buscar, quem você segue e a dica; com busca, a lista de pessoas. */
export default function CommunityPeople({ userId, token, search, pendingIds, onFollow, onOpenProfile, onExpired }: {
  userId: number; token: string | null; search: AthleteSearch; pendingIds: number[]
  onFollow: (person: SocialUser) => void; onOpenProfile: (id: number) => void; onExpired: () => void
}) {
  if (!search.active) return <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-5 pb-8">
    <FollowingRow userId={userId} token={token} onOpenProfile={onOpenProfile} onExpired={onExpired} />
    <Hint icon="search" title="Encontre atletas" text="Busque pelo nome ou pelo @ no campo acima. Contas privadas recebem um pedido para seguir." />
  </ScrollView>

  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-5 pb-8" accessibilityLabel="Resultados da busca">
    {search.loading ? <Text accessibilityRole="progressbar" accessibilityLabel="Buscando atletas" className="py-6 text-center text-[11.5px] text-ink-muted">Buscando atletas…</Text>
      : search.error ? <View className="mt-4"><LoadError size="section" title="Busca indisponível" text={search.error} cause={search.errorCause} onRetry={search.reload} /></View>
        : !search.items.length ? <Hint compact icon="search-x" title="Nenhum atleta encontrado" text="Confira a grafia ou busque pelo @ exato." />
          : <View className="mt-2 mb-3">{search.items.map((person, index) => <PersonRow key={person.id} first={index === 0} person={person} token={token} pending={pendingIds.includes(person.id)} onFollow={onFollow} onOpenProfile={onOpenProfile} />)}</View>}
    {search.moreError ? <Text accessibilityRole="alert" className={tw.error}>{search.moreError}</Text> : null}
    {search.hasMore && !search.loading ? <View className="mt-2"><ActionButton block tone="outline" title={search.busy ? 'Carregando…' : 'Carregar mais atletas'} disabled={search.busy} onPress={() => void search.loadMore()} /></View> : null}
  </ScrollView>
}
