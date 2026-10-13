import { Text, View } from 'react-native'
import type { MatchSideOut } from '../../api/matches'
import { sideName } from '../../data/match'
import { useSessionToken } from '../../hooks/useSessionToken'
import { TeamCrest } from '../arena/TeamCrest'
import type { TeamCrestSize } from '../arena/TeamCrest'
import { TierEmblem } from '../arena/TierEmblem'
import { Avatar } from '../media'
import { sideTierName } from './matchView'

/** Tamanho da foto do atleta ao lado de cada tamanho do brasão (pontos). */
const photoSize = { sm: 29, md: 38, xl: 72 } as const

/**
 * Marca pequena de um lado (brasão ou foto) para as listas claras; decorativa, o nome fica no texto vizinho (porta de
 * `SideMark` da web).
 */
export function SideMark({ side, token: provided }: { side: MatchSideOut | undefined; token?: string | null }) {
  const token = useSessionToken(provided)
  if (side?.team) return <TeamCrest name={side.team.name} initials={side.team.initials} path={side.team.crest_url} size="sm" decorative token={token} />
  return <View accessible={false} importantForAccessibility="no-hide-descendants"><Avatar path={side?.athlete?.avatar_url ?? null} name={sideName(side)} token={token} size={29} /></View>
}

/**
 * Um lado da partida sobre a placa escura (P2 e cartões do Jogar): brasão do time ou foto do atleta, nome e o elo no
 * pareamento. Sem elo, "Em classificação", sem brasão de elo: nunca se atribui elo antes da classificação. Tem um só nome
 * acessível ("Leões do Cerrado, elo Prata").
 */
export function SideBadge({ side, size = 'md', token: provided }: { side: MatchSideOut | undefined; size?: Extract<TeamCrestSize, 'sm' | 'md' | 'xl'>; token?: string | null }) {
  const token = useSessionToken(provided)
  const name = sideName(side)
  const tier = sideTierName(side)
  const large = size === 'xl'
  return <View testID="side-badge" accessible accessibilityLabel={`${name}, ${tier ? `elo ${tier}` : 'em classificação'}`}
    style={{ minWidth: 0, alignItems: 'center', gap: 6 }}>
    {side?.team
      ? <TeamCrest name={side.team.name} initials={side.team.initials} path={side.team.crest_url} size={size} decorative token={token} />
      : <Avatar path={side?.athlete?.avatar_url ?? null} name={name} token={token} size={photoSize[size]} />}
    <Text numberOfLines={2} style={{ textAlign: 'center', color: '#ffffff', fontSize: large ? 14 : 12, fontWeight: '800', lineHeight: large ? 18 : 16 }}>{name}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {side?.tier && tier ? <TierEmblem tier={side.tier} size="xs" decorative /> : null}
      <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10.5 }}>{side?.tier && tier ? tier : 'Em classificação'}</Text>
    </View>
  </View>
}
