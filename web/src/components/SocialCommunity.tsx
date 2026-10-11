import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Area } from 'react-easy-crop'
import { MessageCircle, Search, Shield, UserRoundPlus } from 'lucide-react'
import { request } from '../api/client'
import type { Page, Post, SocialUser } from '../api/client'
import { cropImage, validateImageFile } from '../utils/cropImage'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Eyebrow } from '@/components/ui/eyebrow'
import { feedbackVariants } from '@/components/ui/feedback'
import { PersonList, PersonRow } from '@/components/ui/person-row'
import { cn } from '@/lib/utils'

/* Parágrafos do cartão de publicação (texto de apoio e nome do arquivo escolhido). */
const composerText = 'mt-[5px] text-[10px] leading-[1.6] text-ink-muted'
import ImageCropSheet from './ImageCropSheet'
import PostItem from './PostItem'
import type { PostUpdate } from './PostItem'

export default function SocialCommunity({ viewerId, onOpenUser, onExpired }: { viewerId: number; onOpenUser: (id: number) => void; onExpired: () => void }) {
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
  const [people, setPeople] = useState<SocialUser[]>([])

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

  async function loadPeople() {
    if (!peopleCursor || busy) return
    setBusy(true)
    try {
      const page = await request<Page<SocialUser>>(`/users?q=${encodeURIComponent(searchQuery)}&cursor=${encodeURIComponent(peopleCursor)}`)
      setPeople(old => [...old, ...page.items]); setPeopleCursor(page.next_cursor)
    } catch (err) { fail(err) } finally { setBusy(false) }
  }

  const updatePost: PostUpdate = useCallback((postId, change) => {
    setFeed(old => old.map(item => item.id === postId ? change(item) : item))
  }, [])
  const removePost = useCallback((postId: number) => setFeed(old => old.filter(item => item.id !== postId)), [])

  return <section className="pb-[18px] min-[700px]:mx-auto min-[700px]:max-w-[560px]" aria-label="Comunidade Arena">
    <div className="mb-[15px] flex items-center justify-between gap-3">
      <div><Eyebrow>O ESPORTE CONECTA</Eyebrow><h2 className="text-[26px]">Comunidade</h2></div>
      <Button variant="secondary" className="min-h-[38px] px-2.5 py-[7px] text-[10px]" onClick={() => void refresh()} disabled={loading}>Atualizar feed</Button>
    </div>
    {error && <p className={feedbackVariants()} role="alert">{error}</p>}{notice && <p className={feedbackVariants({ tone: 'success' })} role="status">{notice}</p>}
    <form className="mb-[15px] flex gap-2" onSubmit={event => void search(event)}>
      <label className="sr-only" htmlFor="social-search-input">Buscar atletas por nome ou @</label>
      <input id="social-search-input" className="flex-1" value={query} onChange={event => setQuery(event.target.value)} maxLength={100} placeholder="Encontre atletas pelo nome ou @" />
      <Button variant="secondary" className="min-w-[46px]" aria-label="Buscar atletas"><Search size={18} /></Button>
    </form>
    {people.length > 0 && <PersonList aria-label="Resultados da busca">{people.map(person => <PersonRow key={person.id} person={person} onOpen={onOpenUser}
      info={person.social_public ? 'Conta pública' : 'Conta privada'}
      actions={<Button variant="secondary" size="compact" onClick={() => void follow(person)} disabled={busy}>{person.follow_state === 'approved' ? 'Seguindo' : person.follow_state === 'pending' ? 'Solicitado' : <><UserRoundPlus size={16} /> Seguir</>}</Button>} />)}</PersonList>}
    {peopleCursor && <Button variant="secondary" className="mt-[18px] w-full" disabled={busy} onClick={() => void loadPeople()}>Carregar mais atletas</Button>}
    <Card as="form" className="my-[17px] p-[15px]" onSubmit={(event: FormEvent) => event.preventDefault()}>
      <h3 className="text-[14px]">Compartilhe sua trajetória</h3><p className={composerText}>Uma foto quadrada por publicação. A imagem original fica no seu dispositivo.</p>
      <label className={cn(buttonVariants({ variant: 'secondary' }), 'mt-[13px] min-h-[38px] cursor-pointer text-[10px]')} htmlFor="post-image">{original ? 'Trocar foto' : 'Escolher foto'}</label>
      <input id="post-image" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { choose(event.target.files?.[0]); event.target.value = '' }} />
      {original && <p className={cn(composerText, 'wrap-anywhere')}>{original.name}</p>}
      <label htmlFor="post-caption">Legenda (opcional)</label>
      <textarea id="post-caption" className="block w-full min-w-0 resize-y rounded-field border border-solid border-field-border bg-white px-3 py-[11px] text-[12px] text-ink placeholder:text-[#757575]" value={caption} onChange={event => setCaption(event.target.value)} maxLength={2200} rows={3} placeholder="Conte um pouco sobre esse momento" />
      <div className="mt-[9px] flex items-center justify-between gap-2.5"><small className="text-[10px] text-ink-muted">{caption.length}/2.200</small><Button className="min-h-[38px] px-3 py-[7px] text-[10px]" disabled={busy || !original}>{busy ? 'Publicando…' : 'Publicar foto'}</Button></div>
    </Card>
    {source && <ImageCropSheet source={source} title="Enquadrar publicação" description="Arraste a foto e ajuste o zoom para escolher a imagem quadrada." aspect={1}
      confirmLabel="Confirmar recorte e publicar" busy={busy} error="" onCancel={() => { setSource(''); setOriginal(null) }} onConfirm={area => void publish(area)} />}
    {loading && <p role="status">Carregando publicações…</p>}
    {!loading && feed.length === 0 && <EmptyState Icon={MessageCircle} title="Seu feed começa aqui" text="Siga contas públicas ou peça acesso a perfis privados para acompanhar publicações." />}
    <div className="grid grid-cols-[minmax(0,1fr)] gap-[18px]">{feed.map(post => <PostItem key={post.id} post={post} viewerId={viewerId}
      onUpdate={updatePost} onRemoved={removePost} onOpenProfile={onOpenUser} onExpired={onExpired} />)}</div>
    {feedCursor && <Button variant="secondary" className="mt-[18px] w-full" disabled={busy} onClick={() => void loadMore()}>Carregar mais publicações</Button>}
    <p className="flex items-center gap-1.5 px-[3px] py-3.5 text-[10px] leading-[1.5] text-ink-muted"><Shield size={15} /> Publicações são exibidas conforme a privacidade da conta e os vínculos aprovados.</p>
  </section>
}
