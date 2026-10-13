import type { ScheduleInput } from '../../api/brackets'
import type { CourtOut } from '../../api/matches'
import { DEFERRED_COURT_ID } from '../match/termsRules'
import { combineDateTime } from '../../utils/dateKey'

/** O contrato aceita datas até 12 meses à frente (`validate_schedule_start`); o horário é livre, ao minuto. */
export const SCHEDULE_DAYS_AHEAD = 364

/** Erro de preenchimento antes de enviar o agendamento (o servidor valida de novo). */
export function scheduleError(date: string, time: string, court: CourtOut | null, now = new Date()): string | null {
  if (!date) return 'Escolha a data da partida.'
  if (!time) return 'Digite o horário de início.'
  const iso = combineDateTime(date, time)
  if (!iso) return 'Escolha uma data e um horário válidos.'
  if (new Date(iso).getTime() <= now.getTime()) return 'Escolha um horário que ainda não passou.'
  if (!court) return 'Escolha a quadra do catálogo ou sugira uma.'
  return null
}

/** O corpo do agendamento: a quadra do catálogo (`court_id`) ou a sugestão que ainda vai ser enviada (`court_suggestion`). */
export function scheduleInput(startsAt: string, court: CourtOut): ScheduleInput {
  return court.id === DEFERRED_COURT_ID
    ? { starts_at: startsAt, court_suggestion: { name: court.name, address: court.address } }
    : { starts_at: startsAt, court_id: court.id }
}
