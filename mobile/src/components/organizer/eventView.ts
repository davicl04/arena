import type { Sport } from '../../api/client'
import type { EventPoster as EventPosterData, OrganizerEventDetail } from '../../api/events'
import { eventNoun, eventRefusalReason } from '../../data/arena'
import type { EventRefusalReason } from '../../data/arena'
import type { EventPosterProps } from '../arena/EventPoster'

/*
 * Ponte entre as formas da API (contrato 0003, seções 13 e 14) e os componentes do organizador (porta de
 * `web/src/components/organizer/eventView.ts`): as props do cartaz, os nomes por modalidade e os textos do motivo de
 * recusa.
 */

/** Estados sem barra de inscrições no cartaz: antes de publicar e no cancelado (as vagas foram liberadas). */
const NO_ENTRIES_BAR = ['rascunho', 'em_aprovacao', 'cancelado']

/** Props do `EventPoster` a partir do cartaz da API (O3, Menu e topo da gestão). */
export function posterProps(event: EventPosterData): Omit<EventPosterProps, 'size' | 'onPress'> {
  const showEntries = !NO_ENTRIES_BAR.includes(event.state) && event.capacity
  return {
    name: event.name,
    sport: event.sport,
    startsAt: event.starts_at,
    format: event.format,
    distanceKm: event.distance_km,
    eventType: event.competition_type,
    priceCents: event.price_cents,
    acceptedTiers: event.accepted_tiers,
    entries: showEntries ? { count: event.entries_count, capacity: event.capacity ?? 0 } : null,
    state: event.state,
    phase: event.phase,
    stateLabel: event.revocation_pending ? 'Inscrições suspensas' : undefined,
  }
}

/**
 * Alerta do cartaz (O3 e Menu): as pendências de comprovantes e devoluções somadas, no campeonato, aos jogos para agendar e
 * para decidir (`championship.attention`).
 */
export const alertCount = (event: { pending: { total: number }; championship?: { attention: number } | null }) =>
  event.pending.total + (event.championship?.attention ?? 0)

/** "Times inscritos" no futebol e "Inscritos" no tênis e na corrida. */
export const entriesTitle = (sport: Sport | null) => (sport === 'futebol' ? 'Times inscritos' : 'Inscritos')
/** Unidade das vagas: "times", "atletas", "corredores" (ou "vagas" sem modalidade). */
export const entrantsUnit = (sport: Sport | null) => (sport ? eventNoun[sport].entrants : 'vagas')

/** Motivo da recusa da administração: rótulo e, com detalhe, "rótulo · detalhe" (em "Outro", só o detalhe). */
export function eventRefusalText(code: EventRefusalReason, detail: string | null): string {
  const label = eventRefusalReason[code]?.label ?? 'Motivo não informado'
  const extra = detail?.trim()
  if (code === 'outro' && extra) return extra
  return extra ? `${label} · ${extra}` : label
}

/** Inscrições pagas que viram "Devolução pendente" no cancelamento (confirmadas e em análise). */
export function refundsOnCancel(detail: OrganizerEventDetail): number {
  if (!detail.price_cents) return 0
  return (detail.entries_by_state.confirmada ?? 0) + (detail.entries_by_state.em_analise ?? 0)
}

/** Inscrições ativas que viram "Cancelada" no cancelamento (reservas e recusadas no prazo; e as gratuitas). */
export function cancelledOnCancel(detail: OrganizerEventDetail): number {
  const states = detail.entries_by_state
  const holding = (states.reservada ?? 0) + (states.rejeitada ?? 0)
  return detail.price_cents ? holding : holding + (states.confirmada ?? 0) + (states.em_analise ?? 0)
}
