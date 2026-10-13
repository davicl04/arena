import { Pressable, Text, View } from 'react-native'
import { cx, tw } from '../styles'

export const profileTabs = ['Fotos', 'Partidas'] as const
export type ProfileTab = typeof profileTabs[number]

/** Abas do conteúdo do perfil: Fotos | Partidas. */
export function ProfileTabs({ value, onChange }: { value: ProfileTab; onChange: (value: ProfileTab) => void }) {
  return <View accessibilityRole="tablist" accessibilityLabel="Conteúdo do perfil" className="flex-row border-b border-line bg-white">
    {profileTabs.map(tab => {
      const selected = value === tab
      return <Pressable key={tab} accessibilityRole="tab" accessibilityLabel={tab} accessibilityState={{ selected }} onPress={() => onChange(tab)}
        className={cx('min-h-12 grow basis-0 items-center justify-center border-b-[3px]', selected ? 'border-brand' : 'border-transparent')}>
        <Text className={selected ? 'font-bold text-brand' : 'font-medium text-ink-muted'}>{tab}</Text>
      </Pressable>
    })}
  </View>
}

/** Partidas ainda não têm domínio no backend: só o estado vazio. */
export function MatchesEmpty() {
  return <View className="items-center p-5.5">
    <Text accessibilityRole="header" className={cx(tw.heading, 'text-center')}>Sua história em campo</Text>
    <Text className={cx(tw.body, 'text-center')}>Quando as partidas estiverem disponíveis, os resultados ficam registrados aqui.</Text>
  </View>
}
