import { positions } from '../api/client'
import type { ArenaNotification, NotificationFilterCategory, NotificationSummary } from '../api/notifications'
import { refusalText } from '../api/organizer'
import type { OrganizerRefusalReason } from '../api/organizer'
import { receiptRefusalSentence } from '../api/receipts'
import { formatDeadline } from '../utils/format'
import { eventRefusalReason, footballFormat } from './arena'
import type { FootballFormat } from './arena'

/*
 * Texto e destino de cada tipo de notificação das etapas 1 a 4 (porta de `web/src/data/notifications.ts`; contrato 0003,
 * seções 7, 17 e 21.6, e 0002, seção 13). Tipos desconhecidos (fases seguintes) ganham um texto genérico, sem destino.
 */

/**
 * Para onde a notificação leva ao ser tocada, com as telas do app: Meus times com o time no carrossel (`teamId`), a
 * folha de convites recebidos (`invites`) ou a lista "Pedidos para entrar" (`requests`); o cartão do organizador (a
 * tela "Seja organizador", que no app faz o papel do Menu da web); o detalhe do evento do atleta, a gestão e os
 * comprovantes do organizador; e as filas da administração.
 *
 * Etapa 3 (0002-jogar, seção 13): a partida (`match`, com `matchId`), a placa do Jogar (`play`; propostas e ofertas, com
 * `matchId` como dica da proposta) e as filas `admin-court-suggestions` e `admin-walkover-disputes`. Etapa 4 (0003, seção
 * 21.6): a aba Tabela do evento (`event` com `section: 'tabela'`) e a decisão do organizador (`result-decision`).
 */
export type NotificationTarget =
  | { screen: 'teams'; teamId?: number; invites?: boolean; requests?: boolean }
  | { screen: 'organizer-request' }
  /** `section: 'tabela'` abre o detalhe do evento na aba Tabela (tabela publicada e campeonato encerrado). */
  | { screen: 'event'; eventId: number; section?: 'tabela' }
  | { screen: 'event-manage' | 'event-receipts'; eventId: number }
  /** A agenda das partidas do campeonato; `matchId` abre junto a folha de agendamento dessa partida. */
  | { screen: 'event-matches'; eventId: number; matchId?: number }
  | { screen: 'admin-paid-events' | 'admin-refund-disputes' | 'admin-court-suggestions' | 'admin-walkover-disputes' }
  | { screen: 'match' | 'result-decision'; matchId: number }
  /** A placa do Jogar; `matchId` é a dica da proposta ou da oferta a abrir em tela cheia. */
  | { screen: 'play'; matchId?: number }

type EventScreenName = 'event' | 'event-manage' | 'event-receipts'

export interface NotificationView {
  /** Texto em português montado a partir do `payload` e do `actor`. */
  text: string
  /**
   * `team`: escudo neutro com as iniciais de `teamName`; `organizer`: ícone do organizador; `event`: ícone de
   * campeonato (inscrições, comprovantes, devoluções e avisos); etapa 3: `match` (busca, proposta, vaga), `schedule`
   * (condições, agenda e cancelamento), `result` (resultado e estatísticas), `walkover` (W.O.) e `court` (quadras);
   * `other`: tipos de fases seguintes.
   */
  kind: 'team' | 'organizer' | 'event' | 'match' | 'schedule' | 'result' | 'walkover' | 'court' | 'other'
  teamName: string | null
  target: NotificationTarget | null
}

/** Quem recebe a notificação, para escolher o destino dos tipos que vão a mais de um papel. */
export interface NotificationViewer { isAdmin?: boolean }

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null)
const id = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null)

