import { useState } from 'react'
import { Text, View } from 'react-native'
import { eventEntriesPath } from '../../api/events'
import type { OrganizerEntry } from '../../api/events'
import { subjectName } from '../../api/receipts'
import { usePagedList } from '../../hooks/usePagedList'
import type { EntryState } from '../../data/arena'
import { useThemeColors } from '../../hooks/useTheme'
import { formatPrice } from '../../utils/format'
import { ReceiptImage } from '../arena/ReceiptImage'
import { StateBadge } from '../arena/StateBadge'
import { Icon } from '../Icon'
import { ActionButton, Hint } from '../arena/controls'
import { ListMessageInline, LoadMore } from '../review/ui'
import { RefundAttachSheet } from './RefundAttachSheet'
import { refundStatus } from './receiptView'

/** Uma inscrição com devolução: situação, arquivo enviado e "Anexar comprovante" (imagem ou PDF até 5 MiB). */
function RefundRow({ entry, token, onAttach }: { entry: OrganizerEntry; token: string | null; onAttach: () => void }) {
  const colors = useThemeColors()
  const name = subjectName(entry.subject)
  const status = refundStatus(entry)
  const refund = entry.refund
  return <View testID={`refund-${entry.id}`} accessibilityLabel={`${name}: ${status.label}`} style={{ borderRadius: 16, backgroundColor: colors.surface, padding: 12 }}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      {refund && status.step !== 'enviar'
        ? <ReceiptImage receipt={refund} title={`Comprovante da devolução de ${name}`} variant="thumb" token={token} />
        : <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 48, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors['line-strong'] }}>
          <Icon name="file" size={18} color={colors['ink-muted']} />
        </View>}
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={{ color: colors.ink, fontSize: 13.5, fontWeight: '700' }}>{name}</Text>
        <Hint>{formatPrice(entry.price_cents)} {entry.state === 'devolvida' ? 'devolvidos' : 'a devolver'}</Hint>
        <StateBadge tone={status.tone}>{status.label}</StateBadge>
      </View>
    </View>
    <Text style={{ marginTop: 8, color: colors['ink-muted'], fontSize: 12, lineHeight: 18 }}>{status.text}</Text>
    {status.canAttach ? <View style={{ marginTop: 8 }}>
      <ActionButton icon="file" title={status.step === 'reenviar' ? 'Anexar outro comprovante' : 'Anexar comprovante'} accessibilityLabel={`${status.step === 'reenviar' ? 'Anexar outro comprovante' : 'Anexar comprovante'} de ${name}`} accessibilityHint="Imagem ou PDF, até 5 MiB" onPress={onAttach} fit />
    </View> : null}
  </View>
}

const groups: { state: EntryState; title: string; empty: string }[] = [
  { state: 'devolucao_pendente', title: 'Para enviar e aguardando', empty: 'Nenhuma devolução pendente.' },
  { state: 'devolucao_contestada', title: 'Contestadas', empty: 'Nenhuma devolução contestada.' },
  { state: 'devolvida', title: 'Concluídas', empty: 'Nenhuma devolução concluída ainda.' },
]

function RefundGroup({ eventId, state, title, empty, token, onSent, onExpired }: {
  eventId: number; state: EntryState; title: string; empty: string; token: string | null; onSent: (entry: OrganizerEntry) => void; onExpired: () => void
}) {
  const colors = useThemeColors()
  const list = usePagedList<OrganizerEntry>(eventEntriesPath(eventId, state), onExpired)
  const [attaching, setAttaching] = useState<OrganizerEntry | null>(null)
  return <View accessibilityLabel={title} style={{ marginTop: 18 }}>
    <Text accessibilityRole="header" style={{ marginHorizontal: 4, marginBottom: 8, color: colors['ink-muted'], fontSize: 10.5, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>{title}</Text>
    <ListMessageInline list={list} loadingText="Carregando…" emptyText={empty} />
    {list.items.length > 0 ? <View style={{ gap: 8 }}>
      {list.items.map(entry => <RefundRow key={entry.id} entry={entry} token={token} onAttach={() => setAttaching(entry)} />)}
    </View> : null}
    <LoadMore list={list} label="Carregar mais" />
    {attaching ? <RefundAttachSheet entry={attaching} onExpired={onExpired} onClose={() => setAttaching(null)}
      onSent={sent => {
        list.setItems(old => old.map(item => item.id === sent.id ? sent : item))
        setAttaching(null)
        onSent(sent)
      }} /> : null}
  </View>
}

/**
 * Devoluções do evento cancelado: o organizador devolve por Pix, fora do Arena, e anexa o comprovante de cada
 * inscrição; o participante confirma ou contesta (sem resposta em 7 dias, conta como recebida).
 */
export function RefundList({ eventId, token, onSent, onExpired }: { eventId: number; token: string | null; onSent: (entry: OrganizerEntry) => void; onExpired: () => void }) {
  const colors = useThemeColors()
  return <View>
    <Text style={{ marginTop: 4, color: colors['ink-muted'], fontSize: 12, lineHeight: 18 }}>
      Devolva o valor de cada inscrição paga por Pix, fora do Arena, e anexe o comprovante. O participante confirma o recebimento; sem resposta em 7 dias, conta como recebida.
    </Text>
    {groups.map(group => <RefundGroup key={group.state} eventId={eventId} {...group} token={token} onSent={onSent} onExpired={onExpired} />)}
  </View>
}
