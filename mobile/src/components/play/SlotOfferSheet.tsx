import { Text, View } from 'react-native'
import { acceptSlotOffer, declineSlotOffer } from '../../api/matchmaking'
import type { SlotOffer } from '../../api/matchmaking'
import { footballFormat } from '../../data/arena'
import { sideName } from '../../data/match'
import { useSubmit } from '../../hooks/useSubmit'
import { colors } from '../../theme'
import { eventDateParts, formatClock, parseIso } from '../../utils/format'
import { ActionButton, Notice, TextAction } from '../arena/controls'
import { Icon } from '../Icon'
import { ActionSheet } from '../arena/ActionSheet'
import { Countdown } from './Countdown'
import { positionLabel } from './matchView'
import { SideBadge } from './SideBadge'

/**
 * Oferta de vaga ao avulso (contrato 0002, 11.2) numa folha `forest`: a partida (data, quadra, formato e os dois times), a
 * posição da vaga e as 2 h para responder. "Quero jogar" preenche a vaga e leva à partida; "Agora não" recusa (a vaga vai
 * ao próximo avulso e a busca termina); fechar a folha responde depois, e a oferta continua na placa até o prazo.
 */
export function SlotOfferSheet({ offer, onLater, onAccepted, onDeclined, onElapsed, onExpired }: {
  offer: SlotOffer
  onLater: () => void
  /** Vaga preenchida: `matchId` abre a partida. */
  onAccepted: (matchId: number) => void
  onDeclined: () => void
  onElapsed: () => void
  onExpired: () => void
}) {
  const { busy, error, run } = useSubmit(onExpired)
  const { match } = offer
  const opening = match.sides.find(side => side.side === offer.side)
  const against = match.sides.find(side => side.side !== offer.side)
  const start = parseIso(match.starts_at)
  const date = eventDateParts(match.starts_at)
  const format = match.format ? footballFormat[match.format]?.label : null
  const position = positionLabel(offer.position).toLocaleLowerCase('pt-BR')

  async function accept() {
    const accepted = await run(() => acceptSlotOffer(offer.slot_id), 'Não foi possível aceitar a vaga.')
    if (accepted) onAccepted(accepted.id)
  }
  async function decline() {
    const done = await run(async () => { await declineSlotOffer(offer.slot_id); return true }, 'Não foi possível recusar a vaga.')
    if (done) onDeclined()
  }

  return <ActionSheet title={`Vaga encontrada${format ? ` · ${format}` : ''}`} dark locked={busy} onClose={onLater}>
    <Text accessibilityRole="header" style={{ color: '#ffffff', fontSize: 22, lineHeight: 28, fontWeight: '800', textAlign: 'center' }}>Vaga de {position}</Text>
    <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <View style={{ flex: 1 }}><SideBadge side={opening} size="xl" /></View>
      <Text accessibilityElementsHidden importantForAccessibility="no" style={{ alignSelf: 'center', color: colors.mint, fontSize: 22, fontWeight: '800' }}>×</Text>
      <View style={{ flex: 1 }}><SideBadge side={against} size="xl" /></View>
    </View>
    <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 12, backgroundColor: 'rgba(255,255,255,0.08)' }}>
      {date ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 54, alignItems: 'center', borderRadius: 12, paddingVertical: 7, backgroundColor: 'rgba(255,255,255,0.1)' }}>
        <Text style={{ color: colors.mint, fontSize: 9, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>{date.weekday}</Text>
        <Text style={{ color: '#ffffff', fontSize: 20, lineHeight: 22, fontWeight: '800' }}>{date.day}</Text>
        <Text style={{ color: colors.mint, fontSize: 9, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>{date.month}</Text>
      </View> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="calendar-days" size={15} color={colors.mint} />
          <Text style={{ flex: 1, color: '#ffffff', fontSize: 13, fontWeight: '700' }}>{date ? `${date.label}${start ? ` · ${formatClock(start)}` : ''}` : 'Data a definir'}</Text>
        </View>
        {match.court ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="map-pin" size={14} color={colors.mint} />
          <Text style={{ flex: 1, color: 'rgba(255,255,255,0.8)', fontSize: 11.5 }}>{match.court.name}</Text>
        </View> : null}
        <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11.5, lineHeight: 18 }}>
          {sideName(opening)} abriu esta vaga. Você joga como {position} convidado, só nesta partida.
        </Text>
      </View>
    </View>
    <View style={{ marginTop: 16, alignItems: 'center', gap: 2 }}>
      <Countdown until={offer.expires_at} onElapsed={onElapsed} style={{ color: colors.mint, fontSize: 26, fontWeight: '800' }} />
      <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10.5 }}>para responder</Text>
    </View>
    <View style={{ marginTop: 14, gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <ActionButton grow tone="line" title="Agora não" disabled={busy} onPress={() => void decline()} />
        <ActionButton grow tone="mint" title="Quero jogar" disabled={busy} onPress={() => void accept()} />
      </View>
      {error ? <Notice surface="dark">{error}</Notice> : null}
      <View style={{ alignItems: 'center' }}><TextAction surface="dark" title="Responder depois" disabled={busy} onPress={onLater} /></View>
    </View>
  </ActionSheet>
}
