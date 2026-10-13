import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { AdminEvent } from '../../api/admin'
import type { EventPix, EventPoster as EventPosterData } from '../../api/events'
import { entryStates, eventFormatParts, eventNoun, pixKeyType } from '../../data/arena'
import { colors } from '../../theme'
import { formatDeadline, formatPrice, plural } from '../../utils/format'
import { EventPoster } from '../arena/EventPoster'
import { StateBadge } from '../arena/StateBadge'
import { Icon } from '../Icon'
import { Hint } from '../arena/controls'
import { InfoGrid, InfoText } from '../review/ui'

/** Cartaz do evento (o mesmo do O3 e do E2), sem ação; rascunhos sem modalidade não têm cartaz. */
export function AdminPoster({ event }: { event: EventPosterData }) {
  if (!event.sport) return null
  return <View style={{ marginTop: 4 }}>
    <EventPoster name={event.name} sport={event.sport} startsAt={event.starts_at} format={event.format} distanceKm={event.distance_km} eventType={event.competition_type}
      priceCents={event.price_cents ?? 0} acceptedTiers={event.accepted_tiers} state={event.state} phase={event.phase}
      stateLabel={event.revocation_pending ? 'Inscrições suspensas' : undefined}
      entries={event.capacity ? { count: event.entries_count, capacity: event.capacity } : null} />
  </View>
}

/** Dados do evento na folha: organizador, inscrição, datas, local, vagas e contato. */
export function AdminEventInfo({ event }: { event: AdminEvent }) {
  const sport = event.sport
  const unit = sport ? eventNoun[sport].entrants : 'vagas'
  const category = sport ? eventFormatParts({ sport, format: event.format, distanceKm: event.distance_km, eventType: event.competition_type }).join(' · ') : ''
  const place = [event.venue, event.city && `${event.city.name} · ${event.city.state}`].filter(Boolean).join(' — ')
  return <InfoGrid items={[
    ['Organizador', event.organizer.display_name],
    ['Inscrição', formatPrice(event.price_cents)],
    ['Data', formatDeadline(event.starts_at) || '—'],
    ['Inscrições até', formatDeadline(event.registration_deadline) || '—'],
    ['Local', place || '—'],
    ['Vagas', event.capacity ? `${event.capacity} ${unit}` : '—'],
    ['Formato', category || '—'],
    ['Contato', event.contact ?? '—'],
  ]}>
    {event.course_notes ? <InfoText title="Percurso" text={event.course_notes} empty="" /> : null}
  </InfoGrid>
}

/** "Pix informado" pelo organizador, para conferir antes de publicar; o Copia e Cola abre sob demanda. */
export function PixInformed({ pix }: { pix: EventPix | null }) {
  const [code, setCode] = useState(false)
  const kind = pix?.key_type ? pixKeyType[pix.key_type] : null
  const items: [string, string][] = [
    ['Favorecido', pix?.beneficiary ?? '—'],
    [kind ? `Chave (${kind.label})` : 'Chave', pix?.key ?? '—'],
    ['Copia e Cola', pix?.copy_paste ? 'Informado' : 'Não informado'],
    ['Instruções', pix?.instructions ?? '—'],
  ]
  return <View testID="pix-informed" accessibilityLabel="Pix informado" style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 12 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Icon name="landmark" size={16} color={colors.brand} />
      <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }}>Pix informado</Text>
    </View>
    <View style={{ marginTop: 8, gap: 6 }}>
      {items.map(([term, value]) => <View key={term} style={{ flexDirection: 'row', gap: 12 }}>
        <Text style={{ width: 96, color: colors['ink-muted'], fontSize: 12 }}>{term}</Text>
        <Text selectable style={{ flex: 1, minWidth: 0, color: colors.ink, fontSize: 12, fontWeight: '600' }}>{value}</Text>
      </View>)}
    </View>
    {pix?.copy_paste ? <>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: code }} onPress={() => setCode(open => !open)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: colors.brand, fontSize: 12, fontWeight: '700' }}>{code ? 'Ocultar o código Copia e Cola' : 'Ver o código Copia e Cola'}</Text>
      </Pressable>
      {code ? <Text selectable testID="pix-code" style={{ borderRadius: 8, backgroundColor: colors.subtle, padding: 8, color: colors.ink, fontFamily: 'monospace', fontSize: 11 }}>{pix.copy_paste}</Text> : null}
    </> : null}
  </View>
}

/** O que está em jogo na revogação: inscrições por estado e as pendências de comprovantes e devoluções. */
export function AtStake({ event }: { event: AdminEvent }) {
  const states = entryStates.filter(state => (event.entries_by_state[state.value] ?? 0) > 0)
  const { pending } = event
  const pendencies = [
    pending.receipts && plural(pending.receipts, 'comprovante para analisar', 'comprovantes para analisar'),
    pending.refunds_to_send && plural(pending.refunds_to_send, 'devolução para enviar', 'devoluções para enviar'),
    pending.refunds_awaiting && plural(pending.refunds_awaiting, 'devolução aguardando', 'devoluções aguardando'),
    pending.refund_disputes && plural(pending.refund_disputes, 'devolução contestada', 'devoluções contestadas'),
  ].filter(Boolean)
  return <View testID="at-stake" accessibilityLabel="Inscrições" style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 12 }}>
    <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }}>Inscrições</Text>
    {states.length
      ? <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {states.map(state => <StateBadge key={state.value} tone={state.tone}>{`${event.entries_by_state[state.value]} · ${state.label}`}</StateBadge>)}
      </View>
      : <View style={{ marginTop: 4 }}><Hint>Nenhuma inscrição ainda.</Hint></View>}
    {pendencies.length > 0 ? <View style={{ marginTop: 8 }}><Hint>Pendências: {pendencies.join(' · ')}.</Hint></View> : null}
  </View>
}
