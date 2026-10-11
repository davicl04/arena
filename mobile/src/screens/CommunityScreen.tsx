import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Image, Modal, RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { ApiError, getToken, request } from '../api/client'
import type { MutualFollowersPage, Page, Post, SocialUser, User } from '../api/client'
import { CAPTION_MAX } from '../api/social'
import { usePagedList } from '../hooks/usePagedList'
import { Button, Field, styles } from '../components/ui'
import { Avatar, Cover } from '../components/media'
import AccountActions from '../components/AccountActions'
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
    <SafeAreaView style={[styles.screen, { flex: 1 }]}>
      <ScrollView onScroll={onScroll} scrollEventThrottle={16} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ backgroundColor: '#fff' }}>
          <Cover path={profile.cover_url} token={token} height={COVER_HEIGHT} />
          <View style={{ paddingHorizontal: 22, paddingBottom: 18 }}>
            <View style={{ marginTop: -32, width: 72, borderWidth: 3, borderColor: '#fff', borderRadius: 36 }}><Avatar path={profile.avatar_url} name={profile.name} token={token} size={66} /></View>
            <View style={{ marginTop: 10 }}><ProfileTitle name={profile.name} username={profile.username} /></View>
            <Text style={styles.body}>{profile.social_public ? 'Perfil público' : 'Perfil privado'}</Text>
            <Text accessibilityLabel="Contagens do perfil" style={styles.body}>{canView ? `${profile.post_count} publicações · ` : ''}{connectionsText(profile.follower_count, profile.following_count)}</Text>
            {mutualText ? <Text style={styles.body}>{mutualText}</Text> : null}
            {!own ? <Button title={profile.follow_state === 'approved' ? 'Deixar de seguir' : profile.follow_state === 'pending' ? 'Cancelar solicitação' : profile.social_public ? 'Seguir' : 'Solicitar acesso'} onPress={() => onFollow(profile)} /> : null}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          </View>
        </View>
        {canView ? <>
          <ProfileTabs value={tab} onChange={setTab} />
          <View accessibilityLabel={tab} style={{ minHeight: 280 }}>
            {tab === 'Fotos'
              ? <ProfileGallery key={profile.id} userId={profile.id} ownerName={profile.name} ownerUsername={profile.username} viewerId={user.id} token={token} onPostUpdate={onPostUpdate} onPostRemove={onPostRemove} onExpired={onExpired} />
              : <MatchesEmpty />}
          </View>
        </> : <Text style={[styles.body, { padding: 22 }]}>Esta conta é privada. Solicite acesso para ver as publicações; as listas de seguidores também ficam fechadas até lá.</Text>}
      </ScrollView>
      <ProfileTopBar condensed={condensed} username={profile.username}
        leading={<TopBarButton label="Voltar" glyph="‹" condensed={condensed} onPress={onClose} />}
        trailing={own ? undefined : <TopBarButton label="Ações da conta" glyph="•••" condensed={condensed} onPress={() => setActions(true)} />} />
      {actions ? <AccountActions person={profile} token={token} onClose={() => setActions(false)} onBlocked={onBlocked} onExpired={onExpired} /> : null}
    </SafeAreaView>
  </Modal>
}

