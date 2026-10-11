import { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, Modal, RefreshControl, ScrollView, Text, View } from 'react-native'
import type { FlatList } from 'react-native'
import { ApiError, getToken, request } from '../api/client'
import type { MutualFollowersPage, Post, SocialUser, User } from '../api/client'
import { useAthleteSearch } from '../hooks/useAthleteSearch'
import { usePagedList } from '../hooks/usePagedList'
import { Button } from '../components/ui'
import { Screen } from '../components/Screen'
import { cx, tw } from '../styles'
import { colors } from '../theme'
import { Avatar, Cover } from '../components/media'
import AccountActions from '../components/AccountActions'
import CommunityBar, { TITLE_ROW_HEIGHT } from '../components/CommunityBar'
import type { CommunityTab } from '../components/CommunityBar'
import CommunityPeople from '../components/CommunityPeople'
import { FeedEmpty, FeedEnd, FeedError, FeedLoading, ProgressBar } from '../components/CommunityStates'
import PostComposer, { pickSquarePhoto } from '../components/PostComposer'
import type { PhotoAsset } from '../components/PostComposer'
import PostItem from '../components/PostItem'
import type { PostUpdate } from '../components/PostItem'
import ProfileGallery from '../components/ProfileGallery'
import { MatchesEmpty, ProfileTabs } from '../components/ProfileTabs'
import type { ProfileTab } from '../components/ProfileTabs'
import ProfileTitle from '../components/ProfileTitle'
import ProfileTopBar, { TopBarButton, useCondensedTopBar } from '../components/ProfileTopBar'
import { connectionsText, mutualFollowersText } from '../utils/profile'

const COVER_HEIGHT = 120

/** Perfil visitado em tela cheia: topo fixo (‹ e •••), abas Fotos | Partidas e grade compartilhada com o visualizador. */
function VisitedProfile({ profile, user, token, mutualText, error, onClose, onFollow, onBlocked, onPostUpdate, onPostRemove, onExpired }: {
  profile: SocialUser; user: User; token: string | null; mutualText: string | null; error: string
  onClose: () => void; onFollow: (person: SocialUser) => void; onBlocked: () => void; onPostUpdate: PostUpdate; onPostRemove: (id: number) => void; onExpired: () => void
}) {
  const [tab, setTab] = useState<ProfileTab>('Fotos')
  const [actions, setActions] = useState(false)
  const { condensed, onScroll } = useCondensedTopBar(COVER_HEIGHT)
  const own = profile.id === user.id
  const canView = profile.social_public || profile.follow_state === 'approved' || own
  return <Modal visible animationType="slide" onRequestClose={() => { if (actions) setActions(false); else onClose() }}>
    <Screen className={tw.screen}>
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
              : <MatchesEmpty />}
          </View>
        </> : <Text className={cx(tw.body, 'p-5.5')}>Esta conta é privada. Solicite acesso para ver as publicações; as listas de seguidores também ficam fechadas até lá.</Text>}
      </ScrollView>
      <ProfileTopBar condensed={condensed} username={profile.username}
        leading={<TopBarButton label="Voltar" glyph="‹" condensed={condensed} onPress={onClose} />}
        trailing={own ? undefined : <TopBarButton label="Ações da conta" glyph="•••" condensed={condensed} onPress={() => setActions(true)} />} />
      {actions ? <AccountActions person={profile} token={token} onClose={() => setActions(false)} onBlocked={onBlocked} onExpired={onExpired} /> : null}
    </Screen>
  </Modal>
}

const NOTICE_MS = 4000
type FollowState = SocialUser['follow_state']

/**
 * Rolagem do feed → deslocamento da barra: ao descer, a linha do título recolhe (até a sua altura);
 * ao subir, volta. Tudo no driver nativo, sem renderizar a tela a cada evento de rolagem.
 */
function useCollapsingTitle() {
  const [anim] = useState(() => {
    const scrollY = new Animated.Value(0)
    // O deslocamento negativo (puxar para atualizar, bounce do iOS) não mexe na barra.
    const offset = scrollY.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolateLeft: 'clamp' })
    const translateY = Animated.diffClamp(offset, 0, TITLE_ROW_HEIGHT).interpolate({ inputRange: [0, TITLE_ROW_HEIGHT], outputRange: [0, -TITLE_ROW_HEIGHT] })
    const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })
    return { translateY, onScroll }
  })
  return anim
}

/**
 * Comunidade: barra escura fixa (título, + e abas Publicações | Atletas), feed de ponta a ponta com
 * puxar para atualizar e paginação por cursor, busca de atletas e publicação em dois passos.
 * `composeOnOpen` (vindo do quadro "Nova foto" do perfil) abre o seletor assim que a tela aparece.
 */
