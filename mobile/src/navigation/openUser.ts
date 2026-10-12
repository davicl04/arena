import type { Navigation } from './useNavigation'

/** "Ver perfil" (como `openUser` do `ArenaPage` da web): o próprio perfil é a aba Perfil; o de outro atleta empilha `user-profile` e volta para a tela de origem. */
export function openUser(navigation: Pick<Navigation, 'go'>, viewerId: number, userId: number) {
  if (userId === viewerId) navigation.go('profile')
  else navigation.go('user-profile', { userId })
}
