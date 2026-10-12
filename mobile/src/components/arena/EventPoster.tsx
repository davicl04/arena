import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { Sport } from '../../api/client'
import { entryState as entryStates, eventFormatParts, eventNoun, eventPhase as eventPhases, eventState as eventStates, tiers } from '../../data/arena'
import type { EntryState, EventPhase, EventState, EventType, FootballFormat, TierKey } from '../../data/arena'
import { colors } from '../../theme'
import { eventDateParts, formatPrice, plural } from '../../utils/format'
import { Icon } from '../Icon'
import { SportIcon } from './SportIcon'
import { StateBadge } from './StateBadge'
import { TierEmblem } from './TierEmblem'

export interface EventPosterProps {
  name: string
  /** Modalidade; nula só no rascunho ainda sem modalidade (sem linha de formato nem ícone). */
  sport: Sport | null
  /** Início do evento (ISO, UTC); sem data (rascunho), o cartaz mostra "—". */
  startsAt: string | null
  /** Formato do futebol. */
  format?: FootballFormat | null
  /** Distância da prova de corrida, em km. */
  distanceKm?: number | null
  /** Tipo do campeonato (futebol e tênis). */
  eventType?: EventType | null
  /** Valor da inscrição em centavos; 0 é "Gratuito"; nulo (rascunho sem a escolha) é "A definir". */
  priceCents: number | null
  /** Elos aceitos (RN18), como vêm da API; vazio ou nulo é "aberto a todos" (globo). */
  acceptedTiers?: readonly TierKey[] | null
  /** Ocupação: inscrições (confirmadas ou reservadas, como a tela decidir) e vagas. Mostra a barra. */
  entries?: { count: number; capacity: number } | null
  /** Estado do evento no canto (O3, G3 e a prévia do V4). */
  state?: EventState | null
  /** Fase do cartaz (`phase` da API): no lugar do rótulo e do tom de `state` ("Inscrições encerradas"). */
  phase?: EventPhase | null
  /** Texto do selo no lugar do rótulo do estado (ex.: "Vai para aprovação" na prévia do V4). */
  stateLabel?: string
  /** Estado da inscrição de quem vê (E2), no rodapé do cartaz da lista (no detalhe, use o `StatusCard`). */
  entryState?: EntryState | null
  /** Fora da faixa de elos de quem vê (E2): apagado, com cadeado e "Fora da faixa". */
  locked?: boolean
  /** Pendências do organizador (comprovantes, devoluções), no rodapé do cartaz da lista (O3). */
  pendingCount?: number
  /** Ícone da modalidade no rodapé, quando não há selo (O3 e prévia do V4). */
  showSport?: boolean
  /** Organizador, acima do nome na variante `hero` (D2). */
  organizer?: string | null
  /** `card`: cartaz da lista (E2, O3); `hero`: topo do detalhe e da gestão (D2, G3), com os chips. */
  size?: 'card' | 'hero'
  /** Torna o cartaz da lista um botão (abre o detalhe ou a gestão). */
  onPress?: () => void
}

const whiteSoft = 'rgba(255,255,255,0.63)'

function FooterPill({ children, danger = false, label }: { children: ReactNode; danger?: boolean; label?: string }) {
  return <View accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: danger ? 'rgba(255,138,154,0.15)' : 'rgba(255,255,255,0.08)' }}>
    {children}
  </View>
}
const pillText = (danger = false) => ({ color: danger ? '#ffb3bd' : '#ffffff', fontSize: 9.5, fontWeight: '700' as const })

