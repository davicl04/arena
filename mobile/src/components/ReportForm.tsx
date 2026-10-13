import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { REPORT_DETAILS_MAX, REPORT_REASONS, sendReport } from '../api/social'
import type { ReportReason, ReportTarget } from '../api/social'
import { reportActionError } from '../hooks/useSubmit'
import { cx } from '../styles'
import { colors } from '../theme'
import { toast } from './toast/toastStore'
import { Button } from './ui'

const SENT: Record<ReportTarget, string> = {
  post: 'Denúncia enviada para análise.',
  comment: 'Denúncia do comentário enviada.',
  user: 'Denúncia da conta enviada.',
  match_message: 'Denúncia da mensagem enviada.',
}

/**
 * Formulário de denúncia (post, comentário, conta ou mensagem) para uso dentro do vidro. Ao enviar, avisa em toast de sucesso e
 * chama `onDone`; só a recusa de validação do servidor fica no formulário, e os outros erros viram toast ou aviso de conexão.
 */
export default function ReportForm({ target, targetId, title = 'Por que você quer denunciar?', onDone, onExpired }: {
  target: ReportTarget; targetId: number; title?: string; onDone: () => void; onExpired: () => void
}) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit() {
    if (!reason || busy) return
    setBusy(true); setError('')
    try {
      await sendReport({ target_type: target, target_id: targetId, reason, description: details })
      toast.success(SENT[target], { description: 'A equipe de moderação fará a análise.' })
      onDone()
    } catch (err) {
      const report = reportActionError(err, 'Não foi possível enviar a denúncia.', onExpired)
      if (report.kind === 'form') setError(report.message)
    } finally { setBusy(false) }
  }
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
