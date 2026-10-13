import { useCallback, useState } from 'react'
import { Text, View } from 'react-native'
import { REFUND_REASON_MESSAGE, decideRefund, reasonError } from '../../api/admin'
import type { RefundDecision, RefundDispute } from '../../api/admin'
import { ORGANIZER_LIMITS } from '../../api/organizer'
import { getEntryReceipts, subjectName } from '../../api/receipts'
import { useSubmit } from '../../hooks/useSubmit'
import { useResource } from '../../hooks/useResource'
import { colors } from '../../theme'
import { formatDeadline, formatPrice } from '../../utils/format'
import { ReceiptImage } from '../arena/ReceiptImage'
import { StateBadge } from '../arena/StateBadge'
import { receiptState } from '../receipts/receiptView'
import { ReasonPanel } from '../review/ReasonPanel'
import { ActionButton, BusyStatus, ErrorText, Hint } from '../arena/controls'
import { ActionRow, Eyebrow, InfoGrid, LoadState } from '../review/ui'
import Sheet from '../Sheet'

/** Envios anteriores da inscrição (pagamentos e devoluções), do mais recente ao mais antigo. */
function History({ entryId, currentId, name, token, onExpired }: { entryId: number; currentId: number | null; name: string; token: string | null; onExpired: () => void }) {
  const load = useCallback(() => getEntryReceipts(entryId), [entryId])
  const history = useResource(load, onExpired, { fallback: 'Não foi possível carregar o histórico.' })
  const items = (history.data?.items ?? []).filter(item => item.id !== currentId).reverse()
  return <View testID="dispute-history">
    <Eyebrow>Histórico</Eyebrow>
    <LoadState loading={history.loading} error={history.error || null} onRetry={history.reload} loadingText="Carregando o histórico…" />
    {history.data && !items.length ? <Hint>Nenhum outro envio.</Hint> : null}
    {items.length > 0 ? <View style={{ gap: 6 }}>
      {items.map(item => {
        const [label, tone] = receiptState(item)
        return <View key={item.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 10 }}>
          <ReceiptImage receipt={item} title={`Envio de ${name} em ${formatDeadline(item.created_at)}`} variant="thumb" token={token} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <StateBadge tone={tone}>{label}</StateBadge>
            <Hint>Enviado em {formatDeadline(item.created_at)}{item.uploaded_by ? ` por ${item.uploaded_by.name}` : ''}</Hint>
            {item.resolution_reason ? <Text selectable style={{ color: colors.ink, fontSize: 11.5, lineHeight: 17 }}>Decisão: {item.resolution_reason}</Text> : null}
          </View>
        </View>
      })}
    </View> : null}
  </View>
}

/**
 * Folha da devolução contestada: o comprovante enviado pelo organizador, o motivo do participante e o histórico.
 * A administração mantém a devolução ("devolvida") ou pede outro comprovante ("pendente"), sempre com o motivo.
 */
export function DisputeSheet({ dispute, token, onClose, onDecided, onExpired }: {
  dispute: RefundDispute; token: string | null; onClose: () => void; onDecided: (dispute: RefundDispute, message: string) => void; onExpired: () => void
}) {
  const { entry, event, organizer } = dispute
  const refund = entry.refund
  const name = subjectName(entry.subject)
  const [decision, setDecision] = useState<RefundDecision | null>(null)
  const [reason, setReason] = useState('')
  const [attempted, setAttempted] = useState(false)
  const { busy, error, setError, run } = useSubmit(onExpired)

  async function decide() {
    setAttempted(true)
    if (!decision || reasonError(reason, REFUND_REASON_MESSAGE)) return
    const decided = await run(() => decideRefund(entry.id, decision, reason), 'Não foi possível registrar a decisão.')
    if (decided) {
      onDecided(decided, decision === 'devolvida'
        ? `Devolução de ${name} considerada feita.`
        : `${organizer.name} vai enviar outro comprovante para ${name}.`)
    }
  }
  const back = () => { setDecision(null); setAttempted(false); setError('') }

  return <Sheet title="Devolução contestada" onClose={onClose}>
    <Text style={{ color: colors['ink-muted'], fontSize: 12, marginBottom: 4 }}>{event.name}</Text>
    <InfoGrid items={[
      ['Participante', name],
      ['Valor', formatPrice(entry.price_cents)],
      ['Organizador', organizer.name],
      ['Contestada', formatDeadline(dispute.contested_at)],
    ]} />
    <Eyebrow>Comprovante da devolução</Eyebrow>
    {refund
      ? <>
        <ReceiptImage receipt={refund} title={`Comprovante da devolução enviado por ${organizer.name}`} token={token} />
        <View style={{ marginTop: 4 }}><Hint>Enviado em {formatDeadline(refund.created_at)}</Hint></View>
      </>
      : <Hint>Comprovante indisponível.</Hint>}
    <Eyebrow>Motivo do participante</Eyebrow>
    <View testID="contest-reason" accessible style={{ borderRadius: 12, borderLeftWidth: 4, borderLeftColor: colors.danger, backgroundColor: '#fff0f2', paddingHorizontal: 12, paddingVertical: 10 }}>
      <Text selectable style={{ color: colors.ink, fontSize: 12.5, lineHeight: 19 }}>{refund?.contest_reason ?? 'Sem motivo informado.'}</Text>
    </View>
    <History entryId={entry.id} currentId={refund?.id ?? null} name={name} token={token} onExpired={onExpired} />

    {!decision ? <ActionRow>
      <ActionButton icon="check" title="Devolução feita" disabled={busy} onPress={() => { setDecision('devolvida'); setError('') }} grow />
      <ActionButton tone="outline" title="Pedir outro" disabled={busy} onPress={() => { setDecision('pendente'); setError('') }} grow />
    </ActionRow> : <ReasonPanel tone={decision === 'devolvida' ? 'brand' : 'danger'}
      title={decision === 'devolvida' ? 'Considerar a devolução feita' : 'Pedir outro comprovante'}
      textLabel="Motivo da decisão (o organizador e o participante veem)" text={reason} onText={setReason} max={ORGANIZER_LIMITS.detailMax}
      error={attempted ? reasonError(reason, REFUND_REASON_MESSAGE) : null}
      note={decision === 'devolvida'
        ? 'A inscrição fica como devolvida e o caso é encerrado.'
        : 'A inscrição volta para "Devolução pendente" e o organizador envia outro comprovante.'}
      confirmLabel="Registrar decisão" busyLabel="Registrando…" busy={busy} onConfirm={() => void decide()} onCancel={back} />}
    {error ? <ErrorText>{error}</ErrorText> : null}
    <BusyStatus text={busy ? 'Registrando a decisão…' : ''} />
  </Sheet>
}
