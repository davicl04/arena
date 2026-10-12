import type { EventDetail } from "@/api/entries";
import type { Receipt } from "@/api/events";
import { receiptRefusalSentence } from "@/api/receipts";
import { tiers } from "@/data/arena";
import { parseIso } from "@/utils/format";

/* Textos derivados dos dados do evento e da inscrição, compartilhados pelo detalhe (D2) e pelas folhas. */

const HOUR = 3_600_000;

/** Motivo da recusa do comprovante recebido pelo atleta ("Valor diferente: faltaram R$ 40"). */
export function refusalText(receipt: Pick<Receipt, "reason_code" | "reason_detail"> | null | undefined): string {
  return receiptRefusalSentence(receipt?.reason_code, receipt?.reason_detail);
}

/** Prazo que a reserva terá se for feita agora: 48 h ou 12 h antes do início, o que vier primeiro (RN21). */
export function reservationDeadline(startsAt: string | null, now: number = Date.now()): string | null {
  const start = parseIso(startsAt)?.getTime();
  if (!start) return null;
  return new Date(Math.min(now + 48 * HOUR, start - 12 * HOUR)).toISOString();
}

/** Nomes dos elos em ordem de progressão: "Prata e Ouro", "Bronze, Prata e Ouro". */
export function tiersText(keys: readonly string[]): string {
  const names = Object.values(tiers).filter((tier) => keys.includes(tier.key)).map((tier) => tier.name);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}` : (names[0] ?? "");
}

/** Local completo: "Arena Guará · Brasília/DF". */
export function placeText(detail: Pick<EventDetail, "venue" | "city">): string {
  const city = detail.city ? `${detail.city.name}/${detail.city.state}` : "";
  return [detail.venue, city].filter(Boolean).join(" · ");
}
