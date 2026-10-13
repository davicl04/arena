import { useCallback, useEffect, useRef, useState } from 'react'
import { Image as ImageIcon, Plus } from 'lucide-react'
import { apiUrl } from '../api/client'
import type { Post } from '../api/client'
import { usePagedList } from '../hooks/usePagedList'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { feedbackVariants } from '@/components/ui/feedback'
import { LoadError } from '@/components/ui/load-error'
import PostViewer from './PostViewer'
import type { PostUpdate } from './PostItem'

/* Quadros da grade (1:1). O foco fica por dentro, para não ser cortado pelos vizinhos. */
const tileBase = 'aspect-square w-full focus-visible:outline-offset-[-3px]'

const day = (value: string) => new Date(value).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * Grade de fotos de uma conta (`GET /users/{id}/posts`), de ponta a ponta.
 * A mesma lista alimenta o visualizador, então curtidas, legendas e exclusões aparecem nos dois.
 */
export default function ProfileGallery({ userId, username, ownerName, viewerId, own, onNewPhoto, onExpired }: {
  userId: number
  username: string
  ownerName: string
  viewerId: number
  own: boolean
  onNewPhoto?: () => void
  onExpired: () => void
}) {
  const list = usePagedList<Post>(`/users/${userId}/posts`, onExpired)
  const { setItems } = list
  const [openId, setOpenId] = useState<number | null>(null)
  const [returnTo, setReturnTo] = useState<number | null>(null)
  const tiles = useRef(new Map<number, HTMLButtonElement>())
  const grid = useRef<HTMLDivElement>(null)

  const update: PostUpdate = useCallback((postId, change) => {
    setItems(old => old.map(post => post.id === postId ? change(post) : post))
  }, [setItems])
  const remove = useCallback((postId: number) => setItems(old => old.filter(post => post.id !== postId)), [setItems])

  // Ao fechar o visualizador, o foco volta ao quadro tocado (ou à grade, se a foto foi excluída).
  useEffect(() => {
    if (returnTo === null) return
    const tile = tiles.current.get(returnTo)
    if (tile) tile.focus()
    else grid.current?.focus()
  }, [returnTo])

  function close() { setReturnTo(openId); setOpenId(null) }

  if (list.loading) return <p className="py-7 text-center text-[12px] text-ink-muted" role="status">Carregando fotos…</p>
  if (list.error) return <LoadError size="section" title="Não foi possível carregar as fotos" text={list.error.message} cause={list.error} onRetry={list.reload} />
  if (!list.items.length) {
    return <EmptyState Icon={ImageIcon} title="Nenhuma foto por aqui"
      text={own ? 'Publique pela Comunidade e suas fotos aparecem nesta grade.' : 'Quando esta conta publicar fotos, elas aparecerão aqui.'}
      action={own && onNewPhoto && <Button type="button" className="mt-4" onClick={onNewPhoto}><Plus size={16} />Publicar foto</Button>} />
  }
  const remainder = list.items.length % 3
  const fill = own && remainder ? 3 - remainder : 0
  return <>
    <div ref={grid} className="-mx-5 mt-0.5 grid grid-cols-3 gap-0.5 outline-none [&>div]:min-w-0" role="list" aria-label={`Fotos de ${ownerName}`} tabIndex={-1}>
      {list.items.map(post => <div role="listitem" key={post.id}>
        <button type="button" className={`${tileBase} group relative block overflow-hidden border-0 bg-tile p-0`} ref={node => { if (node) tiles.current.set(post.id, node); else tiles.current.delete(post.id) }}
          aria-label={`Abrir publicação de ${day(post.created_at)}${post.caption ? `: ${post.caption}` : ''}`}
          onClick={() => { setReturnTo(null); setOpenId(post.id) }}>
          <img className="block size-full object-cover motion-safe:transition-transform motion-safe:duration-[250ms] motion-safe:ease-[ease] motion-safe:group-hover:scale-[1.04]" src={apiUrl(post.image_url)} alt="" loading="lazy" />
        </button>
      </div>)}
      {fill > 0 && onNewPhoto && <div role="listitem">
        <button type="button" className={`${tileBase} grid place-items-center content-center gap-1.5 border-[1.5px] border-dashed border-field-border bg-transparent p-0 text-[10px] font-bold text-brand hover:bg-brand/5`} onClick={onNewPhoto}><Plus size={22} />Nova foto</button>
      </div>}
      {Array.from({ length: fill > 0 && onNewPhoto ? fill - 1 : 0 }, (_, index) => <span key={index} className="block aspect-square w-full bg-[#49505708] noite:bg-[#ffffff08]" aria-hidden="true" />)}
    </div>
    {list.moreError && <p className={feedbackVariants()} role="alert">{list.moreError}</p>}
    {list.hasMore && <Button type="button" variant="secondary" className="mt-3.5 w-full" disabled={list.busy} onClick={() => void list.loadMore()}>Carregar mais fotos</Button>}
    {openId !== null && <PostViewer username={username} posts={list.items} initialPostId={openId} viewerId={viewerId}
      hasMore={list.hasMore} busy={list.busy} moreError={list.moreError} onLoadMore={() => void list.loadMore()}
      onUpdate={update} onRemoved={remove} onClose={close} onExpired={onExpired} />}
  </>
}
