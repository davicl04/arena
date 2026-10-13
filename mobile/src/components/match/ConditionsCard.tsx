import { useState } from 'react'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { MatchDetail, MatchTermsOut, Side } from '../../api/matches'
import { currentSlotCounts, guestSlots, nameOf, orderedSides, shortName, sideName, slotTotal, whenText } from '../../data/match'
import { useNow } from '../../hooks/useNow'
import { colors } from '../../theme'
import { formatDeadline, parseIso } from '../../utils/format'
import { ActionButton, ErrorText, SwitchRow } from '../arena/controls'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'

/*
 * Cartão "Condições da partida" (P2): fixo no topo e recolhível. Mostra a proposta vigente (ou as condições combinadas), os selos
 * de aceite de cada lado e, conforme `detail.permissions`, propor outra, aceitar, a reserva, as vagas para avulsos, o
 * cancelamento e o W.O. A interface obedece às permissões do servidor: o que o papel não pode fazer simplesmente não aparece.
 */

const muted = colors['ink-muted']

function Row({ icon, children }: { icon: IconName; children: ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ marginTop: 1 }}><Icon name={icon} size={16} color={colors.brand} /></View>
    <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
  </View>
}

const rowText = { color: colors.ink, fontSize: 12.5, lineHeight: 18 } as const
const small = { color: muted, fontSize: 10.5, lineHeight: 15 } as const

function Badge({ tone, children }: { tone: 'warning' | 'error'; children: string }) {
  return <Text style={{ alignSelf: 'flex-start', marginTop: 3, borderRadius: 999, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3, fontSize: 9.5, fontWeight: '800', backgroundColor: tone === 'warning' ? colors['warning-bg'] : '#fff0f2', color: tone === 'warning' ? colors.warning : colors.error }}>{children}</Text>
}

/** Selo de aceite de um lado: "Ferrugem FC aceitou" ou "Leões do Cerrado falta aceitar". */
function Ack({ name, accepted }: { name: string; accepted: boolean }) {
  return <View testID="terms-ack" style={{ maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: accepted ? colors['success-bg'] : colors['warning-bg'] }}>
    <Icon name={accepted ? 'check' : 'hourglass'} size={12} color={accepted ? colors.brand : colors.warning} />
    <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 10, fontWeight: '700', color: accepted ? colors.brand : colors.warning }}>{`${name} ${accepted ? 'aceitou' : 'falta aceitar'}`}</Text>
  </View>
}

function Eyebrow({ children }: { children: string }) {
  return <Text style={{ color: muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>{children}</Text>
}

function Note({ icon = 'info', children, testID }: { icon?: IconName; children: ReactNode; testID?: string }) {
  return <View testID={testID} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ marginTop: 1 }}><Icon name={icon} size={15} color={muted} /></View>
    <Text style={{ flex: 1, color: muted, fontSize: 11, lineHeight: 16 }}>{children}</Text>
  </View>
}

function Cancelled({ children }: { children: ReactNode }) {
  return <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: 10, borderRadius: 14, backgroundColor: '#fff0f2', padding: 12 }}>
    <Icon name="octagon-x" size={20} color={colors.error} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ color: colors.error, fontSize: 12.5, fontWeight: '800' }}>Partida cancelada</Text>
      <Text style={{ color: colors.ink, fontSize: 11.5, lineHeight: 17 }}>{children}</Text>
    </View>
  </View>
}

/** O cartão recolhível: o cabeçalho (título, resumo se recolhido, seta) é um botão que abre e fecha o conteúdo. */
function Shell({ title, icon, summary, open, onToggle, origin, children }: { title: string; icon: IconName; summary: string; open: boolean; onToggle: () => void; origin?: string; children: ReactNode }) {
  return <View testID={origin ? `conditions-card-${origin}` : 'conditions-card'} style={{ marginHorizontal: 12, marginTop: 10, borderRadius: 16, backgroundColor: '#ffffff', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 1 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={open ? title : `${title}. ${summary}`} accessibilityHint={open ? 'Recolhe as condições' : 'Mostra as condições'} accessibilityState={{ expanded: open }} onPress={onToggle}
      style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 }}>
      <Icon name={icon} size={16} color={colors.brand} />
      <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '800' }}>{title}</Text>
      {open ? <View style={{ flex: 1 }} /> : <Text numberOfLines={1} style={{ flex: 1, color: muted, fontSize: 11 }}>{summary}</Text>}
      <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={muted} />
    </Pressable>
    {open ? <View style={{ gap: 12, paddingHorizontal: 14, paddingBottom: 14 }}>{children}</View> : null}
  </View>
}

