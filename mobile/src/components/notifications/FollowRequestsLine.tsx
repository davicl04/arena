import { Pressable, Text, View } from 'react-native'
import type { SocialUser } from '../../api/client'
import { useSessionToken } from '../../hooks/useSessionToken'
import { colors } from '../../theme'
import { plural } from '../../utils/format'
import { Icon } from '../Icon'
import { Avatar } from '../media'

/** "Bruna Alves", "Bruna Alves e Diego Souza" ou "Bruna Alves, Diego Souza e mais 3". */
export function followRequestNames(people: readonly SocialUser[], total: number): string {
  const names = people.slice(0, 2).map(person => person.name)
  if (names.length < 2) return names[0] ?? ''
  const more = total - names.length
  return more > 0 ? `${names[0]}, ${names[1]} e mais ${more}` : `${names[0]} e ${names[1]}`
}

/**
 * Linha-resumo dos pedidos para seguir no topo de "Tudo": avatares empilhados, "N pedidos para seguir" e os nomes. Abre a
 * subtela onde se aprova e se recusa. `total` vem do resumo (o servidor conta todos); `people` são os da primeira página.
 */
export function FollowRequestsLine({ people, total, onOpen }: { people: readonly SocialUser[]; total: number; onOpen: () => void }) {
  const token = useSessionToken()
  const title = plural(total, 'pedido para seguir', 'pedidos para seguir')
  const names = followRequestNames(people, total)
  return <Pressable testID="follow-requests-line" accessibilityRole="button" accessibilityLabel={names ? `${title}: ${names}` : title} accessibilityHint="Abre a lista para aprovar ou recusar"
    onPress={onOpen} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, backgroundColor: '#ffffff', paddingHorizontal: 14, paddingVertical: 10 }}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', paddingLeft: 10 }}>
      {people.slice(0, 3).map(person => <View key={person.id} style={{ marginLeft: -10, borderRadius: 18, borderWidth: 2, borderColor: '#ffffff' }}>
        <Avatar path={person.avatar_url} name={person.name} token={token} size={32} />
      </View>)}
    </View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '700' }}>{title}</Text>
      {names ? <Text numberOfLines={1} style={{ color: colors['ink-muted'], fontSize: 11, marginTop: 1 }}>{names}</Text> : null}
    </View>
    <Icon name="chevron" size={17} color={colors['ink-muted']} />
  </Pressable>
}
