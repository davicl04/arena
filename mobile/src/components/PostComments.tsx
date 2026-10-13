import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { ApiError } from '../api/client'
import type { Post, SocialComment } from '../api/client'
import { COMMENT_MAX, createComment, deleteComment } from '../api/social'
import { usePagedList } from '../hooks/usePagedList'
import { cx } from '../styles'
import { colors } from '../theme'
import GlassOverlay from './GlassOverlay'
import ReportForm from './ReportForm'
import { Avatar } from './media'

const link = 'font-semibold text-glass-accent'

/**
 * Comentários (C4) em vidro sobre a foto. A lista é paginada por cursor e manipulada localmente;
 * cada inclusão ou exclusão ajusta o `comment_count` do post pelo `onCountChange`.
 */
export default function PostComments({ post, viewerId, token, onClose, onCountChange, onExpired }: {
  post: Post; viewerId: number; token: string | null; onClose: () => void; onCountChange: (delta: number) => void; onExpired: () => void
}) {
  const list = usePagedList<SocialComment>(`/posts/${post.id}/comments`, onExpired)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [removing, setRemoving] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [reporting, setReporting] = useState<SocialComment | null>(null)
  function fail(err: unknown, fallback: string) { if (err instanceof ApiError && err.status === 401) onExpired(); setError(err instanceof Error ? err.message : fallback) }
  async function send() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true); setError('')
    // A lista vem da mais recente para a mais antiga: o comentário novo entra no topo.
    try { const added = await createComment(post.id, body); list.setItems(old => [added, ...old]); setDraft(''); onCountChange(1) }
    catch (err) { fail(err, 'Não foi possível comentar.') }
    finally { setSending(false) }
  }
  async function remove(comment: SocialComment) {
    if (removing) return
    setRemoving(comment.id); setError('')
    try { await deleteComment(comment.id); list.setItems(old => old.filter(item => item.id !== comment.id)); onCountChange(-1) }
    catch (err) { fail(err, 'Não foi possível excluir o comentário.') }
    finally { setRemoving(null) }
  }
  if (reporting) return <GlassOverlay title="Denunciar comentário" onClose={onClose} onBack={() => setReporting(null)} backLabel="Voltar aos comentários">
    <Text className="mb-2 text-glass-muted"><Text className="font-bold text-white">{reporting.author_name} </Text>{reporting.body}</Text>
    <ReportForm target="comment" targetId={reporting.id} onDone={() => setReporting(null)} onExpired={onExpired} />
  </GlassOverlay>
  const canSend = Boolean(draft.trim()) && !sending
  const composer = <View className="flex-row items-center gap-2 pt-2">
    <TextInput accessibilityLabel="Escreva um comentário" placeholder="Adicione um comentário…" placeholderTextColor={colors['glass-muted']} value={draft} onChangeText={setDraft} maxLength={COMMENT_MAX} editable={!sending}
      className="min-h-11 grow basis-0 rounded-[22px] border border-glass-line bg-glass-field px-3.5 text-white" />
    <Pressable accessibilityRole="button" accessibilityLabel="Enviar comentário" accessibilityState={{ disabled: !canSend, busy: sending }} disabled={!canSend} onPress={() => void send()}
      className={cx('size-11 items-center justify-center rounded-[22px] bg-glass-accent', !canSend && 'opacity-45')}>
      <Text className="text-[18px] text-glass-ink">➤</Text>
    </Pressable>
  </View>
  return <GlassOverlay title={`Comentários (${post.comment_count})`} onClose={onClose} closeLabel="Fechar comentários" footer={composer}>
    {list.loading ? <ActivityIndicator accessibilityLabel="Carregando comentários" color={colors['glass-accent']} /> : null}
    {list.error ? <View>
      <Text accessibilityRole="alert" className="text-glass-danger">{list.error.message}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Tentar carregar os comentários novamente" onPress={list.reload} className="min-h-11 justify-center"><Text className={link}>Tentar novamente</Text></Pressable>
    </View> : null}
    {!list.loading && !list.error && !list.items.length ? <Text className="text-glass-muted">Nenhum comentário ainda. Escreva o primeiro.</Text> : null}
    {list.items.map(comment => <View key={comment.id} className="flex-row items-start gap-2 py-1.5">
      <Avatar path={comment.author_avatar_url} name={comment.author_name} token={token} size={28} />
      <View className="grow basis-0">
        <Text className="text-white"><Text className="font-bold">{comment.author_name} </Text>{comment.body}</Text>
        <Text className="mt-0.5 text-[11px] text-glass-muted">{new Date(comment.created_at).toLocaleDateString('pt-BR')}</Text>
      </View>
      {comment.author_id !== viewerId ? <Pressable accessibilityRole="button" accessibilityLabel={`Denunciar comentário de ${comment.author_name}`} onPress={() => { setError(''); setReporting(comment) }} className="min-h-9 min-w-9 items-center justify-center"><Text className="text-glass-muted">⚑</Text></Pressable> : null}
      {comment.can_delete ? <Pressable accessibilityRole="button" accessibilityLabel={`Excluir comentário de ${comment.author_name}`} accessibilityState={{ disabled: removing !== null }} disabled={removing !== null} onPress={() => void remove(comment)} className="min-h-9 min-w-9 items-center justify-center"><Text className="text-glass-muted">✕</Text></Pressable> : null}
    </View>)}
    {list.moreError ? <Text accessibilityRole="alert" className="text-glass-danger">{list.moreError}</Text> : null}
    {list.hasMore ? <Pressable accessibilityRole="button" accessibilityLabel="Carregar mais comentários" accessibilityState={{ disabled: list.busy }} disabled={list.busy} onPress={() => void list.loadMore()} className="min-h-11 justify-center">
      <Text className={link}>{list.busy ? 'Carregando…' : 'Carregar mais comentários'}</Text>
    </Pressable> : null}
    {error ? <Text accessibilityRole="alert" className="mt-1.5 text-glass-danger">{error}</Text> : null}
  </GlassOverlay>
}