function courtNote(terms: MatchTermsOut): string | null {
  if (terms.court.state === 'em_revisao') return 'vale só para esta partida'
  return terms.court.address
}

/** Dia e hora, quadra (com o selo de revisão ou de recusa) e quem reserva; no tênis, o super tie-break. */
function TermsRows({ detail, terms, booked }: { detail: MatchDetail; terms: MatchTermsOut; booked: boolean | null }) {
  const note = courtNote(terms)
  return <View style={{ gap: 8 }}>
    <Row icon="calendar-days"><Text style={[rowText, { fontWeight: '800' }]}>{whenText(terms.starts_at)}</Text></Row>
    <Row icon="map-pin">
      <Text style={rowText}>{terms.court.name}</Text>
      {terms.court.provisional ? <Badge tone="warning">Sugestão em revisão</Badge> : null}
      {terms.court.state === 'rejeitada' ? <Badge tone="error">Sugestão recusada</Badge> : null}
      {note ? <Text style={small}>{note}</Text> : null}
    </Row>
    <Row icon="key-round">
      <Text style={rowText}>{`Reserva: ${nameOf(detail, terms.booking_side)}`}</Text>
      <Text style={small}>{booked === null ? 'reserva com o local' : booked ? 'confirmada com o local' : 'a confirmar com o local'}</Text>
    </Row>
    {detail.sport === 'tenis' && terms.super_tiebreak ? <Row icon="timer"><Text style={rowText}>Super tie-break no lugar do 3º set</Text></Row> : null}
  </View>
}

function slotsSummary(detail: MatchDetail): string {
  if (detail.state === 'combinando') {
    const declared = slotTotal(currentSlotCounts(detail))
    const when = 'abrem para avulsos quando a partida for agendada'
    return declared ? `${declared} ${declared === 1 ? 'vaga declarada' : 'vagas declaradas'} · ${when}` : `Nenhuma vaga declarada · ${when}`
  }
  const open = detail.slots.filter(slot => slot.state !== 'preenchida').length
  const guests = detail.slots.filter(slot => slot.state === 'preenchida').length
  const parts = [open ? `${open} ${open === 1 ? 'vaga aberta' : 'vagas abertas'}` : '', guests ? `${guests} ${guests === 1 ? 'avulso escalado' : 'avulsos escalados'}` : '']
  return parts.filter(Boolean).join(' · ') || 'Nenhuma vaga aberta'
}

export interface ConditionsCardProps {
  detail: MatchDetail
  /** Campeonato: "Agendar" ou "Reagendar" (o organizador), que abre a agenda das partidas do evento com esta partida. */
  onSchedule?: () => void
  /** Campeonato: "Decidir resultado" (o organizador), que abre a decisão do resultado. */
  onDecide?: () => void
  busy: boolean
  error: string
  onPropose: () => void
  onAccept: (terms: MatchTermsOut) => void
  onBooking: (confirmed: boolean) => void
  onSlots: () => void
  onCancel: () => void
  onRegisterWalkover: () => void
  onWithdrawWalkover: () => void
  onContestWalkover: () => void
}

/**
 * Partida de campeonato: a data e a quadra são do organizador, então o cartão não tem "Propor outra", aceite nem reserva;
 * `terms` e `booking` vêm nulos e a data e a quadra estão em `starts_at` e `court`. O organizador ganha "Agendar" e "Decidir
 * resultado", conforme `permissions`.
 */
