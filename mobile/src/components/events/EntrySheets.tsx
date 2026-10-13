import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { UploadFile } from '../../api/client'
import { CONTEST_LIMITS } from '../../api/entries'
import type { EventDetail, MyEntry, TeamEligibility } from '../../api/entries'
import { colors } from '../../theme'
import { formatDeadline, formatPrice } from '../../utils/format'
import { BusyStatus, ErrorText } from '../arena/controls'
import { ReceiptFilePicker } from '../arena/ReceiptFilePicker'
import { PixBlock } from '../arena/PixBlock'
import type { PixInfo } from '../arena/pix'
import { TeamCrest } from '../arena/TeamCrest'
import { Icon } from '../Icon'
import Sheet from '../Sheet'
import { Button, Field } from '../ui'
import { refusalText, reservationDeadline } from './eventText'
import { Muted, Strong, Term } from './Term'

const hint = { color: colors['ink-muted'], fontSize: 10.5, lineHeight: 15 } as const

export interface EnterSheetProps {
  detail: EventDetail
  /** Futebol: times representados, elegíveis e ainda sem inscrição. */
  teams: TeamEligibility[]
  /** Time marcado (a tela guarda a escolha: abrir "Pagamento e informações" e voltar não a perde). */
  teamId: number | null
  onTeam: (teamId: number) => void
  pix: PixInfo | null
  busy: boolean
  onConfirm: (teamId: number | null) => void
  onPaymentInfo: () => void
  onClose: () => void
}

/**
 * Inscrição (RN20, RN21): na gratuita, "Confirmar inscrição" (confirmada na hora); na paga, "Reservar vaga", com o
 * valor, o prazo do comprovante e o bloco "Pix do organizador" em destaque. No futebol, escolhe o time quando quem se
 * inscreve representa mais de um time elegível.
 */
export function EnterSheet({ detail, teams, teamId, onTeam, pix, busy, onConfirm, onPaymentInfo, onClose }: EnterSheetProps) {
  const football = detail.sport === 'futebol'
  const paid = (detail.price_cents ?? 0) > 0
  const team = teams.find(item => item.team.id === teamId)?.team ?? null
  const deadline = formatDeadline(reservationDeadline(detail.starts_at))
  const title = paid ? 'Reservar vaga' : football && team ? `Inscrever ${team.name}` : 'Confirmar inscrição'
  return <Sheet title={title} onClose={onClose}>
    <Text style={{ color: colors['ink-muted'], fontSize: 12, marginBottom: 8 }}>{detail.name}</Text>
    <View style={{ gap: 4, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 }}>
      {football && teams.length > 1 ? <View accessibilityRole="radiogroup" accessibilityLabel="Time que vai se inscrever" style={{ gap: 6, marginBottom: 4 }}>
        <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '700' }}>Time que vai se inscrever</Text>
        {teams.map(item => {
          const selected = item.team.id === teamId
          return <Pressable key={item.team.id} accessibilityRole="radio" accessibilityLabel={item.team.name} accessibilityState={{ selected, disabled: busy }} disabled={busy} onPress={() => onTeam(item.team.id)}
            style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1.5, borderColor: selected ? colors.brand : colors.line, backgroundColor: selected ? colors['success-bg'] : '#ffffff', paddingHorizontal: 10 }}>
            <TeamCrest name={item.team.name} initials={item.team.initials} path={item.team.crest_url} size="sm" decorative />
            <Text style={{ flex: 1, color: colors.ink, fontSize: 12, fontWeight: '700' }}>{item.team.name}</Text>
            <Text style={{ color: selected ? colors.brand : colors['ink-muted'], fontSize: 16 }}>{selected ? '●' : '○'}</Text>
          </Pressable>
        })}
      </View> : football && team ? <Term iconNode={<TeamCrest name={team.name} initials={team.initials} path={team.crest_url} size="xs" decorative />}>
        Inscreve o <Strong>{team.name}</Strong><Muted> · você representa o time</Muted>
      </Term> : null}
      <Term icon="ticket">
        {paid ? <>Valor <Muted>·</Muted> <Strong>{formatPrice(detail.price_cents)}</Strong><Muted>{football ? ' por time' : ''} · pago direto ao organizador</Muted></>
          : <>Inscrição <Strong>gratuita</Strong><Muted> · confirmada na hora</Muted></>}
      </Term>
      {paid && deadline ? <Term icon="hourglass">Comprovante até <Strong>{deadline}</Strong><Muted> · 48 h após reservar ou 12 h antes do evento</Muted></Term> : null}
    </View>
    {paid ? <View style={{ marginTop: 8 }}>
      {pix ? <PixBlock pix={pix} priceCents={detail.price_cents ?? 0} onInfo={onPaymentInfo} />
        : <Text style={hint}>O organizador ainda não informou o Pix deste evento.</Text>}
    </View> : null}
    <BusyStatus text={busy ? (paid ? 'Reservando vaga…' : 'Confirmando inscrição…') : ''} />
    <Button title={busy ? (paid ? 'Reservando…' : 'Confirmando…') : paid ? 'Reservar vaga' : 'Confirmar inscrição'} disabled={busy || (football && !team)} onPress={() => onConfirm(football ? teamId : null)} />
    {paid ? <Text style={[hint, { marginTop: 6 }]}>A vaga fica guardada até o prazo. Pague pelo Pix e volte para enviar o comprovante.</Text> : null}
  </Sheet>
}

