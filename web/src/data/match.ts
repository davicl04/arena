import { positions } from "../api/client";
import type { Position } from "../api/client";
import type { CourtKind, MatchCard, MatchDetail, MatchPhase, MatchSideOut, MatchSlotOut, Side } from "../api/matches";
import { formatClock, formatShortDate, parseIso } from "../utils/format";
import { footballFormat } from "./arena";
import type { StateTone } from "./arena";

/*
 * Mapeamentos visuais da partida (P2 + C1): selo de estado do cabeçalho, nomes dos lados, vagas por posição e
 * o texto de data e hora. As chaves são as do contrato (docs/decisoes/0002-jogar.md, seções 7.3 e 7.4).
 */

/** Selo de estado do cabeçalho da partida, por fase do cartão S1 (`MatchCard.phase`). */
export const matchPhases: Record<MatchPhase, { label: string; tone: StateTone }> = {
  proposta: { label: "Proposta", tone: "pending" },
  recusada: { label: "Recusada", tone: "danger" },
  expirada: { label: "Expirada", tone: "closed" },
  combinando: { label: "Combinando", tone: "draft" },
  agendada: { label: "Agendada", tone: "open" },
  informar_resultado: { label: "Aguardando placar", tone: "live" },
  divergente: { label: "Placar divergente", tone: "danger" },
  wo_registrado: { label: "W.O. registrado", tone: "pending" },
  wo_contestado: { label: "W.O. contestado", tone: "danger" },
  confirmado: { label: "Resultado confirmado", tone: "open" },
  encerrada: { label: "Encerrada", tone: "closed" },
  sem_resultado: { label: "Sem resultado", tone: "closed" },
  cancelada: { label: "Cancelada", tone: "danger" },
};

/** Nome do lado: o do time ou o do atleta (tênis). */
export function sideName(side: MatchSideOut | undefined | null, fallback = "Adversário"): string {
  return side?.team?.name ?? side?.athlete?.name ?? fallback;
}

export function sideOf(match: Pick<MatchCard, "sides">, key: Side | null | undefined): MatchSideOut | undefined {
  return key ? match.sides.find((side) => side.side === key) : undefined;
}

/** Nome do lado `key` ("Ferrugem FC"); sem o lado, o `fallback`. */
export function nameOf(match: Pick<MatchCard, "sides">, key: Side | null | undefined, fallback?: string): string {
  return sideName(sideOf(match, key), fallback);
}

/** Lados na ordem do cabeçalho: o meu primeiro, como em "Ferrugem × Leões"; sem lado (administração), A × B. */
export function orderedSides(match: Pick<MatchCard, "sides" | "my_side">): MatchSideOut[] {
  const mine = match.sides.find((side) => side.side === match.my_side);
  return mine ? [mine, ...match.sides.filter((side) => side !== mine)] : [...match.sides];
}

/** Nome curto do lado, para o cabeçalho e frases curtas: a primeira palavra ("Ferrugem", "Leões", "Beatriz"). */
export function shortName(side: MatchSideOut | undefined | null): string {
  const name = sideName(side);
  return name.split(/\s+/)[0] ?? name;
}

/** Nomes do cabeçalho "Ferrugem × Leões"; se as primeiras palavras forem iguais, os nomes completos. */
export function headerNames(sides: readonly MatchSideOut[]): string[] {
  const short = sides.map(shortName);
  return new Set(short.map((name) => name.toLowerCase())).size < short.length ? sides.map((side) => sideName(side)) : short;
}

/** "sáb, 18 out · 16:00" no fuso do aparelho. ISO inválido ou ausente → "". */
export function whenText(iso: string | null | undefined): string {
  const date = parseIso(iso);
  return date ? `${formatShortDate(date)} · ${formatClock(date)}` : "";
}

/** Tipo de quadra da partida: o formato do futebol ou `tenis`. */
export function courtKindOf(match: Pick<MatchCard, "sport" | "format">): CourtKind | undefined {
  return match.sport === "tenis" ? "tenis" : (match.format ?? undefined);
}

/** Posições na ordem do contrato, com rótulo (vagas para avulsos). */
export const slotPositions: { value: Position; label: string }[] = positions.map((position) => ({ ...position }));

export type SlotCounts = Record<Position, number>;
export const noSlots = (): SlotCounts => ({ goleiro: 0, defesa: 0, meio_campo: 0, atacante: 0 });

/** Vagas abertas ou oferecidas de um lado, por posição (o número que `PUT /slots` pede). */
export function openSlotCounts(slots: readonly MatchSlotOut[], side: Side | null): SlotCounts {
  const counts = noSlots();
  for (const slot of slots) if (slot.side === side && slot.state !== "preenchida") counts[slot.position] += 1;
  return counts;
}

/**
 * Vagas do meu lado que o representante ajusta: enquanto a partida é combinada, as que o lado declarou na busca
 * (`MatchSideOut.declared_slots`); depois, as vagas abertas ou oferecidas (`slots`).
 */
export function currentSlotCounts(detail: Pick<MatchDetail, "state" | "slots" | "sides" | "my_side">): SlotCounts {
  if (detail.state === "combinando") return { ...noSlots(), ...(sideOf(detail, detail.my_side)?.declared_slots ?? {}) };
  return openSlotCounts(detail.slots, detail.my_side);
}

/** Avulsos escalados de um lado (vagas preenchidas). */
export function guestSlots(slots: readonly MatchSlotOut[], side: Side | null): MatchSlotOut[] {
  return slots.filter((slot) => slot.side === side && slot.state === "preenchida" && slot.guest);
}

export const slotTotal = (counts: Partial<SlotCounts> | null | undefined): number => (counts ? Object.values(counts).reduce((sum, value) => sum + value, 0) : 0);

/** Vagas para avulsos que cabem num lado: o formato menos um (futsal 4, society 6, campo 10), contando as já preenchidas (RN06). */
export function maxSlots(format: MatchDetail["format"]): number {
  return format ? footballFormat[format].players - 1 : 0;
}

/** Evento da faixa do chat que a web reconhece pela data (`payload.starts_at`), formatada no fuso do aparelho. */
export function eventWhen(payload: Record<string, unknown> | null): string {
  const value = payload?.starts_at;
  return typeof value === "string" ? whenText(value) : "";
}
