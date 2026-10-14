import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import type { EventDetail, MyEntry } from '../../api/entries'
import type { Receipt } from '../../api/events'
import { useThemeColors } from '../../hooks/useTheme'
import { formatDeadline, formatPrice, parseIso } from '../../utils/format'
import { ReceiptImage } from '../arena/ReceiptImage'
import { StatusCard, StatusCardButton } from '../arena/StatusCard'
import { refusalText } from './eventText'

/** Limiares (em horas) em que o fim do prazo é anunciado a leitores de tela, sem repetir a cada minuto. */
const THRESHOLDS = [1, 3, 6, 12, 24]

/**
 * Aviso discreto do prazo: só anuncia quando o tempo restante cruza um limiar (24, 12, 6, 3 e 1 h) ou acaba, enquanto a
 * tela está aberta. O anel continua com o texto completo para quem lê o cartão.
 */
export function useDeadlineAlert(deadline: string | null | undefined, ended: string): string {
  const [text, setText] = useState('')
  useEffect(() => {
    const end = parseIso(deadline)?.getTime()
    if (!end) return
    const bucket = () => {
      const hours = (end - Date.now()) / 3_600_000
      return hours <= 0 ? 0 : (THRESHOLDS.find(limit => hours <= limit) ?? Infinity)
    }
    let last = bucket()
    const id = setInterval(() => {
      const next = bucket()
      if (next === last) return
      last = next
      setText(next === 0 ? ended : `Falta menos de ${next} ${next === 1 ? 'hora' : 'horas'} para o fim do prazo.`)
    }, 60_000)
    return () => clearInterval(id)
  }, [deadline, ended])
  return text
}

/** Negrito branco dentro do texto do cartão escuro. */
const B = ({ children }: { children: ReactNode }) => <Text className="font-bold text-white">{children}</Text>

export interface EntryStatusProps {
  entry: MyEntry
  detail: EventDetail
  /** Há Pix no evento: o cartão da vaga reservada leva à folha "Pagamento e informações". */
  hasPix: boolean
  busy?: boolean
  token?: string | null
  /** Abre a folha "Pagamento e informações". */
  onPayment: () => void
  onConfirmRefund: () => void
  onContestRefund: () => void
}

/**
 * Cartão S1 da inscrição de quem vê (contrato 0002, seção 6.5): vaga reservada com o anel das horas, comprovante em
 * análise, recusado com o motivo, confirmada, reserva expirada e as etapas da devolução (evento cancelado). O envio do
 * comprovante ("Enviar comprovante" ou "Enviar outro") fica no botão fixo da tela. Quem é só membro do time vê o estado,
 * sem as ações do representante. O comprovante abre na própria tela (imagem autorizada; PDF, o aviso para abrir pela web).
 */
