import { useState } from 'react'
import { Text, View } from 'react-native'
import { CANCEL_REASON_MESSAGE, decideRevocation, reasonError } from '../../api/admin'
import type { AdminEvent } from '../../api/admin'
import { ORGANIZER_LIMITS } from '../../api/organizer'
import { useSubmit } from '../../hooks/useSubmit'
import { colors } from '../../theme'
import { plural } from '../../utils/format'
import { StateBadge } from '../arena/StateBadge'
import { ReasonPanel } from '../review/ReasonPanel'
import { ActionButton, BusyStatus, ErrorText } from '../arena/controls'
import { ActionRow } from '../review/ui'
import Sheet from '../Sheet'
import { AdminEventInfo, AdminPoster, AtStake } from './AdminEventParts'

/**
 * Folha do evento de organizador revogado: a administração decide se o evento segue (o organizador volta a gerir) ou
 * se é cancelado com devolução (motivo obrigatório, o mesmo cancelamento do organizador).
 */
export function RevokedEventSheet({ event, onClose, onDecided, onExpired }: {
  event: AdminEvent; onClose: () => void; onDecided: (event: AdminEvent, message: string) => void; onExpired: () => void
}) {
  const [step, setStep] = useState<'escolher' | 'seguir' | 'cancelar'>('escolher')
  const [reason, setReason] = useState('')
  const [attempted, setAttempted] = useState(false)
  const { busy, error, setError, run } = useSubmit(onExpired)
  const paid = (event.price_cents ?? 0) > 0
  const confirmed = (event.entries_by_state.confirmada ?? 0) + (event.entries_by_state.em_analise ?? 0)

  async function keep() {
    const decided = await run(() => decideRevocation(event.id, { decision: 'seguir' }), 'Não foi possível registrar a decisão.')
    if (decided) onDecided(decided, `${event.name} segue com o organizador.`)
  }
  async function cancel() {
    setAttempted(true)
    if (reasonError(reason, CANCEL_REASON_MESSAGE)) return
    const decided = await run(() => decideRevocation(event.id, { decision: 'cancelar', reason: reason.trim() }), 'Não foi possível cancelar o evento.')
    if (decided) onDecided(decided, `${event.name} foi cancelado. ${paid ? 'O organizador envia as devoluções.' : 'Os inscritos foram avisados.'}`)
  }
  const back = () => { setStep('escolher'); setAttempted(false); setError('') }

  return <Sheet title="Organizador revogado" onClose={onClose}>
    <Text style={{ color: colors['ink-muted'], fontSize: 12, marginBottom: 6 }}>{event.organizer.display_name} · {event.organizer.user.name}</Text>
    <AdminPoster event={event} />
    <View style={{ marginTop: 10, gap: 6 }}>
      <StateBadge tone="danger">{event.organizer.active ? 'Organizador ativo' : 'Permissão revogada'}</StateBadge>
      <Text style={{ color: colors['ink-muted'], fontSize: 11.5 }}>Inscrições suspensas até a decisão.</Text>
    </View>
    <AdminEventInfo event={event} />
    <AtStake event={event} />

    {step === 'escolher' ? <ActionRow>
      <ActionButton icon="check" title="Seguir evento" disabled={busy} onPress={() => { setStep('seguir'); setError('') }} grow />
      <ActionButton tone="outline" title="Cancelar evento" disabled={busy} onPress={() => { setStep('cancelar'); setError('') }} grow />
    </ActionRow> : null}

    {step === 'seguir' ? <View accessibilityLabel="Seguir com o evento" style={{ marginTop: 14, gap: 10, borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(0,90,54,0.4)', padding: 14 }}>
      <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={{ color: colors.ink, fontSize: 14, fontWeight: '700' }}>Seguir com o evento?</Text>
      <Text style={{ color: colors['ink-muted'], fontSize: 12, lineHeight: 18 }}>O organizador continua gerindo este evento, e as inscrições reabrem se o prazo permitir. A decisão fica registrada e ele é avisado.</Text>
      <ActionRow>
        <ActionButton tone="outline" title="Voltar" disabled={busy} onPress={back} grow />
        <ActionButton title={busy ? 'Registrando…' : 'Confirmar'} disabled={busy} onPress={() => void keep()} grow />
      </ActionRow>
    </View> : null}

    {step === 'cancelar' ? <ReasonPanel title="Cancelar com devolução" textLabel="Motivo do cancelamento (aparece aos inscritos)" text={reason} onText={setReason} max={ORGANIZER_LIMITS.detailMax}
      error={attempted ? reasonError(reason, CANCEL_REASON_MESSAGE) : null}
      note={paid && confirmed
        ? `${plural(confirmed, 'inscrição paga vira', 'inscrições pagas viram')} devolução pendente; o organizador devolve por Pix e anexa os comprovantes.`
        : 'Os inscritos recebem o aviso de cancelamento com o motivo.'}
      confirmLabel="Cancelar evento" busyLabel="Cancelando…" busy={busy} onConfirm={() => void cancel()} onCancel={back} /> : null}
    {error ? <ErrorText>{error}</ErrorText> : null}
    <BusyStatus text={busy ? 'Registrando a decisão…' : ''} />
  </Sheet>
}
