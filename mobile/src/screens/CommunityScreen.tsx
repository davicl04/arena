import { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, RefreshControl, Text, View } from 'react-native'
import type { FlatList } from 'react-native'
import { ApiError, getToken } from '../api/client'
import type { Post, SocialUser, User } from '../api/client'
import { toggleFollow } from '../api/social'
import type { FollowState } from '../api/social'
import { useAthleteSearch } from '../hooks/useAthleteSearch'
import { usePagedList } from '../hooks/usePagedList'
import { useVisitedProfile } from '../hooks/useVisitedProfile'
import { Button } from '../components/ui'
import { cx, tw } from '../styles'
import { colors } from '../theme'
import CommunityBar, { TITLE_ROW_HEIGHT } from '../components/CommunityBar'
import type { CommunityTab } from '../components/CommunityBar'
import CommunityPeople from '../components/CommunityPeople'
import { FeedEmpty, FeedEnd, FeedError, FeedLoading, ProgressBar } from '../components/CommunityStates'
import PostComposer, { pickSquarePhoto } from '../components/PostComposer'
import type { PhotoAsset } from '../components/PostComposer'
import PostItem from '../components/PostItem'
import type { PostUpdate } from '../components/PostItem'
import VisitedProfile from '../components/VisitedProfile'

const NOTICE_MS = 4000

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
 * `composeOnOpen` (vindo do quadro "Nova foto" do perfil) abre o seletor assim que a tela aparece. O perfil de um atleta
 * abre num `Modal` por cima da Comunidade; as demais telas usam a rota empilhada `user-profile`.
 */
export default function CommunityScreen({ user, onExpired, composeOnOpen = false, onComposeStarted }: {
  user: User; onExpired: () => void; composeOnOpen?: boolean; onComposeStarted?: () => void
}) {
  const feed = usePagedList<Post>('/posts', onExpired)
  const [tab, setTab] = useState<CommunityTab>('Publicações')
  const [query, setQuery] = useState('')
  const search = useAthleteSearch(query, onExpired)
  const { update: updateSearch, remove: removeFromSearch } = search
  const followedInSearch = useCallback((id: number, state: FollowState) => updateSearch(id, item => ({ ...item, follow_state: state })), [updateSearch])
  const visited = useVisitedProfile(user.id, onExpired, followedInSearch)
  const [following, setFollowing] = useState<number[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [draft, setDraft] = useState<PhotoAsset | null>(null)
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
  const { postRemoved } = visited
  const removeProfilePost = useCallback((id: number) => { removePost(id); postRemoved() }, [removePost, postRemoved])

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

  /** Abre o perfil de `id` num `Modal`; sem perfil aberto, a falha aparece no topo da Comunidade. */
  async function openProfile(id: number) {
    setError('')
    const message = await visited.open(id)
    if (message) setError(message)
  }

  async function followFromList(person: SocialUser) {
    if (followBusy.current.has(person.id)) return
    followBusy.current.add(person.id)
    setFollowing(old => [...old, person.id]); setError('')
    try { followedInSearch(person.id, await toggleFollow(person)) }
    catch (err) { fail(err, 'Não foi possível atualizar o vínculo.') }
    finally { followBusy.current.delete(person.id); setFollowing(old => old.filter(id => id !== person.id)) }
  }

  function blocked() {
    const id = visited.profile?.id
    visited.close()
    if (id !== undefined) removeFromSearch(id)
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
    {visited.profile ? <VisitedProfile modal profile={visited.profile} user={user} token={token} mutualText={visited.mutualText} error={visited.error} onClose={visited.close} onFollow={person => void visited.follow(person)}
      onBlocked={blocked} onPostUpdate={updatePost} onPostRemove={removeProfilePost} onExpired={onExpired} /> : null}
  </>
}
