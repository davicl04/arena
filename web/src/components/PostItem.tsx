import { useState } from 'react'
import { Ellipsis, Heart, MessageCircle } from 'lucide-react'
import { apiUrl } from '../api/client'
import type { Post } from '../api/client'
import { setLike } from '../api/social'
import { reportActionError } from '../hooks/useSubmit'
import PostActions from './PostActions'
import PostComments from './PostComments'
import { SocialPhoto } from './SocialPhoto'
import { IconButton } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

/** Data curta da legenda ("10 de out."); posts de outros anos mostram o ano. */
function day(value: string) {
  const date = new Date(value)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

/* Pílulas de curtir/comentar sobre a foto; curtida marcada (aria-pressed) fica branca com coração vermelho. */
const pill = 'inline-flex min-h-9 items-center gap-1.5 rounded-[18px] border-0 bg-[#0b2218a6] px-[13px] py-0 text-[11px] font-bold text-white tabular-nums backdrop-blur-[10px] aria-pressed:bg-white aria-pressed:text-danger'
/* Etiqueta do autor (A5): vidro escuro com foto sem contorno e @usuário; o tom escuro garante leitura em foto clara. */
const authorChip = 'flex min-w-0 items-center gap-2 rounded-full border border-solid border-[#ffffff2e] bg-[#0c161199] py-[3px] pr-[11px] pl-[3px] text-left text-white backdrop-blur-[14px] backdrop-saturate-[1.7]'

/**
 * Publicação de ponta a ponta (Comunidade e visualizador "Publicações"): foto 1:1 com a etiqueta do autor e o •••
 * em vidro, pílulas de curtir/comentar e, abaixo, data e legenda. Comentários (C4) e menu ••• (M3) abrem em vidro
 * sobre a foto, um de cada vez.
 */
export type PostUpdate = (postId: number, update: (post: Post) => Post) => void

export default function PostItem({ post, viewerId, onUpdate, onRemoved, onOpenProfile, onExpired }: {
  post: Post
  viewerId: number
  /** Recebe uma função de atualização para não sobrescrever mudanças concorrentes (curtida × comentário). */
  onUpdate: PostUpdate
  onRemoved: (postId: number) => void
  onOpenProfile?: (userId: number) => void
  onExpired: () => void
}) {
  const [glass, setGlass] = useState<'menu' | 'comments' | null>(null)
  const [liking, setLiking] = useState(false)
  const { name, username } = post.author
  const toggle = (next: 'menu' | 'comments') => setGlass(old => old === next ? null : next)

  async function like() {
    if (liking) return
    setLiking(true)
    const liked = !post.liked_by_me
    try {
      await setLike(post.id, liked)
      onUpdate(post.id, old => ({ ...old, liked_by_me: liked, like_count: Math.max(0, old.like_count + (liked ? 1 : -1)) }))
    } catch (cause) {
      reportActionError(cause, 'Não foi possível atualizar a curtida.', onExpired)
    } finally { setLiking(false) }
  }

  const author = <><SocialPhoto path={post.author.avatar_url} name={name} size="chip" />
    <span className="truncate text-[12px] font-bold"><span className="text-mint">@</span>{username}</span></>
  return <article className="min-w-0 [&+&]:mt-1.5" data-post-id={post.id} aria-label={`Publicação de @${username}`}>
    <div className="relative overflow-hidden bg-tile">
      <img className="block aspect-square w-full object-cover" src={apiUrl(post.image_url)} alt={post.caption || `Publicação de @${username}`} />
      {/* Com um vidro aberto, autor e pílulas ficam ocultos (continuam no DOM, como antes). */}
      <div className={cn('absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-2.5', glass && 'invisible')}>
        {onOpenProfile
          ? <button type="button" className={authorChip} aria-label={`Abrir perfil de @${username}`} onClick={() => onOpenProfile(post.author.id)}>{author}</button>
          : <span className={authorChip}>{author}</span>}
        <IconButton type="button" tone="media" aria-label="Ações da publicação" aria-haspopup="dialog" aria-expanded={glass === 'menu'}
          onClick={() => toggle('menu')}><Ellipsis size={20} /></IconButton>
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
        onReported={() => { setGlass(null); toast.success('Denúncia enviada para análise.') }} />}
    </div>
    <p className="px-4 pt-2.5 pb-3 text-[12px] leading-[1.55] whitespace-pre-wrap wrap-anywhere">
      <time className="mr-1.5 text-[10.5px] text-ink-muted" dateTime={post.created_at}>{day(post.created_at)}</time>{post.caption}
    </p>
  </article>
}
