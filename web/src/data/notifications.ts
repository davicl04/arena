import type { ArenaNotification } from '../api/notifications'
import { refusalText } from '../api/organizer'
import type { OrganizerRefusalReason } from '../api/organizer'
import { receiptRefusalSentence } from '../api/receipts'
import { eventRefusalReason, footballFormat } from './arena'
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

/* ----- Pendências: o que pede resposta (plano de notificações, seção "Web") ----- */

/** Textos curtos de uma pendência: rótulo do cartão, linha secundária da placa do Início e texto do botão. */
export interface PendingView {
  /** Rótulo curto em caixa alta ("PARTIDA ENCONTRADA"). */
  label: string
  /** Segunda linha (adversário, time, prazo…), curta o bastante para truncar numa linha. */
  secondary: string
  /** Texto do botão primário; o destino continua vindo de `notificationView`. */
  action: string
}

/**
 * Rótulo, linha secundária e botão dos 14 tipos com pendência (contrato do plano). Tipo desconhecido: rótulo
 * genérico "PEDE SUA RESPOSTA" e botão "Abrir".
 */
export function pendingView(notification: ArenaNotification): PendingView {
  const payload = notification.payload ?? {}
  const actor = text(notification.actor?.name)
  const team = text(payload.team_name)
  const event = text(payload.event_name)
  const opponent = text(payload.opponent_name)
  const join = (...parts: (string | null | false | undefined)[]) => parts.filter(Boolean).join(' · ')
  const until = (prefix: string, iso: unknown) => { const when = formatDeadline(text(iso)); return when ? `${prefix} ${when}` : null }
  switch (notification.type) {
    case 'convite_time':
      return { label: 'CONVITE DE TIME', secondary: join(actor ?? 'Um representante', team), action: 'Ver convite' }
    case 'pedido_entrada':
      return { label: 'PEDIDO PARA ENTRAR', secondary: join(actor ?? 'Um atleta', team), action: 'Ver pedido' }
    case 'proposta_partida': {
      const format = typeof payload.format === 'string' && payload.format in footballFormat ? footballFormat[payload.format as keyof typeof footballFormat] : null
      return { label: 'PARTIDA ENCONTRADA', secondary: join(opponent ?? 'Adversário encontrado', format && `${format.label.toLowerCase()} ${format.players}`), action: 'Responder proposta' }
    }
    case 'vaga_encontrada':
      return { label: 'VAGA ENCONTRADA', secondary: join(`Vaga de ${positionName(payload.position)}`, team), action: 'Responder vaga' }
    case 'condicoes_propostas':
      return { label: 'CONDIÇÕES PROPOSTAS', secondary: join(actor ?? 'O outro lado', formatDeadline(text(payload.starts_at)), text(payload.court_name)), action: 'Ver condições' }
    case 'wo_registrado':
      return { label: 'W.O. REGISTRADO', secondary: join(opponent ?? actor ?? 'O adversário', until('conteste até', payload.contest_until)), action: 'Contestar W.O.' }
    case 'resultado_divergente':
      return { label: 'RESULTADO DIVERGENTE', secondary: until('Corrijam até', payload.deadline) ?? 'Os placares não batem', action: 'Revisar resultado' }
    case 'comprovante_decidido':
      return { label: 'COMPROVANTE RECUSADO', secondary: join(event, until('envie outro até', payload.reserved_until)) || 'Envie outro comprovante', action: 'Enviar comprovante' }
    case 'devolucao_enviada':
      return { label: 'DEVOLUÇÃO ENVIADA', secondary: join(event, 'confirme o recebimento'), action: 'Confirmar devolução' }
    case 'comprovante_recebido':
      return { label: 'COMPROVANTE RECEBIDO', secondary: join(event, actor) || 'Novo comprovante', action: 'Analisar comprovante' }
    case 'divergencia_para_decidir':
      return { label: 'DIVERGÊNCIA PARA DECIDIR', secondary: join(event, until('prazo dos times:', payload.deadline)) || 'Os placares não batem', action: 'Decidir resultado' }
    case 'evento_para_aprovar':
      return { label: 'EVENTO PARA APROVAR', secondary: join(event, actor) || 'Evento enviado para aprovação', action: 'Analisar evento' }
    case 'devolucao_contestada':
      return { label: 'DEVOLUÇÃO CONTESTADA', secondary: join(event, actor) || 'Devolução contestada', action: 'Decidir devolução' }
    case 'wo_contestado':
      return { label: 'W.O. CONTESTADO', secondary: join(actor ?? 'O outro lado', 'contestou o W.O.'), action: 'Decidir W.O.' }
    default:
      return { label: 'PEDE SUA RESPOSTA', secondary: notificationView(notification).text, action: 'Abrir' }
  }
}

