import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { ApiError } from '../api/client'
import type { Post } from '../api/client'
import { setLike } from '../api/social'
import PostActions from './PostActions'
import PostComments from './PostComments'
import PostImage from './PostImage'
import { Avatar } from './media'
import { cx } from '../styles'
import { colors } from '../theme'

export type PostUpdate = (id: number, update: (post: Post) => Post) => void

export const postDate = (value: string) => new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })

// Sombra do texto sobre a foto em `style`: a classe text-shadow-* fixaria textShadowOffset em 0, que hoje não é definido.
const textShadow = { textShadowColor: colors['text-shadow'], textShadowRadius: 4 }
const pill = 'min-h-10 flex-row items-center gap-1.5 rounded-[20px] bg-glass-pill px-3.5'

/**
 * Post A3: foto 4:5 com autor e data sobrepostos, pílulas de curtir e comentar e legenda abaixo.
 * Só um vidro fica aberto por vez (comentários ou menu •••).
 */
export default function PostItem({ post, viewerId, token, onUpdate, onRemove, onOpenProfile, onExpired }: {
  post: Post; viewerId: number; token: string | null; onUpdate: PostUpdate; onRemove: (id: number) => void
  onOpenProfile?: (userId: number) => void; onExpired: () => void
}) {
  const [panel, setPanel] = useState<'comments' | 'actions' | null>(null)
  const [liking, setLiking] = useState(false)
  const [error, setError] = useState('')
  async function toggleLike() {
    if (liking) return
    const liked = !post.liked_by_me
    setLiking(true); setError('')
    try {
      await setLike(post.id, liked)
      onUpdate(post.id, item => item.liked_by_me === liked ? item : { ...item, liked_by_me: liked, like_count: Math.max(0, item.like_count + (liked ? 1 : -1)) })
    } catch (err) { if (err instanceof ApiError && err.status === 401) onExpired(); setError(err instanceof Error ? err.message : 'Não foi possível curtir.') }
    finally { setLiking(false) }
  }
  const author = post.author
  const name = <>
    <Text numberOfLines={1} className="font-bold text-white" style={textShadow}>{author.name}</Text>
    <Text numberOfLines={1} className="text-[12px] text-white" style={textShadow}>{postDate(post.created_at)}</Text>
  </>
  return <View className="mb-4.5 overflow-hidden rounded-card bg-white">
    <View className="aspect-[4/5] w-full">
      <PostImage path={post.image_url} token={token} label={post.caption || `Publicação de ${author.name}`} className="h-full w-full" />
      <View className="absolute top-0 right-0 left-0 flex-row items-center gap-2 p-2.5">
        <Avatar path={author.avatar_url} name={author.name} token={token} size={34} />
        {onOpenProfile
          ? <Pressable accessibilityRole="button" accessibilityLabel={`Abrir perfil de ${author.name}`} onPress={() => onOpenProfile(author.id)} className="min-h-11 grow basis-0 justify-center">{name}</Pressable>
          : <View className="grow basis-0">{name}</View>}
        <Pressable accessibilityRole="button" accessibilityLabel="Ações da publicação" accessibilityState={{ expanded: panel === 'actions' }} onPress={() => setPanel(panel === 'actions' ? null : 'actions')}
          className="min-h-11 min-w-11 items-center justify-center rounded-[22px] bg-glass-button">
          <Text className="text-[16px] font-extrabold text-white">•••</Text>
        </Pressable>
      </View>
      <View className="absolute bottom-2.5 left-2.5 flex-row gap-2">
        <Pressable accessibilityRole="togglebutton" accessibilityLabel={`Curtir, ${post.like_count} ${post.like_count === 1 ? 'curtida' : 'curtidas'}`} accessibilityState={{ checked: post.liked_by_me, disabled: liking }} disabled={liking} onPress={() => void toggleLike()} className={pill}>
          <Text className={cx('text-[16px]', post.liked_by_me ? 'text-like' : 'text-white')}>{post.liked_by_me ? '♥' : '♡'}</Text>
          <Text className="font-bold text-white">{post.like_count}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Comentários, ${post.comment_count}`} accessibilityState={{ expanded: panel === 'comments' }} onPress={() => setPanel(panel === 'comments' ? null : 'comments')} className={pill}>
          <Text className="text-[13px] text-white">Comentários</Text>
          <Text className="font-bold text-white">{post.comment_count}</Text>
        </Pressable>
      </View>
      {panel === 'comments' ? <PostComments post={post} viewerId={viewerId} token={token} onClose={() => setPanel(null)} onExpired={onExpired}
        onCountChange={delta => onUpdate(post.id, item => ({ ...item, comment_count: Math.max(0, item.comment_count + delta) }))} /> : null}
      {panel === 'actions' ? <PostActions post={post} onClose={() => setPanel(null)} onExpired={onExpired}
        onUpdated={updated => onUpdate(post.id, () => updated)} onDeleted={onRemove} /> : null}
    </View>
    {error ? <Text accessibilityRole="alert" className="px-3.5 pt-2.5 text-error">{error}</Text> : null}
    {post.caption ? <Text className="p-3.5 text-[14px] leading-[21px] text-ink">{post.caption}</Text> : <View className="h-1.5" />}
  </View>
}
