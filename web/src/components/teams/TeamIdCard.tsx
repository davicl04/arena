import type { ReactNode } from 'react'
import type { RosterPreviewItem } from '@/api/teams'
import { FormatTile } from '@/components/arena/FormatTile'
import { TeamCrest } from '@/components/arena/TeamCrest'
import { cn } from '@/lib/utils'
import { MemberFace } from './MemberFace'
import { athletes, formatGrid, roleLine } from './teamView'
import type { TeamCardView } from './teamView'

/** Elenco em miniatura (.avstack): até cinco rostos e "N atletas". */
export function RosterStack({ roster, count, className }: { roster: RosterPreviewItem[]; count: number; className?: string }) {
  return <div className={cn('flex min-w-0 items-center', className)}>
    <span className="flex" aria-hidden="true">
      {roster.slice(0, 5).map((item, index) => <MemberFace key={item.user_id} name={item.first_name} avatarUrl={item.avatar_url} size="stack"
        className={cn('rounded-full border-2 border-solid border-forest', index > 0 && '-ml-[7px]')} />)}
    </span>
    <small className="ml-1.5 truncate text-[10.5px] text-white/66">{athletes(count)}</small>
  </div>
}

/** Selo menta acima do nome (.badge.mintb): "Convite", "Link do time", "Prévia". */
export function MintBadge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full bg-mint/15 px-2 py-[3px] text-[9.5px] font-bold text-mint [&_svg]:size-3', className)}>{children}</span>
}

/**
 * Carteirinha C5 (.fp): brasão, nome, linha de papel ou de convite, grade Futsal | Society | Campo (FormatTile),
 * elenco em miniatura e ações. Times não têm cores: o filete à esquerda é neutro. `highlight` contorna em menta
 * (convite, prévia e link do time). A grade usa `minmax(0, 1fr)` para nomes de 40 caracteres não estourarem.
 */
export function TeamIdCard({ team, line, badge, actions, highlight = false, crestPreview, showRoster = true, className }: {
  team: TeamCardView
  /** Linha abaixo do nome; padrão: cidade e papel de quem vê. */
  line?: ReactNode
  /** Selo acima do nome ("Convite", "Link do time", "Prévia"). */
  badge?: ReactNode
  actions?: ReactNode
  highlight?: boolean
  /** Recorte local do brasão (Criar e Editar time). */
  crestPreview?: string | null
  showRoster?: boolean
  className?: string
}) {
  return <div data-slot="team-id-card" className={cn(
    'relative grid min-h-[236px] min-w-0 content-start gap-3 overflow-hidden rounded-[22px] bg-linear-180 from-white/7 to-white/2 p-3.5 text-left text-white',
    "before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-linear-180 before:from-[#46524c] before:to-[#9aa69f] before:content-['']",
    highlight ? 'shadow-[inset_0_0_0_2px_var(--color-mint)]' : 'shadow-[inset_0_0_0_1px_#ffffff1f]',
    className)}>
    <div className="flex min-w-0 items-center gap-2.5">
      <TeamCrest name={team.name} initials={team.initials} path={team.crest_url} previewSrc={crestPreview} size="md" decorative />
      <div className="min-w-0 flex-1">
        {badge && <MintBadge>{badge}</MintBadge>}
        <h2 className="truncate text-[16px] text-white" title={team.name}>{team.name}</h2>
        <small className="truncate text-[10.5px] text-white/66">{line ?? roleLine(team)}</small>
      </div>
    </div>
    {/* `grid-cols-3` do Tailwind 4 já é `repeat(3, minmax(0, 1fr))`. */}
    <ul className="m-0 grid list-none grid-cols-3 gap-1.5 p-0" aria-label="Elos por formato">
      {formatGrid(team.formats).map(cell => <li key={cell.format} className="min-w-0">
        <FormatTile format={cell.format} tier={cell.tier} played={cell.played} required={cell.required} />
      </li>)}
    </ul>
    {showRoster && <RosterStack roster={team.roster_preview} count={team.member_count} />}
    {actions && <div className="mt-auto flex min-w-0 gap-2 pt-0.5">{actions}</div>}
  </div>
}
