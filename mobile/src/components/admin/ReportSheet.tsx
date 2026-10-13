import { useState } from 'react'
import { Image, Pressable, Text, View } from 'react-native'
import {
  JUSTIFICATION_LIMITS, decideReport, justificationError, moderationActions, previewContext, previewText, reactivateAccount, reportReasonLabel, reportTargetLabel,
} from '../../api/moderation'
import type { AdminReport, ModerationAction } from '../../api/moderation'
import { useSubmit } from '../../hooks/useSubmit'
import { useThemeColors } from '../../hooks/useTheme'
import { formatDeadline } from '../../utils/format'
import { authSource } from '../media'
import { ActionButton, BusyStatus, ErrorText, Hint } from '../arena/controls'
import { ActionRow, Eyebrow, LongField } from '../review/ui'
import Sheet from '../Sheet'

const messageRemoved = 'Mensagem removida: o texto some para todos na partida e o registro fica guardado.'
const doneMessages: Record<ModerationAction, string> = {
  dismiss: 'Denúncia dispensada.',
  remove: 'Conteúdo removido e denúncia resolvida.',
  suspend: 'Conta responsável suspensa e denúncia resolvida.',
  reactivate: 'Conta reativada e denúncia resolvida.',
}

/**
 * Prévia do alvo: quem é, o texto (legenda, comentário ou mensagem) e, na publicação ainda pendente, a imagem lida pela
 * rota da administração (`image_url`) com o Bearer da sessão; depois da decisão a rota não serve mais a imagem.
 */
function Preview({ report, token }: { report: AdminReport; token: string | null }) {
  const colors = useThemeColors()
  const [failed, setFailed] = useState(false)
  const preview = report.target_preview
  if (!preview) return <Hint>Prévia indisponível.</Hint>
  const who = preview.author || preview.name || 'Conteúdo denunciado'
  const text = previewText(preview)
  const context = previewContext(preview)
  const image = report.status === 'pending' ? preview.image_url : null
  const source = image && token ? authSource(image, token) : null
  return <View testID="report-preview" accessible accessibilityLabel={`${context ? `${context}. ` : ''}Conteúdo denunciado de ${who}${text ? `: ${text}` : ''}`} style={{ borderRadius: 12, backgroundColor: colors.subtle, padding: 12 }}>
    {context ? <Text style={{ marginBottom: 4, color: colors['ink-muted'], fontSize: 10.5 }}>{context}</Text> : null}
    <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }}>{who}</Text>
    {text ? <Text selectable style={{ marginTop: 4, color: preview.removed ? colors['ink-muted'] : colors.ink, fontSize: 12.5, lineHeight: 19, fontStyle: preview.removed ? 'italic' : 'normal' }}>{text}</Text> : null}
    {source && !failed
      ? <Image accessibilityLabel="Imagem da publicação denunciada" source={source} resizeMode="cover" onError={() => setFailed(true)}
        style={{ marginTop: 8, width: 220, maxWidth: '100%', aspectRatio: 1, borderRadius: 8, backgroundColor: colors.line }} />
      : image ? <Text accessibilityRole="alert" style={{ marginTop: 8, color: colors['ink-muted'], fontSize: 11.5 }}>Imagem indisponível.</Text> : null}
  </View>
}

/** Opções da decisão como grupo de rádio: rótulo e explicação, com 44 pt ou mais de altura. */
function ActionChoices({ report, value, onChange, disabled }: { report: AdminReport; value: ModerationAction; onChange: (action: ModerationAction) => void; disabled: boolean }) {
  const colors = useThemeColors()
  return <View accessibilityRole="radiogroup" accessibilityLabel="Decisão">
    {moderationActions(report.target_type).map(option => {
      const checked = option.value === value
      return <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityHint={option.description} accessibilityState={{ checked, disabled }}
        disabled={disabled} onPress={() => onChange(option.value)}
        style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: colors['brand-soft'], paddingVertical: 6 }}>
        <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 2, borderColor: checked ? colors.brand : colors['line-strong'] }}>
          {checked ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand }} /> : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.ink, fontSize: 13.5, fontWeight: '700' }}>{option.label}</Text>
          <Text style={{ color: colors['ink-muted'], fontSize: 11.5 }}>{option.description}</Text>
        </View>
      </Pressable>
    })}
  </View>
}

