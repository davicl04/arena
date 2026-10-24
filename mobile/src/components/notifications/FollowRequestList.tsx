import { Pressable, Text, View } from 'react-native'
import type { SocialUser } from '../../api/client'
import { useSessionToken } from '../../hooks/useSessionToken'
import { useThemeColors } from '../../hooks/useTheme'
import { Icon } from '../Icon'
import { Avatar } from '../media'

export type FollowRequest = { user: SocialUser; state: string }

/** Pedidos para seguir: foto, nome, @usuário e os botões de aprovar e recusar (44 pt). A foto lê o token só aqui. */
export function FollowRequestList({ items, busy, onResolve }: { items: FollowRequest[]; busy: boolean; onResolve: (person: SocialUser, approve: boolean) => void }) {
  const colors = useThemeColors()
  const token = useSessionToken()
  return <View style={{ overflow: 'hidden', borderRadius: 16, backgroundColor: colors.surface }}>
    {items.map(({ user: person }, index) => <View key={person.id} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: index > 0 ? 1 : 0, borderTopColor: colors.line }}>
      <Avatar path={person.avatar_url} name={person.name} token={token} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }}>{person.name}</Text>
        <Text numberOfLines={1} style={{ color: colors['ink-muted'], fontSize: 11 }}>@{person.username}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Aprovar solicitação de ${person.name}`} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => onResolve(person, true)}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.brand, opacity: busy ? 0.5 : 1 }}>
        <Icon name="check" size={18} color={colors['on-brand']} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Recusar solicitação de ${person.name}`} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => onResolve(person, false)}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: colors['line-strong'], opacity: busy ? 0.5 : 1 }}>
        <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>✕</Text>
      </Pressable>
    </View>)}
  </View>
}
