import { useState } from 'react'
import { Text, TextInput, View } from 'react-native'
import { ApiError } from '../api/client'
import type { Post } from '../api/client'
import { CAPTION_MAX, deletePost, updateCaption } from '../api/social'
import GlassOverlay, { GlassRow, glass } from './GlassOverlay'
import ReportForm from './ReportForm'
import { Button } from './ui'

type Step = 'menu' | 'edit' | 'delete' | 'report'

/** Menu ••• (M3) em vidro sobre a foto. Dono: editar legenda e excluir. Visitante: denunciar. */
export default function PostActions({ post, onClose, onUpdated, onDeleted, onExpired }: {
  post: Post; onClose: () => void; onUpdated: (post: Post) => void; onDeleted: (id: number) => void; onExpired: () => void
}) {
  const [step, setStep] = useState<Step>('menu')
  const [caption, setCaption] = useState(post.caption)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  function go(next: Step) { setError(''); setCaption(post.caption); setStep(next) }
  function fail(err: unknown, fallback: string) { if (err instanceof ApiError && err.status === 401) onExpired(); setError(err instanceof Error ? err.message : fallback) }
  async function save() {
    if (busy) return
    setBusy(true); setError('')
    try { onUpdated(await updateCaption(post.id, caption)); onClose() }
    catch (err) { fail(err, 'Não foi possível editar a legenda.') }
    finally { setBusy(false) }
  }
  async function remove() {
    if (busy) return
    setBusy(true); setError('')
    // Ao excluir, o post sai da lista e este vidro é desmontado junto com ele.
    try { await deletePost(post.id); onDeleted(post.id) }
    catch (err) { fail(err, 'Não foi possível excluir a publicação.'); setBusy(false) }
  }
  const back = step === 'menu' ? undefined : () => go('menu')
  const title = step === 'edit' ? 'Editar legenda' : step === 'delete' ? 'Excluir publicação' : step === 'report' ? 'Denunciar publicação' : 'Ações da publicação'
  const feedback = error ? <Text accessibilityRole="alert" style={{ color: glass.danger, marginTop: 8 }}>{error}</Text> : null
  return <GlassOverlay title={title} onClose={onClose} onBack={busy ? undefined : back}>
    {step === 'menu' ? post.can_edit ? <>
      <GlassRow label="Editar legenda" onPress={() => go('edit')} />
      <GlassRow danger label="Excluir publicação" onPress={() => go('delete')} />
    </> : <GlassRow danger label="Denunciar publicação" onPress={() => go('report')} /> : null}
    {step === 'edit' ? <View>
      <TextInput accessibilityLabel="Legenda" value={caption} onChangeText={setCaption} maxLength={CAPTION_MAX} multiline editable={!busy} autoFocus
        style={{ minHeight: 96, borderWidth: 1, borderColor: glass.line, borderRadius: 8, padding: 10, color: glass.text, textAlignVertical: 'top', backgroundColor: '#ffffff1a' }} />
      <Text accessibilityLabel={`${caption.length} de ${CAPTION_MAX} caracteres`} style={{ color: glass.muted, fontSize: 12, textAlign: 'right', marginTop: 4 }}>{caption.length}/{CAPTION_MAX}</Text>
      {feedback}
      <Button title={busy ? 'Salvando…' : 'Salvar'} disabled={busy || caption === post.caption} onPress={() => void save()} />
      <Button secondary title="Cancelar" disabled={busy} onPress={() => go('menu')} />
    </View> : null}
    {step === 'delete' ? <View>
      <Text style={{ color: glass.text, fontSize: 15, fontWeight: '700' }}>Excluir publicação?</Text>
      <Text style={{ color: glass.muted, lineHeight: 20, marginTop: 6 }}>A foto, as curtidas e os comentários saem do perfil. Não dá para desfazer.</Text>
      {feedback}
      <Button title={busy ? 'Excluindo…' : 'Excluir'} disabled={busy} onPress={() => void remove()} />
      <Button secondary title="Cancelar" disabled={busy} onPress={() => go('menu')} />
    </View> : null}
    {step === 'report' ? <ReportForm target="post" targetId={post.id} onDone={onClose} onExpired={onExpired} /> : null}
  </GlassOverlay>
}
