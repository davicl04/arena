import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import type { Proposal, SlotOffer } from '../../api/matchmaking'
import { sideName } from '../../data/match'
import { colors } from '../../theme'
import { eventDateParts, formatClock, parseIso } from '../../utils/format'
import { ActionButton } from '../arena/controls'
import { StateBadge } from '../arena/StateBadge'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'
import { Countdown } from './Countdown'
import { positionLabel } from './matchView'
import { SideBadge } from './SideBadge'

/** Cartão de estado sobre a placa (`.st.dk`): vidro claro sobre o verde, com contorno fino. */
function PlateCard({ testID, icon, title, expires, onElapsed, children }: {
  testID: string
  icon: IconName
  title: string
  expires: string
  onElapsed: () => void
  children: ReactNode
}) {
  return <View testID={testID} style={{ alignSelf: 'stretch', gap: 12, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', padding: 16, backgroundColor: 'rgba(255,255,255,0.06)' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Icon name={icon} size={17} color={colors.mint} />
      <Text accessibilityRole="header" style={{ flex: 1, color: '#ffffff', fontSize: 14, fontWeight: '700' }}>{title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: 'rgba(246,194,107,0.13)' }}>
        <Icon name="timer" size={13} color={colors.amber} />
        <Countdown until={expires} onElapsed={onElapsed} style={{ color: colors.amber, fontSize: 10.5, fontWeight: '700' }} />
      </View>
    </View>
    {children}
  </View>
}

/**
 * Cartão da proposta sobre a placa: os dois lados, a contagem regressiva e o caminho para a folha (P2). A resposta mora na
 * folha; aqui só se abre. Quem já aceitou lê "Você aceitou" e quem espera.
 */
export function ProposalCard({ proposal, onOpen, onElapsed }: { proposal: Proposal; onOpen: () => void; onElapsed: () => void }) {
  const mine = proposal.sides.find(side => side.side === proposal.my_side)
  const other = proposal.sides.find(side => side.side !== proposal.my_side)
  const accepted = Boolean(mine?.accepted_at)
  const against = sideName(other)
  return <PlateCard testID="proposal-card" icon="swords" title="Adversário encontrado" expires={proposal.expires_at} onElapsed={onElapsed}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
      <View style={{ flex: 1 }}><SideBadge side={mine} size="md" /></View>
      <Text accessibilityElementsHidden importantForAccessibility="no" style={{ alignSelf: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '800' }}>VS</Text>
      <View style={{ flex: 1 }}><SideBadge side={other} size="md" /></View>
    </View>
    {accepted
      ? <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <StateBadge surface="dark" tone="open">Você aceitou</StateBadge>
        <StateBadge surface="dark" tone="draft">{`Aguardando ${against}`}</StateBadge>
      </View>
      : <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, lineHeight: 17 }}>
        {proposal.can_respond
          ? 'Os dois lados precisam aceitar em até 2 h. A proposta expira se ninguém responder.'
          : proposal.sport === 'tenis' ? 'Só o atleta aceita a proposta.' : 'Só os representantes aceitam.'}
      </Text>}
    <ActionButton block tone="mint" title={proposal.can_respond ? 'Responder à proposta' : 'Ver proposta'} accessibilityHint={`Proposta contra ${against}`} onPress={onOpen} />
  </PlateCard>
}

/** Cartão da oferta de vaga ao avulso: a partida, a posição e o prazo; "Ver vaga" abre a folha. */
export function SlotOfferCard({ offer, onOpen, onElapsed }: { offer: SlotOffer; onOpen: () => void; onElapsed: () => void }) {
  const { match } = offer
  const opening = match.sides.find(side => side.side === offer.side)
  const against = match.sides.find(side => side.side !== offer.side)
  const date = eventDateParts(match.starts_at)
  const start = parseIso(match.starts_at)
  const position = positionLabel(offer.position).toLocaleLowerCase('pt-BR')
  return <PlateCard testID="slot-offer-card" icon="user-plus" title="Vaga encontrada" expires={offer.expires_at} onElapsed={onElapsed}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {date ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 54, alignItems: 'center', borderRadius: 12, paddingVertical: 7, backgroundColor: 'rgba(255,255,255,0.1)' }}>
        <Text style={{ color: colors.mint, fontSize: 9, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>{date.weekday}</Text>
        <Text style={{ color: '#ffffff', fontSize: 20, lineHeight: 22, fontWeight: '800' }}>{date.day}</Text>
        <Text style={{ color: colors.mint, fontSize: 9, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>{date.month}</Text>
      </View> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>{sideName(opening)} × {sideName(against)}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11.5 }}>{start ? formatClock(start) : 'Horário a definir'}{match.court ? ` · ${match.court.name}` : ''}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11.5 }}>Você joga como {position} convidado, só nesta partida</Text>
      </View>
    </View>
    <ActionButton block tone="mint" title="Ver vaga" accessibilityHint={`Vaga de ${position} no ${sideName(opening)}`} onPress={onOpen} />
  </PlateCard>
}
