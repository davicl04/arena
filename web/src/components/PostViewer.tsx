import { useEffect, useId, useLayoutEffect, useRef } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { Post } from '../api/client'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { useOverlayPortal } from '../hooks/useOverlayPortal'
import PostItem from './PostItem'
import type { PostUpdate } from './PostItem'
import { Button, IconButton } from '@/components/ui/button'
import { feedbackVariants } from '@/components/ui/feedback'
import { widePanel } from '@/components/ui/overlay-variants'
import { cn } from '@/lib/utils'

/**
 * Página sobreposta "Publicações": feed vertical das fotos de uma conta, aberto no post tocado.
 * No celular, fica absoluta dentro do `app-frame` (como as folhas), abaixo da navegação inferior (z-viewer < z-nav),
 * para não cobrir o botão Jogar. Em tablet e computador (ticket 02 da web responsiva) vira painel centralizado de 480 px
 * sobre o fundo escurecido, que cobre também a navegação lateral (useOverlayPortal); as fotos ficam na largura do painel.
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
  const overlay = useOverlayPortal()
  const scroller = useRef<HTMLDivElement>(null)
  const sentinel = useRef<HTMLDivElement>(null)
  const loadMore = useRef(onLoadMore)
  useEffect(() => { loadMore.current = onLoadMore }, [onLoadMore])

  useLayoutEffect(() => {
    const box = scroller.current
    const target = box?.querySelector<HTMLElement>(`[data-post-id="${initialPostId}"]`)
    if (box && target) box.scrollTop = target.offsetTop // o contêiner rolável é o offsetParent (position: relative)
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

  return overlay.render(<section ref={ref} className={cn('absolute inset-0 z-viewer flex flex-col bg-app outline-none motion-safe:animate-viewer-in', widePanel, 'md:overflow-hidden md:motion-safe:animate-glass-in')} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}>
    <header className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-1.5">
      <IconButton type="button" aria-label="Voltar" onClick={onClose}><ArrowLeft size={21} /></IconButton>
      <div className="min-w-0 flex-1 text-center">
        <small className="truncate text-[9px] font-bold tracking-[0.08em] text-ink-muted uppercase">@{username}</small>
        <h2 id={titleId} className="text-[15px]">Publicações</h2>
      </div>
      <span className="w-11" />
    </header>
    <div ref={scroller} className="relative flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pb-[calc(102px+env(safe-area-inset-bottom))] scrollbar-hidden md:pb-6" data-testid="viewer-scroll">
      {posts.map(post => <PostItem key={post.id} post={post} viewerId={viewerId} onUpdate={onUpdate} onRemoved={removed} onExpired={onExpired} />)}
      {moreError && <p className={cn(feedbackVariants(), 'mx-4 mt-2 mb-0')} role="alert">{moreError}</p>}
      {hasMore && <div ref={sentinel} className="px-4">
        <Button type="button" variant="secondary" className="mt-[18px] w-full" disabled={busy} onClick={onLoadMore}>{busy ? 'Carregando…' : 'Carregar mais publicações'}</Button>
      </div>}
    </div>
  </section>, { scrim: true })
}