function ChampionshipConditions({ detail, busy, error, onSchedule, onDecide }: Pick<ConditionsCardProps, 'detail' | 'busy' | 'error' | 'onSchedule' | 'onDecide'>) {
  const { permissions, cancellation, court } = detail
  const scheduled = detail.state === 'agendada'
  const [open, setOpen] = useState(() => detail.state === 'combinando' || Boolean(cancellation) || permissions.decide_result === true)
  const hasDate = detail.starts_at !== null
  const closed = detail.state === 'cancelada'
  const summary = hasDate ? `${whenText(detail.starts_at)}${court ? ` · ${court.name}` : ''}` : 'Data e quadra a definir'
  const waiting = detail.sides.length < 2
  return <Shell title={scheduled ? 'Partida agendada' : 'Data e quadra'} icon={scheduled ? 'calendar-check' : 'pin'} summary={summary} open={open} onToggle={() => setOpen(old => !old)} origin="campeonato">
    {cancellation ? <Cancelled>{cancellation.reason ? `Motivo: ${cancellation.reason}` : 'O campeonato foi cancelado.'}</Cancelled> : null}
    {detail.event ? <Eyebrow>{`${detail.event.name}${detail.round_number ? ` · fase ${detail.round_number}` : ''}`}</Eyebrow> : null}
    {hasDate ? <View style={{ gap: 8 }}>
      <Row icon="calendar-days"><Text style={[rowText, { fontWeight: '800' }]}>{whenText(detail.starts_at)}</Text></Row>
      <Row icon="map-pin">
        <Text style={rowText}>{court?.name ?? 'Quadra a definir'}</Text>
        {court?.provisional ? <Badge tone="warning">Sugestão em revisão</Badge> : null}
        {court ? (court.provisional ? <Text style={small}>vale só para esta partida</Text> : court.address ? <Text style={small}>{court.address}</Text> : null) : null}
      </Row>
    </View> : !closed ? <Text style={{ color: muted, fontSize: 12, lineHeight: 18 }}>
      {waiting
        ? 'Esta partida espera o resultado dos jogos anteriores. O organizador agenda quando os dois lados estiverem definidos.'
        : 'O organizador ainda vai definir data, horário e quadra. Você é avisado quando estiver agendada.'}
    </Text> : null}
    {!closed ? <Note testID="organizer-note">Data, horário e quadra são do organizador. A reserva é com o local; o Arena só registra.</Note> : null}
    {permissions.schedule_match || permissions.decide_result ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {permissions.schedule_match && onSchedule ? <ActionButton grow tone={hasDate ? 'outline' : 'brand'} title={hasDate ? 'Reagendar' : 'Agendar'} disabled={busy} onPress={onSchedule} /> : null}
      {permissions.decide_result && onDecide ? <ActionButton grow tone="brand" title="Decidir resultado" disabled={busy} onPress={onDecide} /> : null}
    </View> : null}
    {error ? <ErrorText>{error}</ErrorText> : null}
  </Shell>
}

export function ConditionsCard(props: ConditionsCardProps) {
  return props.detail.origin === 'campeonato'
    ? <ChampionshipConditions detail={props.detail} busy={props.busy} error={props.error} onSchedule={props.onSchedule} onDecide={props.onDecide} />
    : <FriendlyConditions {...props} />
}

