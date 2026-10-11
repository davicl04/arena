import { useState } from 'react'
import { Ellipsis, Heart, MessageCircle } from 'lucide-react'
import { ApiError, apiUrl } from '../api/client'
import type { Post } from '../api/client'
import { setLike } from '../api/social'
import PostActions from './PostActions'
import PostComments from './PostComments'
import { SocialPhoto } from './SocialPhoto'

const day = (value: string) => new Date(value).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * Publicação A3: foto 4:5 com autor e data sobrepostos, pílulas de curtir/comentar e legenda abaixo.
 * Comentários (C4) e menu ••• (M3) abrem em vidro sobre a foto, um de cada vez.
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

  const author = <><SocialPhoto path={post.author.avatar_url} name={name} /><span><b>{name}</b><time dateTime={post.created_at}>{day(post.created_at)}</time></span></>
  return <article className="post-item" data-post-id={post.id} aria-label={`Publicação de ${name}`}>
    <div className={`post-media ${glass ? 'has-glass' : ''}`}>
      <img src={apiUrl(post.image_url)} alt={post.caption || `Publicação de ${name}`} />
      <div className="post-top">
        {onOpenProfile
          ? <button type="button" className="post-author" aria-label={`Abrir perfil de ${name}`} onClick={() => onOpenProfile(post.author.id)}>{author}</button>
          : <span className="post-author">{author}</span>}
        <button type="button" className="icon-btn" aria-label="Ações da publicação" aria-haspopup="dialog" aria-expanded={glass === 'menu'}
          onClick={() => toggle('menu')}><Ellipsis size={21} /></button>
      </div>
      <div className="post-pills">
        <button type="button" className="pill" aria-label={`Curtir (${post.like_count})`} aria-pressed={post.liked_by_me} disabled={liking} onClick={() => void like()}>
          <Heart size={17} fill={post.liked_by_me ? 'currentColor' : 'none'} /><span aria-hidden="true">{post.like_count}</span>
        </button>
        <button type="button" className="pill" aria-label={`Comentários (${post.comment_count})`} aria-expanded={glass === 'comments'} onClick={() => toggle('comments')}>
          <MessageCircle size={17} /><span aria-hidden="true">{post.comment_count}</span>
        </button>
      </div>
      {glass === 'comments' && <PostComments post={post} viewerId={viewerId} onClose={() => setGlass(null)} onExpired={onExpired}
        onCountChange={delta => onUpdate(post.id, old => ({ ...old, comment_count: Math.max(0, old.comment_count + delta) }))} />}
      {glass === 'menu' && <PostActions post={post} onClose={() => setGlass(null)} onChange={updated => onUpdate(post.id, () => updated)} onRemoved={onRemoved} onExpired={onExpired}
        onReported={() => { setGlass(null); setFeedback({ kind: 'success', text: 'Denúncia enviada para análise.' }) }} />}
    </div>
    {feedback && <p className={feedback.kind === 'error' ? 'post-feedback error' : 'post-feedback success'} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.text}</p>}
    {post.caption && <p className="post-caption">{post.caption}</p>}
  </article>
}