export default function CommunityScreen({ user, onExpired }: { user: User; onExpired: () => void }) {
  const feed = usePagedList<Post>('/posts', onExpired)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [peopleCursor, setPeopleCursor] = useState<string | null>(null)
  const [people, setPeople] = useState<SocialUser[]>([])
  const [profile, setProfile] = useState<SocialUser | null>(null)
  const [profileError, setProfileError] = useState('')
  const [mutualText, setMutualText] = useState<string | null>(null)
  const [selectedImage, setSelectedImage] = useState<ImagePicker.ImagePickerAsset | null>(null)
  const [caption, setCaption] = useState('')

  useEffect(() => {
    let alive = true
    void getToken().then(value => { if (alive) setToken(value) })
    return () => { alive = false }
  }, [])

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

  async function choosePhoto() {
    setError('')
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, allowsEditing: true, aspect: [1, 1], quality: 0.9 })
      if (result.canceled || !result.assets[0]) return
      const asset = result.assets[0]
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) { setError('A imagem deve ter até 5 MiB.'); return }
      setSelectedImage(asset)
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível abrir as fotos.') }
  }

  async function publish() {
    if (!selectedImage || busy) return
    setBusy(true); setError('')
    const form = new FormData()
    form.append('file', { uri: selectedImage.uri, name: selectedImage.fileName ?? 'publicacao.jpg', type: selectedImage.mimeType ?? 'image/jpeg' } as unknown as Blob)
    form.append('caption', caption)
    try {
      const created = await request<Post>('/posts', 'POST', form)
      setFeedItems(old => [created, ...old]); setSelectedImage(null); setCaption('')
    } catch (err) { fail(err, 'Não foi possível publicar a foto.') }
    finally { setBusy(false) }
  }

  async function search() {
    if (!query.trim()) return
    setError('')
    try { const page = await request<Page<SocialUser>>(`/users?q=${encodeURIComponent(query.trim())}`); setPeople(page.items); setPeopleCursor(page.next_cursor); setSearchQuery(query.trim()) }
    catch (err) { fail(err, 'Busca indisponível.') }
  }

  async function morePeople() {
    if (!peopleCursor || busy) return
    setBusy(true); setError('')
    try {
      const page = await request<Page<SocialUser>>(`/users?q=${encodeURIComponent(searchQuery)}&cursor=${encodeURIComponent(peopleCursor)}`)
      setPeople(old => [...old, ...page.items]); setPeopleCursor(page.next_cursor)
    } catch (err) { fail(err, 'Não foi possível carregar mais itens.') }
    finally { setBusy(false) }
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

  async function follow(person: SocialUser) {
    setProfileError('')
    try {
      if (person.follow_state === 'approved' || person.follow_state === 'pending') await request<void>(`/users/${person.id}/follow`, 'DELETE')
      else await request(`/users/${person.id}/follow`, 'PUT')
      await openProfile(person.id)
      setPeople(old => old.map(item => item.id === person.id ? { ...item, follow_state: item.social_public ? (item.follow_state === 'approved' ? 'none' : 'approved') : (item.follow_state === 'pending' ? 'none' : 'pending') } : item))
    } catch (err) { if (err instanceof ApiError && err.status === 401) onExpired(); setProfileError(err instanceof Error ? err.message : 'Não foi possível atualizar o vínculo.') }
  }

  function blocked() {
    const id = profile?.id
    setProfile(null)
    setPeople(old => old.filter(person => person.id !== id))
    reloadFeed()
  }

  const header = <View>
    <Text style={styles.eyebrow}>O ESPORTE CONECTA</Text><Text style={styles.title}>Comunidade</Text>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <View style={styles.card}><Text style={styles.heading}>Compartilhe sua trajetória</Text><Text style={styles.body}>Publique uma foto quadrada e uma legenda opcional.</Text><Button title={selectedImage ? 'Trocar foto' : 'Escolher foto'} onPress={() => void choosePhoto()} />
      {selectedImage ? <><Image source={{ uri: selectedImage.uri }} accessibilityLabel="Prévia da foto recortada" style={{ width: '100%', aspectRatio: 1, marginTop: 12, borderRadius: 12 }} /><Field label="Legenda (opcional)" value={caption} onChangeText={setCaption} maxLength={CAPTION_MAX} multiline /><Text style={styles.body}>{caption.length}/2.200</Text><Button title={busy ? 'Publicando…' : 'Publicar'} disabled={busy} onPress={() => void publish()} /><Button secondary title="Cancelar foto" disabled={busy} onPress={() => { setSelectedImage(null); setCaption('') }} /></> : null}
    </View>
    <View style={styles.card}><Text style={styles.heading}>Encontrar atletas</Text><Field label="Nome ou @" value={query} onChangeText={setQuery} maxLength={100} /><Button title="Buscar" onPress={() => void search()} />{people.map(person => <View key={person.id} style={[styles.row, { marginTop: 10 }]}><Avatar path={person.avatar_url} name={person.name} token={token} /><View><Button secondary title={person.name} onPress={() => void openProfile(person.id)} /><Text style={{ color: '#606965', fontSize: 13 }}>@{person.username}</Text></View><Button title={person.follow_state === 'approved' ? 'Seguindo' : person.follow_state === 'pending' ? 'Solicitado' : 'Seguir'} onPress={() => void follow(person)} /></View>)}{peopleCursor ? <Button secondary title="Carregar mais atletas" disabled={busy} onPress={() => void morePeople()} /> : null}</View>
    <Text style={styles.heading}>Publicações recentes</Text>
    {feed.error ? <><Text accessibilityRole="alert" style={styles.error}>{feed.error.message}</Text><Button secondary title="Tentar novamente" onPress={reloadFeed} /></> : null}
  </View>

  const footer = <View>
    {feed.moreError ? <Text accessibilityRole="alert" style={styles.error}>{feed.moreError}</Text> : null}
    {feed.busy ? <ActivityIndicator accessibilityLabel="Carregando mais publicações" color="#005a36" /> : feed.hasMore ? <Button secondary title="Carregar mais publicações" onPress={() => void feed.loadMore()} /> : null}
  </View>

  return <>
    <FlatList data={feed.items} keyExtractor={item => String(item.id)} keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => <PostItem post={item} viewerId={user.id} token={token} onUpdate={updatePost} onRemove={removePost} onOpenProfile={id => void openProfile(id)} onExpired={onExpired} />}
      ListHeaderComponent={header} ListFooterComponent={footer}
      ListEmptyComponent={feed.loading ? <ActivityIndicator accessibilityLabel="Carregando publicações" color="#005a36" /> : feed.error ? null : <Text style={styles.body}>Seu feed está vazio. Encontre atletas e solicite acesso a contas privadas.</Text>}
      contentContainerStyle={{ padding: 22, paddingBottom: 30 }} refreshControl={<RefreshControl refreshing={feed.loading} onRefresh={reloadFeed} />}
      onEndReached={() => { if (feed.hasMore && !feed.busy) void feed.loadMore() }} onEndReachedThreshold={0.6} />
    {profile ? <VisitedProfile profile={profile} user={user} token={token} mutualText={mutualText} error={profileError} onClose={() => setProfile(null)} onFollow={person => void follow(person)}
      onBlocked={blocked} onPostUpdate={updatePost} onPostRemove={removeProfilePost} onExpired={onExpired} /> : null}
  </>
}
