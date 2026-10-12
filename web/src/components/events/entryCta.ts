import type { EventDetail, MyEntry, TeamEligibility } from "@/api/entries";
import { formatPrice } from "@/utils/format";

/** Botão fixo do detalhe (D2), conforme a inscrição de quem vê e o evento (contrato 0002, seção 6.5). */
export type EntryCta =
  /** Abre a folha de inscrição: confirmar (gratuita) ou reservar a vaga (paga). */
  | { kind: "enter"; label: string; teams: TeamEligibility[] }
  /** Abre "Enviar comprovante" (reservada) ou "Enviar outro" (recusada). */
  | { kind: "receipt"; label: string }
  /** Futebol sem time representado: leva a Meus times. */
  | { kind: "teams"; label: string }
  /** Desabilitado, com o motivo no rótulo; `locked` mostra o cadeado (fora da faixa). */
  | { kind: "blocked"; label: string; locked?: boolean };

/** Estados em que a inscrição de quem vê segue no evento (não deixa inscrever de novo o mesmo sujeito). */
const SETTLED = ["expirada", "cancelada"];

/** Times que ainda podem se inscrever: representados, elegíveis e sem inscrição que ocupa vaga. */
export function enterableTeams(detail: Pick<EventDetail, "eligibility">): TeamEligibility[] {
  return (detail.eligibility.teams ?? []).filter((team) => team.eligible && team.entry_id === null);
}

/**
 * Rótulo e ação do botão fixo. Prioridade: o comprovante da inscrição em curso; depois, se o evento aceita
 * inscrições agora (estado, prazo, revogação, vagas e elegibilidade). O organizador e quem já está inscrito não
 * veem o botão de inscrição (no futebol, a não ser que represente outro time elegível).
 */
export function entryCta(detail: EventDetail, entry: MyEntry | null): EntryCta | null {
  if (detail.is_organizer) return null;
  if (entry?.can_send_receipt) return { kind: "receipt", label: entry.state === "rejeitada" ? "Enviar outro" : "Enviar comprovante" };
  const football = detail.sport === "futebol";
  const teams = enterableTeams(detail);
  const holding = entry !== null && !SETTLED.includes(entry.state);
  if (holding && !(football && teams.length > 0)) return null;
  if (detail.state !== "publicado") return null;
  if (detail.revocation_pending) return { kind: "blocked", label: "Inscrições suspensas" };
  if (!detail.registration_open) return { kind: "blocked", label: "Inscrições encerradas" };
  if (detail.spots_left <= 0) return { kind: "blocked", label: "Vagas esgotadas" };
  if (football && detail.eligibility.reason === "sem_time") return { kind: "teams", label: "Crie ou represente um time" };
  if (!detail.eligibility.eligible) {
    return detail.eligibility.reason ? { kind: "blocked", label: "Fora da faixa do evento", locked: true } : null;
  }
  const price = formatPrice(detail.price_cents, { compact: true, free: "Grátis" });
  if (!football) return { kind: "enter", label: `Inscrever-se · ${price}`, teams: [] };
  const who = teams.length === 1 ? teams[0].team.name : "time";
  return { kind: "enter", label: `Inscrever ${who} · ${price}`, teams };
}

/** Cartaz apagado com cadeado: fora da faixa ou em classificação num evento restrito, sem inscrição em curso. */
export function isLocked(card: Pick<EventDetail, "eligibility" | "my_entry">): boolean {
  const reason = card.eligibility.reason;
  const settled = !card.my_entry || SETTLED.includes(card.my_entry.state);
  return !card.eligibility.eligible && settled && (reason === "fora_da_faixa" || reason === "em_classificacao");
}
