import type { RankingKey, RankingRow, RankingSubject } from '@/api/results'
import { TeamCrest } from '@/components/arena/TeamCrest'
import { SocialPhoto } from '@/components/SocialPhoto'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { dayMonth, formatMetric, isRunRanking, metricUnit } from './metric'
import { RecentForm } from './RecentForm'

/*
 * Linha do Ranking dentro do elo: posição no elo, escudo do time ou foto do atleta, nome (com o selo "Você" ou "Seu time"
 * na linha do titular), a forma recente (ou, na corrida, a data da melhor marca) e a métrica com a unidade. Todas as
 * linhas de uma lista são do mesmo elo, por isso não há brasão do elo. `glass` é a linha de vidro sobre a placa
 * contínua; `hall` é a linha numerada do Salão dos Lendários. A linha do titular tem borda menta e `aria-current`.
 */
export type RankingLineTone = 'glass' | 'hall'

/** Escudo do time ou foto do atleta de uma linha ou de uma prévia. */
export function Subject({ subject, size = 'md', className }: { subject: RankingSubject; size?: 'md' | 'lg'; className?: string }) {
  if (subject.team) return <TeamCrest name={subject.team.name} initials={subject.team.initials} path={subject.team.crest_url} size={size === 'lg' ? 'md' : 'sm'} decorative className={className} />
  const name = subject.athlete?.name ?? 'Atleta'
  return <SocialPhoto path={subject.athlete?.avatar_url ?? null} name={name}
    className={cn('bg-white/15 text-[10px] text-white', size === 'lg' ? 'size-[38px] flex-[0_0_38px]' : 'size-8 flex-[0_0_32px]', className)} />
}

export function RankingLine({ row, ranking, tone = 'glass', onOpenUser }: {
  row: RankingRow
  ranking: RankingKey
  tone?: RankingLineTone
  onOpenUser?: (userId: number) => void
}) {
  const hall = tone === 'hall'
  const name = row.team?.name ?? row.athlete?.name ?? 'Atleta'
  const athleteId = row.athlete?.id
  const open = athleteId !== undefined && onOpenUser ? () => onOpenUser(athleteId) : undefined
  const body = (
    <>
      <span className={cn('grid flex-none place-items-center text-center font-display font-extrabold tabular-nums',
        hall ? 'w-[26px] text-[20px] text-legend' : 'w-6 text-[14px] text-white/70')}>
        <span className="sr-only">Posição no elo </span>{row.tier_position}
      </span>
      <Subject subject={row} size={hall ? 'lg' : 'md'} />
      <span className="min-w-0 flex-1 text-left">
        <b className={cn('flex min-w-0 items-center gap-1.5 text-white', hall ? 'text-[13px]' : 'text-[12.5px]')}>
          <span className="truncate">{name}</span>
          {row.is_mine && <Badge className="flex-none bg-mint px-1.5 py-0.5 text-[9px] text-night">{row.team ? 'Seu time' : 'Você'}</Badge>}
        </b>
        {isRunRanking(ranking)
          ? row.best_mark_on && <small className="mt-0.5 truncate text-[10px] text-white/55">melhor marca em {dayMonth(row.best_mark_on)}</small>
          : row.form && row.form.length > 0 && <RecentForm form={row.form} className="mt-1" />}
      </span>
    </>
  )
  return (
    <li
      data-mine={row.is_mine ? '' : undefined}
      aria-current={row.is_mine ? 'true' : undefined}
      className={cn('flex items-center gap-2 border border-solid',
        hall ? 'rounded-2xl px-3 py-[11px]' : 'rounded-[14px] px-3 py-2.5',
        row.is_mine
          ? (hall ? 'border-mint bg-mint/8' : 'border-mint/40 bg-mint/12')
          : (hall ? 'border-legend/18 bg-white/4' : 'border-white/7 bg-white/3'))}
    >
      {open
        ? <button type="button" aria-label={`Abrir perfil de ${name}, posição ${row.tier_position}`} onClick={open}
          className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent p-0 text-inherit focus-visible:outline-mint">{body}</button>
        : <div className="flex min-w-0 flex-1 items-center gap-2">{body}</div>}
      <span className="grid min-w-9 flex-none justify-items-end">
        <b className={cn('font-display font-extrabold tabular-nums', hall ? 'text-[15px] text-legend' : 'text-[14px] text-white')}>{formatMetric(row.metric_value, ranking)}</b>
        <small className="text-[9.5px] text-white/50">{metricUnit(ranking)}</small>
      </span>
    </li>
  )
}
