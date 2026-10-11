import { useEffect, useId, useLayoutEffect, useRef } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { Post } from '../api/client'
import { useDialogFocus } from '../hooks/useDialogFocus'
import PostItem from './PostItem'
import type { PostUpdate } from './PostItem'

/**
 * Página sobreposta "Publicações": feed vertical das fotos de uma conta, aberto no post tocado.
 * Fica absoluta dentro de `.arena-app` (como as folhas), deixando a navegação inferior visível.
 */
export default function PostViewer({ username, posts, initialPostId, viewerId, hasMore, busy, moreError, onLoadMore, onUpdate, onRemoved, onClose, onExpired }: {
  username: string
  posts: Post[]
  initialPostId: number
  viewerId: number
  hasMore: boolean
  busy: boolean
  moreError: string
  onLoadMore: () => void
  onUpdate: PostUpdate
  onRemoved: (postId: number) => void
  onClose: () => void
  onExpired: () => void
}) {
  const titleId = useId()
  // O foco volta ao quadro da grade pela galeria, que sabe se ele ainda existe.
  const { ref, onKeyDown } = useDialogFocus<HTMLElement>(onClose, { restoreFocus: false })
  const scroller = useRef<HTMLDivElement>(null)
  const sentinel = useRef<HTMLDivElement>(null)
  const loadMore = useRef(onLoadMore)
  useEffect(() => { loadMore.current = onLoadMore }, [onLoadMore])

  useLayoutEffect(() => {
    const box = scroller.current
    const target = box?.querySelector<HTMLElement>(`[data-post-id="${initialPostId}"]`)
    if (box && target) box.scrollTop = target.offsetTop // .viewer-scroll é o offsetParent (position: relative)
    // Somente na abertura: depois disso a rolagem é de quem usa.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const node = sentinel.current
    // Sem repetir automaticamente depois de uma falha: o botão continua disponível.
    if (!node || !hasMore || busy || moreError || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) loadMore.current()
    }, { root: scroller.current, rootMargin: '0px 0px 400px 0px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, busy, moreError])

  function removed(postId: number) {
    onRemoved(postId)
    if (posts.length <= 1) onClose()
  }

  return <section ref={ref} className="post-viewer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}>
    <header className="viewer-bar">
      <button type="button" className="icon-btn" aria-label="Voltar" onClick={onClose}><ArrowLeft size={21} /></button>
      <div><small>@{username}</small><h2 id={titleId}>Publicações</h2></div>
      <span className="topbar-spacer" />
    </header>
    <div ref={scroller} className="viewer-scroll">
      {posts.map(post => <PostItem key={post.id} post={post} viewerId={viewerId} onUpdate={onUpdate} onRemoved={removed} onExpired={onExpired} />)}
      {moreError && <p className="error" role="alert">{moreError}</p>}
      {hasMore && <div ref={sentinel} className="viewer-more">
        <button type="button" className="secondary full-width" disabled={busy} onClick={onLoadMore}>{busy ? 'Carregando…' : 'Carregar mais publicações'}</button>
      </div>}
    </div>
  </section>
}
