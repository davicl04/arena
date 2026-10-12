import type { CourtOut } from "@/api/matches";
import { combineDateTime } from "@/utils/dateKey";

/** O contrato aceita horários até 60 dias à frente, em passos de 15 minutos (`validate_terms_start`). */
export const MAX_DAYS_AHEAD = 60;
export const STEP_MINUTES = 15;

/** Erro de preenchimento antes de enviar a proposta ao servidor (que valida de novo). */
export function termsError(date: string, time: string, court: CourtOut | null, now = new Date()): string | null {
  if (!date) return "Escolha a data da partida.";
  if (!time) return "Escolha o horário da partida.";
  const iso = combineDateTime(date, time);
  if (!iso) return "Escolha uma data e um horário válidos.";
  const start = new Date(iso);
  if (start.getMinutes() % STEP_MINUTES !== 0) return "Use horários de 15 em 15 minutos.";
  if (start.getTime() <= now.getTime()) return "Escolha um horário que ainda não passou.";
  if (!court) return "Escolha a quadra do catálogo ou sugira uma.";
  return null;
}
