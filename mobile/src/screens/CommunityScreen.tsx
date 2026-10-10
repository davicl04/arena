import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Image, Modal, RefreshControl, Text, TextInput, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { ApiError, apiUrl, getToken, request } from '../api/client'
import type { Page, Post, SocialComment, SocialUser, User } from '../api/client'
import { Button, Field, styles } from '../components/ui'

export default function CommunityScreen({ user, onExpired }: { user: User; onExpired: () => void }) {
  const [items, setItems] = useState<Post[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const loadingMore = useRef(false)
  const [error, setError] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [peopleCursor, setPeopleCursor] = useState<string | null>(null)
  const [profileCursor, setProfileCursor] = useState<string | null>(null)
  const [commentCursors, setCommentCursors] = useState<Record<number, string | null>>({})
  const [people, setPeople] = useState<SocialUser[]>([])
  const [profile, setProfile] = useState<SocialUser | null>(null)
  const [profilePosts, setProfilePosts] = useState<Post[]>([])
  const [selectedImage, setSelectedImage] = useState<ImagePicker.ImagePickerAsset | null>(null)
  const [caption, setCaption] = useState('')
  const [editingPost, setEditingPost] = useState<Post | null>(null)
  const [editingCaption, setEditingCaption] = useState('')
  const [commentsFor, setCommentsFor] = useState<number | null>(null)
  const [comments, setComments] = useState<Record<number, SocialComment[]>>({})
  const [commentDraft, setCommentDraft] = useState<Record<number, string>>({})

  const load = useCallback(async (refresh = false) => {
    if (!refresh && loadingMore.current) return
    if (!refresh) loadingMore.current = true
    if (refresh) setLoading(true)
    setError('')
    try {
      const path = refresh || !cursor ? '/posts' : `/posts?cursor=${encodeURIComponent(cursor)}`
      const page = await request<Page<Post>>(path)
      setItems(old => refresh || !cursor ? page.items : [...old, ...page.items])
      setCursor(page.next_cursor)
    } catch (err) { if (err instanceof ApiError && err.status === 401) onExpired(); setError(err instanceof Error ? err.message : 'Não foi possível carregar o feed.') }
    finally { setLoading(false); if (!refresh) loadingMore.current = false }
  }, [cursor, onExpired])

  useEffect(() => {
    let alive = true
    void getToken().then(value => { if (alive) setToken(value) })
    request<Page<Post>>('/posts').then(page => {
      if (alive) { setItems(page.items); setCursor(page.next_cursor) }
    }).catch(err => {
      if (alive) { if (err instanceof ApiError && err.status === 401) onExpired(); setError(err instanceof Error ? err.message : 'Não foi possível carregar o feed.') }
    }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [onExpired])

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
      setItems(old => [created, ...old]); setSelectedImage(null); setCaption('')
    } catch (err) { if (err instanceof ApiError && err.status === 401) onExpired(); setError(err instanceof Error ? err.message : 'Não foi possível publicar a foto.') }
    finally { setBusy(false) }
  }

  async function search() {
    if (!query.trim()) return
    setError('')
    try { const page = await request<Page<SocialUser>>(`/users?q=${encodeURIComponent(query.trim())}`); setPeople(page.items); setPeopleCursor(page.next_cursor); setSearchQuery(query.trim()) }
    catch (err) { if (err instanceof ApiError && err.status === 401) onExpired(); setError(err instanceof Error ? err.message : 'Busca indisponível.') }
  }

  async function openProfile(id: number) {
    setProfilePosts([]); setProfileCursor(null); setError('')
    try {
      const person = await request<SocialUser>(`/users/${id}`)
      setProfile(person)
      if (person.social_public || person.follow_state === 'approved' || person.id === user.id) {
        const page = await request<Page<Post>>(`/users/${id}/posts`)
        setProfilePosts(page.items); setProfileCursor(page.next_cursor)
      }
    } catch (err) { if (err instanceof ApiError && err.status === 401) onExpired(); setError(err instanceof Error ? err.message : 'Perfil indisponível.') }
  }

  async function follow(person: SocialUser) {
    try {
      if (person.follow_state === 'approved' || person.follow_state === 'pending') await request<void>(`/users/${person.id}/follow`, 'DELETE')
      else await request(`/users/${person.id}/follow`, 'PUT')
      await openProfile(person.id)
      setPeople(old => old.map(item => item.id === person.id ? { ...item, follow_state: item.social_public ? (item.follow_state === 'approved' ? 'none' : 'approved') : (item.follow_state === 'pending' ? 'none' : 'pending') } : item))
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível atualizar o vínculo.') }
  }

  async function block(person: SocialUser) {
    Alert.alert('Bloquear conta', `Bloquear ${person.name}? Os vínculos atuais serão removidos.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Bloquear', style: 'destructive', onPress: () => { void request<void>(`/users/${person.id}/block`, 'PUT').then(() => { setProfile(null); void load(true) }).catch(err => setError(err.message)) } },
    ])
  }

  async function report(type: string, id: number) {
    const choices = ['spam', 'assedio', 'conteudo_inadequado', 'outro'].map(reason => ({
      text: reason.replaceAll('_', ' '), onPress: () => { void request('/reports', 'POST', { target_type: type, target_id: id, reason }).then(() => Alert.alert('Denúncia enviada', 'A equipe de moderação fará a análise.')).catch(err => setError(err.message)) },
    }))
    Alert.alert('Denunciar', 'Selecione o motivo da denúncia.', [...choices, { text: 'Cancelar', style: 'cancel' }])
  }

  async function toggleLike(post: Post) {
    try {
      await request<void>(`/posts/${post.id}/like`, post.liked_by_me ? 'DELETE' : 'PUT')
      const update = (item: Post) => item.id === post.id ? { ...item, liked_by_me: !post.liked_by_me, like_count: item.like_count + (post.liked_by_me ? -1 : 1) } : item
      setItems(old => old.map(update)); setProfilePosts(old => old.map(update))
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível curtir.') }
  }

  async function saveCaption() {
    if (!editingPost || busy) return
    setBusy(true)
    try {
      const updated = await request<Post>(`/posts/${editingPost.id}`, 'PATCH', { caption: editingCaption })
      const replace = (post: Post) => post.id === updated.id ? updated : post
      setItems(old => old.map(replace)); setProfilePosts(old => old.map(replace)); setEditingPost(null)
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível editar a legenda.') }
    finally { setBusy(false) }
  }

  async function showComments(post: Post) {
    setCommentsFor(commentsFor === post.id ? null : post.id)
    if (commentsFor === post.id) return
    try { const page = await request<Page<SocialComment>>(`/posts/${post.id}/comments`); setComments(old => ({ ...old, [post.id]: page.items })); setCommentCursors(old => ({ ...old, [post.id]: page.next_cursor })) }
    catch (err) { setError(err instanceof Error ? err.message : 'Comentários indisponíveis.') }
  }

  async function sendComment(post: Post) {
    const body = commentDraft[post.id]?.trim()
    if (!body || busy) return
    setBusy(true)
    try {
      const added = await request<SocialComment>(`/posts/${post.id}/comments`, 'POST', { body })
      setComments(old => ({ ...old, [post.id]: [...(old[post.id] ?? []), added] })); setCommentDraft(old => ({ ...old, [post.id]: '' }))
      setItems(old => old.map(item => item.id === post.id ? { ...item, comment_count: item.comment_count + 1 } : item))
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível comentar.') }
    finally { setBusy(false) }
  }

  async function loadSocialPage(which: 'people' | 'profile' | 'comments', postId?: number) {
    const next = which === 'people' ? peopleCursor : which === 'profile' ? profileCursor : postId ? commentCursors[postId] : null
    if (!next || busy) return
    setBusy(true); setError('')
    try {
      const suffix = `cursor=${encodeURIComponent(next)}`
      if (which === 'people') {
        const page = await request<Page<SocialUser>>(`/users?q=${encodeURIComponent(searchQuery)}&${suffix}`)
        setPeople(old => [...old, ...page.items]); setPeopleCursor(page.next_cursor)
      } else if (which === 'profile' && profile) {
        const page = await request<Page<Post>>(`/users/${profile.id}/posts?${suffix}`)
        setProfilePosts(old => [...old, ...page.items]); setProfileCursor(page.next_cursor)
      } else if (postId) {
        const page = await request<Page<SocialComment>>(`/posts/${postId}/comments?${suffix}`)
        setComments(old => ({ ...old, [postId]: [...(old[postId] ?? []), ...page.items] }))
        setCommentCursors(old => ({ ...old, [postId]: page.next_cursor }))
      }
    } catch (err) { if (err instanceof ApiError && err.status === 401) onExpired(); setError(err instanceof Error ? err.message : 'Não foi possível carregar mais itens.') }
    finally { setBusy(false) }
  }

  function avatar(path: string | null, name: string, size = 42) {
    return path && token ? <Image source={{ uri: apiUrl(path), headers: { Authorization: `Bearer ${token}` } }} accessibilityLabel={`Foto de ${name}`} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#e2e4e9' }} /> :
      <View accessibilityRole="image" accessibilityLabel={name} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#edf3ef', alignItems: 'center', justifyContent: 'center' }}><Text style={styles.heading}>{name.slice(0, 1).toUpperCase()}</Text></View>
  }

  function renderPost({ item }: { item: Post }) {
    return <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        {avatar(item.author.avatar_url, item.author.name, 38)}
        <Button secondary title={item.author.name} onPress={() => void openProfile(item.author.id)} />
        {!item.can_edit ? <Button secondary title="Denunciar" onPress={() => void report('post', item.id)} /> : <><Button secondary title="Editar legenda" onPress={() => { setEditingPost(item); setEditingCaption(item.caption) }} /><Button secondary title="Excluir" onPress={() => Alert.alert('Excluir publicação', 'Deseja remover esta foto?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Excluir', style: 'destructive', onPress: () => { void request<void>(`/posts/${item.id}`, 'DELETE').then(() => setItems(old => old.filter(post => post.id !== item.id))).catch(err => setError(err.message)) } }])} /></>}
      </View>
      <Image source={{ uri: apiUrl(item.image_url), headers: token ? { Authorization: `Bearer ${token}` } : {} }} accessibilityLabel={item.caption || `Publicação de ${item.author.name}`} style={{ width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: '#e2e4e9' }} />
      {item.caption ? <Text style={[styles.body, { marginTop: 10 }]}>{item.caption}</Text> : null}
      <View style={styles.row}><Button secondary title={`${item.liked_by_me ? 'Curtido' : 'Curtir'} · ${item.like_count}`} onPress={() => void toggleLike(item)} /><Button secondary title={`Comentários · ${item.comment_count}`} onPress={() => void showComments(item)} /></View>
      {commentsFor === item.id ? <View style={{ marginTop: 10 }}>
        {(comments[item.id] ?? []).map(comment => <View key={comment.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 5 }}>
          {avatar(comment.author_avatar_url, comment.author_name, 28)}<Text style={[styles.body, { flex: 1, marginBottom: 0 }]}><Text style={{ fontWeight: '700' }}>{comment.author_name} </Text>{comment.body}</Text>
          {comment.can_delete ? <Button secondary title="Excluir" onPress={() => { void request<void>(`/comments/${comment.id}`, 'DELETE').then(() => setComments(old => ({ ...old, [item.id]: (old[item.id] ?? []).filter(entry => entry.id !== comment.id) }))).catch(err => setError(err.message)) }} /> : null}
        </View>)}
        {commentCursors[item.id] ? <Button secondary title="Carregar mais comentários" disabled={busy} onPress={() => void loadSocialPage('comments', item.id)} /> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><TextInput accessibilityLabel="Escreva um comentário" value={commentDraft[item.id] ?? ''} onChangeText={value => setCommentDraft(old => ({ ...old, [item.id]: value }))} maxLength={1000} placeholder="Adicione um comentário" style={[styles.input, { flex: 1, marginTop: 8 }]} /><Button title="Enviar" disabled={busy || !commentDraft[item.id]?.trim()} onPress={() => void sendComment(item)} /></View>
      </View> : null}
    </View>
  }

  const header = <View>
    <Text style={styles.eyebrow}>O ESPORTE CONECTA</Text><Text style={styles.title}>Comunidade</Text>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <View style={styles.card}><Text style={styles.heading}>Compartilhe sua trajetória</Text><Text style={styles.body}>Publique uma foto quadrada e uma legenda opcional.</Text><Button title={selectedImage ? 'Trocar foto' : 'Escolher foto'} onPress={() => void choosePhoto()} />
      {selectedImage ? <><Image source={{ uri: selectedImage.uri }} accessibilityLabel="Prévia da foto recortada" style={{ width: '100%', aspectRatio: 1, marginTop: 12, borderRadius: 12 }} /><Field label="Legenda (opcional)" value={caption} onChangeText={setCaption} maxLength={2200} multiline /><Text style={styles.body}>{caption.length}/2.200</Text><Button title={busy ? 'Publicando…' : 'Publicar'} disabled={busy} onPress={() => void publish()} /><Button secondary title="Cancelar foto" disabled={busy} onPress={() => { setSelectedImage(null); setCaption('') }} /></> : null}
    </View>
    <View style={styles.card}><Text style={styles.heading}>Encontrar atletas</Text><Field label="Nome" value={query} onChangeText={setQuery} maxLength={100} /><Button title="Buscar" onPress={() => void search()} />{people.map(person => <View key={person.id} style={[styles.row, { marginTop: 10 }]}>{avatar(person.avatar_url, person.name)}<Button secondary title={person.name} onPress={() => void openProfile(person.id)} /><Button title={person.follow_state === 'approved' ? 'Seguindo' : person.follow_state === 'pending' ? 'Solicitado' : 'Seguir'} onPress={() => void follow(person)} /></View>)}{peopleCursor ? <Button secondary title="Carregar mais atletas" disabled={busy} onPress={() => void loadSocialPage('people')} /> : null}</View>
    <Text style={styles.heading}>Publicações recentes</Text>
  </View>

  return <>
    <FlatList data={items} keyExtractor={item => String(item.id)} renderItem={renderPost} ListHeaderComponent={header} ListEmptyComponent={loading ? <ActivityIndicator accessibilityLabel="Carregando publicações" color="#005a36" /> : <Text style={styles.body}>Seu feed está vazio. Encontre atletas e solicite acesso a contas privadas.</Text>} contentContainerStyle={{ padding: 22, paddingBottom: 30 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load(true)} />} onEndReached={() => { if (cursor && !busy) void load() }} onEndReachedThreshold={0.6} />
    <Modal visible={Boolean(profile)} animationType="slide" onRequestClose={() => setProfile(null)}><View style={[styles.screen, { padding: 22 }]}>
      <Button secondary title="Fechar perfil" onPress={() => setProfile(null)} />{profile ? <><View style={[styles.card, { marginTop: 20 }]}><View style={styles.row}>{avatar(profile.avatar_url, profile.name, 60)}<View><Text style={styles.heading}>{profile.name}</Text><Text style={styles.body}>{profile.social_public ? 'Perfil público' : 'Perfil privado'}</Text></View></View>
        {profile.id !== user.id ? <><Button title={profile.follow_state === 'approved' ? 'Deixar de seguir' : profile.follow_state === 'pending' ? 'Cancelar solicitação' : profile.social_public ? 'Seguir' : 'Solicitar acesso'} onPress={() => void follow(profile)} /><Button secondary title="Bloquear conta" onPress={() => void block(profile)} /><Button secondary title="Denunciar conta" onPress={() => void report('user', profile.id)} /></> : null}
        <Text style={styles.body}>{profile.post_count} publicações · {profile.follower_count} seguidores · {profile.following_count} seguindo</Text>
      </View>{profile.social_public || profile.follow_state === 'approved' || profile.id === user.id ? <FlatList data={profilePosts} keyExtractor={post => String(post.id)} renderItem={renderPost} ListFooterComponent={profileCursor ? <Button secondary title="Carregar mais fotos" disabled={busy} onPress={() => void loadSocialPage('profile')} /> : null} /> : <Text style={styles.body}>Esta conta é privada. Solicite acesso para ver as publicações.</Text>}</> : null}
    </View></Modal>
    <Modal visible={Boolean(editingPost)} transparent animationType="fade" onRequestClose={() => setEditingPost(null)}><View style={{ flex: 1, justifyContent: 'center', padding: 22, backgroundColor: '#0008' }}><View style={styles.card}><Text style={styles.heading}>Editar legenda</Text><TextInput accessibilityLabel="Legenda da publicação" value={editingCaption} onChangeText={setEditingCaption} maxLength={2200} multiline style={[styles.input, { minHeight: 100, textAlignVertical: 'top' }]} /><Button title={busy ? 'Salvando…' : 'Salvar legenda'} disabled={busy} onPress={() => void saveCaption()} /><Button secondary title="Cancelar" disabled={busy} onPress={() => setEditingPost(null)} /></View></View></Modal>
  </>
}
