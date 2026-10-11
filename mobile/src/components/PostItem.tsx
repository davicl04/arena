import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { ApiError } from '../api/client'
import type { Post } from '../api/client'
import { setLike } from '../api/social'
import PostActions from './PostActions'
import PostComments from './PostComments'
import PostImage from './PostImage'
import { Avatar } from './media'

export type PostUpdate = (id: number, update: (post: Post) => Post) => void

export const postDate = (value: string) => new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })

const overlayText = { color: '#ffffff', textShadowColor: '#0009', textShadowRadius: 4 }
const pill = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: 'rgba(8,20,14,0.6)' }

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
    <Text numberOfLines={1} style={[overlayText, { fontWeight: '700' }]}>{author.name}</Text>
    <Text numberOfLines={1} style={[overlayText, { fontSize: 12 }]}>{postDate(post.created_at)}</Text>
  </>
  return <View style={{ backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 18 }}>
    <View style={{ width: '100%', aspectRatio: 4 / 5 }}>
      <PostImage path={post.image_url} token={token} label={post.caption || `Publicação de ${author.name}`} style={{ width: '100%', height: '100%' }} />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 }}>
        <Avatar path={author.avatar_url} name={author.name} token={token} size={34} />
        {onOpenProfile
          ? <Pressable accessibilityRole="button" accessibilityLabel={`Abrir perfil de ${author.name}`} onPress={() => onOpenProfile(author.id)} style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>{name}</Pressable>
          : <View style={{ flex: 1 }}>{name}</View>}
        <Pressable accessibilityRole="button" accessibilityLabel="Ações da publicação" accessibilityState={{ expanded: panel === 'actions' }} onPress={() => setPanel(panel === 'actions' ? null : 'actions')}
          style={{ minHeight: 44, minWidth: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,20,14,0.45)' }}>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>•••</Text>
        </Pressable>
      </View>
      <View style={{ position: 'absolute', left: 10, bottom: 10, flexDirection: 'row', gap: 8 }}>
        <Pressable accessibilityRole="togglebutton" accessibilityLabel={`Curtir, ${post.like_count} ${post.like_count === 1 ? 'curtida' : 'curtidas'}`} accessibilityState={{ checked: post.liked_by_me, disabled: liking }} disabled={liking} onPress={() => void toggleLike()} style={pill}>
          <Text style={{ color: post.liked_by_me ? '#ff8a80' : '#fff', fontSize: 16 }}>{post.liked_by_me ? '♥' : '♡'}</Text>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{post.like_count}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Comentários, ${post.comment_count}`} accessibilityState={{ expanded: panel === 'comments' }} onPress={() => setPanel(panel === 'comments' ? null : 'comments')} style={pill}>
          <Text style={{ color: '#fff', fontSize: 13 }}>Comentários</Text>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{post.comment_count}</Text>
        </Pressable>
      </View>
      {panel === 'comments' ? <PostComments post={post} viewerId={viewerId} token={token} onClose={() => setPanel(null)} onExpired={onExpired}
        onCountChange={delta => onUpdate(post.id, item => ({ ...item, comment_count: Math.max(0, item.comment_count + delta) }))} /> : null}
      {panel === 'actions' ? <PostActions post={post} onClose={() => setPanel(null)} onExpired={onExpired}
        onUpdated={updated => onUpdate(post.id, () => updated)} onDeleted={onRemove} /> : null}
    </View>
    {error ? <Text accessibilityRole="alert" style={{ color: '#94351e', paddingHorizontal: 14, paddingTop: 10 }}>{error}</Text> : null}
    {post.caption ? <Text style={{ color: '#343d39', fontSize: 14, lineHeight: 21, padding: 14 }}>{post.caption}</Text> : <View style={{ height: 6 }} />}
  </View>
}
