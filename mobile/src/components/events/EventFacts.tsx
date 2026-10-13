import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { EventDetail } from '../../api/entries'
import { eventFormatParts, eventNoun, tiers } from '../../data/arena'
import { useThemeColors } from '../../hooks/useTheme'
import { formatDeadline, formatPrice } from '../../utils/format'
import { TierEmblem } from '../arena/TierEmblem'
import { Icon } from '../Icon'
import { placeText, tiersText } from './eventText'
import { Muted, Strong, Term } from './Term'

/** Cartão branco das abas do detalhe. */
export function InfoCard({ children, label }: { children: ReactNode; label?: string }) {
  const colors = useThemeColors()
  return <View accessibilityLabel={label} style={{ gap: 4, borderRadius: 16, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 12 }}>{children}</View>
}

/** Ícone ⓘ ao lado do preço: abre a folha "Pagamento e informações". */
export function PaymentInfoButton({ onPress }: { onPress: () => void }) {
  const colors = useThemeColors()
  return <Pressable accessibilityRole="button" accessibilityLabel="Informações de pagamento" onPress={onPress}
    style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
    <Icon name="info" size={18} color={colors.brand} />
  </Pressable>
}

/** O que conta na faixa de elos, por modalidade (RN18). */
function tierBasis(detail: EventDetail): string {
  if (detail.sport === 'futebol') return 'conta o elo do time no formato'
  if (detail.sport === 'corrida') return detail.distance_km ? `conta o seu elo nos ${detail.distance_km} km` : 'conta o seu elo na distância'
  return 'conta o seu elo no tênis'
}

/**
 * Aba Informações do D2: data e hora, local, formato e tipo, vagas, preço (com o ⓘ nos pagos), elos aceitos,
 * prazo das inscrições e, no tênis, o bônus no ranking (RN16).
 */
export function EventFacts({ detail, onPaymentInfo }: { detail: EventDetail; onPaymentInfo?: () => void }) {
  const sport = detail.sport ?? 'futebol'
  const paid = (detail.price_cents ?? 0) > 0
  const formatParts = eventFormatParts({ sport, format: detail.format, distanceKm: detail.distance_km, eventType: detail.competition_type })
  const accepted = (detail.accepted_tiers ?? []).filter(tier => tier in tiers)
  const noun = eventNoun[sport]
  const deadline = formatDeadline(detail.registration_deadline)
  const bonus = detail.tennis_bonus
  return <InfoCard label="Informações do evento">
    <Term icon="calendar-days">{formatDeadline(detail.starts_at) || 'Data a definir'}</Term>
    <Term icon="map-pin">{placeText(detail) || 'Local a definir'}</Term>
    {formatParts.length > 0 ? <Term icon={sport === 'corrida' ? 'route' : 'fork'}>{formatParts.join(' · ')}</Term> : null}
    {detail.capacity ? <Term icon="users">{detail.entries_count} de {detail.capacity} {noun.entrants}<Muted> · {detail.spots_left === 1 ? '1 vaga' : `${detail.spots_left} vagas`}</Muted></Term> : null}
    <Term icon="ticket" action={paid && onPaymentInfo ? <PaymentInfoButton onPress={onPaymentInfo} /> : undefined}>
      {paid ? <Strong>{formatPrice(detail.price_cents)}</Strong> : 'Gratuito'}
      {paid ? <Muted>{sport === 'futebol' ? ' por time' : ''} · pagamento direto ao organizador</Muted> : null}
    </Term>
    <Term icon={accepted.length ? undefined : 'globe'}
      iconNode={accepted.length ? <View style={{ flexDirection: 'row' }}>{accepted.map((tier, index) => <View key={tier} style={{ marginLeft: index > 0 ? -4 : 0 }}><TierEmblem tier={tier} decorative /></View>)}</View> : undefined}>
      {accepted.length ? `Para ${tiersText(accepted)}` : 'Aberto a todos'}
      {accepted.length > 0 ? <Muted> · {tierBasis(detail)}</Muted> : null}
    </Term>
    <Term icon="hourglass">
      {detail.revocation_pending ? 'Inscrições suspensas enquanto a administração decide sobre o evento'
        : !detail.registration_open ? 'Inscrições encerradas'
          : <>Inscrições até <Strong>{deadline}</Strong>{paid ? <Muted> · pagos fecham 12 h antes do início</Muted> : null}</>}
    </Term>
    {bonus ? <Term icon="medal">
      Bônus no ranking
      <Muted> · campeão +{bonus.champion}, vice +{bonus.runner_up}, 3º e 4º +{bonus.semifinalist} (com {bonus.min_entries} ou mais inscritos{bonus.applies ? '' : '; ainda não vale'})</Muted>
    </Term> : null}
  </InfoCard>
}

/** Cartão do organizador ("Contato"), com o nome público. */
export function OrganizerCard({ name, onContact }: { name: string; onContact?: () => void }) {
  const colors = useThemeColors()
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 12 }}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.tile }}>
      <Icon name="building" size={19} color={colors.brand} />
    </View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '700' }}>{name}</Text>
      <Text style={{ color: colors['ink-muted'], fontSize: 10.5 }}>Organizador</Text>
    </View>
    {onContact ? <Pressable accessibilityRole="button" accessibilityLabel={`Contato de ${name}`} onPress={onContact}
      style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 11, borderWidth: 1.5, borderColor: colors['line-strong'], paddingHorizontal: 12 }}>
      <Text style={{ color: colors.ink, fontSize: 11, fontWeight: '700' }}>Contato</Text>
    </Pressable> : null}
  </View>
}

/** Aviso do pagamento fora do Arena, abaixo das informações dos eventos pagos. */
export function PaymentHint() {
  const colors = useThemeColors()
  return <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 4 }}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ marginTop: 1 }}><Icon name="info" size={15} color={colors['ink-muted']} /></View>
    <Text style={{ flex: 1, color: colors['ink-muted'], fontSize: 10.5, lineHeight: 15 }}>
      Pagamento fora do Arena, direto ao organizador. A inscrição paga reserva a vaga por 48 h ou até 12 h antes do evento, o que vier primeiro.
    </Text>
  </View>
}
