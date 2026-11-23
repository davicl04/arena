import { ChevronRight, MapPin, Trophy } from 'lucide-react'
import type { Profile, Sport } from '@/api/client'
import type { EventCard } from '@/api/entries'
import SportIcon from '@/components/SportIcon'
import { StateBadge } from '@/components/events/StateBadge'
import { Button } from '@/components/ui/button'
import { IconTile } from '@/components/ui/icon-tile'
import { LoadError } from '@/components/ui/load-error'
import { SectionTitle } from '@/components/ui/section-title'
import { championshipMeta, championshipTags, championshipsTitle, emptyChampionshipsText } from '@/data/home'
import type { ChampionshipTag } from '@/data/home'
import { cn } from '@/lib/utils'

/**
 * Situação da seção: carregando (perfis ou campeonatos), perfis com falha (o shell mostra o erro e a nova tentativa), falha
 * dos campeonatos (com a nova tentativa), sem perfis ou com a lista unida.
 */
export type CampeonatosState =
  | { kind: 'loading' }
  | { kind: 'profiles-failed' }
  | { kind: 'error'; message: string; cause: unknown; onRetry: () => void }
  | { kind: 'no-profiles' }
  | { kind: 'ready'; shown: EventCard[] }

/** Cores das etiquetas claras pelos tokens do tema: preço como o quadro de ícone, vagas neutras e elegibilidade verde. */
const tagLook: Record<Exclude<ChampionshipTag['kind'], 'ongoing'>, string> = {
  price: 'bg-icon-tile text-icon-tile-ink',
  spots: 'bg-subtle text-ink-muted',
  eligible: 'bg-success-bg text-brand',
}

function Tag({ tag }: { tag: ChampionshipTag }) {
  if (tag.kind === 'ongoing') return <StateBadge tone="live">{tag.label}</StateBadge>
  return <span data-slot="championship-tag" data-kind={tag.kind}
    className={cn('inline-flex max-w-full items-center truncate rounded-full px-2 py-[3px] text-[10px] leading-tight font-semibold whitespace-nowrap', tagLook[tag.kind])}>
    {tag.label}
  </span>
}

const card = 'rounded-card border border-solid border-line bg-surface shadow-card noite:border-surface-edge'

/** Uma linha de campeonato: ícone da modalidade, nome, "{data e hora} · {local}" e as etiquetas; o toque abre o campeonato. */
function ChampionshipRow({ event, divider, onOpen }: { event: EventCard; divider: boolean; onOpen: (event: EventCard) => void }) {
  const meta = championshipMeta(event)
  const tags = championshipTags(event)
  return <li className={cn('min-w-0', divider && 'border-t border-solid border-line')}>
    <button type="button" data-slot="championship" data-event-id={event.id}
      aria-label={[event.name, meta, ...tags.map(tag => tag.label)].join(', ')}
      onClick={() => onOpen(event)}
      className="flex w-full cursor-pointer items-start gap-3 p-3.5 text-left">
      <IconTile aria-hidden="true" className="size-10 flex-none">
        {event.sport ? <SportIcon sport={event.sport} size={26} /> : <Trophy size={20} />}
      </IconTile>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[13px] text-heading">{event.name}</b>
        <small className="mt-0.5 truncate text-[11px] text-ink-muted">{meta}</small>
        <span className="mt-[7px] flex flex-wrap gap-[5px]">
          {tags.map(tag => <Tag key={tag.kind} tag={tag} />)}
        </span>
      </span>
      <ChevronRight size={16} aria-hidden="true" className="flex-none self-center text-ink-muted" />
    </button>
  </li>
}

/**
 * Campeonatos do Início: o título pela cidade dos perfis esportivos ("Campeonatos em {cidade}", "Campeonatos perto de você"
 * ou "Perto de você"), "Ver todos" com perfis (abre a lista na modalidade de `allSport`) e, conforme `state`, o carregamento,
 * o erro só desta seção com "Tentar novamente", o convite "Configure suas modalidades" sem perfis, o estado vazio com "Ver
 * campeonatos" ou os campeonatos reais (os 2 primeiros da união das leituras por perfil). Cartões claros em `surface`.
 * O Início do Expo tem a mesma seção, com os mesmos textos e regras.
 */
export function Campeonatos({ state, profiles, allSport, onOpenEvent, onOpenEvents, onOpenModalities }: {
  state: CampeonatosState
  /** Perfis esportivos lidos; `null` enquanto carregam ou se a leitura falhou. */
  profiles: readonly Profile[] | null
  /** Modalidade de "Ver todos" e "Ver campeonatos" (`championshipsSport`); `null` sem perfis, e então não há "Ver todos". */
  allSport: Sport | null
  onOpenEvent: (event: EventCard) => void
  onOpenEvents: (sport: Sport) => void
  onOpenModalities: () => void
}) {
  return <section aria-labelledby="campeonatos-title" data-slot="campeonatos">
    <SectionTitle
      title={<span id="campeonatos-title" className="block truncate">{championshipsTitle(profiles)}</span>}
      className="[&>h2]:min-w-0"
      action={allSport ? <Button variant="link" className="flex-none" aria-label="Ver todos os campeonatos" onClick={() => onOpenEvents(allSport)}>Ver todos</Button> : undefined}
    />
    {state.kind === 'loading' ? <p role="status" className="text-[12px] text-ink-muted">Carregando campeonatos…</p>
      : state.kind === 'profiles-failed' ? <p className="text-[12px] text-ink-muted">Os campeonatos aparecem quando seus perfis esportivos carregarem.</p>
        : state.kind === 'error' ? <div className={card}>
          <LoadError size="section" title="Não foi possível carregar os campeonatos" text={state.message} cause={state.cause} onRetry={state.onRetry} />
        </div>
          : state.kind === 'no-profiles' ? <button type="button" data-slot="campeonatos-sem-perfis" onClick={onOpenModalities}
            className={cn(card, 'flex w-full cursor-pointer items-center gap-3 p-3.5 text-left')}>
            <IconTile aria-hidden="true" className="size-10 flex-none">
              <MapPin size={20} />
            </IconTile>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[13px] text-heading">Configure suas modalidades</b>
              <small className="mt-0.5 text-[11px] text-ink-muted">Para ver campeonatos perto de você</small>
            </span>
            <ChevronRight size={18} aria-hidden="true" className="flex-none text-ink-muted" />
          </button>
            : state.shown.length === 0 ? <div data-slot="campeonatos-vazio" className={cn(card, 'grid justify-items-center px-4 py-[18px] text-center')}>
              <Trophy size={24} aria-hidden="true" className="text-ink-muted" />
              <b className="mt-2 text-[13px] text-heading">{emptyChampionshipsText(profiles ?? [])}</b>
              {allSport && <Button variant="link" className="mt-1 min-h-11" onClick={() => onOpenEvents(allSport)}>Ver campeonatos</Button>}
            </div>
              : <ul aria-label="Campeonatos" className={cn(card, 'm-0 list-none overflow-hidden p-0')}>
                {state.shown.map((event, index) => <ChampionshipRow key={event.id} event={event} divider={index > 0} onOpen={onOpenEvent} />)}
              </ul>}
  </section>
}
