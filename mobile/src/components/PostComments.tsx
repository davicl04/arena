import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { ApiError } from '../api/client'
import type { Post, SocialComment } from '../api/client'
import { COMMENT_MAX, createComment, deleteComment } from '../api/social'
import { usePagedList } from '../hooks/usePagedList'
import GlassOverlay, { glass } from './GlassOverlay'
import ReportForm from './ReportForm'
import { Avatar } from './media'

const linkStyle = { color: glass.accent, fontWeight: '600' as const }

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
    <Text style={{ color: glass.muted, marginBottom: 8 }}><Text style={{ color: glass.text, fontWeight: '700' }}>{reporting.author_name} </Text>{reporting.body}</Text>
    <ReportForm target="comment" targetId={reporting.id} onDone={() => setReporting(null)} onExpired={onExpired} />
  </GlassOverlay>
  const canSend = Boolean(draft.trim()) && !sending
  const composer = <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 }}>
    <TextInput accessibilityLabel="Escreva um comentário" placeholder="Adicione um comentário…" placeholderTextColor={glass.muted} value={draft} onChangeText={setDraft} maxLength={COMMENT_MAX} editable={!sending}
      style={{ flex: 1, minHeight: 44, borderWidth: 1, borderColor: glass.line, borderRadius: 22, paddingHorizontal: 14, color: glass.text, backgroundColor: '#ffffff1a' }} />
    <Pressable accessibilityRole="button" accessibilityLabel="Enviar comentário" accessibilityState={{ disabled: !canSend, busy: sending }} disabled={!canSend} onPress={() => void send()}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: glass.accent, opacity: canSend ? 1 : 0.45 }}>
      <Text style={{ color: '#08140e', fontSize: 18 }}>➤</Text>
    </Pressable>
  </View>
  return <GlassOverlay title={`Comentários (${post.comment_count})`} onClose={onClose} closeLabel="Fechar comentários" footer={composer}>
    {list.loading ? <ActivityIndicator accessibilityLabel="Carregando comentários" color={glass.accent} /> : null}
    {list.error ? <View>
      <Text accessibilityRole="alert" style={{ color: glass.danger }}>{list.error.message}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Tentar carregar os comentários novamente" onPress={list.reload} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={linkStyle}>Tentar novamente</Text></Pressable>
    </View> : null}
    {!list.loading && !list.error && !list.items.length ? <Text style={{ color: glass.muted }}>Nenhum comentário ainda. Escreva o primeiro.</Text> : null}
    {list.items.map(comment => <View key={comment.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6 }}>
      <Avatar path={comment.author_avatar_url} name={comment.author_name} token={token} size={28} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: glass.text }}><Text style={{ fontWeight: '700' }}>{comment.author_name} </Text>{comment.body}</Text>
        <Text style={{ color: glass.muted, fontSize: 11, marginTop: 2 }}>{new Date(comment.created_at).toLocaleDateString('pt-BR')}</Text>
      </View>
      {comment.author_id !== viewerId ? <Pressable accessibilityRole="button" accessibilityLabel={`Denunciar comentário de ${comment.author_name}`} onPress={() => { setError(''); setReporting(comment) }} style={{ minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: glass.muted }}>⚑</Text></Pressable> : null}
      {comment.can_delete ? <Pressable accessibilityRole="button" accessibilityLabel={`Excluir comentário de ${comment.author_name}`} accessibilityState={{ disabled: removing !== null }} disabled={removing !== null} onPress={() => void remove(comment)} style={{ minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: glass.muted }}>✕</Text></Pressable> : null}
    </View>)}
    {list.moreError ? <Text accessibilityRole="alert" style={{ color: glass.danger }}>{list.moreError}</Text> : null}
    {list.hasMore ? <Pressable accessibilityRole="button" accessibilityLabel="Carregar mais comentários" accessibilityState={{ disabled: list.busy }} disabled={list.busy} onPress={() => void list.loadMore()} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={linkStyle}>{list.busy ? 'Carregando…' : 'Carregar mais comentários'}</Text>
    </Pressable> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: glass.danger, marginTop: 6 }}>{error}</Text> : null}
  </GlassOverlay>
}
