import { Text, View } from 'react-native'

// Identidade do perfil: "@usuario" como título (o @ em verde) e o nome real abaixo, menor e em cinza.
export default function ProfileTitle({ name, username }: { name: string; username: string }) {
  return <>
    <View accessible accessibilityRole="header" accessibilityLabel={`@${username}`} style={{ flexDirection: 'row', marginBottom: 2 }}>
      <Text style={{ fontSize: 23, fontWeight: '700', color: '#005a36' }}>@</Text>
      <Text style={{ flexShrink: 1, fontSize: 23, fontWeight: '700', color: '#343d39' }}>{username}</Text>
    </View>
    <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '500', color: '#626970', marginBottom: 6 }}>{name}</Text>
  </>
}
