import { useState } from 'react'
import { Text, View } from 'react-native'
import type { EventPix, Receipt, ReceiptReview } from '../../api/events'
import { RECEIPT_LIMITS, decideReceipt, receiptRefusalError, receiptRefusalInput, receiptRefusalText, subjectName } from '../../api/receipts'
import { pixKeyType, receiptRefusalReasons } from '../../data/arena'
import type { ReceiptRefusalReason } from '../../data/arena'
import { useSubmit } from '../../hooks/useSubmit'
import { useResolvedTheme, useThemeColors } from '../../hooks/useTheme'
import { formatDeadline, formatPrice, parseIso } from '../../utils/format'
import { relativeTime } from '../../utils/relativeTime'
import { ReceiptImage } from '../arena/ReceiptImage'
import { Icon } from '../Icon'
import { ReasonPanel } from '../review/ReasonPanel'
import { ActionButton, BusyStatus, ErrorText, Hint } from '../arena/controls'
import { ActionRow, Banner, Eyebrow, InfoGrid } from '../review/ui'
import Sheet from '../Sheet'

/** Prazo ausente ou já vencido. */
function isPast(iso: string | null, now: number = Date.now()) {
  const date = parseIso(iso)
  return !date || date.getTime() <= now
}

/** "Esperado": o valor da inscrição e o Pix do evento, para conferir com o comprovante. */
function Expected({ priceCents, pix }: { priceCents: number; pix: EventPix | null }) {
  const kind = pix?.key_type ? pixKeyType[pix.key_type] : null
  return <View accessibilityLabel="Esperado">
    <Eyebrow>Esperado</Eyebrow>
    <InfoGrid items={[
      ['Valor', formatPrice(priceCents)],
      ['Favorecido', pix?.beneficiary ?? '—'],
      [kind ? `Chave (${kind.inline})` : 'Chave', pix?.key ?? '—'],
    ]} />
  </View>
}

/** Recusas anteriores da inscrição, da mais recente à mais antiga, com a miniatura de cada envio. */
function RefusalHistory({ previous, name, token }: { previous: Receipt[]; name: string; token: string | null }) {
  const colors = useThemeColors()
  const refused = previous.filter(item => item.decision === 'recusado')
  if (!refused.length) return null
  return <View testID="refusal-history">
    <Eyebrow>Recusas anteriores</Eyebrow>
    <View style={{ gap: 6 }}>
      {refused.map(item => <View key={item.id} accessible accessibilityLabel={`Recusado em ${formatDeadline(item.decided_at)}: ${receiptRefusalText(item.reason_code, item.reason_detail)}`}
        style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 10 }}>
        <ReceiptImage receipt={item} title={`Envio recusado de ${name} em ${formatDeadline(item.created_at)}`} variant="thumb" token={token} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '700' }}>Recusado em {formatDeadline(item.decided_at)}</Text>
          <Text style={{ color: colors['ink-muted'], fontSize: 11.5, lineHeight: 17 }}>{receiptRefusalText(item.reason_code, item.reason_detail)}</Text>
          <Hint>Enviado em {formatDeadline(item.created_at)}</Hint>
        </View>
      </View>)}
    </View>
  </View>
}

/** Decisão já tomada (aba Decididos). */
function Decision({ receipt }: { receipt: Receipt }) {
  const colors = useThemeColors()
  const dark = useResolvedTheme() === 'dark'
  const approved = receipt.decision === 'aprovado'
  return <View testID="receipt-decision" accessible accessibilityLabel={approved ? 'Comprovante aprovado' : 'Comprovante recusado'}
    style={{ marginTop: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, padding: 12, backgroundColor: approved ? colors['success-bg'] : dark ? '#ff8a801a' : '#fff0f2' }}>
    <Icon name={approved ? 'check' : 'alert'} size={17} color={approved ? colors.brand : colors.danger} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ color: approved ? colors.brand : colors.danger, fontSize: 12.5, fontWeight: '700' }}>{approved ? 'Aprovado' : 'Recusado'}{receipt.decided_at ? ` em ${formatDeadline(receipt.decided_at)}` : ''}</Text>
      {approved ? null : <Text style={{ color: colors['ink-muted'], fontSize: 12, lineHeight: 18 }}>Motivo: {receiptRefusalText(receipt.reason_code, receipt.reason_detail)}</Text>}
    </View>
  </View>
}