export function EntryStatus({ entry, detail, hasPix, busy = false, token, onPayment, onConfirmRefund, onContestRefund }: EntryStatusProps) {
  const colors = useThemeColors()
  const [receipt, setReceipt] = useState<'pagamento' | 'devolucao' | null>(null)
  const acting = entry.my_role === 'atleta' || entry.my_role === 'representante'
  const team = entry.subject.team
  const price = formatPrice(entry.price_cents, { compact: true })
  const reserved = formatDeadline(entry.reserved_until)
  const refund = entry.refund
  const waitingRefund = entry.state === 'devolucao_pendente' && refund && !refund.participant_response && refund.auto_confirm_at
  const alert = useDeadlineAlert(
    entry.state === 'reservada' || entry.state === 'rejeitada' ? entry.reserved_until : waitingRefund ? refund?.auto_confirm_at : null,
    entry.state === 'reservada' || entry.state === 'rejeitada' ? 'O prazo da reserva acabou.' : 'O prazo para responder à devolução acabou.',
  )
  const repText = team ? `O representante do ${team.name}` : 'O inscrito'
  const viewReceipt = (kind: 'pagamento' | 'devolucao') => (
    <StatusCardButton variant="secondary" title={receipt === kind ? 'Ocultar comprovante' : 'Ver comprovante'} onPress={() => setReceipt(receipt === kind ? null : kind)} />
  )
  const shown: Receipt | null = receipt === 'pagamento' ? entry.latest_payment : receipt === 'devolucao' ? refund : null

  let card: ReactNode
  switch (entry.state) {
    case 'reservada':
      card = <StatusCard tone="aguardando" title="Vaga reservada" deadline={entry.reserved_until} windowStart={entry.created_at}
        actions={acting && hasPix ? <StatusCardButton title="Pix e pagamento" onPress={onPayment} /> : undefined}>
        {acting ? <>Pague <B>{price}</B> direto ao organizador e envie o comprovante até <B>{reserved}</B>. Sem comprovante, a vaga é liberada.</>
          : <>{repText} paga <B>{price}</B> ao organizador e envia o comprovante até <B>{reserved}</B>.</>}
      </StatusCard>
      break
    case 'em_analise':
      card = <StatusCard tone="aguardando" icon="file" title="Comprovante em análise" actions={entry.latest_payment ? viewReceipt('pagamento') : undefined}>
        {entry.latest_payment ? `Enviado ${formatDeadline(entry.latest_payment.created_at)}. ` : ''}
        {detail.organizer.display_name} confirma o pagamento; você recebe um aviso.
      </StatusCard>
      break
    case 'rejeitada':
      card = <StatusCard tone="divergente" title="Comprovante recusado">
        Motivo: <B>{refusalText(entry.latest_payment)}</B>. {acting ? <>Envie outro até <B>{reserved}</B>.</> : <>{repText} pode enviar outro até <B>{reserved}</B>.</>}
      </StatusCard>
      break
    case 'confirmada':
      card = <StatusCard tone="confirmado" title="Inscrição confirmada" pill={team ? team.name : 'Você'}>
        {entry.price_cents > 0 ? 'Pagamento aprovado pelo organizador. ' : ''}
        {detail.sport === 'corrida' ? 'Seu nome está na lista de inscritos da prova.' : 'A tabela sai quando o organizador confirmar o chaveamento.'}
      </StatusCard>
      break
    case 'expirada':
      card = <StatusCard tone="neutro" icon="hourglass" title="A vaga foi liberada">
        A reserva expirou sem comprovante aprovado no prazo.
        {detail.registration_open && detail.spots_left > 0 ? ' Se quiser, inscreva-se de novo enquanto houver vaga.' : ''}
      </StatusCard>
      break
    case 'devolucao_pendente':
      card = waitingRefund && refund
        ? <StatusCard tone="aguardando" title="Devolução enviada pelo organizador" deadline={refund.auto_confirm_at} windowStart={refund.created_at} windowHours={168}
          actions={<>
            {viewReceipt('devolucao')}
            {entry.can_respond_refund ? <>
              <StatusCardButton title="Confirmar recebimento" onPress={onConfirmRefund} disabled={busy} />
              <StatusCardButton variant="secondary" title="Contestar" onPress={onContestRefund} disabled={busy} />
            </> : null}
          </>}>
          Confira se <B>{price}</B> voltou para a conta e responda até <B>{formatDeadline(refund.auto_confirm_at)}</B>. Sem resposta em 7 dias, a devolução conta como recebida.
        </StatusCard>
        : <StatusCard tone="neutro" title="Evento cancelado · devolução por Pix">
          O organizador vai devolver <B>{price}</B> por Pix.{' '}
          {refund?.resolution === 'pendente' ? 'A administração pediu a ele outro comprovante da devolução.' : 'Quando ele anexar o comprovante, você confirma o recebimento aqui.'}
        </StatusCard>
      break
    case 'devolucao_contestada':
      card = <StatusCard tone="divergente" title="Contestação em análise pela administração" actions={refund ? viewReceipt('devolucao') : undefined}>
        {refund?.contest_reason ? <>Motivo: <B>“{refund.contest_reason}”</B> </> : null}A administração confere o comprovante da devolução e decide.
      </StatusCard>
      break
    case 'devolvida':
      card = <StatusCard tone="confirmado" title="Devolução recebida">
        {refund?.participant_response === 'automatica' ? 'Sem resposta em 7 dias, a devolução foi considerada recebida.'
          : refund?.resolution === 'devolvida' ? 'A administração considerou a devolução feita.' : 'O recebimento da devolução foi confirmado.'}
      </StatusCard>
      break
    default:
      card = <StatusCard tone="neutro" title="Inscrição cancelada">Esta inscrição não ocupa mais vaga no evento.</StatusCard>
  }

  return <View accessibilityLabel="Sua inscrição" testID={`entry-${entry.state}`} style={{ gap: 8 }}>
    {card}
    {shown ? <View style={{ gap: 6, borderRadius: 16, backgroundColor: colors.surface, padding: 12 }}>
      <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 12, fontWeight: '700' }}>{shown.kind === 'devolucao' ? 'Comprovante da devolução' : 'Comprovante enviado'}</Text>
      <ReceiptImage receipt={shown} token={token} title={shown.kind === 'devolucao' ? `Comprovante da devolução de ${detail.organizer.display_name}` : `Comprovante enviado por ${team?.name ?? shown.uploaded_by?.name ?? 'você'}`} />
    </View> : null}
    <Text accessibilityLiveRegion="polite" style={{ height: alert ? undefined : 0, color: colors['ink-muted'], fontSize: 11, lineHeight: 15, paddingHorizontal: 4 }}>{alert}</Text>
  </View>
}