/** Elos aceitos sobrepostos, ou o globo de "aberto a todos" (com o texto para leitores de tela). */
function TierAccess({ keys, hero }: { keys: TierKey[]; hero: boolean }) {
  if (!keys.length) return <View accessibilityLabel="Aberto a todos" accessible><Icon name="globe" size={hero ? 24 : 22} color={colors.mint} /></View>
  const names = keys.map(key => tiers[key].name)
  const text = names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}` : names[0]
  return <View accessible accessibilityLabel={`Para ${text}`} style={{ flexDirection: 'row' }}>
    {keys.map((key, index) => <View key={key} style={{ marginLeft: index > 0 ? (hero ? -8 : -6) : 0 }}><TierEmblem tier={key} size={hero ? 'lg' : 'md'} decorative /></View>)}
  </View>
}

/**
 * Cartaz verde-escuro do evento (E2 do Jogar, O3 do organizador): dia grande e mês, elos aceitos ou globo,
 * nome, formato ou distância e tipo, preço ou "Gratuito", barra de inscrições e selos. Fora da faixa, fica
 * apagado com cadeado. A variante `hero` é o topo do detalhe (D2) e da gestão (G3).
 */
export function EventPoster({ name, sport, startsAt, format, distanceKm, eventType, priceCents, acceptedTiers, entries, state, phase, stateLabel, entryState, locked = false, pendingCount = 0, showSport = false, organizer, size = 'card', onPress }: EventPosterProps) {
  const hero = size === 'hero'
  const date = eventDateParts(startsAt)
  const formatParts = sport ? eventFormatParts({ sport, format, distanceKm, eventType }) : []
  const price = priceCents == null ? 'A definir' : formatPrice(priceCents, { compact: true })
  const tierKeys = (acceptedTiers ?? []).filter(tier => tier in tiers)
  const closed = state === 'encerrado' || state === 'cancelado'
  const stateInfo = phase ? eventPhases[phase] : state ? eventStates[state] : null
  const entryInfo = entryState ? entryStates[entryState] : null
  const unit = sport ? eventNoun[sport].entrants : 'inscritos'
  const stateText = stateInfo ? (stateLabel ?? stateInfo.label) : ''

  const badge: ReactNode = entryInfo ? <FooterPill>{entryState === 'confirmada' ? <Icon name="check" size={12} color="#ffffff" /> : null}<Text style={pillText()}>{entryInfo.short}</Text></FooterPill>
    : locked ? <FooterPill><Icon name="lock" size={12} color="#ffffff" /><Text style={pillText()}>Fora da faixa</Text></FooterPill>
    : pendingCount > 0 ? <FooterPill danger label={plural(pendingCount, 'pendência', 'pendências')}><Icon name="alert" size={12} color="#ffb3bd" /><Text style={pillText(true)}>{pendingCount}</Text></FooterPill>
    : showSport && sport ? <SportIcon sport={sport} size={22} inverted />
    : null

  const spoken = [name, formatParts.join(', '), date ? date.label : 'Sem data definida', price, stateText, entryInfo?.short, locked ? 'Fora da faixa' : '', pendingCount > 0 ? plural(pendingCount, 'pendência', 'pendências') : '']
    .filter(Boolean).join(', ')
  const body = <View style={{ minHeight: hero ? 220 : 196, borderRadius: 18, backgroundColor: colors.forest, padding: hero ? 14 : 12, opacity: locked ? 0.55 : closed ? 0.6 : 1 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
      <View accessible accessibilityLabel={date ? date.label : 'Sem data definida'}>
        <Text style={{ color: '#ffffff', fontSize: hero ? 44 : 34, lineHeight: hero ? 46 : 36, fontWeight: '800' }}>{date?.day ?? '—'}</Text>
        <Text style={{ color: colors.mint, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 }}>{date ? (hero ? `${date.month} · ${date.weekday}` : date.month).toUpperCase() : 'SEM DATA'}</Text>
      </View>
      <View style={{ flexShrink: 1, alignItems: 'flex-end', gap: 6 }}>
        {stateInfo ? <StateBadge surface="dark" tone={stateInfo.tone}>{stateText}</StateBadge> : null}
        <TierAccess keys={tierKeys} hero={hero} />
      </View>
    </View>
    <View style={{ flexGrow: 1, justifyContent: 'flex-end', gap: 3, marginTop: 14 }}>
      {hero && organizer ? <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10.5 }}>{organizer}</Text> : null}
      <Text accessibilityRole="header" style={{ color: '#ffffff', fontSize: hero ? 22 : 14, lineHeight: hero ? 26 : 17, fontWeight: '700' }}>{name}</Text>
      {!hero && formatParts.length ? <Text style={{ color: whiteSoft, fontSize: 10 }}>{formatParts.join(' · ')}</Text> : null}
      {hero ? <View className="mt-2 flex-row flex-wrap gap-1.5">
        {formatParts.map(part => <View key={part} style={{ borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 9, paddingVertical: 4 }}><Text style={{ color: '#ffffff', fontSize: 10.5, fontWeight: '700' }}>{part}</Text></View>)}
        <View style={{ borderRadius: 999, backgroundColor: colors.mint, paddingHorizontal: 9, paddingVertical: 4 }}><Text style={{ color: colors.night, fontSize: 10.5, fontWeight: '700' }}>{price}</Text></View>
      </View> : null}
      {entries && entries.capacity > 0 ? <View style={{ marginTop: hero ? 8 : 6 }}>
        <View style={{ height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.12)' }}>
          <View testID="poster-fill" style={{ height: 5, borderRadius: 3, backgroundColor: colors.mint, width: `${Math.min(100, Math.max(0, (entries.count / entries.capacity) * 100))}%` }} />
        </View>
        <Text style={{ color: whiteSoft, fontSize: 9.5, marginTop: 4 }}>{entries.count} de {entries.capacity} {unit}</Text>
      </View> : null}
      {!hero ? <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <Text style={{ color: colors.mint, fontSize: 12, fontWeight: '800' }}>{price}</Text>
        {badge}
      </View> : null}
    </View>
  </View>
  if (hero) return body
  if (onPress) return <Pressable accessibilityRole="button" accessibilityLabel={spoken} onPress={onPress}>{body}</Pressable>
  return <View accessible accessibilityLabel={spoken}>{body}</View>
}