/** "Goleiro" → "goleiro", "Meio de campo" → "meio de campo"; código desconhecido → "posição". */
const positionName = (code: unknown) => positions.find(item => item.value === code)?.label.toLowerCase() ?? 'posição'
/** Campos da estatística contestada, como aparecem na frase ("gols e assistências"). */
const statFieldName: Record<string, string> = { gols: 'gols', assistencias: 'assistências', estatistica_posicao: 'estatística da posição' }
function listText(items: string[]) {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}` : items[0] ?? ''
}
const noTrailingDot = (value: string) => value.replace(/[.!;]+$/, '')

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
 * Texto e destino de cada tipo das etapas 1 a 4. Sem `actor`, o texto usa "Um representante", "Um atleta",
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
  const organizerView = (value: string): NotificationView => ({ text: value, kind: 'organizer', teamName: null, target: { screen: 'organizer-request' } })
  /* Etapa 2: o nome do evento é a cópia do aviso; a navegação usa `event_id` e mostra os dados atuais. */
  const eventId = id(payload.event_id)
  const eventName = text(payload.event_name)
  const event = eventName ?? 'um evento'
  /** No início da frase: o nome como veio, ou "Um evento". */
  const Event = eventName ?? 'Um evento'
  const eventView = (value: string, screen: EventScreenName): NotificationView => ({
    text: value, kind: 'event', teamName: null, target: eventId ? { screen, eventId } : null,
  })
  /** Etapa 4: o detalhe do evento já na aba Tabela. */
  const tableView = (value: string): NotificationView => ({ text: value, kind: 'event', teamName: null, target: eventId ? { screen: 'event', eventId, section: 'tabela' } : null })
  /* Etapa 3: a navegação usa `match_id`; o texto, os nomes copiados no momento do aviso. */
  const matchId = id(payload.match_id)
  const toMatch: NotificationTarget | null = matchId ? { screen: 'match', matchId } : null
  const toBoard: NotificationTarget = matchId ? { screen: 'play', matchId } : { screen: 'play' }
  const matchView = (value: string, kind: 'match' | 'schedule' | 'result' | 'walkover', target: NotificationTarget | null): NotificationView => ({
    text: value, kind, teamName: null, target,
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

    /* Etapa 3 (Jogar): propostas e ofertas abrem a placa; o resto da vida da partida, a tela da partida. */
    case 'proposta_partida': {
      const opponent = text(payload.opponent_name) ?? 'um adversário'
      const deadline = formatDeadline(text(payload.expires_at))
      return matchView(`Partida encontrada contra ${opponent}. Responda ${deadline ? `até ${deadline}` : 'em até 2 h'}`, 'match', toBoard)
    }
    case 'proposta_aceita': {
      const opponent = text(payload.opponent_name)
      // Aceite dos dois lados: a partida existe e o chat abriu; senão, a proposta segue na placa do Jogar.
      return payload.complete === true
        ? matchView(`Partida confirmada contra ${opponent ?? 'um adversário'}. Combinem no chat`, 'match', toMatch)
        : matchView(`${opponent ?? actor ?? 'O adversário'} aceitou a proposta`, 'match', toBoard)
    }
    case 'proposta_encerrada': {
      const opponent = text(payload.opponent_name) ?? 'um adversário'
      const how = payload.reason === 'expirada' ? 'expirou' : 'foi recusada'
      return matchView(`A proposta contra ${opponent} ${how}${payload.requeued === true ? '. Sua busca continua' : ''}`, 'match', toBoard)
    }
    case 'vaga_encontrada': {
      const deadline = formatDeadline(text(payload.expires_at))
      return matchView(`Vaga de ${positionName(payload.position)} no ${team}. Responda ${deadline ? `até ${deadline}` : 'em até 2 h'}`, 'match', toBoard)
    }
    case 'vaga_preenchida':
      return matchView(`${actor ?? 'Um avulso'} entrou como ${positionName(payload.position)}`, 'match', toMatch)
    case 'oferta_retirada':
      // O representante reduziu as vagas ou cancelou a partida: a placa mostra a busca que segue, se houver.
      return matchView(`A vaga de ${positionName(payload.position)} no ${team} foi retirada${payload.requeued === true ? '. Sua busca continua' : ''}`, 'match', toBoard)
    case 'removido_da_partida':
      // Sem destino: quem foi removido deixa de ter acesso à partida.
      return matchView(`Você foi removido da partida do ${team}`, 'match', null)

    case 'condicoes_propostas': {
      const detail = [formatDeadline(text(payload.starts_at)), text(payload.court_name) && `em ${text(payload.court_name)}`].filter(Boolean).join(' ')
      return matchView(`${actor ?? 'O outro lado'} propôs novas condições${detail ? `: ${detail}` : ''}`, 'schedule', toMatch)
    }
    case 'partida_agendada': {
      const detail = [formatDeadline(text(payload.starts_at)), text(payload.court_name) && `em ${text(payload.court_name)}`].filter(Boolean).join(' ')
      return matchView(`${payload.changed === true ? 'Partida alterada' : 'Partida agendada'}${detail ? `: ${detail}` : ''}`, 'schedule', toMatch)
    }
    case 'partida_cancelada': {
      const when = formatDeadline(text(payload.starts_at))
      const reason = text(payload.reason)
      const subject = when ? `a partida de ${when}` : 'a partida'
      const sentence = actor ? `${actor} cancelou ${subject}` : `${subject[0].toUpperCase()}${subject.slice(1)} foi cancelada`
      return matchView(`${sentence}${reason ? `: ${noTrailingDot(reason)}` : ''}`, 'schedule', toMatch)
    }

    case 'wo_registrado': {
      const opponent = text(payload.opponent_name) ?? actor ?? 'O adversário'
      const deadline = formatDeadline(text(payload.contest_until))
      return matchView(`${opponent} registrou W.O. Conteste${deadline ? ` até ${deadline}` : ''} se vocês compareceram`, 'walkover', toMatch)
    }
    case 'wo_contestado': {
      // Vai a quem registrou (a partida) e às contas administrativas (a fila de W.O. contestados).
      const view = matchView(`${actor ?? 'O outro lado'} contestou o W.O.`, 'walkover', toMatch)
      return viewer.isAdmin ? { ...view, target: { screen: 'admin-walkover-disputes' } } : view
    }
    case 'wo_decidido': {
      const reason = text(payload.reason)
      return matchView(`A administração ${payload.decision === 'mantido' ? 'manteve' : 'anulou'} o W.O.${reason ? `: ${noTrailingDot(reason)}` : ''}`, 'walkover', toMatch)
    }

    case 'resultado_partida': {
      if (payload.outcome === 'wo') return matchView('Resultado definido: vale o W.O.', 'result', toMatch)
      if (payload.outcome === 'sem_resultado') return matchView('A partida ficou sem resultado', 'result', toMatch)
      const a = payload.score_a
      const b = payload.score_b
      return matchView(`Resultado confirmado${typeof a === 'number' && typeof b === 'number' ? `: ${a} × ${b}` : ''}`, 'result', toMatch)
    }
    case 'resultado_divergente': {
      const deadline = formatDeadline(text(payload.deadline))
      return matchView(`Os placares não batem. Corrijam${deadline ? ` até ${deadline}` : ' antes do fim do prazo'}`, 'result', toMatch)
    }
    case 'estatistica_contestada': {
      const fields = Array.isArray(payload.fields) ? payload.fields.map(field => statFieldName[String(field)]).filter(Boolean) : []
      return matchView(`${actor ?? 'O adversário'} contestou estatísticas da partida${fields.length ? ` (${listText(fields)})` : ''}`, 'result', toMatch)
    }

    case 'quadra_decidida': {
      const court = text(payload.court_name) ?? 'A quadra sugerida'
      // Sem destino: a quadra não tem tela; a partida de origem mostra a quadra do catálogo.
      if (payload.decision === 'publicada') return { text: `${court} entrou no catálogo`, kind: 'court', teamName: null, target: null }
      const reason = text(payload.reason)
      const why = reason ? noTrailingDot(reason) : id(payload.duplicate_of_id) ? 'já existe no catálogo' : null
      return { text: `${court} foi recusada${why ? `: ${why}` : ''}`, kind: 'court', teamName: null, target: null }
    }

    /* Etapa 4 (campeonatos): tabela, adversário, divergência, decisão e encerramento. */
    case 'tabela_publicada':
      return tableView(`A tabela de ${event} saiu`)
    case 'adversario_definido': {
      const opponent = text(payload.opponent_name)
      return matchView(`Seu próximo jogo${opponent ? `: ${opponent}` : ' está definido'}${eventName ? ` em ${eventName}` : ''}`, 'match', toMatch)
    }
    case 'divergencia_para_decidir': {
      const deadline = formatDeadline(text(payload.deadline))
      return matchView(`Os placares de uma partida de ${event} não batem. Decida${deadline ? ` (prazo dos times: ${deadline})` : ''}`, 'result',
        matchId ? { screen: 'result-decision', matchId } : null)
    }
    case 'decisao_registrada': {
      const a = payload.score_a
      const b = payload.score_b
      const score = typeof a === 'number' && typeof b === 'number' ? `${a} × ${b}` : ''
      return matchView(
        payload.kind === 'wo'
          ? `O organizador decidiu o resultado por W.O.${score ? ` (${score})` : ''}`
          : `O organizador decidiu o resultado${score ? `: ${score}` : ''}`,
        'result', toMatch)
    }
    case 'evento_encerrado': {
      const champion = text(payload.champion)
      return tableView(`${Event} terminou${champion ? `: campeão ${champion}` : ''}`)
    }

    /* Administração: a fila "Eventos pagos" (no app a fila não abre um evento específico). */
    case 'evento_para_aprovar':
      return { text: `${actor ?? 'Um organizador'} enviou ${event} para aprovação`, kind: 'event', teamName: null, target: { screen: 'admin-paid-events' } }
    default:
      return { text: 'Nova atividade na sua conta', kind: 'other', teamName: null, target: null }
  }
}

/* ===== Pendências, prazos e agrupamento por dia (tela de notificações e placa do Início) ===== */

/** Filtro da tela de notificações (chips); `responder` é só o bloco "Para responder", sem lista abaixo. */
export type NotificationFilter = 'tudo' | 'responder' | NotificationFilterCategory

export const notificationFilters: readonly { value: NotificationFilter; label: string }[] = [
  { value: 'tudo', label: 'Tudo' },
  { value: 'responder', label: 'Para responder' },
  { value: 'partidas', label: 'Partidas' },
  { value: 'times', label: 'Times' },
  { value: 'eventos', label: 'Eventos' },
]

export interface PendingView {
  /** Rótulo curto da pendência, em caixa alta ("PARTIDA ENCONTRADA"). */
  label: string
  /** Linha secundária (quem e onde), vazia quando o aviso não traz dados para ela. */
  secondary: string
  /** Texto do botão do cartão ("Responder proposta"). */
  action: string
}

const pendingLabels: Record<string, { label: string; action: string }> = {
  convite_time: { label: 'CONVITE DE TIME', action: 'Ver convite' },
  pedido_entrada: { label: 'PEDIDO PARA ENTRAR', action: 'Ver pedido' },
  proposta_partida: { label: 'PARTIDA ENCONTRADA', action: 'Responder proposta' },
  vaga_encontrada: { label: 'VAGA ENCONTRADA', action: 'Responder vaga' },
  condicoes_propostas: { label: 'CONDIÇÕES PROPOSTAS', action: 'Ver condições' },
  wo_registrado: { label: 'W.O. REGISTRADO', action: 'Contestar W.O.' },
  resultado_divergente: { label: 'RESULTADO DIVERGENTE', action: 'Revisar resultado' },
  comprovante_decidido: { label: 'COMPROVANTE RECUSADO', action: 'Enviar comprovante' },
  devolucao_enviada: { label: 'DEVOLUÇÃO ENVIADA', action: 'Confirmar devolução' },
  comprovante_recebido: { label: 'COMPROVANTE RECEBIDO', action: 'Analisar comprovante' },
  divergencia_para_decidir: { label: 'DIVERGÊNCIA PARA DECIDIR', action: 'Decidir resultado' },
  evento_para_aprovar: { label: 'EVENTO PARA APROVAR', action: 'Analisar evento' },
  devolucao_contestada: { label: 'DEVOLUÇÃO CONTESTADA', action: 'Decidir devolução' },
  wo_contestado: { label: 'W.O. CONTESTADO', action: 'Decidir W.O.' },
}
const unknownPending = { label: 'PEDE SUA RESPOSTA', action: 'Abrir' }

const joinParts = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ')

/** Rótulo curto, linha secundária e texto do botão de uma pendência. Tipos fora da tabela caem em "PEDE SUA RESPOSTA". */
export function pendingView(notification: ArenaNotification): PendingView {
  const payload = notification.payload ?? {}
  const actor = text(notification.actor?.name)
  const team = text(payload.team_name)
  const event = text(payload.event_name)
  const opponent = text(payload.opponent_name)
  const labels = pendingLabels[notification.type] ?? unknownPending
  let secondary = ''
  switch (notification.type) {
    case 'convite_time':
    case 'pedido_entrada':
      secondary = joinParts(actor, team); break
    case 'proposta_partida': {
      const format = typeof payload.format === 'string' ? footballFormat[payload.format as FootballFormat] : undefined
      secondary = joinParts(opponent, format && `${format.label.toLowerCase()} ${format.size}`); break
    }
    case 'vaga_encontrada':
      secondary = joinParts(positions.find(item => item.value === payload.position)?.label, team); break
    case 'condicoes_propostas':
      secondary = joinParts(actor, formatDeadline(text(payload.starts_at)), text(payload.court_name)); break
    case 'wo_registrado': {
      const until = formatDeadline(text(payload.contest_until))
      secondary = joinParts(opponent ?? actor, until && `conteste até ${until}`); break
    }
    case 'resultado_divergente': {
      const until = formatDeadline(text(payload.deadline))
      secondary = until ? `Corrijam até ${until}` : ''; break
    }
    case 'comprovante_decidido':
      secondary = event ?? ''; break
    case 'devolucao_enviada':
    case 'comprovante_recebido':
    case 'evento_para_aprovar':
    case 'devolucao_contestada':
    case 'divergencia_para_decidir':
      secondary = joinParts(event, actor); break
    case 'wo_contestado':
      secondary = actor ?? ''; break
  }
  return { ...labels, secondary }
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Tempo que falta, curto: "35 min", "1 h 52", "2 h", "1 dia 5 h", "3 dias". */
export function remainingText(ms: number): string {
  if (ms < MINUTE) return 'menos de 1 min'
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} min`
  if (ms < DAY) {
    const hours = Math.floor(ms / HOUR)
    const minutes = Math.floor((ms % HOUR) / MINUTE)
    return minutes ? `${hours} h ${String(minutes).padStart(2, '0')}` : `${hours} h`
  }
  const days = Math.floor(ms / DAY)
  const hours = Math.floor((ms % DAY) / HOUR)
  return `${days} ${days === 1 ? 'dia' : 'dias'}${hours ? ` ${hours} h` : ''}`
}