export interface ReceiptSheetProps {
  entry: MyEntry
  eventName: string
  busy: boolean
  error: string
  onSend: (file: UploadFile) => void
  onClose: () => void
}

/**
 * "Enviar comprovante": imagem (JPEG, PNG ou WebP) ou PDF de até 5 MiB, escolhidos no seletor de documentos ou na
 * galeria e conferidos no cliente com as mesmas regras e mensagens do servidor; envio `multipart` para a análise do
 * organizador. Numa recusa, mostra o motivo anterior.
 */
export function ReceiptSheet({ entry, eventName, busy, error, onSend, onClose }: ReceiptSheetProps) {
  const [file, setFile] = useState<UploadFile | null>(null)
  const team = entry.subject.team
  return <Sheet title="Enviar comprovante" onClose={onClose}>
    <Text style={{ color: colors['ink-muted'], fontSize: 12, marginBottom: 8 }}>{eventName} · {formatPrice(entry.price_cents, { compact: true })}</Text>
    {entry.state === 'rejeitada' ? <Text style={{ borderRadius: 8, backgroundColor: '#fff0f2', color: colors.error, fontSize: 11, lineHeight: 16, padding: 10, marginBottom: 8 }}>
      Recusado: {refusalText(entry.latest_payment)}. Envie outro até {formatDeadline(entry.reserved_until)}.
    </Text> : null}
    <ReceiptFilePicker file={file} onFile={setFile} busy={busy} pickedTestID="receipt-picked" />
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10 }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ marginTop: 1 }}><Icon name="lock" size={15} color={colors['ink-muted']} /></View>
      <Text style={[hint, { flex: 1 }]}>
        {team ? 'Só os representantes do time, o organizador e a administração veem o comprovante.' : 'Só você, o organizador e a administração veem o comprovante.'}
        {entry.reserved_until ? ` Prazo: ${formatDeadline(entry.reserved_until)}.` : ''}
      </Text>
    </View>
    {error ? <ErrorText>{error}</ErrorText> : null}
    <BusyStatus text={busy ? 'Enviando comprovante…' : ''} />
    <Button title={busy ? 'Enviando…' : 'Enviar para análise'} disabled={!file || busy} onPress={() => { if (file && !busy) onSend(file) }} />
  </Sheet>
}

