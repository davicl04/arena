import type { MyRankingLine } from '@/api/results'
import { TeamCrest } from '@/components/arena/TeamCrest'
import { Chip } from '@/components/ui/chip'

/**
 * Chips dos times ativos do titular, no ranking de Times: o selecionado define a linha da placa. Só aparece com mais de
 * um time (a API devolve uma linha por time em `mine`).
 */
export function TeamSwitch({ lines, selectedTeamId, onSelect }: {
  lines: readonly MyRankingLine[]
  selectedTeamId: number | null
  onSelect: (teamId: number) => void
}) {
  const teams = lines.flatMap(line => (line.team ? [line.team] : []))
  if (teams.length < 2) return null
  return (
    <div role="group" aria-label="Time" data-slot="team-switch" className="flex flex-wrap gap-[7px]">
      {teams.map(team => (
        <Chip key={team.id} aria-pressed={team.id === selectedTeamId} className="max-w-full min-w-0" onClick={() => onSelect(team.id)}>
          <TeamCrest name={team.name} initials={team.initials} path={team.crest_url} size="xs" decorative />
          <span className="max-w-[150px] truncate">{team.name}</span>
        </Chip>
      ))}
    </div>
  )
}
