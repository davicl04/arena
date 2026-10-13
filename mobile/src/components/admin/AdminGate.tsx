import type { ReactNode } from 'react'
import { ScrollView, Text, View } from 'react-native'
import type { User } from '../../api/client'
import { tw } from '../../styles'

export const ADMIN_ONLY = 'Esta área é só para a administração do Arena.'

/**
 * Porteiro das telas da administração: sem `is_admin` a pessoa vê um aviso e nenhuma requisição é feita (o servidor
 * também responde 403 às rotas `/admin`). O conteúdo só é montado, com seus `hooks` de leitura, para quem tem acesso.
 */
export default function AdminGate({ user, children }: { user: User; children: ReactNode }) {
  if (user.is_admin) return <>{children}</>
  return <ScrollView contentContainerClassName={tw.content}>
    <View testID="admin-denied" className={tw.card}>
      <Text className={tw.eyebrow}>ACESSO RESTRITO</Text>
      <Text accessibilityRole="header" className={tw.heading}>Sem acesso</Text>
      <Text className={tw.body}>{ADMIN_ONLY}</Text>
    </View>
  </ScrollView>
}
