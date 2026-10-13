import { useCallback, useEffect, useRef } from 'react'
import { Progress as ProgressPrimitive } from '@base-ui/react/progress'
import { Camera, Shield } from 'lucide-react'
import type { Post } from '../api/client'
import type { usePagedList } from '../hooks/usePagedList'
import { ArenaMark } from './Brand'
import PostItem from './PostItem'
import type { PostUpdate } from './PostItem'
import { Button } from '@/components/ui/button'
import { feedbackVariants } from '@/components/ui/feedback'
import { LoadError } from '@/components/ui/load-error'
import { ProgressIndicator, ProgressTrack } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

/** Barra de progresso verde sem valor (J4): no topo ao carregar o feed e no fim ao carregar mais. */
export function FeedProgress({ label, className }: { label: string; className?: string }) {
  return <ProgressPrimitive.Root value={null} aria-label={label} className={className}>
    <ProgressTrack className="h-[3px] rounded-none bg-[#8fe0b44d]"><ProgressIndicator className="w-2/5 bg-brand motion-safe:animate-indeterminate" /></ProgressTrack>
  </ProgressPrimitive.Root>
}

/** Esqueleto de um post quadrado, enquanto a primeira página chega. */
function PostSkeleton() {
  const block = 'rounded-lg bg-[#d5d9de] motion-safe:animate-pulse'
  return <div className="pb-3.5 [&+&]:mt-1.5" aria-hidden="true">
    <div className="aspect-square bg-[#d5d9de] motion-safe:animate-pulse" />
    <div className="grid gap-[7px] px-4 pt-3"><div className={cn(block, 'h-[9px] w-[86%]')} /><div className={cn(block, 'h-[9px] w-[58%]')} /></div>
  </div>
}

/* Estado centralizado do feed vazio: arte, título, texto e ações. */
const stateBox = 'mx-6 mt-10 grid justify-items-center gap-1 text-center'
const stateText = 'mt-1 mb-3.5 max-w-[270px] text-[11.5px] leading-[1.6] text-ink-muted'

/**
 * Feed da Comunidade com os estados "arquibancada" (J4): carregando, vazio, erro (`LoadError`), carregando mais e fim.
 * Os posts usam o mesmo `PostItem` do visualizador do perfil; a paginação continua sozinha perto do fim.
 */
export default function CommunityFeed({ feed, viewerId, scroller, onOpenUser, onExpired, onCompose, onSearch }: {
  feed: ReturnType<typeof usePagedList<Post>>
  viewerId: number
  scroller: HTMLElement | null
  onOpenUser: (id: number) => void
  onExpired: () => void
  onCompose: () => void
  onSearch: () => void
}) {
  const { items, loading, error, hasMore, busy, moreError, loadMore, setItems, reload } = feed
  const sentinel = useRef<HTMLDivElement>(null)
  const more = useRef(loadMore)
  useEffect(() => { more.current = loadMore }, [loadMore])

  useEffect(() => {
    const node = sentinel.current
    // Sem repetir automaticamente depois de uma falha: o botão continua disponível.
    if (!node || !hasMore || busy || moreError || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void more.current()
    }, { root: scroller, rootMargin: '0px 0px 400px 0px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, busy, moreError, scroller])

  const updatePost: PostUpdate = useCallback((postId, change) => {
    setItems(old => old.map(item => item.id === postId ? change(item) : item))
  }, [setItems])
  const removePost = useCallback((postId: number) => setItems(old => old.filter(item => item.id !== postId)), [setItems])

  if (loading) return <div><FeedProgress label="Carregando publicações" />
    <div className="opacity-45"><PostSkeleton /><PostSkeleton /></div></div>
  if (error) return <LoadError size="screen" title="Feed indisponível" text="Não foi possível carregar as publicações." cause={error} onRetry={reload} />
  if (items.length === 0) return <div className={stateBox}>
    <span className="mb-4 grid size-[120px] place-items-center rounded-full bg-forest shadow-[0_0_0_8px_#0b221814]"><ArenaMark className="h-[54px] w-[72px] text-mint" /></span>
    <h2 className="text-[16px]">A arquibancada está vazia</h2>
    <p className={stateText}>Siga atletas para ver as fotos deles aqui, ou abra os trabalhos com a sua.</p>
    <div className="flex flex-wrap justify-center gap-2">
      <Button type="button" size="compact" onClick={onCompose}><Camera size={16} />Publicar foto</Button>
      <Button type="button" variant="text" className="min-h-[38px] px-2 no-underline font-bold" onClick={onSearch}>Buscar atletas</Button>
    </div>
  </div>

  return <>
    {items.map(post => <PostItem key={post.id} post={post} viewerId={viewerId}
      onUpdate={updatePost} onRemoved={removePost} onOpenProfile={onOpenUser} onExpired={onExpired} />)}
    {moreError && <p className={cn(feedbackVariants(), 'mx-4 mt-2 mb-0')} role="alert">{moreError}</p>}
    {hasMore ? <div ref={sentinel} className="px-4 pt-3.5">
      {busy ? <FeedProgress label="Carregando mais publicações" className="mx-1 my-3.5" />
        : <Button type="button" variant="secondary" className="w-full" onClick={() => void loadMore()}>Carregar mais publicações</Button>}
    </div> : <>
      <div className="mx-4 mt-3 flex items-center gap-3 rounded-panel bg-white p-3.5 shadow-card">
        <div className="min-w-0 flex-1"><b className="block font-display text-[13px]">Chegou ao fim</b>
          <small className="mt-0.5 text-[10.5px] text-ink-muted">Que tal compartilhar a sua?</small></div>
        <Button type="button" size="compact" onClick={onCompose}><Camera size={16} />Publicar</Button>
      </div>
      <p className="flex items-center gap-1.5 px-5 py-3.5 text-[10px] leading-[1.5] text-ink-muted"><Shield size={15} /> Publicações são exibidas conforme a privacidade da conta e os vínculos aprovados.</p>
    </>}
  </>
}
