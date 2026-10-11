import { useState } from 'react'
import { Ellipsis, Heart, MessageCircle } from 'lucide-react'
import { ApiError, apiUrl } from '../api/client'
import type { Post } from '../api/client'
import { setLike } from '../api/social'
import PostActions from './PostActions'
import PostComments from './PostComments'
import { SocialPhoto } from './SocialPhoto'
import { IconButton } from '@/components/ui/button'
import { feedbackVariants } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

const day = (value: string) => new Date(value).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })

/* Pílulas de curtir/comentar sobre a foto; curtida marcada (aria-pressed) fica branca com coração vermelho. */
const pill = 'inline-flex min-h-9 items-center gap-1.5 rounded-[18px] border-0 bg-[#0b2218a6] px-[13px] py-0 text-[11px] font-bold text-white tabular-nums backdrop-blur-[10px] aria-pressed:bg-white aria-pressed:text-danger'
const authorBox = 'flex min-w-0 flex-1 items-center gap-[9px] border-0 bg-transparent p-0 text-left text-inherit'
/* feed: Comunidade (cantos arredondados) · viewer: visualizador "Publicações" (foto de ponta a ponta, texto recuado). */
const layouts = {
  feed: { article: 'min-w-0', media: 'rounded-card', caption: 'px-1 pt-2.5 pb-0.5', feedback: 'mt-2 mb-0' },
  viewer: { article: 'min-w-0 [&+&]:mt-1.5', media: 'rounded-none', caption: 'px-4 pt-2.5 pb-3', feedback: 'mx-4 mt-2 mb-0' },
}

/**
 * Publicação A3: foto 4:5 com autor e data sobrepostos, pílulas de curtir/comentar e legenda abaixo.
 * Comentários (C4) e menu ••• (M3) abrem em vidro sobre a foto, um de cada vez.
 */
export type PostUpdate = (postId: number, update: (post: Post) => Post) => void

export default function PostItem({ post, viewerId, layout = 'feed', onUpdate, onRemoved, onOpenProfile, onExpired }: {
  post: Post
  layout?: keyof typeof layouts
  viewerId: number
  /** Recebe uma função de atualização para não sobrescrever mudanças concorrentes (curtida × comentário). */
  onUpdate: PostUpdate
  onRemoved: (postId: number) => void
  onOpenProfile?: (userId: number) => void
  onExpired: () => void
}) {
  const [glass, setGlass] = useState<'menu' | 'comments' | null>(null)
  const [liking, setLiking] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const name = post.author.name
  const toggle = (next: 'menu' | 'comments') => { setFeedback(null); setGlass(old => old === next ? null : next) }

  async function like() {
    if (liking) return
    setLiking(true); setFeedback(null)
    const liked = !post.liked_by_me
    try {
      await setLike(post.id, liked)
      onUpdate(post.id, old => ({ ...old, liked_by_me: liked, like_count: Math.max(0, old.like_count + (liked ? 1 : -1)) }))
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      setFeedback({ kind: 'error', text: cause instanceof Error && cause.message ? cause.message : 'Não foi possível atualizar a curtida.' })
    } finally { setLiking(false) }
  }

  const l = layouts[layout]
  const author = <><SocialPhoto path={post.author.avatar_url} name={name} size="author" />
    <span className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-px"><b className="truncate text-[12px]">{name}</b><time className="text-[9.5px] opacity-85" dateTime={post.created_at}>{day(post.created_at)}</time></span></>
  return <article className={l.article} data-post-id={post.id} aria-label={`Publicação de ${name}`}>
    <div className={cn('relative overflow-hidden bg-tile', l.media)}>
      <img className="block aspect-[4/5] w-full object-cover" src={apiUrl(post.image_url)} alt={post.caption || `Publicação de ${name}`} />
      {/* Com um vidro aberto, autor e pílulas ficam ocultos (continuam no DOM, como antes). */}
      <div className={cn('absolute inset-x-0 top-0 flex items-center gap-2 py-2.5 pr-1.5 pl-3 text-white [text-shadow:0_1px_3px_#000b]', glass && 'invisible')}>
        {onOpenProfile
          ? <button type="button" className={authorBox} aria-label={`Abrir perfil de ${name}`} onClick={() => onOpenProfile(post.author.id)}>{author}</button>
          : <span className={authorBox}>{author}</span>}
        <IconButton type="button" tone="photo" aria-label="Ações da publicação" aria-haspopup="dialog" aria-expanded={glass === 'menu'}
          onClick={() => toggle('menu')}><Ellipsis size={21} /></IconButton>
      </div>
      <div className={cn('absolute bottom-3 left-3 flex gap-2', glass && 'invisible')}>
        <button type="button" className={pill} aria-label={`Curtir (${post.like_count})`} aria-pressed={post.liked_by_me} disabled={liking} onClick={() => void like()}>
          <Heart size={17} fill={post.liked_by_me ? 'currentColor' : 'none'} /><span aria-hidden="true">{post.like_count}</span>
        </button>
        <button type="button" className={pill} aria-label={`Comentários (${post.comment_count})`} aria-expanded={glass === 'comments'} onClick={() => toggle('comments')}>
          <MessageCircle size={17} /><span aria-hidden="true">{post.comment_count}</span>
        </button>
      </div>
      {glass === 'comments' && <PostComments post={post} viewerId={viewerId} onClose={() => setGlass(null)} onExpired={onExpired}
        onCountChange={delta => onUpdate(post.id, old => ({ ...old, comment_count: Math.max(0, old.comment_count + delta) }))} />}
      {glass === 'menu' && <PostActions post={post} onClose={() => setGlass(null)} onChange={updated => onUpdate(post.id, () => updated)} onRemoved={onRemoved} onExpired={onExpired}
        onReported={() => { setGlass(null); setFeedback({ kind: 'success', text: 'Denúncia enviada para análise.' }) }} />}
    </div>
    {feedback && <p className={cn(feedbackVariants({ tone: feedback.kind }), l.feedback)} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.text}</p>}
    {post.caption && <p className={cn('text-[12px] leading-[1.55] whitespace-pre-wrap wrap-anywhere', l.caption)}>{post.caption}</p>}
  </article>
}