/** O rótulo em caixa de frase, para a placa do Início ("PARTIDA ENCONTRADA" → "Partida encontrada", "W.O. REGISTRADO" → "W.O. registrado"). */
export function pendingTitle(view: PendingView): string {
  const lower = view.label.toLocaleLowerCase('pt-BR')
  return (lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1)).replace(/^W\.o\./, 'W.O.')
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** Prazo de uma pendência: tempo que falta, fração restante (a barra) e se já merece atenção (âmbar). */
export interface PendingDeadline {
  /** "1 h 52", "45 min", "2 d 3 h"; `null` sem prazo. */
  left: string | null
  /** Fração do tempo que ainda resta, de 0 a 1; `null` sem prazo. */
  remaining: number | null
  /** Menos de 25% do tempo restante (fronteira exclusiva: 25% exatos ainda é verde); prazo vencido também é âmbar. */
  warn: boolean
}

/** Tempo que falta em texto curto: "menos de 1 min", "45 min", "1 h 52", "21 h" e "2 d 3 h". */
export function formatTimeLeft(ms: number): string {
  if (ms < MINUTE) return 'menos de 1 min'
  const minutes = Math.floor(ms / MINUTE)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const rest = minutes % 60
    return rest ? `${hours} h ${String(rest).padStart(2, '0')}` : `${hours} h`
  }
  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours ? `${days} d ${restHours} h` : `${days} d`
}

/** Calcula o prazo de `created_at` até `action_until` no instante `now`. */
export function pendingDeadline(notification: ArenaNotification, now: number): PendingDeadline {
  if (!notification.action_until) return { left: null, remaining: null, warn: false }
  const end = new Date(notification.action_until).getTime()
  const start = new Date(notification.created_at).getTime()
  if (Number.isNaN(end)) return { left: null, remaining: null, warn: false }
  const left = Math.max(0, end - now)
  const total = Number.isNaN(start) ? 0 : end - start
  const remaining = total > 0 ? Math.min(1, left / total) : left > 0 ? 1 : 0
  return { left: formatTimeLeft(left), remaining, warn: remaining < 0.25 }
}

/* ----- Lista agrupada por dia ----- */

export type DayGroupLabel = 'Hoje' | 'Ontem' | 'Esta semana' | 'Anteriores'
export interface DayGroup<T> { label: DayGroupLabel; items: T[] }

/** Dias de calendário entre `time` e `now` (fuso local). */
function calendarDaysAgo(time: number, now: number) {
  const day = (value: number) => { const date = new Date(value); return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) }
  return Math.round((day(now) - day(time)) / (24 * HOUR))
}

/**
 * Agrupa por dia de criação, mantendo a ordem recebida: Hoje, Ontem, Esta semana (2 a 6 dias atrás) e Anteriores.
 * Só devolve os grupos que têm itens.
 */
export function groupByDay<T extends { created_at: string }>(items: readonly T[], now: number): DayGroup<T>[] {
  const order: DayGroupLabel[] = ['Hoje', 'Ontem', 'Esta semana', 'Anteriores']
  const groups = new Map<DayGroupLabel, T[]>()
  for (const item of items) {
    const time = new Date(item.created_at).getTime()
    const days = Number.isNaN(time) ? 99 : calendarDaysAgo(time, now)
    const label: DayGroupLabel = days <= 0 ? 'Hoje' : days === 1 ? 'Ontem' : days < 7 ? 'Esta semana' : 'Anteriores'
    groups.set(label, [...(groups.get(label) ?? []), item])
  }
  return order.filter(label => groups.has(label)).map(label => ({ label, items: groups.get(label) ?? [] }))
}

/** Filtros (chips) da tela de notificações. */
export type NotificationFilter = 'tudo' | 'responder' | 'partidas' | 'times' | 'eventos'
