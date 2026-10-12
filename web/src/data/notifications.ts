import type { ArenaNotification } from '../api/notifications'
import { refusalText } from '../api/organizer'
import type { OrganizerRefusalReason } from '../api/organizer'
import { receiptRefusalSentence } from '../api/receipts'
import { eventRefusalReason } from './arena'
import type { Screen } from './arena'
import { formatDeadline } from '../utils/format'

/**
 * Para onde a notificação leva ao ser tocada (contrato 0003, seções 7 e 17): Meus times com o time no carrossel
 * (`teamId`), a folha de convites recebidos (`invites`) ou a lista "Pedidos para entrar" (`requests`); o Menu, com o
 * cartão do organizador; ou as telas de eventos com o evento (`eventId`): o detalhe do atleta (`event`), a gestão
 * e os comprovantes do organizador (`event-manage`, `event-receipts`) e as filas da administração (`admin-paid-events`,
 * `admin-refund-disputes`).
 */
export interface NotificationTarget { screen: Screen; teamId?: number; invites?: boolean; requests?: boolean; eventId?: number }

export interface NotificationView {
  /** Texto em português montado a partir do `payload` e do `actor`. */
  text: string
  /**
   * `team`: escudo neutro com as iniciais de `teamName`; `organizer`: ícone do organizador; `event`: ícone de
   * campeonato (inscrições, comprovantes, devoluções e avisos); `other`: tipos de fases seguintes.
   */
  kind: 'team' | 'organizer' | 'event' | 'other'
  teamName: string | null
  target: NotificationTarget | null
}

/** Quem recebe a notificação, para escolher o destino dos tipos que vão a mais de um papel. */
export interface NotificationViewer { isAdmin?: boolean }

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null)
const id = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null)

/** Motivo com rótulo e detalhe ("Valor diferente: faltaram R$ 40"); "Outro" mostra só o detalhe. */
function reasonText(label: string | null, detail: string | null) {
  if (label && detail) return label === 'Outro' ? detail : `${label}: ${detail}`
  return label ?? detail ?? 'motivo não informado'
}
function eventReason(code: unknown, detail: unknown) {
  const label = typeof code === 'string' && code in eventRefusalReason ? eventRefusalReason[code as keyof typeof eventRefusalReason].label : null
  return reasonText(label, text(detail))
}

/**
 * Texto e destino de cada tipo das etapas 1 e 2. Sem `actor`, o texto usa "Um representante", "Um atleta",
 * "O organizador" ou "A administração". Tipos desconhecidos (fases seguintes) ganham um texto genérico, sem destino.
 */
export function notificationView(notification: ArenaNotification, viewer: NotificationViewer = {}): NotificationView {
  const payload = notification.payload ?? {}
  const teamName = text(payload.team_name)
  const team = teamName ?? 'time'
  const teamId = id(payload.team_id)
  const actor = text(notification.actor?.name)
  const toTeam: NotificationTarget = teamId ? { screen: 'teams', teamId } : { screen: 'teams' }
  const teamView = (value: string, target: NotificationTarget | null): NotificationView => ({ text: value, kind: 'team', teamName, target })
  const organizerView = (value: string): NotificationView => ({ text: value, kind: 'organizer', teamName: null, target: { screen: 'menu' } })
  /* Etapa 2: o nome do evento é a cópia do aviso; a navegação usa `event_id` e mostra os dados atuais. */
  const eventId = id(payload.event_id)
  const eventName = text(payload.event_name)
  const event = eventName ?? 'um evento'
  /** No início da frase: o nome como veio, ou "Um evento". */
  const Event = eventName ?? 'Um evento'
  const eventView = (value: string, screen: Screen): NotificationView => ({
    text: value, kind: 'event', teamName: null, target: eventId ? { screen, eventId } : null,
  })
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

    /* Atleta (ou representantes e membros do time): o detalhe do evento, com a inscrição. */
    case 'time_inscrito':
      return eventView(`${actor ?? 'Um representante'} inscreveu o ${team} em ${event}`, 'event')
    case 'comprovante_decidido': {
      if (payload.decision === 'aprovado') return eventView(`Inscrição confirmada em ${event}`, 'event')
      const deadline = formatDeadline(text(payload.reserved_until))
      return eventView(`Comprovante recusado em ${event}: ${receiptRefusalSentence(text(payload.reason_code), text(payload.reason_detail))}.${deadline ? ` Envie outro até ${deadline}` : ' Envie outro'}`, 'event')
    }
    case 'reserva_expirada':
      return eventView(`Sua reserva em ${event} expirou e a vaga foi liberada`, 'event')
    case 'evento_cancelado':
      return eventView(`${Event} foi cancelado: ${text(payload.reason)?.replace(/[.!;]+$/, '') || 'motivo não informado'}${payload.refund === true ? '. O organizador vai devolver o valor por Pix' : ''}`, 'event')
    case 'aviso_evento':
      return eventView(`Novo aviso em ${event}`, 'event')
    case 'devolucao_enviada':
      return eventView(`${actor ?? 'O organizador'} enviou a devolução de ${event}. Confirme o recebimento`, 'event')
    case 'devolucao_decidida':
      // Vai ao organizador e aos participantes: o detalhe serve aos dois (o organizador tem o atalho para a gestão).
      return payload.decision === 'devolvida'
        ? eventView(`A administração considerou feita a devolução de ${event}`, 'event')
        : eventView(`A administração pediu outro comprovante da devolução de ${event}`, 'event')

    /* Organizador: gestão e comprovantes do evento. */
    case 'comprovante_recebido':
      return eventView(`Novo comprovante em ${event}`, 'event-receipts')
    case 'evento_decidido':
      return payload.decision === 'aprovado'
        ? eventView(`${Event} foi aprovado e publicado`, 'event-manage')
        : eventView(`${Event} foi recusado: ${eventReason(payload.reason_code, payload.reason_detail)}`, 'event-manage')
    case 'evento_revogacao_decidida':
      return payload.decision === 'seguir'
        ? eventView(`A administração manteve ${event}`, 'event-manage')
        : eventView(`A administração cancelou ${event}`, 'event-manage')
    case 'devolucao_confirmada':
      // Automática: vai também aos participantes; o detalhe serve aos dois.
      return payload.automatic === true
        ? eventView(`Devolução de ${event} considerada recebida após 7 dias`, 'event')
        : eventView(`${actor ?? 'O participante'} confirmou a devolução de ${event}`, 'event-manage')
    case 'devolucao_contestada': {
      // Organizador e administração: a administração decide na fila "Devoluções contestadas"; o organizador acompanha na gestão.
      const view = eventView(`${actor ?? 'Um participante'} contestou a devolução de ${event}`, 'event-manage')
      return viewer.isAdmin ? { ...view, target: { screen: 'admin-refund-disputes' } } : view
    }

    /* Administração. */
    case 'evento_para_aprovar':
      return { ...eventView(`${actor ?? 'Um organizador'} enviou ${event} para aprovação`, 'admin-paid-events'), target: eventId ? { screen: 'admin-paid-events', eventId } : { screen: 'admin-paid-events' } }
    default:
      return { text: 'Nova atividade na sua conta', kind: 'other', teamName: null, target: null }
  }
}
