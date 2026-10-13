import { useState } from 'react'
import { Text, View } from 'react-native'
import type { UploadFile } from '../../api/client'
import type { OrganizerEntry } from '../../api/events'
import { sendRefundReceipt, subjectName } from '../../api/receipts'
import { useSubmit } from '../../hooks/useSubmit'
import { useThemeColors } from '../../hooks/useTheme'
import { formatPrice } from '../../utils/format'
import Sheet from '../Sheet'
import { ActionButton, BusyStatus, ErrorText, Hint } from '../arena/controls'
import { ReceiptFilePicker } from '../arena/ReceiptFilePicker'
import { ActionRow } from '../review/ui'
import { refundStatus } from './receiptView'

/**
 * Anexar a devolução (evento cancelado): o organizador devolve o valor por Pix, fora do Arena, escolhe o comprovante
 * (imagem JPEG, PNG ou WebP, ou PDF, até 5 MiB) no seletor de arquivos ou na galeria e o envia. O arquivo é conferido
 * no cliente com as regras e as mensagens do servidor; o participante confirma ou contesta o recebimento.
 */
export function RefundAttachSheet({ entry, onSent, onClose, onExpired }: {
  entry: OrganizerEntry; onSent: (entry: OrganizerEntry) => void; onClose: () => void; onExpired: () => void
}) {
  const colors = useThemeColors()
  const name = subjectName(entry.subject)
  const again = refundStatus(entry).step === 'reenviar'
  const [file, setFile] = useState<UploadFile | null>(null)
  const { busy, error, run } = useSubmit(onExpired)

  async function send() {
    if (!file || busy) return
    const sent = await run(() => sendRefundReceipt(entry.id, file), 'Não foi possível enviar o comprovante da devolução.')
    if (sent) onSent(sent)
  }

  return <Sheet title={again ? 'Anexar outro comprovante' : 'Anexar devolução'} onClose={onClose}>
    <Text style={{ color: colors['ink-muted'], fontSize: 12, lineHeight: 18, marginBottom: 8 }}>
      {name} · {formatPrice(entry.price_cents)} a devolver. Faça o Pix para o participante, fora do Arena, e anexe o comprovante.
    </Text>
    <ReceiptFilePicker file={file} onFile={setFile} busy={busy} pickedTestID="refund-picked" />
    <View style={{ marginTop: 10 }}><Hint>O participante vê o comprovante e confirma o recebimento; sem resposta em 7 dias, conta como recebido.</Hint></View>
    {error ? <ErrorText>{error}</ErrorText> : null}
    <BusyStatus text={busy ? 'Enviando devolução…' : ''} />
    <ActionRow>
      <ActionButton title={busy ? 'Enviando…' : 'Enviar devolução'} disabled={!file || busy} onPress={() => void send()} grow />
    </ActionRow>
  </Sheet>
}