/**
 * Folha da denúncia: a prévia do alvo, os detalhes de quem denunciou e, nas pendentes, a decisão (dispensar, remover,
 * suspender ou reativar) com justificativa obrigatória; nas resolvidas, a reativação da conta suspensa. As ações valem
 * para publicação, comentário, conta e mensagem do chat da partida (`match_message`, que a API devolve com o texto só
 * enquanto a denúncia está pendente).
 */
export function ReportSheet({ report, token, onClose, onDecided, onReactivated, onExpired }: {
  report: AdminReport
  token: string | null
  onClose: () => void
  onDecided: (report: AdminReport, message: string) => void
  onReactivated: (report: AdminReport) => void
  onExpired: () => void
}) {
  const colors = useThemeColors()
  const pending = report.status === 'pending'
  // O padrão é dispensar, a única decisão que não muda nada: remover ou suspender é uma escolha explícita.
  const [action, setAction] = useState<ModerationAction>('dismiss')
  const [justification, setJustification] = useState('')
  const [attempted, setAttempted] = useState(false)
  const { busy, error, run } = useSubmit(onExpired)
  const problem = attempted ? justificationError(justification) : null
  const suspended = !pending && report.target_user_id !== null && report.target_user_active === false

  async function decide() {
    setAttempted(true)
    if (justificationError(justification)) return
    const done = await run(() => decideReport(report.id, action, justification), 'Não foi possível registrar a decisão.')
    if (done) onDecided(report, action === 'remove' && report.target_type === 'match_message' ? messageRemoved : doneMessages[action])
  }
  async function reactivate() {
    setAttempted(true)
    if (justificationError(justification) || report.target_user_id === null) return
    const userId = report.target_user_id
    const done = await run(() => reactivateAccount(userId, justification), 'Não foi possível reativar a conta.')
    if (done) onReactivated(report)
  }

  return <Sheet title={`${reportTargetLabel(report.target_type)} · #${report.target_id}`} onClose={onClose}>
    <Text style={{ color: colors['ink-muted'], fontSize: 12, marginBottom: 8 }}>{reportReasonLabel(report.reason)} · {formatDeadline(report.created_at)}</Text>
    {report.description ? <>
      <Eyebrow>Detalhes de quem denunciou</Eyebrow>
      <Text selectable style={{ color: colors.ink, fontSize: 12.5, lineHeight: 19 }}>{report.description}</Text>
    </> : null}
    <Eyebrow>Conteúdo denunciado</Eyebrow>
    <Preview report={report} token={token} />

    {pending ? <>
      <Eyebrow>Decisão</Eyebrow>
      <ActionChoices report={report} value={action} onChange={setAction} disabled={busy} />
      <LongField label="Justificativa obrigatória" value={justification} onChangeText={setJustification} max={JUSTIFICATION_LIMITS.max} disabled={busy} invalid={Boolean(problem)} />
      {problem ? <ErrorText>{problem}</ErrorText> : null}
      <ActionRow><ActionButton title={busy ? 'Registrando…' : 'Registrar decisão'} disabled={busy} onPress={() => void decide()} grow /></ActionRow>
    </> : null}

    {suspended ? <>
      <Eyebrow>Conta suspensa</Eyebrow>
      <Text style={{ color: colors.ink, fontSize: 12.5 }}>Conta responsável suspensa · #{report.target_user_id}</Text>
      <LongField label="Justificativa para reativação" value={justification} onChangeText={setJustification} max={JUSTIFICATION_LIMITS.max} disabled={busy} invalid={Boolean(problem)} />
      {problem ? <ErrorText>{problem}</ErrorText> : null}
      <ActionRow><ActionButton tone="outline" title={busy ? 'Reativando…' : 'Reativar conta'} disabled={busy} onPress={() => void reactivate()} grow /></ActionRow>
    </> : null}
    {!pending && !suspended ? <View style={{ marginTop: 12 }}><Hint>Denúncia resolvida: nada mais a decidir.</Hint></View> : null}
    {error ? <ErrorText>{error}</ErrorText> : null}
    <BusyStatus text={busy ? 'Registrando a decisão…' : ''} />
  </Sheet>
}
