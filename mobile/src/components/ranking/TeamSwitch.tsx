import type { TeamRef } from '../../api/matches'
import { useSessionToken } from '../../hooks/useSessionToken'
import { ChoicePills } from '../arena/controls'
import type { ChoiceOption } from '../arena/controls'
import { TeamCrest } from '../arena/TeamCrest'

/**
 * Chips dos times ativos do titular no ranking de Times: cada um mostra o escudo e o nome, e o escolhido define a linha da
 * placa (`team_id` do overview). Só aparece com mais de um time.
 */
export function TeamSwitch({ teams, selectedId, onSelect }: { teams: TeamRef[]; selectedId: number | null; onSelect: (teamId: number) => void }) {
  const token = useSessionToken()
  if (teams.length < 2) return null
  const options: ChoiceOption<number>[] = teams.map(team => ({
    value: team.id, label: team.name, accessibilityLabel: `Time ${team.name}`,
    leading: () => <TeamCrest name={team.name} initials={team.initials} path={team.crest_url} size="xs" decorative token={token} />,
  }))
  return <ChoicePills label="Time" options={options} value={selectedId} onChange={onSelect} />
}
