import { Pressable, View } from 'react-native'
import { useTopArea } from '../navigation/topArea'
import { Text, TextInput } from './Text'
import { cx, tw } from '../styles'
import { colors } from '../theme'
import { NotificationBell } from './notifications/NotificationBell'
import { ArenaMark } from './arena/ArenaMark'
import { Icon } from './Icon'

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
  // A barra encosta no topo da tela: a faixa da barra de status fica `forest` (navigation/topArea).
  useTopArea('forest')
  return <View className="bg-forest">
    <View className="h-14 flex-row items-center gap-2.5 pr-2 pl-4.5">
      <ArenaMark width={30} height={22} color={colors.mint} />
      <Text accessibilityRole="header" numberOfLines={1} className={cx('grow basis-0 text-white', tw.pageTitle)}>Comunidade</Text>
      {onOpenNotifications ? <NotificationBell tone="dark" count={notificationCount} onOpen={onOpenNotifications} /> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Nova publicação" onPress={onCompose} className="min-h-11 min-w-11 items-center justify-center">
        <View className="h-9.5 w-9.5 items-center justify-center rounded-full bg-mint">
          <Icon name="plus" size={20} color={colors.night} />
        </View>
      </Pressable>
    </View>
    <View accessibilityRole="tablist" accessibilityLabel="Seções da Comunidade" className="flex-row px-2.5">
      {communityTabs.map(item => {
        const selected = tab === item
        return <Pressable key={item} accessibilityRole="tab" accessibilityLabel={item} accessibilityState={{ selected }} onPress={() => onTab(item)}
          className={cx('min-h-11.5 grow basis-0 flex-row items-center justify-center gap-1.5 border-b-2', selected ? 'border-mint' : 'border-transparent')}>
          <Icon name={item === 'Publicações' ? 'images' : 'users'} size={17} color={selected ? colors.mint : '#ffffff99'} />
          <Text maxFontSizeMultiplier={1.3} className={selected ? 'text-[11px] font-bold text-mint' : 'text-[11px] font-bold text-[#ffffff99]'}>{item}</Text>
        </Pressable>
      })}
    </View>
    {tab === 'Atletas' ? <View className="px-4 pt-1 pb-3">
      {/* Campo da web: vidro claro sobre o verde, lupa à esquerda, texto de 13. */}
      <View className="justify-center">
        <TextInput value={query} onChangeText={onQuery} maxLength={100} autoCapitalize="none" autoCorrect={false} returnKeyType="search" clearButtonMode="while-editing"
          accessibilityLabel="Buscar atletas por nome ou @" placeholder="Buscar atletas pelo nome ou @" placeholderTextColor="#ffffff8c"
          style={{ height: 44, paddingVertical: 0, paddingLeft: 36, paddingRight: 13, borderRadius: 11, borderWidth: 1, borderColor: '#ffffff2e', backgroundColor: '#ffffff14', color: '#ffffff', fontSize: 13 }} />
        <View pointerEvents="none" className="absolute left-3"><Icon name="search" size={17} color="#ffffffa6" /></View>
      </View>
    </View> : null}
  </View>
}