export interface PendingDeadline {
  /** Tempo restante ("1 h 52"); `null` quando a pendência não tem prazo e "encerrado" quando o prazo passou. */
  remaining: string | null
  /** Fração do tempo que ainda resta, de 1 (recém-criada) a 0 (prazo); `null` sem prazo. */
  fraction: number | null
  /** Âmbar: restam menos de 25% do tempo entre `created_at` e `action_until` (exatamente 25% ainda é verde). */
  warn: boolean
}

/** Prazo de uma pendência no instante `now`: a barra vai de `created_at` até `action_until`. */
export function pendingDeadline(notification: ArenaNotification, now: number): PendingDeadline {
  const until = notification.action_until ? new Date(notification.action_until).getTime() : NaN
  if (Number.isNaN(until)) return { remaining: null, fraction: null, warn: false }
  const left = until - now
  if (left <= 0) return { remaining: 'encerrado', fraction: 0, warn: true }
  const total = until - new Date(notification.created_at).getTime()
  const fraction = Number.isFinite(total) && total > 0 ? Math.min(1, left / total) : 1
  return { remaining: remainingText(left), fraction, warn: fraction < 0.25 }
}

/** "faltam 1 h 52", "sem prazo" ou "prazo encerrado". */
export const deadlineSentence = (deadline: PendingDeadline): string =>
  deadline.remaining === null ? 'sem prazo' : deadline.remaining === 'encerrado' ? 'prazo encerrado' : `faltam ${deadline.remaining}`

