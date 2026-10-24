import { Pressable, Text, TextInput, View } from 'react-native'
import { cx } from '../styles'
import { colors } from '../theme'
import { NotificationBell } from './notifications/NotificationBell'

/** Altura da linha do título (classe h-14): é o quanto a barra recolhe ao rolar o feed. */
export const TITLE_ROW_HEIGHT = 56

export const communityTabs = ['Publicações', 'Atletas'] as const
export type CommunityTab = typeof communityTabs[number]

/**
 * Barra escura da Comunidade: título com o botão de nova publicação, abas sublinhadas em menta
 * e, na aba Atletas, o campo de busca. O recolhimento da linha do título é feito por quem a posiciona.
 */
export default function CommunityBar({ tab, onTab, onCompose, query, onQuery, notificationCount = 0, onOpenNotifications }: {
  tab: CommunityTab; onTab: (tab: CommunityTab) => void; onCompose: () => void; query: string; onQuery: (value: string) => void
  /** Sino das Notificações (círculo de vidro antes do "+"); sem `onOpenNotifications`, a barra não o mostra. */
  notificationCount?: number; onOpenNotifications?: () => void
}) {
  return <View className="bg-forest">
    <View className="h-14 flex-row items-center gap-2 px-4">
      <Text accessibilityRole="header" numberOfLines={1} className="grow basis-0 text-[24px] font-extrabold tracking-[-0.5px] text-white">Comunidade</Text>
      {onOpenNotifications ? <NotificationBell tone="dark" count={notificationCount} onOpen={onOpenNotifications} /> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Nova publicação" onPress={onCompose} className="min-h-11 min-w-11 items-center justify-center">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-glass-accent">
          <Text className="text-[26px] leading-[28px] font-bold text-forest">+</Text>
        </View>
      </Pressable>
    </View>
    <View accessibilityRole="tablist" accessibilityLabel="Seções da Comunidade" className="flex-row px-2">
      {communityTabs.map(item => {
        const selected = tab === item
        return <Pressable key={item} accessibilityRole="tab" accessibilityLabel={item} accessibilityState={{ selected }} onPress={() => onTab(item)}
          className={cx('min-h-12 grow basis-0 items-center justify-center border-b-[3px]', selected ? 'border-glass-accent' : 'border-transparent')}>
          <Text className={selected ? 'text-[15px] font-bold text-white' : 'text-[15px] font-medium text-glass-muted'}>{item}</Text>
        </Pressable>
      })}
    </View>
    {tab === 'Atletas' ? <View className="px-4 pt-1 pb-3">
      <TextInput value={query} onChangeText={onQuery} maxLength={100} autoCapitalize="none" autoCorrect={false} returnKeyType="search"
        accessibilityLabel="Buscar atletas por nome ou @" placeholder="Buscar atletas pelo nome ou @" placeholderTextColor={colors['glass-muted']}
        className="min-h-11 rounded-full border border-forest-line bg-forest-field px-4 text-[15px] text-white" />
    </View> : null}
  </View>
}
