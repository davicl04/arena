import { View } from 'react-native'
import type { MatchSideOut } from '../../api/matches'
import { tiers } from '../../data/arena'
import { sideName } from '../../data/match'
import { useSessionToken } from '../../hooks/useSessionToken'
import { TeamCrest } from '../arena/TeamCrest'
import { TierEmblem } from '../arena/TierEmblem'
import { Avatar } from '../media'

/** Foto do atleta (pontos) ao lado do brasão `sm` (26×29) e `lg` (52×57). */
const photoSize = { sm: 29, lg: 52 } as const

/**
 * Marca de um lado da partida: o brasão do time com o elo no canto, ou a foto do atleta no tênis. O elo só aparece
 * quando o pareamento o guardou (`tier`); quem está em classificação não tem elo, nem aqui nem em lugar nenhum. É
 * decorativa: o nome do lado fica no texto vizinho.
 */
export function TeamMark({ side, size = 'sm', token: provided }: { side: MatchSideOut; size?: 'sm' | 'lg'; token?: string | null }) {
  const token = useSessionToken(provided)
  const name = sideName(side)
  const tier = side.tier && side.tier in tiers ? side.tier : null
  return <View testID="team-mark" accessible={false} importantForAccessibility="no-hide-descendants" style={{ alignSelf: 'flex-start' }}>
    {side.team
      ? <TeamCrest name={side.team.name} initials={side.team.initials} path={side.team.crest_url} size={size} decorative token={token} />
      : <Avatar path={side.athlete?.avatar_url ?? null} name={name} token={token} size={photoSize[size]} />}
    {tier ? <View style={{ position: 'absolute', right: size === 'lg' ? -8 : -5, bottom: size === 'lg' ? -4 : -3 }}>
      <TierEmblem tier={tier} size={size === 'lg' ? 'sm' : 'xs'} decorative />
    </View> : null}
  </View>
}
