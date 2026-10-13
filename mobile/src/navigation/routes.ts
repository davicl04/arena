import type { Sport } from '../api/client'
import { eventNoun } from '../data/arena'
import type { NotificationFilter } from '../data/notifications'
import type { RunDistance } from '../data/arena'
import type { IconName } from '../components/Icon'

/*
 * Telas do app e seus parâmetros (a pilha por estado do Expo, como o `Entry` de `web/src/pages/ArenaPage.tsx`).
 * Não há roteador: cada entrada da pilha é `{ screen, params }`, tipada por este mapa. Todas as telas existem; o registro
 * de componentes fica em `navigation/screens.tsx`.
 */
export interface ScreenParams {
  /* Abas da navegação inferior: zeram a pilha. */
  home: undefined
  /** `sport`/`distanceKm`: abre o Ranking já na modalidade (e, na corrida, na distância), como o "Ver ranking" de "Suas marcas". */
  ranking: { sport?: Sport; distanceKm?: RunDistance } | undefined
  /**
   * `matchId`: a proposta ou a oferta de vaga dessa partida abre em tela cheia (vindas de notificações). `sport`: a aba
   * escolhida, guardada na entrada da pilha (como `Entry.sport` da web) para voltar da partida na mesma modalidade.
   */
  play: { matchId?: number; sport?: Sport } | undefined
  /** `compose`: abre a Comunidade já na nova publicação (quadro "Nova foto" do perfil). */
  community: { compose?: boolean } | undefined
  /** Aba do conteúdo preservada ao abrir uma partida e voltar ao perfil. */
  profile: { tab?: 'Fotos' | 'Partidas' } | undefined
  /** Perfil de outro atleta (o `user-profile` da web), empilhado sobre a tela de origem: "Ver perfil" do elenco e das filas. */
  'user-profile': { userId: number }
  /* Atleta: notificações, campeonatos e provas. */
  /** `filter`: o chip aberto de início (a placa "Para responder" do Início abre em `responder`); sem ele, `tudo`. */
  notifications: { filter?: NotificationFilter } | undefined
  /** Pedidos para seguir (subtela da tela de notificações). */
  'follow-requests': undefined
  /** Lista E2: a corrida chama os eventos de "Provas". */
  events: { sport?: Sport } | undefined
  /** Detalhe D2; `section: 'tabela'` abre na aba Tabela (notificações da tabela e do encerramento). */
  event: { eventId: number; sport?: Sport; section?: 'tabela' }
  /* Jogar (etapas 3 a 5). */
  match: { matchId: number }
  /* Campeonatos (etapa 4), do organizador: chaveamento e tabela, agenda das partidas e decisão do resultado. */
  'event-bracket': { eventId: number }
  /** `matchId`: a partida cuja folha de agendamento abre junto (vindo do "Agendar" da tela da partida). */
  'event-matches': { eventId: number; matchId?: number }
  'result-decision': { matchId: number }
  /* Times. `invites`/`requests`: abre a folha de convites ou a lista de pedidos (vindos de notificações). */
  teams: { teamId?: number; invites?: boolean; requests?: boolean } | undefined
  /** Criar (sem `teamId`) ou editar time. */
  'team-form': { teamId?: number } | undefined
  /** Convidar; `link` abre na aba Link e QR. */
  'team-invite': { teamId: number; link?: boolean }
  /** Entrar pelo link/QR: o token vem do endereço recebido e fica só em memória. */
  join: { token: string }
  /* Organizador. */
  'organizer-request': undefined
  'organizer-events': undefined
  /** Criar (sem `eventId`) ou editar rascunho; `step` abre num passo do assistente. */
  'event-wizard': { eventId?: number; step?: number } | undefined
  'event-manage': { eventId: number }
  'event-receipts': { eventId: number }
  /* Administração (exigem `is_admin`). */
  'admin-organizer-requests': undefined
  'admin-paid-events': undefined
  'admin-revoked-events': undefined
  'admin-refund-disputes': undefined
  'admin-court-suggestions': undefined
  'admin-walkover-disputes': undefined
  /** Denúncias (fila de moderação). */
  moderation: undefined
}

export type ScreenName = keyof ScreenParams
/** Argumento de parâmetros de `go`: opcional quando a tela aceita `undefined`, obrigatório nas demais. */
export type ParamsArg<S extends ScreenName> = undefined extends ScreenParams[S] ? [params?: ScreenParams[S]] : [params: ScreenParams[S]]
type EntryOf<S extends ScreenName> = undefined extends ScreenParams[S] ? { screen: S; params?: ScreenParams[S] } : { screen: S; params: ScreenParams[S] }
/** Uma tela da pilha, com o contexto necessário para restaurá-la ao voltar. */
export type Entry = { [S in ScreenName]: EntryOf<S> }[ScreenName]

/** Monta a entrada de `screen`; sem parâmetros, a chave `params` não existe. */
export function makeEntry<S extends ScreenName>(screen: S, ...args: ParamsArg<S>): Entry {
  const params = args[0]
  return (params === undefined ? { screen } : { screen, params }) as Entry
}

/**
 * Abas da navegação inferior, na ordem de exibição (JOGAR no centro e em destaque). Ranking (Coliseu) e JOGAR (muralha)
 * usam a marca no lugar de um ícone de traço, como na web.
 */
