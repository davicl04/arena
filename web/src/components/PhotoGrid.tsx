import type { ReactNode } from 'react'
import { apiUrl } from '../api/client'
import type { Post } from '../api/client'
import { usePagedList } from '../hooks/usePagedList'

/** Galeria de fotos publicadas por uma conta (`GET /users/{id}/posts`). */
export default function PhotoGrid({ userId, ownerName, empty, onExpired }: {
  userId: number
  ownerName: string
  empty: ReactNode
  onExpired: () => void
}) {
  const list = usePagedList<Post>(`/users/${userId}/posts`, onExpired)
  if (list.loading) return <p role="status">Carregando fotos…</p>
  return <>
    {list.error && <p className="error" role="alert">{list.error.message}</p>}
    {list.items.length > 0
      ? <div className="profile-photo-grid" aria-label="Publicações de fotos">
        {list.items.map(post => <img key={post.id} src={apiUrl(post.image_url)} alt={post.caption || `Publicação de ${ownerName}`} />)}
      </div>
      : !list.error && empty}
    {list.moreError && <p className="error" role="alert">{list.moreError}</p>}
    {list.hasMore && <button className="secondary full-width" disabled={list.busy} onClick={() => void list.loadMore()}>Carregar mais fotos</button>}
  </>
}
