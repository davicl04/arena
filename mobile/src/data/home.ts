import { sports } from '../api/client'
import type { City, Profile, Sport } from '../api/client'
import type { EventCard } from '../api/entries'
import type { MatchCard, MatchSideOut } from '../api/matches'
import type { ModalityStanding } from '../components/arena/modalityStanding'
import { formatDuration } from '../components/play/tierLines'
import { formatDeadline, formatPrice } from '../utils/format'
import { eventNoun, tiers } from './arena'
import type { RunDistance, TierKey } from './arena'
import { orderedSides, sideName } from './match'

/*
 * Regras e textos do Início (spec "Nova tela de Início"): a Contagem do Placar, o rótulo dos lados ("Você"), o texto do
 * Placar vazio, o rótulo do botão principal, os textos do Destaque (urgência e link para as demais pendências), a situação, a
 * métrica e o nome acessível de cada pílula de "Seu elo", o cartão "Complete seu perfil esportivo" e os Campeonatos (união,
 * título, estado vazio, "Ver todos", linha e etiquetas). A web aplica as mesmas regras e os mesmos textos.
 */

const MINUTE = 60_000
const HOUR_MINUTES = 60
const DAY_MINUTES = 24 * HOUR_MINUTES

/** Um número da Contagem com a unidade ("3" e "dias"). */
export interface CountdownPart {
  value: number
  unit: string
}

/**
 * Contagem até a partida, em minutos inteiros (arredondados para baixo):
 * - a partir de 24 h, "{d} dia(s) {h} h", com "1 dia" no singular e as horas sempre presentes, inclusive "0 h";
 * - de 1 h a 24 h, "{h} h {m} min";
 * - abaixo de 1 h, "{m} min", no mínimo "1 min" (a partida que já começou não é mais a próxima).
 */
export function countdownParts(ms: number): CountdownPart[] {
  const minutes = Math.max(1, Math.floor((Number.isFinite(ms) ? ms : 0) / MINUTE))
  if (minutes >= DAY_MINUTES) {
    const days = Math.floor(minutes / DAY_MINUTES)
    return [{ value: days, unit: days === 1 ? 'dia' : 'dias' }, { value: Math.floor((minutes % DAY_MINUTES) / HOUR_MINUTES), unit: 'h' }]
  }
  if (minutes >= HOUR_MINUTES) return [{ value: Math.floor(minutes / HOUR_MINUTES), unit: 'h' }, { value: minutes % HOUR_MINUTES, unit: 'min' }]
  return [{ value: minutes, unit: 'min' }]
}

/** A Contagem em texto: "3 dias 4 h", "5 h 20 min" ou "40 min". */
export const countdownText = (ms: number): string => countdownParts(ms).map(part => `${part.value} ${part.unit}`).join(' ')

/** Nome do lado no Placar: em partida individual (lado de atleta), o lado do titular (`my_side`) é "Você". */
export function sideLabel(card: Pick<MatchCard, 'my_side'>, side: MatchSideOut | undefined): string {
  if (side && side.kind === 'atleta' && side.side === card.my_side) return 'Você'
  return sideName(side)
}

/** Linha do confronto, com o lado do titular primeiro: "Ferrugem FC × Leões do Cerrado" ou "Você × Rafael Lima". */
export function matchupLabel(card: Pick<MatchCard, 'sides' | 'my_side'>): string {
  const [first, second] = orderedSides(card)
  return `${sideLabel(card, first)} × ${second ? sideLabel(card, second) : 'adversário a definir'}`
}

/** Texto do Placar sem partida agendada: o convite muda para quem ainda não tem nenhum perfil esportivo. */
export const emptyPlacarText = (hasProfiles: boolean): string =>
  hasProfiles ? 'Que tal marcar a próxima?' : 'Prepare seus perfis esportivos e encontre a primeira.'

/** Rótulo do botão principal do Início, que sempre abre o Jogar. */
export function primaryButtonLabel({ hasProfiles, hasNextMatch }: { hasProfiles: boolean; hasNextMatch: boolean }): string {
  if (!hasProfiles) return 'Preparar perfis'
  return hasNextMatch ? 'Encontrar outra partida' : 'Encontrar partida'
}

/** Etiqueta do Destaque: "Mais urgente" quando o prazo está no fim (o critério `warn` de `pendingDeadline`), senão "Aguardando você". */
export const urgencyLabel = (warn: boolean): string => (warn ? 'Mais urgente' : 'Aguardando você')

/**
 * Link abaixo do Destaque, a partir do total de pendências (`pending_count`): "+ 1 pendência · ver todas" ou
 * "+ {n−1} pendências · ver todas". Com 1 pendência (ou nenhuma), não há link: `null`.
 */
export function morePendingLabel(total: number): string | null {
  const rest = total - 1
  if (!(rest >= 1)) return null
  return `+ ${rest} ${rest === 1 ? 'pendência' : 'pendências'} · ver todas`
}