export const tabItems: readonly { screen: Extract<ScreenName, 'home' | 'ranking' | 'play' | 'community' | 'profile'>; label: string; icon: IconName | null }[] = [
  { screen: 'home', label: 'Início', icon: 'home' },
  { screen: 'ranking', label: 'Ranking', icon: null },
  { screen: 'play', label: 'JOGAR', icon: null },
  { screen: 'community', label: 'Comunidade', icon: 'users' },
  { screen: 'profile', label: 'Perfil', icon: 'user' },
]
export type TabScreen = (typeof tabItems)[number]['screen']
export const rootScreens: readonly ScreenName[] = tabItems.map(item => item.screen)
export const isRootScreen = (screen: ScreenName): screen is TabScreen => rootScreens.includes(screen)

export const titles: Record<ScreenName, string> = {
  home: 'Início',
  ranking: 'Ranking',
  play: 'Jogar',
  community: 'Comunidade',
  profile: 'Perfil',
  'user-profile': 'Perfil',
  notifications: 'Notificações',
  'follow-requests': 'Pedidos para seguir',
  events: eventNoun.futebol.many,
  event: eventNoun.futebol.one,
  match: 'Partida',
  'event-bracket': 'Chaveamento',
  'event-matches': 'Partidas',
  'result-decision': 'Decidir resultado',
  teams: 'Meus times',
  'team-form': 'Criar time',
  'team-invite': 'Convidar',
  join: 'Entrar no time',
  'organizer-request': 'Seja organizador',
  'organizer-events': 'Meus eventos',
  'event-wizard': 'Novo evento',
  'event-manage': 'Gestão do evento',
  'event-receipts': 'Comprovantes',
  'admin-organizer-requests': 'Pedidos de organizador',
  'admin-paid-events': 'Eventos pagos',
  'admin-revoked-events': 'Organizador revogado',
  'admin-refund-disputes': 'Devoluções contestadas',
  'admin-court-suggestions': 'Sugestões de quadra',
  'admin-walkover-disputes': 'W.O. contestados',
  moderation: 'Denúncias',
}

/** Título da barra conforme o contexto: edição de time ou de rascunho e eventos da corrida ("Provas"). */
export function titleFor(entry: Entry): string {
  switch (entry.screen) {
    case 'team-form': return entry.params?.teamId ? 'Editar time' : titles['team-form']
    case 'event-wizard': return entry.params?.eventId ? 'Editar rascunho' : titles['event-wizard']
    case 'events': return entry.params?.sport ? eventNoun[entry.params.sport].many : titles.events
    case 'event': return entry.params.sport ? eventNoun[entry.params.sport].one : titles.event
    default: return titles[entry.screen]
  }
}

/* Telas empilhadas que acendem uma aba diferente da própria. */
const profileScreens: readonly ScreenName[] = [
  'organizer-request', 'organizer-events', 'event-wizard', 'event-manage', 'event-receipts', 'event-bracket', 'event-matches', 'result-decision',
  'admin-organizer-requests', 'admin-paid-events', 'admin-revoked-events', 'admin-refund-disputes', 'admin-court-suggestions', 'admin-walkover-disputes', 'moderation',
]
const playScreens: readonly ScreenName[] = ['teams', 'team-form', 'team-invite', 'join', 'events', 'event', 'match']

/**
 * Aba acesa na navegação inferior para a tela atual (`root` é a primeira tela da pilha). As telas de Meus times, dos
 * eventos do atleta (o detalhe traz a Tabela do campeonato) e da partida acendem "JOGAR"; as de organizador e
 * administração, inclusive o chaveamento, as partidas e a decisão do campeonato, "Perfil"; Notificações e Pedidos para seguir
 * acendem a aba de onde o sino foi tocado (`root`).
 */
export function activeNavFor(screen: ScreenName, root: ScreenName): TabScreen {
  if (isRootScreen(screen)) return screen
  if (profileScreens.includes(screen)) return 'profile'
  if (playScreens.includes(screen)) return 'play'
  return isRootScreen(root) ? root : 'home'
}

/**
 * Telas que desenham a própria barra de topo e dispensam o cabeçalho claro do shell, como no `ArenaPage` da web: a placa
 * escura de Meus times, do organizador, dos comprovantes e do Criar evento (voltar ou fechar e o título dentro dela), a capa
 * do perfil de outro atleta (voltar e ••• na barra fixa), o cabeçalho da partida (P2) e as telas do campeonato do organizador
 * (chaveamento, partidas e decisão) e a placa das notificações (voltar, título e filtros; os pedidos para seguir usam o cabeçalho padrão).
 * Entre as abas, o Início (marca e sino) e o Jogar (placa `forest` com o Coliseu) também
 * trazem o topo, e por isso o shell não põe a faixa "arena." acima delas. Telas novas que não desenhem a barra ficam fora da lista.
 */
const ownHeaderScreens: readonly ScreenName[] = [
  'home', 'play', 'user-profile', 'teams', 'team-form', 'team-invite', 'join', 'organizer-events', 'event-wizard', 'event-manage', 'event-receipts',
  'match', 'event-bracket', 'event-matches', 'result-decision', 'notifications',
]
export const hasOwnHeader = (screen: ScreenName): boolean => ownHeaderScreens.includes(screen)
