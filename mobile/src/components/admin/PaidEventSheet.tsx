import { useState } from 'react'
import { Text } from 'react-native'
import { decideEvent, eventRefusalInput, refusalError } from '../../api/admin'
import type { AdminEvent } from '../../api/admin'
import { ORGANIZER_LIMITS } from '../../api/organizer'
import { eventRefusalReasons } from '../../data/arena'
import type { EventRefusalReason } from '../../data/arena'
import { useSubmit } from '../../hooks/useSubmit'
import { colors } from '../../theme'
import { relativeTime } from '../../utils/relativeTime'
import { ReasonPanel } from '../review/ReasonPanel'
import { ActionButton, BusyStatus, ErrorText } from '../arena/controls'
import { ActionRow } from '../review/ui'
import Sheet from '../Sheet'
import { AdminEventInfo, AdminPoster, PixInformed } from './AdminEventParts'

/** Folha do evento pago (AD1): cartaz, dados e Pix informado; Aprovar e publicar | Recusar com motivo. */
export function PaidEventSheet({ event, onClose, onDecided, onExpired }: {
  event: AdminEvent; onClose: () => void; onDecided: (event: AdminEvent, message: string) => void; onExpired: () => void
}) {
  const [refusing, setRefusing] = useState(false)
  const [reason, setReason] = useState<EventRefusalReason | null>(null)
  const [detail, setDetail] = useState('')
  const [attempted, setAttempted] = useState(false)
  const { busy, error, setError, run } = useSubmit(onExpired)
  const problem = attempted ? refusalError(reason, detail) : null

  async function approve() {
    const decided = await run(() => decideEvent(event.id, { decision: 'aprovar' }), 'Não foi possível aprovar o evento.')
    if (decided) onDecided(decided, `${event.name} foi aprovado e publicado.`)
  }
  async function refuse() {
    setAttempted(true)
    if (refusalError(reason, detail) || !reason) return
    const decided = await run(() => decideEvent(event.id, eventRefusalInput(reason, detail)), 'Não foi possível recusar o evento.')
    if (decided) onDecided(decided, `${event.name} voltou para rascunho com o motivo.`)
  }

  return <Sheet title="Evento pago" onClose={onClose}>
    <Text style={{ color: colors['ink-muted'], fontSize: 12, marginBottom: 6 }}>Enviado por {event.organizer.display_name}{event.submitted_at ? ` ${relativeTime(event.submitted_at)}` : ''}</Text>
    <AdminPoster event={event} />
    <AdminEventInfo event={event} />
    <PixInformed pix={event.pix} />
    {!refusing ? <ActionRow>
      <ActionButton icon="check" title={busy ? 'Aprovando…' : 'Aprovar e publicar'} disabled={busy} onPress={() => void approve()} grow />
      <ActionButton tone="outline" title="Recusar" disabled={busy} onPress={() => { setRefusing(true); setError('') }} grow />
    </ActionRow> : <ReasonPanel title="Motivo da recusa" options={eventRefusalReasons} option={reason} onOption={setReason}
      textLabel={`Detalhe para o organizador ${reason === 'outro' ? '(obrigatório)' : '(opcional)'}`} text={detail} onText={setDetail} max={ORGANIZER_LIMITS.detailMax}
      error={problem} note="O evento volta para rascunho com o motivo; o organizador corrige e reenvia."
      confirmLabel="Recusar evento" busyLabel="Recusando…" busy={busy} onConfirm={() => void refuse()}
      onCancel={() => { setRefusing(false); setAttempted(false); setError('') }} />}
    {error ? <ErrorText>{error}</ErrorText> : null}
    <BusyStatus text={busy ? 'Registrando a decisão…' : ''} />
  </Sheet>
}
