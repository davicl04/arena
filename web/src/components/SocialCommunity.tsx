import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Area } from 'react-easy-crop'
import { MessageCircle, Search, Shield, UserRoundPlus } from 'lucide-react'
import { request } from '../api/client'
import type { Page, Post, SocialComment, SocialUser } from '../api/client'
import { cropImage, validateImageFile } from '../utils/cropImage'
import ImageCropSheet from './ImageCropSheet'
import PersonRow from './PersonRow'
import SocialPostCard from './SocialPostCard'

export default function SocialCommunity({ onOpenUser, onExpired }: { onOpenUser: (id: number) => void; onExpired: () => void }) {
  const [feed, setFeed] = useState<Post[]>([])
  const [feedCursor, setFeedCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [caption, setCaption] = useState('')
  const [original, setOriginal] = useState<File | null>(null)
  const [source, setSource] = useState('')
  const [query, setQuery] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [peopleCursor, setPeopleCursor] = useState<string | null>(null)
  const [commentCursors, setCommentCursors] = useState<Record<number, string | null>>({})
  const [people, setPeople] = useState<SocialUser[]>([])
  const [comments, setComments] = useState<Record<number, SocialComment[]>>({})
  const [openComments, setOpenComments] = useState<number | null>(null)
  const [commentText, setCommentText] = useState<Record<number, string>>({})

  async function refresh() {
    setLoading(true); setError('')
    try { const page = await request<Page<Post>>('/posts'); setFeed(page.items); setFeedCursor(page.next_cursor) }
    catch (err) { if (isExpired(err)) onExpired(); setError(message(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => {
    let alive = true
    request<Page<Post>>('/posts').then(page => {
      if (alive) { setFeed(page.items); setFeedCursor(page.next_cursor) }
    }).catch(err => {
      if (alive) { if (isExpired(err)) onExpired(); setError(message(err)) }
    }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [onExpired])
  useEffect(() => () => { if (source) URL.revokeObjectURL(source) }, [source])
  function isExpired(err: unknown) { return Boolean(err && typeof err === 'object' && 'status' in err && err.status === 401) }
  function message(err: unknown) { return err instanceof Error ? err.message : 'Não foi possível concluir a ação.' }
  function fail(err: unknown) { if (isExpired(err)) onExpired(); setError(message(err)) }

  function choose(file?: File) {
    setError(''); setNotice('')
    if (!file) return
    const invalid = validateImageFile(file)
    if (invalid) { setError(invalid); return }
    if (source) URL.revokeObjectURL(source)
    setOriginal(file); setSource(URL.createObjectURL(file))
  }

  async function publish(cropArea: Area) {
    if (!original || !source || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const image = await cropImage(source, cropArea, { quality: 0.88 })
      const form = new FormData()
      form.append('file', image, `${original.name.replace(/\.[^.]+$/, '')}.webp`)
      form.append('caption', caption)
      const created = await request<Post>('/posts', 'POST', form)
      setFeed(old => [created, ...old]); setCaption(''); setOriginal(null); setSource('')
      setNotice('Publicação compartilhada.')
    } catch (err) { fail(err) } finally { setBusy(false) }
  }

  async function loadMore() {
    if (!feedCursor || busy) return
    setBusy(true)
    try { const page = await request<Page<Post>>(`/posts?cursor=${encodeURIComponent(feedCursor)}`); setFeed(old => [...old, ...page.items]); setFeedCursor(page.next_cursor) }
    catch (err) { fail(err) } finally { setBusy(false) }
  }

  async function search(event: FormEvent) {
    event.preventDefault(); setError('')
    if (!query.trim()) return
    try { const result = await request<Page<SocialUser>>(`/users?q=${encodeURIComponent(query.trim())}`); setPeople(result.items); setPeopleCursor(result.next_cursor); setSearchQuery(query.trim()) }
    catch (err) { fail(err) }
  }

  async function follow(person: SocialUser) {
    setBusy(true)
    try {
      let next: SocialUser['follow_state'] = 'none'
      if (person.follow_state === 'pending' || person.follow_state === 'approved') await request<void>(`/users/${person.id}/follow`, 'DELETE')
      else next = (await request<{ state: 'approved' | 'pending' }>(`/users/${person.id}/follow`, 'PUT')).state
      setPeople(old => old.map(item => item.id === person.id ? { ...item, follow_state: next } : item))
    } catch (err) { fail(err) } finally { setBusy(false) }
  }

  async function toggleLike(post: Post) {
    try {
      await request<void>(`/posts/${post.id}/like`, post.liked_by_me ? 'DELETE' : 'PUT')
      const update = (item: Post) => item.id === post.id ? { ...item, liked_by_me: !post.liked_by_me, like_count: item.like_count + (post.liked_by_me ? -1 : 1) } : item
      setFeed(old => old.map(update))
    } catch (err) { fail(err) }
  }

  async function toggleComments(post: Post) {
    if (openComments === post.id) { setOpenComments(null); return }
    setOpenComments(post.id)
    try { const page = await request<Page<SocialComment>>(`/posts/${post.id}/comments`); setComments(old => ({ ...old, [post.id]: page.items })); setCommentCursors(old => ({ ...old, [post.id]: page.next_cursor })) }
    catch (err) { fail(err) }
  }

  async function sendComment(event: FormEvent, post: Post) {
    event.preventDefault()
    const body = commentText[post.id]?.trim()
    if (!body || busy) return
    setBusy(true)
    try {
      const added = await request<SocialComment>(`/posts/${post.id}/comments`, 'POST', { body })
      setComments(old => ({ ...old, [post.id]: [...(old[post.id] ?? []), added] }))
      setCommentText(old => ({ ...old, [post.id]: '' }))
      const update = (item: Post) => item.id === post.id ? { ...item, comment_count: item.comment_count + 1 } : item
      setFeed(old => old.map(update))
    } catch (err) { fail(err) } finally { setBusy(false) }
  }

  async function report(targetType: string, targetId: number) {
    const reason = window.prompt('Motivo: spam, assedio, conteudo_inadequado ou outro')
    if (!reason || !['spam', 'assedio', 'conteudo_inadequado', 'outro'].includes(reason)) return
    try { await request('/reports', 'POST', { target_type: targetType, target_id: targetId, reason }); setNotice('Denúncia enviada para análise.') }
    catch (err) { fail(err) }
  }

  async function removePost(post: Post) {
    if (!window.confirm('Excluir esta publicação?')) return
    try { await request<void>(`/posts/${post.id}`, 'DELETE'); setFeed(old => old.filter(item => item.id !== post.id)) }
    catch (err) { fail(err) }
  }

  async function editCaption(post: Post) {
    const next = window.prompt('Editar legenda', post.caption)
    if (next === null || next.length > 2200) return
    try { const updated = await request<Post>(`/posts/${post.id}`, 'PATCH', { caption: next });
      const replace = (item: Post) => item.id === post.id ? updated : item
      setFeed(old => old.map(replace))
    } catch (err) { fail(err) }
  }

  async function loadPeople() {
    if (!peopleCursor || busy) return
    setBusy(true)
    try {
      const page = await request<Page<SocialUser>>(`/users?q=${encodeURIComponent(searchQuery)}&cursor=${encodeURIComponent(peopleCursor)}`)
      setPeople(old => [...old, ...page.items]); setPeopleCursor(page.next_cursor)
    } catch (err) { fail(err) } finally { setBusy(false) }
  }

  async function loadComments(post: Post) {
    const cursor = commentCursors[post.id]
    if (!cursor || busy) return
    setBusy(true)
    try {
      const page = await request<Page<SocialComment>>(`/posts/${post.id}/comments?cursor=${encodeURIComponent(cursor)}`)
      setComments(old => ({ ...old, [post.id]: [...(old[post.id] ?? []), ...page.items] }))
      setCommentCursors(old => ({ ...old, [post.id]: page.next_cursor }))
    } catch (err) { fail(err) } finally { setBusy(false) }
  }

  async function deleteComment(post: Post, comment: SocialComment) {
    try {
      await request<void>(`/comments/${comment.id}`, 'DELETE')
      setComments(old => ({ ...old, [post.id]: (old[post.id] ?? []).filter(item => item.id !== comment.id) }))
      const update = (item: Post) => item.id === post.id ? { ...item, comment_count: Math.max(0, item.comment_count - 1) } : item
      setFeed(old => old.map(update))
    } catch (err) { fail(err) }
  }

  function renderPost(post: Post) {
    return <SocialPostCard key={post.id} post={post} comments={comments[post.id] ?? []}
      open={openComments === post.id} draft={commentText[post.id] ?? ''} busy={busy}
      commentCursor={commentCursors[post.id] ?? null}
      onOpenProfile={onOpenUser} onEditCaption={post => void editCaption(post)}
      onRemovePost={post => void removePost(post)} onReport={(type, id) => void report(type, id)}
      onToggleLike={post => void toggleLike(post)} onToggleComments={post => void toggleComments(post)}
      onSendComment={(event, post) => void sendComment(event, post)}
      onDraftChange={(id, value) => setCommentText(old => ({ ...old, [id]: value }))}
      onDeleteComment={(post, comment) => void deleteComment(post, comment)} onLoadComments={post => void loadComments(post)} />
  }

  return <section className="social-community" aria-label="Comunidade Arena">
    <div className="social-heading"><div><p className="eyebrow">O ESPORTE CONECTA</p><h2>Comunidade</h2></div><button className="secondary" onClick={() => void refresh()} disabled={loading}>Atualizar feed</button></div>
    {error && <p className="error" role="alert">{error}</p>}{notice && <p className="success" role="status">{notice}</p>}
    <form className="social-search" onSubmit={event => void search(event)}><label className="visually-hidden" htmlFor="social-search-input">Buscar atletas por nome ou @</label><input id="social-search-input" value={query} onChange={event => setQuery(event.target.value)} maxLength={100} placeholder="Encontre atletas pelo nome ou @" /><button className="secondary" aria-label="Buscar atletas"><Search size={18} /></button></form>
    {people.length > 0 && <div className="person-list" aria-label="Resultados da busca">{people.map(person => <PersonRow key={person.id} person={person} onOpen={onOpenUser}
      info={person.social_public ? 'Conta pública' : 'Conta privada'}
      actions={<button className="secondary compact" onClick={() => void follow(person)} disabled={busy}>{person.follow_state === 'approved' ? 'Seguindo' : person.follow_state === 'pending' ? 'Solicitado' : <><UserRoundPlus size={16} /> Seguir</>}</button>} />)}</div>}
    {peopleCursor && <button className="secondary full-width" disabled={busy} onClick={() => void loadPeople()}>Carregar mais atletas</button>}
    <form className="social-composer" onSubmit={(event: FormEvent) => event.preventDefault()}>
      <h3>Compartilhe sua trajetória</h3><p>Uma foto quadrada por publicação. A imagem original fica no seu dispositivo.</p>
      <label className="secondary social-file-label" htmlFor="post-image">{original ? 'Trocar foto' : 'Escolher foto'}</label>
      <input id="post-image" className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { choose(event.target.files?.[0]); event.target.value = '' }} />
      {original && <p className="social-file-name">{original.name}</p>}
      <label htmlFor="post-caption">Legenda (opcional)</label><textarea id="post-caption" value={caption} onChange={event => setCaption(event.target.value)} maxLength={2200} rows={3} placeholder="Conte um pouco sobre esse momento" />
      <div className="social-compose-footer"><small>{caption.length}/2.200</small><button className="primary" disabled={busy || !original}>{busy ? 'Publicando…' : 'Publicar foto'}</button></div>
    </form>
    {source && <ImageCropSheet source={source} title="Enquadrar publicação" description="Arraste a foto e ajuste o zoom para escolher a imagem quadrada." aspect={1}
      confirmLabel="Confirmar recorte e publicar" busy={busy} error="" onCancel={() => { setSource(''); setOriginal(null) }} onConfirm={area => void publish(area)} />}
    {loading && <p role="status">Carregando publicações…</p>}
    {!loading && feed.length === 0 && <div className="empty-state"><span className="empty-icon"><MessageCircle size={26} /></span><h2>Seu feed começa aqui</h2><p>Siga contas públicas ou peça acesso a perfis privados para acompanhar publicações.</p></div>}
    <div className="social-feed">{feed.map(renderPost)}</div>
    {feedCursor && <button className="secondary full-width" disabled={busy} onClick={() => void loadMore()}>Carregar mais publicações</button>}
    <p className="social-privacy-note"><Shield size={15} /> Publicações são exibidas conforme a privacidade da conta e os vínculos aprovados.</p>
  </section>
}
