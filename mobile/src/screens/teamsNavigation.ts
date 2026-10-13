import { makeEntry } from '../navigation/routes'
import type { Navigation } from '../navigation/useNavigation'

/**
 * Sai da tela atual (Criar time, Entrar no time) para Meus times com o time no carrossel: substitui a Meus times logo
 * abaixo na pilha ou, se não houver, a empilha no lugar da atual. `invites` abre a folha de convites recebidos.
 */
export function showTeams(navigation: Navigation, teamId?: number, invites = false) {
  navigation.replace(makeEntry('teams', { teamId, invites }), below => below.screen === 'teams')
}
