import { useCallback, useEffect, useRef, useState } from 'react'
import { Image as ImageIcon, Plus } from 'lucide-react'
import { apiUrl } from '../api/client'
import type { Post } from '../api/client'
import { usePagedList } from '../hooks/usePagedList'
import EmptyState from './EmptyState'
import PostViewer from './PostViewer'
import type { PostUpdate } from './PostItem'

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

  if (list.loading) return <p className="gallery-status" role="status">Carregando fotos…</p>
  if (list.error) return <div className="error" role="alert">{list.error.message} <button type="button" className="text-button" onClick={list.reload}>Tentar novamente</button></div>
  if (!list.items.length) {
    return <EmptyState Icon={ImageIcon} title="Nenhuma foto por aqui"
      text={own ? 'Publique pela Comunidade e suas fotos aparecem nesta grade.' : 'Quando esta conta publicar fotos, elas aparecerão aqui.'}
      action={own && onNewPhoto && <button type="button" className="primary empty-action" onClick={onNewPhoto}><Plus size={16} />Publicar foto</button>} />
  }
  const remainder = list.items.length % 3
  const fill = own && remainder ? 3 - remainder : 0
  return <>
    <div ref={grid} className="profile-gallery" role="list" aria-label={`Fotos de ${ownerName}`} tabIndex={-1}>
      {list.items.map(post => <div role="listitem" key={post.id}>
        <button type="button" className="gallery-tile" ref={node => { if (node) tiles.current.set(post.id, node); else tiles.current.delete(post.id) }}
          aria-label={`Abrir publicação de ${day(post.created_at)}${post.caption ? `: ${post.caption}` : ''}`}
          onClick={() => { setReturnTo(null); setOpenId(post.id) }}>
          <img src={apiUrl(post.image_url)} alt="" loading="lazy" />
        </button>
      </div>)}
      {fill > 0 && onNewPhoto && <div role="listitem">
        <button type="button" className="add-tile" onClick={onNewPhoto}><Plus size={22} />Nova foto</button>
      </div>}
      {Array.from({ length: fill > 0 && onNewPhoto ? fill - 1 : 0 }, (_, index) => <span key={index} className="ghost-tile" aria-hidden="true" />)}
    </div>
    {list.moreError && <p className="error" role="alert">{list.moreError}</p>}
    {list.hasMore && <button type="button" className="secondary full-width gallery-more" disabled={list.busy} onClick={() => void list.loadMore()}>Carregar mais fotos</button>}
    {openId !== null && <PostViewer username={username} posts={list.items} initialPostId={openId} viewerId={viewerId}
      hasMore={list.hasMore} busy={list.busy} moreError={list.moreError} onLoadMore={() => void list.loadMore()}
      onUpdate={update} onRemoved={remove} onClose={close} onExpired={onExpired} />}
  </>
}