export default function CommunityScreen({ user, onExpired, composeOnOpen = false, onComposeStarted }: {
  user: User; onExpired: () => void; composeOnOpen?: boolean; onComposeStarted?: () => void
}) {
  const feed = usePagedList<Post>('/posts', onExpired)
  const [tab, setTab] = useState<CommunityTab>('Publicações')
  const [query, setQuery] = useState('')
  const search = useAthleteSearch(query, onExpired)
  const [following, setFollowing] = useState<number[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [draft, setDraft] = useState<PhotoAsset | null>(null)
  const [profile, setProfile] = useState<SocialUser | null>(null)
  const [profileError, setProfileError] = useState('')
  const [mutualText, setMutualText] = useState<string | null>(null)
  const [height, setHeight] = useState(0)
  const listRef = useRef<FlatList<Post>>(null)
  const picking = useRef(false)
  const followBusy = useRef(new Set<number>())
  const { translateY, onScroll } = useCollapsingTitle()

  useEffect(() => {
    let alive = true
    void getToken().then(value => { if (alive) setToken(value) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  const { setItems: setFeedItems, reload: reloadFeed } = feed
  const updatePost: PostUpdate = useCallback((id, change) => setFeedItems(old => old.map(post => post.id === id ? change(post) : post)), [setFeedItems])
  const removePost = useCallback((id: number) => setFeedItems(old => old.filter(post => post.id !== id)), [setFeedItems])
  // Exclusões feitas na grade do perfil visitado também saem do feed e da contagem do cabeçalho.
  const removeProfilePost = useCallback((id: number) => {
    removePost(id)
    setProfile(old => old ? { ...old, post_count: Math.max(0, old.post_count - 1) } : old)
  }, [removePost])

  function fail(err: unknown, fallback: string) {
    if (err instanceof ApiError && err.status === 401) onExpired()
    setError(err instanceof Error ? err.message : fallback)
  }

  // Passo 1: recorte 1:1 no editor nativo. Cancelar não muda nada; com a foto, abre o passo 2.
  const startCompose = useCallback(async () => {
    if (picking.current) return
    picking.current = true
    try {
      const asset = await pickSquarePhoto()
      setError('')
      if (asset) setDraft(asset)
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível abrir as fotos.') }
    finally { picking.current = false }
  }, [])

  // Abre o seletor depois da montagem (o estado só muda quando ele responde).
  useEffect(() => {
    if (!composeOnOpen) return
    onComposeStarted?.()
    void Promise.resolve().then(startCompose)
  }, [composeOnOpen, onComposeStarted, startCompose])

  const toTop = () => listRef.current?.scrollToOffset({ offset: 0, animated: true })

  function published(post: Post) {
    setDraft(null)
    setFeedItems(old => [post, ...old.filter(item => item.id !== post.id)])
    setTab('Publicações')
    setNotice('Publicação compartilhada.')
    toTop()
  }

  function selectTab(next: CommunityTab) {
    // Tocar na aba já ativa só volta ao início do feed (não recarrega).
    if (next === tab) { if (next === 'Publicações') toTop(); return }
    setError('')
    setTab(next)
  }

  async function openProfile(id: number) {
    setError(''); setProfileError('')
    try {
      const person = await request<SocialUser>(`/users/${id}`)
      if (person.id !== user.id) {
        // Seguidores em comum são complementares: uma falha aqui não impede de ver o perfil.
        try { const mutual = await request<MutualFollowersPage>(`/users/${id}/mutual-followers?limit=2`); setMutualText(mutualFollowersText(mutual.items ?? [], mutual.total ?? 0)) }
        catch (err) { setMutualText(null); if (err instanceof ApiError && err.status === 401) onExpired() }
      } else setMutualText(null)
      setProfile(person)
    } catch (err) {
      // Com o perfil aberto (ex.: após seguir), o erro aparece nele; senão, no topo da Comunidade.
      if (!profile) fail(err, 'Perfil indisponível.')
      else { if (err instanceof ApiError && err.status === 401) onExpired(); setProfileError(err instanceof Error ? err.message : 'Perfil indisponível.') }
    }
  }

  /** Alterna o vínculo: aprovado ou pendente → DELETE; sem vínculo → PUT, que diz se ficou aprovado ou pendente. */
  async function changeFollow(person: SocialUser) {
    let state: FollowState = 'none'
    if (person.follow_state === 'approved' || person.follow_state === 'pending') await request<void>(`/users/${person.id}/follow`, 'DELETE')
    else {
      const result = await request<{ state: 'approved' | 'pending' } | undefined>(`/users/${person.id}/follow`, 'PUT')
      state = result?.state ?? (person.social_public ? 'approved' : 'pending')
    }
    search.update(person.id, item => ({ ...item, follow_state: state }))
  }

  async function followFromList(person: SocialUser) {
    if (followBusy.current.has(person.id)) return
    followBusy.current.add(person.id)
    setFollowing(old => [...old, person.id]); setError('')
    try { await changeFollow(person) }
    catch (err) { fail(err, 'Não foi possível atualizar o vínculo.') }
    finally { followBusy.current.delete(person.id); setFollowing(old => old.filter(id => id !== person.id)) }
  }

  async function followFromProfile(person: SocialUser) {
    setProfileError('')
    try { await changeFollow(person); await openProfile(person.id) }
    catch (err) { if (err instanceof ApiError && err.status === 401) onExpired(); setProfileError(err instanceof Error ? err.message : 'Não foi possível atualizar o vínculo.') }
  }

  function blocked() {
    const id = profile?.id
    setProfile(null)
    if (id !== undefined) search.remove(id)
    reloadFeed()
  }

  const onFeed = tab === 'Publicações'
  const compose = () => void startCompose()
  const feedEmpty = feed.loading ? <FeedLoading /> : feed.error ? <FeedError onRetry={reloadFeed} /> : <FeedEmpty onPublish={compose} onSearch={() => selectTab('Atletas')} />
  const feedFooter = feed.items.length ? <View>
    {feed.busy ? <View className="py-3"><ProgressBar label="Carregando mais publicações" /></View> : null}
    {feed.moreError ? <View className="px-4">
      <Text accessibilityRole="alert" className={tw.error}>{feed.moreError}</Text>
      <Button secondary title="Carregar mais publicações" onPress={() => void feed.loadMore()} />
    </View> : null}
    {!feed.hasMore ? <FeedEnd onPublish={compose} /> : null}
  </View> : null
  // Com a área medida, barra e feed sobem juntos a altura do título; no feed, o quadro ganha essa altura para não abrir vão embaixo.
  const frame = height ? { height: height + (onFeed ? TITLE_ROW_HEIGHT : 0) } : { flexGrow: 1 }

  return <>
    <View className="grow basis-0 overflow-hidden bg-app" onLayout={event => setHeight(Math.round(event.nativeEvent.layout.height))}>
      <Animated.View style={[frame, { transform: [{ translateY: onFeed ? translateY : 0 }] }]}>
        <CommunityBar tab={tab} onTab={selectTab} onCompose={compose} query={query} onQuery={setQuery} />
        {error ? <Text accessibilityRole="alert" className={cx(tw.error, 'px-4')}>{error}</Text> : null}
        {notice && onFeed ? <Text accessibilityLiveRegion="polite" className={cx(tw.success, 'px-4')}>{notice}</Text> : null}
        <View className={onFeed ? 'grow basis-0' : 'hidden'}>
          <Animated.FlatList ref={listRef} data={feed.items} keyExtractor={(item: Post) => String(item.id)} keyboardShouldPersistTaps="handled"
            renderItem={({ item }: { item: Post }) => <PostItem post={item} viewerId={user.id} token={token} onUpdate={updatePost} onRemove={removePost} onOpenProfile={id => void openProfile(id)} onExpired={onExpired} />}
            ListEmptyComponent={feedEmpty} ListFooterComponent={feedFooter}
            onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingBottom: 24 }}
            refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={feed.refresh} colors={[colors.brand]} tintColor={colors.brand} />}
            onEndReached={() => { if (feed.hasMore && !feed.busy && !feed.moreError) void feed.loadMore() }} onEndReachedThreshold={0.6} />
        </View>
        {!onFeed ? <View className="grow basis-0">
          <CommunityPeople userId={user.id} token={token} search={search} pendingIds={following} onFollow={person => void followFromList(person)} onOpenProfile={id => void openProfile(id)} onExpired={onExpired} />
        </View> : null}
      </Animated.View>
    </View>
    {draft ? <PostComposer key={draft.uri} initial={draft} onClose={() => setDraft(null)} onPublished={published} onExpired={onExpired} /> : null}
    {profile ? <VisitedProfile profile={profile} user={user} token={token} mutualText={mutualText} error={profileError} onClose={() => setProfile(null)} onFollow={person => void followFromProfile(person)}
      onBlocked={blocked} onPostUpdate={updatePost} onPostRemove={removeProfilePost} onExpired={onExpired} /> : null}
  </>
}
