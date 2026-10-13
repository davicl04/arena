import { sideName } from '@/data/match'
import type { MatchSideOut } from '@/api/matches'
import { SocialPhoto } from '@/components/SocialPhoto'
import { TeamCrest } from '@/components/arena/TeamCrest'
import type { TeamCrestSize } from '@/components/arena/TeamCrest'
import { TierEmblem } from '@/components/arena/TierEmblem'
import { cn } from '@/lib/utils'
import { sideTierName } from './matchView'

const photoSize = { sm: 'comment', md: 'md', xl: 'lg' } as const

/** Marca pequena de um lado (brasão ou foto) para as listas claras; decorativa, o nome fica no texto vizinho. */
export function SideMark({ side, className }: { side: MatchSideOut | undefined; className?: string }) {
  if (side?.team) return <TeamCrest name={side.team.name} initials={side.team.initials} path={side.team.crest_url} size="sm" decorative className={className} />
  return <SocialPhoto path={side?.athlete?.avatar_url ?? null} name={sideName(side)} size="comment" className={className} />
}

/**
 * Um lado da partida sobre a placa escura (P2 e cartões do Jogar): brasão do time ou foto do atleta, nome e o elo
 * no pareamento. Sem elo, "Em classificação", sem brasão de elo: nunca se atribui elo antes da classificação.
 */
export function SideBadge({ side, size = 'md', className }: { side: MatchSideOut | undefined; size?: Extract<TeamCrestSize, 'sm' | 'md' | 'xl'>; className?: string }) {
  const name = sideName(side)
  const tier = sideTierName(side)
  const large = size === 'xl'
  return <div data-slot="side-badge" data-side={side?.side} className={cn('grid min-w-0 content-start justify-items-center gap-1.5 text-center', className)}>
    {side?.team
      ? <TeamCrest name={side.team.name} initials={side.team.initials} path={side.team.crest_url} size={size} decorative />
      : <SocialPhoto path={side?.athlete?.avatar_url ?? null} name={name} size={photoSize[size]}
        className={cn('flex-none bg-white/10 text-white', large && 'mb-0 size-[72px] text-[20px]')} />}
    <b className={cn('font-display leading-tight wrap-anywhere text-white', large ? 'text-[14px]' : 'text-[12px]')}>{name}</b>
    <small className="inline-flex items-center gap-1 text-[10.5px] text-white/65">
      {side?.tier && tier ? <><TierEmblem tier={side.tier} size="xs" decorative />{tier}</> : 'Em classificação'}
    </small>
  </div>
}
