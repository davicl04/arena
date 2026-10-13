import { Text, View } from 'react-native'

// Identidade do perfil: "@usuario" como título (o @ em verde) e o nome real abaixo, menor e em cinza.
export default function ProfileTitle({ name, username }: { name: string; username: string }) {
  return <>
    <View accessible accessibilityRole="header" accessibilityLabel={`@${username}`} className="mb-0.5 flex-row">
      <Text className="text-[23px] font-bold text-brand">@</Text>
      <Text className="shrink text-[23px] font-bold text-ink">{username}</Text>
    </View>
    <Text numberOfLines={1} className="mb-1.5 text-[13px] font-medium text-ink-soft">{name}</Text>
  </>
}
