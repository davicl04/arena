import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import type { RosterPreviewItem } from '../../api/teams'
import { colors } from '../../theme'
import { FormatTile } from '../arena/FormatTile'
import { TeamCrest } from '../arena/TeamCrest'
import { MemberFace } from './MemberFace'
import { athletes, formatGrid, roleLine } from './teamView'
import type { TeamCardView } from './teamView'
import { MintBadge, useTeamToken } from './ui'

/** Elenco em miniatura (.avstack): até cinco rostos e "N atletas". Decorativo: o texto traz a contagem. */
export function RosterStack({ roster, count }: { roster: RosterPreviewItem[]; count: number }) {
  return <View accessible accessibilityLabel={athletes(count)} style={{ flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ flexDirection: 'row' }}>
      {roster.slice(0, 5).map((item, index) => <View key={item.user_id} style={{ marginLeft: index > 0 ? -7 : 0 }}>
        <MemberFace name={item.first_name} avatarUrl={item.avatar_url} size="stack" />
      </View>)}
    </View>
    <Text numberOfLines={1} style={{ marginLeft: 6, flexShrink: 1, color: 'rgba(255,255,255,0.66)', fontSize: 10.5 }}>{athletes(count)}</Text>
  </View>
}

export interface TeamIdCardProps {
  team: TeamCardView
  /** Linha abaixo do nome; padrão: cidade e papel de quem vê. */
  line?: string
  /** Selo acima do nome ("Convite", "Link do time", "Prévia"). */
  badge?: string
  actions?: ReactNode
  /** Contorna em menta (convite, prévia e link do time). */
  highlight?: boolean
  /** Recorte local do brasão (Criar e Editar time). */
  crestPreview?: string | null
  showRoster?: boolean
  /** Ocupa a altura do espaço disponível (cartões do carrossel de mesma altura). */
  fill?: boolean
}

/**
 * Carteirinha C5: brasão, nome, linha de papel ou de convite, grade Futsal | Society | Campo (`FormatTile`), elenco em
 * miniatura e ações. Times não têm cores: o filete à esquerda é neutro. A grade tem três colunas iguais, e o nome de 40
 * caracteres é truncado em uma linha.
 */
export function TeamIdCard({ team, line, badge, actions, highlight = false, crestPreview, showRoster = true, fill = false }: TeamIdCardProps) {
  const token = useTeamToken()
  return <View testID="team-id-card" style={{ minHeight: 236, minWidth: 0, overflow: 'hidden', borderRadius: 22, padding: 14, gap: 12, backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: highlight ? 2 : 1, borderColor: highlight ? colors.mint : 'rgba(255,255,255,0.12)', ...(fill ? { flexGrow: 1 } : {}) }}>
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: '#6b7771' }} />
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <TeamCrest name={team.name} initials={team.initials} path={team.crest_url} previewUri={crestPreview} size="md" decorative token={token} />
      <View style={{ flex: 1, minWidth: 0 }}>
        {badge ? <MintBadge>{badge}</MintBadge> : null}
        <Text accessibilityRole="header" numberOfLines={1} style={{ color: '#ffffff', fontSize: 16, fontWeight: '800' }}>{team.name}</Text>
        <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.66)', fontSize: 10.5, marginTop: 1 }}>{line ?? roleLine(team)}</Text>
      </View>
    </View>
    <View accessibilityLabel="Elos por formato" style={{ flexDirection: 'row', gap: 6 }}>
      {formatGrid(team.formats).map(cell => <FormatTile key={cell.format} format={cell.format} tier={cell.tier} played={cell.played} required={cell.required} />)}
    </View>
    {showRoster ? <RosterStack roster={team.roster_preview} count={team.member_count} /> : null}
    {actions ? <View style={{ marginTop: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0, paddingTop: 2 }}>{actions}</View> : null}
  </View>
}

/** Rótulo cinza de grupo da tela escura ("Prévia da carteirinha"). */
export function GroupLabel({ children, color = colors.mint }: { children: string; color?: string }) {
  return <Text accessibilityRole="header" style={{ marginTop: 18, marginBottom: 8, color, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>{children}</Text>
}
