import { Pressable, Text, View } from 'react-native'
import { styles } from './ui'

export const profileTabs = ['Fotos', 'Partidas'] as const
export type ProfileTab = typeof profileTabs[number]

/** Abas do conteúdo do perfil: Fotos | Partidas. */
export function ProfileTabs({ value, onChange }: { value: ProfileTab; onChange: (value: ProfileTab) => void }) {
  return <View accessibilityRole="tablist" accessibilityLabel="Conteúdo do perfil" style={{ flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#cdd4d0' }}>
    {profileTabs.map(tab => {
      const selected = value === tab
      return <Pressable key={tab} accessibilityRole="tab" accessibilityLabel={tab} accessibilityState={{ selected }} onPress={() => onChange(tab)}
        style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderColor: selected ? '#005a36' : 'transparent' }}>
        <Text style={{ color: selected ? '#005a36' : '#606965', fontWeight: selected ? '700' : '500' }}>{tab}</Text>
      </Pressable>
    })}
  </View>
}

/** Partidas ainda não têm domínio no backend: só o estado vazio. */
export function MatchesEmpty() {
  return <View style={{ padding: 22, alignItems: 'center' }}>
    <Text accessibilityRole="header" style={[styles.heading, { textAlign: 'center' }]}>Sua história em campo</Text>
    <Text style={[styles.body, { textAlign: 'center' }]}>Quando as partidas estiverem disponíveis, os resultados ficam registrados aqui.</Text>
  </View>
}