/**
 * Situação de uma pílula de "Seu elo", na ordem de decisão de `pillStatus`:
 * - `no-profile`: a lista de perfis esportivos confirmou que não há perfil na modalidade ("Sem perfil" e "Configurar");
 * - `loading`: a classificação (ou a lista de perfis) ainda está sendo lida;
 * - `unavailable`: a leitura de `GET /me/standings` falhou ("Classificação indisponível");
 * - `tier`: classificação completa, com o elo (`modalityStanding`), a métrica da linha que dá o elo e, na corrida, a distância;
 * - `no-mark`: corrida sem marca ("Sem marca" e "Sem classificação");
 * - `placement`: em classificação ("{n} de {3}" e "Sem classificação"). Nunca há elo nesse caso.
 */
export type PillStatus =
  | { kind: 'no-profile' }
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'tier'; tier: TierKey; metric: ModalityStanding['metric']; distanceKm: RunDistance | null }
  | { kind: 'no-mark' }
  | { kind: 'placement'; played: number; required: number }

/**
 * Situação da pílula da modalidade. `standing` é o resultado de `modalityStanding` (ou `null` sem a classificação lida);
 * `hasProfile` é `false` só quando a lista de perfis foi lida e não tem a modalidade (`null` enquanto carrega ou se falhou:
 * a pílula segue a classificação). `loading` cobre a leitura da classificação e a dos perfis.
 */
export function pillStatus(sport: Sport, { standing, loading, hasProfile }: { standing: ModalityStanding | null; loading: boolean; hasProfile: boolean | null }): PillStatus {
  if (hasProfile === false) return { kind: 'no-profile' }
  if (loading) return { kind: 'loading' }
  if (!standing) return { kind: 'unavailable' }
  if (standing.tier) return { kind: 'tier', tier: standing.tier, metric: standing.metric, distanceKm: standing.distanceKm }
  if (sport === 'corrida') return { kind: 'no-mark' }
  return { kind: 'placement', played: standing.played, required: standing.required }
}

const decimal = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

/**
 * Métrica da pílula com elo: "{n} pts" (pontos de time e tênis), "{n} média" (média por partida do individual) ou, na corrida,
 * "{tempo} · {distância} km" na distância de maior elo. Sem o valor da métrica, a corrida mostra só a distância; as demais, nada.
 */
export function pillMetric(metric: ModalityStanding['metric'], distanceKm: RunDistance | null = null): string | null {
  if (metric?.unit === 'tempo') return distanceKm ? `${formatDuration(metric.value)} · ${distanceKm} km` : formatDuration(metric.value)
  if (metric) return `${decimal(metric.value)} ${metric.unit === 'média' ? 'média' : 'pts'}`
  return distanceKm ? `${distanceKm} km` : null
}

/**
 * Textos da pílula sem elo: a situação e a linha de baixo ("2 de 3" e "Sem classificação", "Sem marca" e "Sem classificação",
 * "Sem perfil" e "Configurar", "Classificação indisponível"). Com elo ou carregando, `null`: a pílula mostra o emblema ou o
 * carregamento.
 */
export function pillTexts(status: PillStatus): { status: string; detail: string | null } | null {
  switch (status.kind) {
    case 'no-profile': return { status: 'Sem perfil', detail: 'Configurar' }
    case 'unavailable': return { status: 'Classificação indisponível', detail: null }
    case 'no-mark': return { status: 'Sem marca', detail: 'Sem classificação' }
    case 'placement': return { status: `${status.played} de ${status.required}`, detail: 'Sem classificação' }
    default: return null
  }
}

/**
 * Nome acessível da pílula: a modalidade e o elo com a métrica por extenso ("Futebol: elo Ouro, 38 pontos", "Corrida: elo
 * Diamante, 1:45:30 nos 21 km") ou a situação ("Tênis: sem classificação, 2 de 3 partidas", "Futebol: sem perfil, configurar").
 */
export function pillAccessibilityLabel(sportLabel: string, status: PillStatus): string {
  switch (status.kind) {
    case 'tier': {
      const { metric, distanceKm } = status
      const spoken = metric?.unit === 'tempo' ? `${formatDuration(metric.value)}${distanceKm ? ` nos ${distanceKm} km` : ''}`
        : metric ? `${decimal(metric.value)} ${metric.unit === 'média' ? 'de média' : 'pontos'}`
          : distanceKm ? `nos ${distanceKm} km` : ''
      return `${sportLabel}: elo ${tiers[status.tier]?.name ?? status.tier}${spoken ? `, ${spoken}` : ''}`
    }
    case 'placement': return `${sportLabel}: sem classificação, ${status.played} de ${status.required} ${status.required === 1 ? 'partida' : 'partidas'}`
    case 'no-mark': return `${sportLabel}: sem marca, sem classificação`
    case 'no-profile': return `${sportLabel}: sem perfil, configurar`
    case 'loading': return `${sportLabel}: carregando classificação`
    case 'unavailable': return `${sportLabel}: classificação indisponível`
  }
}

/** Quantas das três modalidades ainda não têm perfil esportivo: o cartão "Complete seu perfil esportivo" aparece enquanto houver alguma. */
export const missingSportsCount = (profiles: readonly Pick<Profile, 'sport'>[]): number =>
  sports.filter(sport => !profiles.some(profile => profile.sport === sport.value)).length

