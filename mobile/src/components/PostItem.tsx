import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { Post } from '../api/client'
import { setLike } from '../api/social'
import { reportActionError } from '../hooks/useSubmit'
import PostActions from './PostActions'
import PostComments from './PostComments'
import PostImage from './PostImage'
import { Avatar } from './media'
import { colors } from '../theme'
import { Icon } from './Icon'

export type PostUpdate = (id: number, update: (post: Post) => Post) => void

/** Data curta em pt-BR ("10 de out."); o ano só aparece quando não é o atual. */
export function postDate(value: string, now = new Date()) {
  const date = new Date(value)
  return date.toLocaleDateString('pt-BR', date.getFullYear() === now.getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
}

// Vidro escuro da etiqueta do autor e do botão •••.
const glassTag = 'flex-row items-center gap-1.5 rounded-full border border-forest-line bg-glass-tag py-1 pr-2.5 pl-1'
const pill = 'min-h-10 flex-row items-center gap-1.5 rounded-[20px] bg-glass-pill px-3.5'

/**
 * Post de ponta a ponta: foto 1:1 com a etiqueta do autor (A5) e o ••• sobrepostos, pílulas de curtir e comentar
 * e, abaixo, a data seguida da legenda. Usado no feed da Comunidade e no visualizador "Publicações" do perfil.
 * Só um vidro fica aberto por vez (comentários ou menu •••).
 */
export default function PostItem({ post, viewerId, token, onUpdate, onRemove, onOpenProfile, onExpired }: {
  post: Post; viewerId: number; token: string | null; onUpdate: PostUpdate; onRemove: (id: number) => void
  onOpenProfile?: (userId: number) => void; onExpired: () => void
}) {
  const [panel, setPanel] = useState<'comments' | 'actions' | null>(null)
  const [liking, setLiking] = useState(false)
  async function toggleLike() {
    if (liking) return
    const liked = !post.liked_by_me
    setLiking(true)
    try {
      await setLike(post.id, liked)
      onUpdate(post.id, item => item.liked_by_me === liked ? item : { ...item, liked_by_me: liked, like_count: Math.max(0, item.like_count + (liked ? 1 : -1)) })
    } catch (err) { reportActionError(err, 'Não foi possível curtir.', onExpired) }
    finally { setLiking(false) }
  }
  const author = post.author
  const tag = <View className={glassTag}>
    <Avatar path={author.avatar_url} name={author.name} token={token} size={24} />
    <Text numberOfLines={1} className="shrink text-[12px] font-bold text-white"><Text className="text-glass-accent">@</Text>{author.username}</Text>
  </View>
  return <View className="mb-1.5 bg-surface">
    <View className="aspect-square w-full overflow-hidden">
      <PostImage path={post.image_url} token={token} label={post.caption || `Publicação de @${author.username}`} className="h-full w-full" />
      <View className="absolute top-0 right-0 left-0 flex-row items-start justify-between gap-2 p-1.5">
        {onOpenProfile
          ? <Pressable accessibilityRole="button" accessibilityLabel={`Abrir perfil de @${author.username}`} onPress={() => onOpenProfile(author.id)} className="min-h-11 shrink justify-center">{tag}</Pressable>
          : <View accessible accessibilityLabel={`@${author.username}`} className="min-h-11 shrink justify-center">{tag}</View>}
        <Pressable accessibilityRole="button" accessibilityLabel="Ações da publicação" accessibilityState={{ expanded: panel === 'actions' }} onPress={() => setPanel(panel === 'actions' ? null : 'actions')}
          className="min-h-11 min-w-11 items-center justify-center">
          <View className="h-8 w-8 items-center justify-center rounded-full border border-forest-line bg-glass-tag">
            <Icon name="ellipsis" size={18} color="#ffffff" />
          </View>
        </Pressable>
      </View>
      <View className="absolute bottom-2.5 left-2.5 flex-row gap-2">
        <Pressable accessibilityRole="togglebutton" accessibilityLabel={`Curtir, ${post.like_count} ${post.like_count === 1 ? 'curtida' : 'curtidas'}`} accessibilityState={{ checked: post.liked_by_me, disabled: liking }} disabled={liking} onPress={() => void toggleLike()} className={pill}>
          <Icon name="heart" size={17} filled={post.liked_by_me} color={post.liked_by_me ? colors.like : '#ffffff'} />
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
    <Text className="px-3.5 py-3 text-[14px] leading-[21px] text-ink">
      <Text className="text-ink-muted">{postDate(post.created_at)}</Text>{post.caption ? `  ${post.caption}` : null}
    </Text>
  </View>
}
