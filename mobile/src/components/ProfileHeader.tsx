import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { sports } from '../api/client'
import type { Sport } from '../api/client'
import { useResolvedTheme, useThemeColors } from '../hooks/useTheme'
import { connectionsText } from '../utils/profile'
import { SportIcon } from './arena/SportIcon'
import { Icon } from './Icon'
import { Text } from './Text'

/**
 * Identidade do perfil abaixo da capa, como o `ProfileHeader` da web: avatar de 88 pt sobre a borda da capa (com o selo de
 * editar no perfil próprio), `@usuário` em Sora, o nome, as conexões, os chips das modalidades e a visibilidade da conta.
 */
export function ProfileHeader({ name, username, avatar, isPublic, followerCount, followingCount, sportList, mutualText, actions, onEdit, onConnections }: {
  name: string
  username: string
  /** O `Avatar` já montado (84 pt, dentro do anel de 4 pt). */
  avatar: ReactNode
  isPublic: boolean
  followerCount: number
  followingCount: number
  /** Modalidades do perfil próprio; `undefined` no perfil de outra pessoa (sem chips nem convite). */
  sportList?: Sport[]
  /** Aliados em comum (perfil de outra pessoa). */
  mutualText?: string | null
  /** Ação à direita, na linha do `@usuário` (o Aliar-se do perfil de outra pessoa). */
  actions?: ReactNode
  onEdit?: () => void
  /** Abre as conexões; sem ela (perfil de outra pessoa), a linha só informa. */
  onConnections?: () => void
}) {
  const colors = useThemeColors()
  const dark = useResolvedTheme() === 'dark'
  return <View accessibilityLabel={onEdit ? 'Seu perfil' : `Perfil de ${name}`} className="px-5 pt-11">
    <View className="absolute -top-[42px] left-5 size-[88px]">
      <View style={{ borderColor: dark ? colors.app : '#ffffff' }} className="size-[88px] items-center justify-center overflow-hidden rounded-full border-4 bg-app">{avatar}</View>
      {onEdit ? <Pressable accessibilityRole="button" accessibilityLabel="Editar perfil" onPress={onEdit}
        className="absolute -right-1 bottom-0.5 size-9 items-center justify-center rounded-full border-[3px] border-app bg-brand">
        <Icon name="user-cog" size={16} color={colors['on-brand']} />
      </Pressable> : null}
    </View>
    {/* A ação do perfil de outra pessoa divide a linha com o `@usuário`, à direita; sem espaço, desce. */}
    <View className="mt-3.25 flex-row flex-wrap items-center gap-x-3 gap-y-2">
      <Text accessibilityRole="header" className="shrink text-[21px] text-heading"><Text className="text-brand">@</Text>{username}</Text>
      {actions ? <View className="ml-auto">{actions}</View> : null}
    </View>
    <Text className="mt-0.75 mb-1 text-[12px] font-medium text-ink-muted">{name}</Text>
    <Pressable accessibilityRole={onConnections ? 'button' : undefined} accessibilityLabel={`Conexões: ${connectionsText(followerCount, followingCount)}`} onPress={onConnections} disabled={!onConnections}
      className="mt-0.5 mb-2 min-h-8 flex-row items-center self-start">
      <Text className="text-[12px] text-ink-muted"><Text className="font-bold text-ink">{followerCount}</Text> {followerCount === 1 ? 'aliado' : 'aliados'}  ·  <Text className="font-bold text-ink">{followingCount}</Text> {followingCount === 1 ? 'aliança' : 'alianças'}</Text>
    </Pressable>
    {mutualText ? <Text className="mb-2 text-[11px] leading-[16px] text-ink">{mutualText}</Text> : null}
    {sportList ? <View className="flex-row flex-wrap gap-1.5">
      {sportList.length ? sportList.map(sport => <View key={sport} className="min-h-[29px] flex-row items-center gap-1.5 rounded-[18px] border border-brand bg-brand px-2">
        <SportIcon sport={sport} shape="aro" size={20} color={colors['on-brand']} />
        <Text className="text-[9px] font-bold text-on-brand">{sports.find(item => item.value === sport)?.label}</Text>
      </View>) : <Text className="text-[11px] leading-[18px] text-ink-muted">Adicione sua primeira modalidade</Text>}
    </View> : null}
    <View className="my-4 flex-row items-center gap-1.25">
      <Icon name="shield" size={13} color={colors['ink-muted']} />
      <Text className="text-[10px] text-ink-muted">{isPublic ? 'Conta pública' : 'Conta privada'}</Text>
    </View>
  </View>
}