/**
 * Folha do comprovante (A2): o arquivo (imagem pela rota autorizada; o PDF avisa para abrir pela web), quando e como foi
 * enviado, o valor esperado, as recusas anteriores da inscrição e, se ainda não decidido, Aprovar | Recusar com motivo.
 */
export function ReceiptSheet({ review, pix, locked = false, token, onClose, onDecided, onExpired }: {
  review: ReceiptReview
  /** Pix do evento ("Esperado"). */
  pix: EventPix | null
  /** Revogação pendente: a administração decide antes; as decisões ficam suspensas. */
  locked?: boolean
  token: string | null
  onClose: () => void
  onDecided: (decided: ReceiptReview, message: string) => void
  onExpired: () => void
}) {
  const colors = useThemeColors()
  const { receipt, entry, attempt, previous } = review
  const name = subjectName(entry.subject)
  const [refusing, setRefusing] = useState(false)
  const [reason, setReason] = useState<ReceiptRefusalReason | null>(null)
  const [detail, setDetail] = useState('')
  const [attempted, setAttempted] = useState(false)
  const { busy, error, setError, run } = useSubmit(onExpired)
  const problem = attempted ? receiptRefusalError(reason, detail) : null
  const pending = receipt.decision === null
  const reservationOver = isPast(entry.reserved_until)
  const team = entry.subject.kind === 'time'
  const kind = receipt.file_type === 'pdf' ? 'PDF' : 'Imagem'
  const meta = [`Enviado ${relativeTime(receipt.created_at)}`, kind, attempt > 1 ? `${attempt}ª tentativa` : ''].filter(Boolean).join(' · ')

  async function approve() {
    const decided = await run(() => decideReceipt(receipt.id, { decision: 'aprovar' }), 'Não foi possível aprovar o comprovante.')
    if (decided) onDecided(decided, `Inscrição de ${name} confirmada.`)
  }
  async function refuse() {
    setAttempted(true)
    if (receiptRefusalError(reason, detail) || !reason) return
    const decided = await run(() => decideReceipt(receipt.id, receiptRefusalInput(reason, detail)), 'Não foi possível recusar o comprovante.')
    if (decided) onDecided(decided, `Comprovante de ${name} recusado.`)
  }

  return <Sheet title={name} onClose={onClose}>
    <Text style={{ color: colors['ink-muted'], fontSize: 12, marginBottom: 8 }}>{meta}</Text>
    <ReceiptImage receipt={receipt} title={`Comprovante enviado por ${name}`} token={token} />
    <View style={{ marginTop: 4 }}>
      <Hint>Enviado em {formatDeadline(receipt.created_at)}{receipt.uploaded_by ? ` por ${receipt.uploaded_by.name}` : ''}</Hint>
    </View>
    <Expected priceCents={entry.price_cents} pix={pix} />
    <RefusalHistory previous={previous} name={name} token={token} />
    {pending ? null : <Decision receipt={receipt} />}

    {pending && locked ? <Banner>A administração está decidindo se o evento segue. A análise fica em espera até a decisão.</Banner> : null}

    {pending && !locked && !refusing ? <ActionRow>
      <ActionButton icon="check" title={busy ? 'Aprovando…' : 'Aprovar'} disabled={busy} onPress={() => void approve()} grow />
      <ActionButton tone="outline" title="Recusar" disabled={busy} onPress={() => { setRefusing(true); setError('') }} grow />
    </ActionRow> : null}

    {pending && !locked && refusing ? <ReasonPanel title="Motivo da recusa" options={receiptRefusalReasons} option={reason} onOption={setReason}
      textLabel={`Detalhe para ${team ? 'o time' : 'o atleta'} ${reason === 'outro' ? '(obrigatório)' : '(opcional)'}`} text={detail} onText={setDetail} max={RECEIPT_LIMITS.detailMax}
      error={problem}
      note={reservationOver ? 'A reserva já terminou: ao recusar, a vaga é liberada.'
        : `${team ? 'O time' : 'O atleta'} vê o motivo e pode enviar outro comprovante até ${formatDeadline(entry.reserved_until)}.`}
      confirmLabel="Recusar" busyLabel="Recusando…" busy={busy} onConfirm={() => void refuse()}
      onCancel={() => { setRefusing(false); setAttempted(false); setError('') }} /> : null}
    {error ? <ErrorText>{error}</ErrorText> : null}
    <BusyStatus text={busy ? (refusing ? 'Recusando comprovante…' : 'Aprovando comprovante…') : ''} />
  </Sheet>
}
