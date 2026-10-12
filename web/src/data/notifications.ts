import type { ArenaNotification } from '../api/notifications'
import { refusalText } from '../api/organizer'
import type { OrganizerRefusalReason } from '../api/organizer'
import type { Screen } from './arena'

/**
 * Para onde a notificação leva ao ser tocada (contrato 0003, seção 7): Meus times com o time no carrossel (`teamId`),
 * a folha de convites recebidos (`invites`) ou a lista "Pedidos para entrar" (`requests`); ou o Menu, com o cartão do
 * organizador.
 */
export interface NotificationTarget { screen: Screen; teamId?: number; invites?: boolean; requests?: boolean }

export interface NotificationView {
  /** Texto em português montado a partir do `payload` e do `actor`. */
  text: string
  /** `team`: escudo neutro com as iniciais de `teamName`; `organizer`: ícone do organizador; `other`: tipos de fases seguintes. */
  kind: 'team' | 'organizer' | 'other'
  teamName: string | null
  target: NotificationTarget | null
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null)
const id = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null)

/**
 * Texto e destino de cada tipo da etapa 1. Sem `actor`, o texto usa "Um representante", "Um atleta" ou
 * "A administração". Tipos desconhecidos (fases seguintes) ganham um texto genérico, sem destino.
 */
export function notificationView(notification: ArenaNotification): NotificationView {
  const payload = notification.payload ?? {}
  const teamName = text(payload.team_name)
  const team = teamName ?? 'time'
  const teamId = id(payload.team_id)
  const actor = text(notification.actor?.name)
  const toTeam: NotificationTarget = teamId ? { screen: 'teams', teamId } : { screen: 'teams' }
  const teamView = (value: string, target: NotificationTarget | null): NotificationView => ({ text: value, kind: 'team', teamName, target })
  const organizerView = (value: string): NotificationView => ({ text: value, kind: 'organizer', teamName: null, target: { screen: 'menu' } })
  switch (notification.type) {
    case 'convite_time':
      // A folha mostra os convites pendentes de agora; se este já foi aceito, o time está no carrossel.
      return teamView(`${actor ?? 'Um representante'} convidou você para o ${team}`, { ...toTeam, invites: true })
    case 'convite_aceito':
      return teamView(`${actor ?? 'Um atleta'} aceitou o convite e entrou no ${team}`, toTeam)
    case 'pedido_entrada':
      return teamView(`${actor ?? 'Um atleta'} pediu para entrar no ${team}`, { ...toTeam, requests: true })
    case 'pedido_entrada_decidido':
      return payload.decision === 'aprovado'
        ? teamView(`Seu pedido para entrar no ${team} foi aprovado`, toTeam)
        : teamView(`Seu pedido para entrar no ${team} foi recusado`, null)
    case 'removido_do_time':
      return teamView(`Você foi removido do ${team}`, null)
    case 'time_encerrado':
      return teamView(`O ${team} foi encerrado`, null)
    case 'pedido_organizador_decidido':
      return payload.decision === 'aprovado'
        ? organizerView('Seu pedido de organizador foi aprovado')
        : organizerView(`Seu pedido de organizador foi recusado: ${refusalText(payload.reason_code as OrganizerRefusalReason | null, text(payload.reason_detail))}`)
    case 'organizador_revogado':
      return organizerView(`Sua permissão de organizador foi revogada: ${text(payload.reason) ?? 'motivo não informado'}`)
    default:
      return { text: 'Nova atividade na sua conta', kind: 'other', teamName: null, target: null }
  }
}
