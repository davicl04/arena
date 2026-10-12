import type { ArenaNotification } from '../api/notifications'
import { refusalText } from '../api/organizer'
import type { OrganizerRefusalReason } from '../api/organizer'
import { receiptRefusalSentence } from '../api/receipts'
import { eventRefusalReason } from './arena'
import type { Screen } from './arena'
import { positions } from '../api/client'
import { formatDeadline } from '../utils/format'

/**
 * Para onde a notificação leva ao ser tocada (contrato 0003, seções 7 e 17): Meus times com o time no carrossel
 * (`teamId`), a folha de convites recebidos (`invites`) ou a lista "Pedidos para entrar" (`requests`); o Menu, com o
 * cartão do organizador; ou as telas de eventos com o evento (`eventId`): o detalhe do atleta (`event`), a gestão
 * e os comprovantes do organizador (`event-manage`, `event-receipts`) e as filas da administração (`admin-paid-events`,
 * `admin-refund-disputes`).
 *
 * Etapa 3 (0002-jogar, seção 13): a partida (`match`, com `matchId`), a placa do Jogar (`play`; propostas e ofertas, com
 * `matchId` como dica da proposta) e as filas da administração (`admin-court-suggestions`, `admin-walkover-disputes`).
 *
 * Etapa 4 (0003, seção 21.6): a aba Tabela do evento (`event` com `section: 'tabela'`), a partida e a decisão do organizador
 * (`result-decision`, com `matchId`).
 */
export interface NotificationTarget {
  screen: Screen; teamId?: number; invites?: boolean; requests?: boolean; eventId?: number; matchId?: number
  /** Aba do detalhe do evento (`event`) a abrir: a Tabela, com a árvore ou a classificação. */
  section?: 'tabela'
}

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
 * Texto e destino de cada tipo das etapas 1, 2 e 3. Sem `actor`, o texto usa "Um representante", "Um atleta",
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
      return { ...eventView(`A tabela de ${event} saiu`, 'event'), target: eventId ? { screen: 'event', eventId, section: 'tabela' } : null }
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
      return { ...eventView(`${Event} terminou${champion ? `: campeão ${champion}` : ''}`, 'event'), target: eventId ? { screen: 'event', eventId, section: 'tabela' } : null }
    }

    /* Administração. */
    case 'evento_para_aprovar':
      return { ...eventView(`${actor ?? 'Um organizador'} enviou ${event} para aprovação`, 'admin-paid-events'), target: eventId ? { screen: 'admin-paid-events', eventId } : { screen: 'admin-paid-events' } }
    default:
      return { text: 'Nova atividade na sua conta', kind: 'other', teamName: null, target: null }
  }
}