/** Quantos campeonatos o Início pede a cada perfil e quantos mostra depois da união. */
export const CHAMPIONSHIPS_LIMIT = 2

const startsAtTime = (iso: string | null): number => {
  const time = iso ? Date.parse(iso) : Number.NaN
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time
}

/**
 * União dos campeonatos lidos por perfil: sem duplicatas por `id` (fica a primeira ocorrência), ordenados por `starts_at`
 * crescente (sem data por último; empate pelo `id`) e cortados nos `limit` primeiros (2).
 */
export function mergeChampionships<T extends Pick<EventCard, 'id' | 'starts_at'>>(lists: readonly (readonly T[])[], limit: number = CHAMPIONSHIPS_LIMIT): T[] {
  const byId = new Map<number, T>()
  for (const list of lists) for (const card of list) if (!byId.has(card.id)) byId.set(card.id, card)
  return [...byId.values()].sort((a, b) => startsAtTime(a.starts_at) - startsAtTime(b.starts_at) || a.id - b.id).slice(0, limit)
}

/** A cidade comum a todos os perfis (pelo `id`), ou `null` quando as cidades diferem ou não há perfis. */
function sharedCity(profiles: readonly Pick<Profile, 'city'>[]): City | null {
  const first = profiles[0]?.city
  return first && profiles.every(profile => profile.city?.id === first.id) ? first : null
}

/**
 * Título dos Campeonatos: "Campeonatos em {cidade}" quando todos os perfis têm a mesma cidade, "Campeonatos perto de você"
 * quando as cidades diferem e "Perto de você" sem perfis. `null` (perfis carregando ou com falha) não conta como "sem
 * perfis": fica "Campeonatos perto de você".
 */
export function championshipsTitle(profiles: readonly Pick<Profile, 'city'>[] | null): string {
  if (profiles && profiles.length === 0) return 'Perto de você'
  const city = profiles ? sharedCity(profiles) : null
  return city ? `Campeonatos em ${city.name}` : 'Campeonatos perto de você'
}

/** Texto dos Campeonatos sem nenhum campeonato: "Nenhum campeonato aberto em {cidade}" ou "Nenhum campeonato aberto perto de você". */
export function emptyChampionshipsText(profiles: readonly Pick<Profile, 'city'>[]): string {
  const city = sharedCity(profiles)
  return city ? `Nenhum campeonato aberto em ${city.name}` : 'Nenhum campeonato aberto perto de você'
}

/**
 * Modalidade em que "Ver todos" abre a lista de campeonatos: a do primeiro campeonato exibido ou, sem campeonatos (ou sem a
 * modalidade nele), a do primeiro perfil. Sem perfis, `null`.
 */
export function championshipsSport(shown: readonly Pick<EventCard, 'sport'>[], profiles: readonly Pick<Profile, 'sport'>[]): Sport | null {
  return shown[0]?.sport ?? profiles[0]?.sport ?? null
}

/** Linha de baixo do campeonato: "{data e hora} · {local}" ("sáb, 6 dez · 08:00 · Arena Asa Norte"); sem local, a cidade. */
export function championshipMeta(card: Pick<EventCard, 'starts_at' | 'venue' | 'city'>, now: Date = new Date()): string {
  const when = formatDeadline(card.starts_at, now) || 'Data a definir'
  const where = card.venue?.trim() || card.city?.name || ''
  return where ? `${when} · ${where}` : when
}

/** Etiqueta da linha do campeonato, na ordem de exibição. */
export interface ChampionshipTag {
  kind: 'ongoing' | 'price' | 'spots' | 'eligible'
  label: string
}

/**
 * Etiquetas do campeonato, na ordem:
 * - "Em andamento", quando o evento já começou (`state = em_andamento`: a lista também traz eventos em andamento);
 * - o preço no formato dos cartazes ("R$ 40", "R$ 42,50") ou "Gratuita";
 * - as vagas no formato dos cartazes ("8 de 16 times") ou "Vagas esgotadas"; sem limite de vagas, nenhuma;
 * - "Você pode se inscrever", com `eligibility.eligible`, exceto no evento em andamento, que não recebe mais inscrições.
 */
export function championshipTags(card: Pick<EventCard, 'state' | 'price_cents' | 'capacity' | 'entries_count' | 'sport' | 'eligibility'>): ChampionshipTag[] {
  const ongoing = card.state === 'em_andamento'
  const tags: ChampionshipTag[] = ongoing ? [{ kind: 'ongoing', label: 'Em andamento' }] : []
  tags.push({ kind: 'price', label: formatPrice(card.price_cents, { compact: true, free: 'Gratuita' }) })
  if (card.capacity && card.capacity > 0) {
    const unit = card.sport ? eventNoun[card.sport].entrants : 'inscritos'
    tags.push({ kind: 'spots', label: card.entries_count >= card.capacity ? 'Vagas esgotadas' : `${card.entries_count} de ${card.capacity} ${unit}` })
  }
  if (card.eligibility?.eligible && !ongoing) tags.push({ kind: 'eligible', label: 'Você pode se inscrever' })
  return tags
}