function FriendlyConditions({ detail, busy, error, onPropose, onAccept, onBooking, onSlots, onCancel, onRegisterWalkover, onWithdrawWalkover, onContestWalkover }: ConditionsCardProps) {
  const { permissions, terms, walkover, cancellation } = detail
  const scheduled = detail.state === 'agendada'
  const pending = terms.pending
  const current = terms.current
  const [open, setOpen] = useState(() => detail.state === 'combinando' || Boolean(pending) || Boolean(walkover) || Boolean(cancellation))
  const mine: Side | null = detail.my_side
  const opponent = orderedSides(detail).find(side => side.side !== mine)
  const acts = detail.my_role === 'representante' || detail.my_role === 'atleta'
  const closed = ['cancelada', 'recusada', 'expirada'].includes(detail.state)
  const now = useNow()
  const starts = parseIso(detail.starts_at)
  const started = starts !== null && now >= starts.getTime()
  const showSlots = detail.sport === 'futebol' && detail.origin === 'amistoso' && !closed && !started && (permissions.manage_slots || detail.slots.length > 0)
  const lateToCancel = scheduled && acts && !permissions.cancel && detail.cancel_until !== null && starts !== null && now < starts.getTime()
  const alreadyAccepted = pending !== null && mine !== null && Boolean(mine === 'a' ? pending.accepted_a_at : pending.accepted_b_at)
  const shown = pending ?? current
  const summary = shown ? `${whenText(shown.starts_at)} · ${shown.court.name}` : 'Nenhuma proposta ainda'
  const booked = detail.booking?.state === 'confirmada'
  const guests = guestSlots(detail.slots, mine)

  return <Shell title={scheduled ? 'Partida agendada' : 'Condições da partida'} icon={scheduled ? 'calendar-check' : 'pin'} summary={summary} open={open} onToggle={() => setOpen(old => !old)}>
    {cancellation ? <Cancelled>{`${cancellation.by ? `${cancellation.by.name} cancelou a partida.` : 'A partida foi cancelada.'}${cancellation.reason ? ` Motivo: ${cancellation.reason}` : ''}`}</Cancelled> : null}

    {pending ? <>
      <Eyebrow>{current ? 'Nova proposta' : `Proposta de ${nameOf(detail, pending.proposed_by_side)}`}</Eyebrow>
      <TermsRows detail={detail} terms={pending} booked={null} />
      <View accessibilityLabel="Aceites" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {orderedSides(detail).map(side => <Ack key={side.side} name={sideName(side)} accepted={Boolean(side.side === 'a' ? pending.accepted_a_at : pending.accepted_b_at)} />)}
      </View>
      {current ? <Text style={{ color: muted, fontSize: 11, lineHeight: 16 }}>
        {'Continua valendo: '}<Text style={{ fontWeight: '800' }}>{whenText(current.starts_at)}</Text>{` em ${current.court.name}, até os dois lados aceitarem a nova.`}
      </Text> : null}
    </> : current ? <TermsRows detail={detail} terms={current} booked={detail.booking ? booked : null} />
      : !closed ? <Text style={{ color: muted, fontSize: 12, lineHeight: 18 }}>Os representantes combinam dia, horário e quadra. Quem propõe já aceita; o outro lado aceita ou propõe outra.</Text> : null}

    {permissions.accept_terms && pending ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {permissions.propose_terms ? <ActionButton grow tone="outline" title="Propor outra" disabled={busy} onPress={onPropose} /> : null}
      <ActionButton grow tone="brand" title="Aceitar condições" disabled={busy} busy={busy} onPress={() => onAccept(pending)} />
    </View> : null}
    {!permissions.accept_terms && permissions.propose_terms ? <>
      {alreadyAccepted && opponent ? <Note icon="hourglass">{`Aguardando ${shortName(opponent)} aceitar a proposta.`}</Note> : null}
      <ActionButton block tone="outline" title={pending ? 'Propor outra' : current ? 'Alterar' : 'Propor condições'} disabled={busy} onPress={onPropose} />
    </> : null}
    {!permissions.propose_terms && !closed && mine !== null && ['membro', 'avulso'].includes(detail.my_role)
      ? <Note testID="members-note">{scheduled ? 'Só os representantes alteram a partida.' : 'Só os representantes aceitam. Combinem as condições no chat.'}</Note> : null}

    {permissions.confirm_booking ? <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 4 }}>
      <SwitchRow label={booked ? 'Reserva confirmada' : 'Reserva a confirmar'} accessibilityLabel="Reserva confirmada" hint="Vocês reservam com o local e confirmam aqui" checked={booked} disabled={busy} onChange={onBooking} />
    </View> : null}

    {showSlots ? <View testID="slots-row" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 }}>
      <Icon name="users" size={16} color={colors.brand} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '700' }}>Vagas para avulsos</Text>
        <Text style={small}>{`${slotsSummary(detail)}${guests.length ? ` · seu time: ${guests.map(slot => slot.guest?.name.split(' ')[0]).join(', ')}` : ''}`}</Text>
      </View>
      {permissions.manage_slots ? <ActionButton tone="outline" size="sm" fit title="Ajustar" accessibilityLabel="Ajustar vagas para avulsos" disabled={busy} onPress={onSlots} /> : null}
    </View> : null}

    {/* O estado do W.O. (quem registrou, a contestação, a decisão) aparece no cartão de resultado; aqui ficam só os botões. */}
    {permissions.withdraw_walkover || permissions.contest_walkover ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {permissions.withdraw_walkover ? <ActionButton grow tone="outline" title="Retirar W.O." disabled={busy} onPress={onWithdrawWalkover} /> : null}
      {permissions.contest_walkover ? <ActionButton grow tone="outline" title="Contestar W.O." disabled={busy} onPress={onContestWalkover} /> : null}
    </View> : null}
    {permissions.register_walkover ? <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 }}>
      <Text style={{ color: muted, fontSize: 11, lineHeight: 16 }}>{`${opponent ? `${sideName(opponent)} não compareceu?` : 'O adversário não compareceu?'} Registre o W.O. até ${formatDeadline(detail.result_deadline)}.`}</Text>
      <ActionButton block tone="outline" title="Registrar W.O." disabled={busy} onPress={onRegisterWalkover} />
    </View> : null}

    {permissions.cancel || lateToCancel ? <View style={{ gap: 2, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 6 }}>
      {permissions.cancel ? <>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancelar partida" accessibilityState={{ disabled: busy }} disabled={busy} onPress={onCancel}
          style={{ minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}>
          <Text style={{ color: colors.error, fontSize: 12.5, fontWeight: '700' }}>Cancelar partida</Text>
        </Pressable>
        {scheduled && detail.cancel_until ? <Text style={small}>{`Dá para cancelar até ${whenText(detail.cancel_until)}.`}</Text> : null}
      </> : null}
      {lateToCancel ? <Note>Faltam menos de 24 h: não dá mais para cancelar. Quem não comparecer perde por W.O.</Note> : null}
    </View> : null}

    {error ? <ErrorText>{error}</ErrorText> : null}
  </Shell>
}
