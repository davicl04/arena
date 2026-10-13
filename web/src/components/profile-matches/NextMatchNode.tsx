import { ChevronRight } from 'lucide-react'
import type { MatchCard } from '@/api/matches'
import { SideMark } from '@/components/play/SideBadge'
import { matchTitle } from '@/components/play/matchView'
import { footballFormat } from '@/data/arena'
import { formatClock, formatShortDate, parseIso } from '@/utils/format'
import { daysUntil } from './timelineView'

/** Cartão verde-escuro da próxima partida (só no perfil próprio): quando, os dois lados, formato, origem e quadra. Leva à partida. */
export function NextMatchNode({ match, now, onOpen }: { match: MatchCard; now: Date; onOpen: (matchId: number) => void }) {
  const start = parseIso(match.starts_at)
  const mine = match.sides.find(side => side.side === match.my_side) ?? match.sides[0]
  const other = match.sides.find(side => side !== mine)
  const details = [
    match.sport === 'tenis' ? 'Tênis' : match.format ? footballFormat[match.format].label : 'Futebol',
    match.origin === 'campeonato' ? 'Campeonato' : 'Amistoso',
    match.court?.name,
  ].filter(Boolean).join(' · ')
  const when = start ? `${daysUntil(match.starts_at ?? '', now)} · ${formatShortDate(start, now)}, ${formatClock(start)}` : ''
  return <button type="button" data-slot="next-match" onClick={() => onOpen(match.id)} aria-label={`Abrir próxima partida: ${matchTitle(match)}, ${when}`}
    className="flex min-h-11 w-full items-center gap-3 rounded-card border-0 bg-forest px-3.5 py-3 text-left text-white shadow-card">
    <span className="min-w-0 flex-1">
      <small className="block text-[10px] font-extrabold tracking-[0.08em] text-mint uppercase">Próxima partida</small>
      <b className="mt-0.5 block text-[12px] text-mint">{when}</b>
      <span className="mt-1.5 flex items-center gap-2">
        <span className="flex flex-none -space-x-2" aria-hidden="true">
          <SideMark side={mine} className="relative z-1 ring-2 ring-forest" />
          <SideMark side={other} />
        </span>
        <b className="min-w-0 text-[12.5px] leading-tight wrap-anywhere">{matchTitle(match)}</b>
      </span>
      <small className="mt-1 block text-[10.5px] leading-normal wrap-anywhere text-white/65">{details}</small>
    </span>
    <ChevronRight size={18} aria-hidden="true" className="flex-none text-mint" />
  </button>
}