export type DayGroupLabel = 'Hoje' | 'Ontem' | 'Esta semana' | 'Anteriores'
export interface DayGroup { label: DayGroupLabel; items: ArenaNotification[] }

const startOfDay = (time: number) => { const date = new Date(time); date.setHours(0, 0, 0, 0); return date.getTime() }

/**
 * Agrupa por dia local, mantendo a ordem recebida: Hoje, Ontem, Esta semana (de 2 a 6 dias atrás) e Anteriores. Só cria os
 * grupos que têm itens; datas inválidas ou futuras entram em Hoje.
 */
export function groupByDay(items: readonly ArenaNotification[], now: number = Date.now()): DayGroup[] {
  const today = startOfDay(now)
  const groups: DayGroup[] = []
  for (const item of items) {
    const time = new Date(item.created_at).getTime()
    const days = Number.isNaN(time) ? 0 : Math.round((today - startOfDay(time)) / DAY)
    const label: DayGroupLabel = days <= 0 ? 'Hoje' : days === 1 ? 'Ontem' : days < 7 ? 'Esta semana' : 'Anteriores'
    const last = groups[groups.length - 1]
    if (last?.label === label) last.items.push(item)
    else groups.push({ label, items: [item] })
  }
  return groups
}

/**
 * Linha de resumo da placa: "4 não lidas · 3 pedem sua resposta", "Tudo lido · 3 ainda pedem sua resposta" ou "Tudo em dia".
 * As pendências lidas continuam pedindo resposta; os pedidos para seguir não entram aqui (têm a própria linha).
 */
export function summaryLine({ unread_count: unread, pending_count: pending }: Pick<NotificationSummary, 'unread_count' | 'pending_count'>): string {
  const asking = (verb: string, plural: string) => `${pending} ${pending === 1 ? verb : plural} sua resposta`
  if (unread > 0) {
    const unreadText = `${unread} ${unread === 1 ? 'não lida' : 'não lidas'}`
    return pending > 0 ? `${unreadText} · ${asking('pede', 'pedem')}` : unreadText
  }
  return pending > 0 ? `Tudo lido · ${asking('ainda pede', 'ainda pedem')}` : 'Tudo em dia'
}