/** Confirmação do recebimento da devolução: só quando o valor já voltou para a conta. */
export function ConfirmRefundSheet({ entry, busy, onConfirm, onClose }: { entry: MyEntry; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  return <Sheet title="Confirmar recebimento" onClose={onClose}>
    <Text style={{ color: colors['ink-muted'], fontSize: 12, marginBottom: 8 }}>{entry.event.name}</Text>
    <Text style={{ color: colors.ink, fontSize: 12, lineHeight: 18 }}>
      Confirme só se <Strong>{formatPrice(entry.price_cents, { compact: true })}</Strong> já voltou para a sua conta. Depois de confirmar, a devolução fica registrada como recebida.
    </Text>
    <BusyStatus text={busy ? 'Confirmando recebimento…' : ''} />
    <Button title={busy ? 'Confirmando…' : 'Confirmar recebimento'} disabled={busy} onPress={onConfirm} />
  </Sheet>
}

/** Contestação da devolução (5 a 500 caracteres), que vai à administração. */
export function ContestRefundSheet({ entry, busy, error, onContest, onClose }: { entry: MyEntry; busy: boolean; error: string; onContest: (reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const text = reason.trim()
  const short = text.length < CONTEST_LIMITS.min
  function submit() {
    setTouched(true)
    if (!short && !busy) onContest(text)
  }
  return <Sheet title="Contestar devolução" onClose={onClose}>
    <Text style={{ color: colors['ink-muted'], fontSize: 12, marginBottom: 4 }}>{entry.event.name}</Text>
    <Field label="O que aconteceu com a devolução?" multiline maxLength={CONTEST_LIMITS.max} value={reason} onChangeText={setReason} editable={!busy}
      placeholder="Ex.: o valor que voltou é menor que o pago." textAlignVertical="top" style={{ minHeight: 104 }} />
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
      <Text style={[hint, { flex: 1 }]}>A administração analisa o comprovante e decide.</Text>
      <Text accessibilityElementsHidden style={hint}>{reason.length}/{CONTEST_LIMITS.max}</Text>
    </View>
    {touched && short ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: colors.error, fontSize: 12, lineHeight: 17, marginTop: 10 }}>Conte o que aconteceu com a devolução (ao menos {CONTEST_LIMITS.min} caracteres).</Text> : null}
    {error ? <ErrorText>{error}</ErrorText> : null}
    <BusyStatus text={busy ? 'Enviando contestação…' : ''} />
    <Button title={busy ? 'Enviando…' : 'Contestar devolução'} disabled={busy} onPress={submit} />
  </Sheet>
}

/** Desistir da inscrição (gratuita antes do início; paga só enquanto reservada ou recusada). */
export function CancelEntrySheet({ entry, busy, onConfirm, onClose }: { entry: MyEntry; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  const paid = entry.price_cents > 0
  return <Sheet title="Desistir da inscrição" onClose={onClose}>
    <Text style={{ color: colors['ink-muted'], fontSize: 12, marginBottom: 8 }}>{entry.event.name}</Text>
    <Text style={{ color: colors.ink, fontSize: 12, lineHeight: 18 }}>
      {paid ? 'A reserva é cancelada e a vaga fica livre. Se você já pagou, combine a devolução com o organizador.' : 'A inscrição é cancelada e a vaga fica livre para outra pessoa.'}
    </Text>
    <BusyStatus text={busy ? 'Cancelando inscrição…' : ''} />
    <Button title={busy ? 'Cancelando…' : 'Desistir'} disabled={busy} onPress={onConfirm} />
  </Sheet>
}

/** Contato do organizador (telefone, e-mail ou perfil), em texto selecionável: o app não usa a área de transferência. */
export function ContactSheet({ name, contact, onClose }: { name: string; contact: string; onClose: () => void }) {
  return <Sheet title="Contato do organizador" onClose={onClose}>
    <Text style={{ color: colors['ink-muted'], fontSize: 12, marginBottom: 8 }}>{name}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: colors['line-strong'], backgroundColor: '#ffffff', paddingVertical: 10, paddingHorizontal: 12 }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Icon name="phone" size={17} color={colors.brand} /></View>
      <Text selectable testID="contact-text" style={{ flex: 1, color: colors.ink, fontSize: 12.5, fontWeight: '600' }}>{contact}</Text>
    </View>
    <Text style={[hint, { marginTop: 6 }]}>Segure o texto para selecionar e copiar. Dúvidas sobre o evento, o pagamento ou a devolução são combinadas com o organizador, fora do Arena.</Text>
  </Sheet>
}
