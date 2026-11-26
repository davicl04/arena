import { ChevronRight } from 'lucide-react'
import { sports } from '@/api/client'
import type { MatchCard, MatchSideOut } from '@/api/matches'
import SportIcon from '@/components/SportIcon'
import { SocialPhoto } from '@/components/SocialPhoto'
import { TeamCrest } from '@/components/arena/TeamCrest'
import { orderedSides } from '@/data/match'
import { cn } from '@/lib/utils'
import { formatDeadline, parseIso } from '@/utils/format'
import { countdownParts, emptyPlacarText, matchupLabel, sideLabel, spokenMatchCountdown } from '@/data/home'

/** Marca d'água do Coliseu no canto do bloco escuro, como na placa do Jogar. */
function Watermark() {
  return <span aria-hidden="true" className="pointer-events-none absolute -right-[30px] -bottom-6 h-[130px] w-[230px] bg-white opacity-[0.06] mask-[url(/images/brand/coliseum.svg)] mask-contain mask-center mask-no-repeat" />
}

const blockClass = 'relative block w-full overflow-hidden rounded-[22px] bg-forest p-[18px] text-left text-white'
const labelClass = 'relative text-[10px] font-bold tracking-[0.1em] text-mint uppercase'

/** Identificação de um lado sobre o bloco escuro: brasão (ou iniciais) do time, ou foto (ou iniciais) da pessoa. */
function SideMark({ card, side, className }: { card: MatchCard; side: MatchSideOut | undefined; className?: string }) {
  if (side?.team) return <TeamCrest name={side.team.name} initials={side.team.initials} path={side.team.crest_url} size="sm" decorative className={className} />
  return <SocialPhoto path={side?.athlete?.avatar_url ?? null} name={side?.athlete?.name ?? sideLabel(card, side)} size="comment"
    className={cn('bg-white/10 text-white ring-2 ring-forest', className)} />
}

/**
 * Placar do Início: a próxima partida agendada com a Contagem ("3 dias 4 h"), a data e a hora, o confronto e o local.
 * O bloco inteiro é um único botão que abre a partida. Sem partida, o traço, "Nenhuma partida agendada" e um convite,
 * sem toque. É escuro por design (forest), igual nos dois temas; `now` vem do relógio de 60 s do Início.
 */
export function Placar({ match, now, hasProfiles, onOpen }: {
  /** A próxima partida agendada (`nextScheduledMatch`), ou nulo. */
  match: MatchCard | null
  now: number
  hasProfiles: boolean
  onOpen: (matchId: number) => void
}) {
  const start = match ? parseIso(match.starts_at) : null
  if (!match || !start) return <section aria-labelledby="placar-title" data-slot="placar" className={blockClass}>
    <Watermark />
    <p className={labelClass}>Próxima partida</p>
    <p aria-hidden="true" className="relative mt-2.5 font-display text-[46px] leading-none font-bold text-white/30">—</p>
    <h2 id="placar-title" className="relative mt-2 mb-1 text-[17px] text-white">Nenhuma partida agendada</h2>
    <p className="relative text-[12px] leading-normal text-white/66">{emptyPlacarText(hasProfiles)}</p>
  </section>

  const left = start.getTime() - now
  const sport = sports.find(item => item.value === match.sport)?.label ?? match.sport
  const when = formatDeadline(match.starts_at, new Date(now))
  const matchup = matchupLabel(match)
  const place = match.court?.name
  const [mine, other] = orderedSides(match)
  return <button type="button" data-slot="placar" onClick={() => onOpen(match.id)}
    aria-label={`Próxima partida em ${spokenMatchCountdown(left)}: ${matchup}, ${when}${place ? `, ${place}` : ''}`}
    className={cn(blockClass, 'cursor-pointer border-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint')}>
    <Watermark />
    <span className="relative flex items-center justify-between gap-2">
      <span className={labelClass}>Próxima partida</span>
      <span className="inline-flex flex-none items-center gap-[5px] rounded-full bg-white/8 px-[9px] py-1 text-[10px] font-semibold text-white">
        <SportIcon sport={match.sport} forma="aro" size={14} />{sport}
      </span>
    </span>
    <span data-slot="countdown" className="relative mt-2.5 flex flex-wrap items-end gap-x-2.5 gap-y-1">
      {countdownParts(left).map(part => <span key={part.unit} className="inline-flex items-end gap-1.5">
        <b className="font-display text-[46px] leading-none font-bold text-white tabular-nums">{part.value}</b>
        <span className="pb-[5px] font-display text-[18px] font-bold">{part.unit}</span>
      </span>)}
    </span>
    <span className="relative mt-1 block text-[12px] text-white/66">{when}</span>
    <span className="relative mt-4 flex items-center gap-3 border-t border-solid border-white/9 pt-3.5">
      <span className="flex flex-none items-center" aria-hidden="true">
        <SideMark card={match} side={mine} className="relative z-1" />
        <SideMark card={match} side={other} className="-ml-2" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[13px]">{matchup}</b>
        {place && <small className="mt-0.5 block truncate text-[11px] text-white/66">{place}</small>}
      </span>
      <ChevronRight size={18} aria-hidden="true" className="flex-none text-white/66" />
    </span>
  </button>
}
