import { Pressable, Text, View } from 'react-native'
import type { TeamInviteReceived } from '../../api/teams'
import { colors } from '../../theme'
import { TeamCrest } from '../arena/TeamCrest'
import { useTeamToken } from './ui'
import { Icon } from '../Icon'

/**
 * Faixa menta no topo da placa (R2): "Leões do Cerrado convidou você" ou "2 convites para times". Abre a folha de
 * convites. Sem convites pendentes, não aparece.
 */
export function InviteStrip({ invites, onOpen }: { invites: TeamInviteReceived[]; onOpen: () => void }) {
  const token = useTeamToken()
  if (!invites.length) return null
  const first = invites[0].team
  const many = invites.length > 1
  const spoken = many ? `${invites.length} convites para times` : `${first.name} convidou você`
  return <Pressable accessibilityRole="button" accessibilityLabel={`${spoken}. Abrir convites`} onPress={onOpen}
    style={{ marginHorizontal: 16, marginTop: 10, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingVertical: 9, paddingHorizontal: 10, backgroundColor: 'rgba(143,224,180,0.10)', borderWidth: 1, borderColor: 'rgba(143,224,180,0.33)' }}>
    <TeamCrest name={first.name} initials={first.initials} path={first.crest_url} size="sm" decorative token={token} />
    <Text style={{ flex: 1, minWidth: 0, color: '#ffffff', fontSize: 11.5, lineHeight: 16 }}>
      {many ? <><Text style={{ fontWeight: '800' }}>{invites.length} convites</Text> para times</> : <><Text style={{ fontWeight: '800' }}>{first.name}</Text> convidou você</>}
    </Text>
    <View><Icon name="chevron" size={18} color={colors.mint} /></View>
  </Pressable>
}
