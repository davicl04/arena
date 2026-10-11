import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { ApiError } from '../api/client'
import { REPORT_DETAILS_MAX, REPORT_REASONS, sendReport } from '../api/social'
import type { ReportReason, ReportTarget } from '../api/social'
import { cx } from '../styles'
import { colors } from '../theme'
import { Button } from './ui'

const SENT: Record<ReportTarget, string> = {
  post: 'Denúncia enviada para análise.',
  comment: 'Denúncia do comentário enviada.',
  user: 'Denúncia da conta enviada.',
}

/** Formulário de denúncia (post, comentário ou conta) para uso dentro do vidro. */
export default function ReportForm({ target, targetId, title = 'Por que você quer denunciar?', onDone, onExpired }: {
  target: ReportTarget; targetId: number; title?: string; onDone: () => void; onExpired: () => void
}) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  async function submit() {
    if (!reason || busy) return
    setBusy(true); setError('')
    try { await sendReport({ target_type: target, target_id: targetId, reason, description: details }); setSent(true) }
    catch (err) { if (err instanceof ApiError && err.status === 401) onExpired(); setError(err instanceof Error ? err.message : 'Não foi possível enviar a denúncia.') }
    finally { setBusy(false) }
  }
  if (sent) return <View>
    <Text accessibilityLiveRegion="polite" className="mt-2 text-[15px] font-bold text-white">{SENT[target]}</Text>
    <Text className="mt-1.5 text-[13px] leading-[20px] text-glass-muted">A equipe de moderação fará a análise.</Text>
    <Button title="Concluir" onPress={onDone} />
  </View>
  return <View>
    <Text className="mb-1.5 text-[15px] font-bold text-white">{title}</Text>
    <View accessibilityRole="radiogroup" accessibilityLabel="Motivo da denúncia">
      {REPORT_REASONS.map(option => {
        const checked = reason === option.value
        return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked, disabled: busy }} accessibilityLabel={option.label} accessibilityHint={option.description} disabled={busy} onPress={() => setReason(option.value)}
          className="min-h-12 flex-row items-center gap-2.5 border-b border-glass-line py-1.5">
          <View className={cx('size-5 items-center justify-center rounded-[10px] border-2', checked ? 'border-glass-accent' : 'border-glass-muted')}>
            {checked ? <View className="size-2.5 rounded-[5px] bg-glass-accent" /> : null}
          </View>
          <View className="grow basis-0">
            <Text className="font-semibold text-white">{option.label}</Text>
            <Text className="text-[12px] text-glass-muted">{option.description}</Text>
          </View>
        </Pressable>
      })}
    </View>
    <TextInput accessibilityLabel="Detalhes (opcional)" placeholder="Detalhes (opcional)" placeholderTextColor={colors['glass-muted']} value={details} onChangeText={setDetails} editable={!busy}
      maxLength={REPORT_DETAILS_MAX} multiline className="mt-2.5 min-h-[72px] rounded-control border border-glass-line p-2.5 text-white align-top" />
    {error ? <Text accessibilityRole="alert" className="mt-2 text-glass-danger">{error}</Text> : null}
    <Button title={busy ? 'Enviando…' : 'Enviar denúncia'} disabled={!reason || busy} onPress={() => void submit()} />
  </View>
}
