import type { ReactNode } from "react";
import { useState } from "react";
import { CalendarCheck, CalendarDays, Check, ChevronDown, Hourglass, Info, KeyRound, MapPin, OctagonX, Pin, Timer, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MatchDetail, MatchTermsOut, Side } from "@/api/matches";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { feedbackVariants } from "@/components/ui/feedback";
import { currentSlotCounts, guestSlots, nameOf, orderedSides, shortName, sideName, slotTotal, whenText } from "@/data/match";
import { useNow } from "@/hooks/useNow";
import { cn } from "@/lib/utils";
import { formatDeadline, parseIso } from "@/utils/format";
import { Switch } from "@/components/ui/switch";

/*
 * Cartão "Condições da partida" (P2): fixo no topo e recolhível. Mostra a proposta vigente (ou as condições
 * combinadas), os selos de aceite de cada lado e, conforme `detail.permissions`, propor outra, aceitar, a reserva,
 * as vagas para avulsos, o cancelamento e o W.O. A interface obedece às permissões do servidor: o que o papel não
 * pode fazer simplesmente não aparece.
 */

const rowClass = "flex items-start gap-2.5 text-[12px] leading-snug text-ink";
const rowIcon = "mt-px size-4 flex-none text-brand";

function Row({ Icon, children }: { Icon: LucideIcon; children: ReactNode }) {
  return (
    <div className={rowClass}>
      <Icon className={rowIcon} aria-hidden="true" />
      <span className="min-w-0 flex-1 wrap-anywhere">{children}</span>
    </div>
  );
}

/** Selo de aceite de um lado: "Ferrugem FC aceitou" ou "Leões do Cerrado falta aceitar". */
function Ack({ name, accepted }: { name: string; accepted: boolean }) {
  return (
    <Badge className={cn("max-w-full gap-1 py-1 text-[10px]", accepted ? "bg-success-bg text-brand" : "bg-warning-bg text-warning")}>
      {accepted ? <Check size={12} aria-hidden="true" /> : <Hourglass size={12} aria-hidden="true" />}
      <span className="min-w-0 truncate">
        {name} {accepted ? "aceitou" : "falta aceitar"}
      </span>
    </Badge>
  );
}

function courtNote(terms: MatchTermsOut): string | null {
  if (terms.court.state === "em_revisao") return "vale só para esta partida";
  return terms.court.address;
}

/** Dia e hora, quadra (com o selo de revisão ou de recusa) e quem reserva; no tênis, o super tie-break. */
function TermsRows({ detail, terms, booked }: { detail: MatchDetail; terms: MatchTermsOut; booked: boolean | null }) {
  const note = courtNote(terms);
  return (
    <div className="grid gap-2">
      <Row Icon={CalendarDays}>
        <b>{whenText(terms.starts_at)}</b>
      </Row>
      <Row Icon={MapPin}>
        {terms.court.name}
        {terms.court.provisional && <Badge className="ml-1.5 bg-warning-bg py-[3px] text-warning">Sugestão em revisão</Badge>}
        {terms.court.state === "rejeitada" && <Badge className="ml-1.5 bg-error-bg py-[3px] text-error">Sugestão recusada</Badge>}
        {note && <small className="block text-[10.5px] text-ink-muted">{note}</small>}
      </Row>
      <Row Icon={KeyRound}>
        Reserva: {nameOf(detail, terms.booking_side)}
        <small className="block text-[10.5px] text-ink-muted">
          {booked === null ? "reserva com o local" : booked ? "confirmada com o local" : "a confirmar com o local"}
        </small>
      </Row>
      {detail.sport === "tenis" && terms.super_tiebreak && <Row Icon={Timer}>Super tie-break no lugar do 3º set</Row>}
    </div>
  );
}

function slotsSummary(detail: MatchDetail): string {
  if (detail.state === "combinando") {
    const declared = slotTotal(currentSlotCounts(detail));
    const when = "abrem para avulsos quando a partida for agendada";
    return declared ? `${declared} ${declared === 1 ? "vaga declarada" : "vagas declaradas"} · ${when}` : `Nenhuma vaga declarada · ${when}`;
  }
  const open = detail.slots.filter((slot) => slot.state !== "preenchida").length;
  const guests = detail.slots.filter((slot) => slot.state === "preenchida").length;
  const parts = [open ? `${open} ${open === 1 ? "vaga aberta" : "vagas abertas"}` : "", guests ? `${guests} ${guests === 1 ? "avulso escalado" : "avulsos escalados"}` : ""];
  return parts.filter(Boolean).join(" · ") || "Nenhuma vaga aberta";
}

export interface ConditionsCardProps {
  detail: MatchDetail;
  /** Campeonato: "Agendar" ou "Reagendar" (o organizador), que abre a lista de partidas com a folha de agendamento. */
  onSchedule?: () => void;
  /** Campeonato: "Decidir resultado" (o organizador), que abre a decisão (D3). */
  onDecide?: () => void;
  busy: boolean;
  /** Recusa do servidor que pertence ao cartão (o `409` com conflito de agenda): as demais falhas de ação saem em toast. */
  error: string;
  onPropose: () => void;
  onAccept: (terms: MatchTermsOut) => void;
  onBooking: (confirmed: boolean) => void;
  onSlots: () => void;
  onCancel: () => void;
  onRegisterWalkover: () => void;
  onWithdrawWalkover: () => void;
  onContestWalkover: () => void;
}

/**
 * Partida de campeonato: a data e a quadra são do organizador (`PUT /organizer/matches/{id}/schedule`), então o cartão não tem
 * "Propor outra", aceite nem reserva; `terms` e `booking` vêm nulos e a data e a quadra estão em `starts_at` e `court`.
 * O organizador ganha "Agendar" e "Decidir resultado", conforme `permissions`.
 */
function ChampionshipConditions({ detail, busy, error, onSchedule, onDecide }: Pick<ConditionsCardProps, "detail" | "busy" | "error" | "onSchedule" | "onDecide">) {
  const { permissions, cancellation, court } = detail;
  const scheduled = detail.state === "agendada";
  const [open, setOpen] = useState(() => detail.state === "combinando" || Boolean(cancellation) || permissions.decide_result === true);
  const hasDate = detail.starts_at !== null;
  const closed = detail.state === "cancelada";
  const summary = hasDate ? `${whenText(detail.starts_at)}${court ? ` · ${court.name}` : ""}` : "Data e quadra a definir";
  const waiting = detail.sides.length < 2;

  return (
    <Collapsible open={open} onOpenChange={setOpen} data-slot="conditions-card" data-origin="campeonato" className="mx-3 mt-2.5 rounded-card surface inset-ring inset-ring-surface-edge shadow-card">
      <CollapsibleTrigger className="flex min-h-12 w-full items-center gap-2 border-0 bg-transparent px-3.5 py-2.5 text-left text-ink">
        {scheduled ? <CalendarCheck size={16} className="flex-none text-brand" aria-hidden="true" /> : <Pin size={16} className="flex-none text-brand" aria-hidden="true" />}
        <b className="text-[13px]">{scheduled ? "Partida agendada" : "Data e quadra"}</b>
        {!open && <span className="min-w-0 flex-1 truncate text-[11px] text-ink-muted">{summary}</span>}
        <ChevronDown size={16} aria-hidden="true" className={cn("ml-auto flex-none text-ink-muted motion-safe:transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-3 px-3.5 pb-3.5">
        {cancellation && (
          <div role="note" className="flex gap-2.5 rounded-[14px] bg-error-bg p-3">
            <OctagonX size={20} className="flex-none text-error" aria-hidden="true" />
            <p className="m-0 min-w-0 flex-1 text-[11.5px] leading-normal wrap-anywhere text-ink">
              <b className="block text-[12.5px] text-error">Partida cancelada</b>
              {cancellation.reason ? `Motivo: ${cancellation.reason}` : "O campeonato foi cancelado."}
            </p>
          </div>
        )}
        {detail.event && (
          <div className="text-[10.5px] font-bold tracking-wide text-ink-muted uppercase">
            {detail.event.name}{detail.round_number ? ` · fase ${detail.round_number}` : ""}
          </div>
        )}
        {hasDate ? (
          <div className="grid gap-2">
            <Row Icon={CalendarDays}>
              <b>{whenText(detail.starts_at)}</b>
            </Row>
            <Row Icon={MapPin}>
              {court?.name ?? "Quadra a definir"}
              {court?.provisional && <Badge className="ml-1.5 bg-warning-bg py-[3px] text-warning">Sugestão em revisão</Badge>}
              {court && (court.provisional ? <small className="block text-[10.5px] text-ink-muted">vale só para esta partida</small> : court.address && <small className="block text-[10.5px] text-ink-muted">{court.address}</small>)}
            </Row>
          </div>
        ) : (
          !closed && (
            <p className="m-0 text-[12px] leading-normal text-ink-muted">
              {waiting
                ? "Esta partida espera o resultado dos jogos anteriores. O organizador agenda quando os dois lados estiverem definidos."
                : "O organizador ainda vai definir data, horário e quadra. Você é avisado quando estiver agendada."}
            </p>
          )
        )}
        {!closed && (
          <p className="m-0 flex items-start gap-2 text-[11px] leading-normal text-ink-muted" data-slot="organizer-note">
            <Info size={15} className="mt-px flex-none" aria-hidden="true" />
            Data, horário e quadra são do organizador. A reserva é com o local; o Arena só registra.
          </p>
        )}
        {(permissions.schedule_match || permissions.decide_result) && (
          <div className="flex flex-wrap gap-2">
            {permissions.schedule_match && onSchedule && (
              <Button variant={hasDate ? "secondary" : "primary"} className="min-w-0 flex-1" disabled={busy} onClick={onSchedule}>
                {hasDate ? "Reagendar" : "Agendar"}
              </Button>
            )}
            {permissions.decide_result && onDecide && (
              <Button className="min-w-0 flex-1" disabled={busy} onClick={onDecide}>
                Decidir resultado
              </Button>
            )}
          </div>
        )}
        {error && (
          <p className={cn(feedbackVariants(), "my-0")} role="alert">
            {error}
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ConditionsCard(props: ConditionsCardProps) {
  return props.detail.origin === "campeonato" ? (
    <ChampionshipConditions detail={props.detail} busy={props.busy} error={props.error} onSchedule={props.onSchedule} onDecide={props.onDecide} />
  ) : (
    <FriendlyConditions {...props} />
  );
}

function FriendlyConditions({
  detail,
  busy,
  error,
  onPropose,
  onAccept,
  onBooking,
  onSlots,
  onCancel,
  onRegisterWalkover,
  onWithdrawWalkover,
  onContestWalkover,
}: ConditionsCardProps) {
  const { permissions, terms, walkover, cancellation } = detail;
  const scheduled = detail.state === "agendada";
  const pending = terms.pending;
  const current = terms.current;
  const [open, setOpen] = useState(() => detail.state === "combinando" || Boolean(pending) || Boolean(walkover) || Boolean(cancellation));
  const mine: Side | null = detail.my_side;
  const opponent = orderedSides(detail).find((side) => side.side !== mine);
  const acts = detail.my_role === "representante" || detail.my_role === "atleta";
  const closed = ["cancelada", "recusada", "expirada"].includes(detail.state);
  const now = useNow();
  const starts = parseIso(detail.starts_at);
  const started = starts !== null && now >= starts.getTime();
  const showSlots = detail.sport === "futebol" && detail.origin === "amistoso" && !closed && !started && (permissions.manage_slots || detail.slots.length > 0);
  const lateToCancel = scheduled && acts && !permissions.cancel && detail.cancel_until !== null && starts !== null && now < starts.getTime();
  const alreadyAccepted = pending !== null && mine !== null && Boolean(mine === "a" ? pending.accepted_a_at : pending.accepted_b_at);
  const shown = pending ?? current;
  const summary = shown ? `${whenText(shown.starts_at)} · ${shown.court.name}` : "Nenhuma proposta ainda";
  const title = scheduled ? "Partida agendada" : "Condições da partida";
  const TitleIcon = scheduled ? CalendarCheck : Pin;
  const booked = detail.booking?.state === "confirmada";
  const guests = guestSlots(detail.slots, mine);

  return (
    <Collapsible open={open} onOpenChange={setOpen} data-slot="conditions-card" className="mx-3 mt-2.5 rounded-card surface inset-ring inset-ring-surface-edge shadow-card">
      <CollapsibleTrigger className="flex min-h-12 w-full items-center gap-2 border-0 bg-transparent px-3.5 py-2.5 text-left text-ink">
        <TitleIcon size={16} className="flex-none text-brand" aria-hidden="true" />
        <b className="text-[13px]">{title}</b>
        {!open && <span className="min-w-0 flex-1 truncate text-[11px] text-ink-muted">{summary}</span>}
        <ChevronDown size={16} aria-hidden="true" className={cn("ml-auto flex-none text-ink-muted motion-safe:transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-3 px-3.5 pb-3.5">
        {cancellation && (
          <div role="note" className="flex gap-2.5 rounded-[14px] bg-error-bg p-3">
            <OctagonX size={20} className="flex-none text-error" aria-hidden="true" />
            <p className="m-0 min-w-0 flex-1 text-[11.5px] leading-normal wrap-anywhere text-ink">
              <b className="block text-[12.5px] text-error">Partida cancelada</b>
              {cancellation.by ? `${cancellation.by.name} cancelou a partida.` : "A partida foi cancelada."}
              {cancellation.reason ? ` Motivo: ${cancellation.reason}` : ""}
            </p>
          </div>
        )}

        {pending ? (
          <>
            <div className="text-[10.5px] font-bold tracking-wide text-ink-muted uppercase">
              {current ? "Nova proposta" : `Proposta de ${nameOf(detail, pending.proposed_by_side)}`}
            </div>
            <TermsRows detail={detail} terms={pending} booked={null} />
            <div className="flex flex-wrap gap-1.5" aria-label="Aceites">
              {orderedSides(detail).map((side) => (
                <Ack key={side.side} name={sideName(side)} accepted={Boolean(side.side === "a" ? pending.accepted_a_at : pending.accepted_b_at)} />
              ))}
            </div>
            {current && (
              <p className="m-0 text-[11px] leading-normal text-ink-muted">
                Continua valendo: <b>{whenText(current.starts_at)}</b> em {current.court.name}, até os dois lados aceitarem a nova.
              </p>
            )}
          </>
        ) : current ? (
          <TermsRows detail={detail} terms={current} booked={detail.booking ? booked : null} />
        ) : (
          !closed && (
            <p className="m-0 text-[12px] leading-normal text-ink-muted">
              Os representantes combinam dia, horário e quadra. Quem propõe já aceita; o outro lado aceita ou propõe outra.
            </p>
          )
        )}

        {permissions.accept_terms && pending && (
          <div className="flex flex-wrap gap-2">
            {permissions.propose_terms && (
              <Button variant="secondary" className="min-w-0 flex-1" disabled={busy} onClick={onPropose}>
                Propor outra
              </Button>
            )}
            <Button className="min-w-0 flex-1" disabled={busy} onClick={() => onAccept(pending)}>
              Aceitar condições
            </Button>
          </div>
        )}
        {!permissions.accept_terms && permissions.propose_terms && (
          <>
            {alreadyAccepted && opponent && (
              <p className="m-0 flex items-start gap-2 text-[11px] leading-normal text-ink-muted">
                <Hourglass size={15} className="mt-px flex-none" aria-hidden="true" />
                Aguardando {shortName(opponent)} aceitar a proposta.
              </p>
            )}
            <Button variant="secondary" className="w-full" disabled={busy} onClick={onPropose}>
              {pending ? "Propor outra" : current ? "Alterar" : "Propor condições"}
            </Button>
          </>
        )}
        {!permissions.propose_terms && !closed && mine !== null && ["membro", "avulso"].includes(detail.my_role) && (
          <p className="m-0 flex items-start gap-2 text-[11px] leading-normal text-ink-muted" data-slot="members-note">
            <Info size={15} className="mt-px flex-none" aria-hidden="true" />
            {scheduled ? "Só os representantes alteram a partida." : "Só os representantes aceitam. Combinem as condições no chat."}
          </p>
        )}

        {permissions.confirm_booking && (
          <div className="flex items-center gap-2 border-t border-solid border-line pt-2.5">
            <span className="min-w-0 flex-1 text-[12px]">
              <b className="block">{booked ? "Reserva confirmada" : "Reserva a confirmar"}</b>
              <small className="block text-[10.5px] text-ink-muted">Vocês reservam com o local e confirmam aqui</small>
            </span>
            <Switch size="lg" checked={booked} disabled={busy} onCheckedChange={onBooking} aria-label="Reserva confirmada" />
          </div>
        )}

        {showSlots && (
          <div className="flex items-center gap-2.5 border-t border-solid border-line pt-2.5" data-slot="slots-row">
            <Users size={16} className="flex-none text-brand" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-[12px]">
              <b className="block">Vagas para avulsos</b>
              <small className="block text-[10.5px] text-ink-muted">
                {slotsSummary(detail)}
                {guests.length ? ` · seu time: ${guests.map((slot) => slot.guest?.name.split(" ")[0]).join(", ")}` : ""}
              </small>
            </span>
            {permissions.manage_slots && (
              <Button variant="secondary" size="compact" disabled={busy} onClick={onSlots}>
                Ajustar
              </Button>
            )}
          </div>
        )}

        {/* O estado do W.O. (quem registrou, a contestação, a decisão) aparece no cartão de resultado; aqui ficam só os botões. */}
        {(permissions.withdraw_walkover || permissions.contest_walkover) && (
          <div className="flex flex-wrap gap-2">
            {permissions.withdraw_walkover && (
              <Button variant="secondary" className="min-w-0 flex-1" disabled={busy} onClick={onWithdrawWalkover}>
                Retirar W.O.
              </Button>
            )}
            {permissions.contest_walkover && (
              <Button variant="secondary" className="min-w-0 flex-1" disabled={busy} onClick={onContestWalkover}>
                Contestar W.O.
              </Button>
            )}
          </div>
        )}
        {permissions.register_walkover && (
          <div className="grid gap-1.5 border-t border-solid border-line pt-2.5">
            <p className="m-0 text-[11px] leading-normal text-ink-muted">
              {opponent ? `${sideName(opponent)} não compareceu?` : "O adversário não compareceu?"} Registre o W.O. até {formatDeadline(detail.result_deadline)}.
            </p>
            <Button variant="secondary" className="w-full" disabled={busy} onClick={onRegisterWalkover}>
              Registrar W.O.
            </Button>
          </div>
        )}

        {(permissions.cancel || lateToCancel) && (
          <div className="grid gap-1 border-t border-solid border-line pt-2">
            {permissions.cancel && (
              <>
                <Button variant="text" className="min-h-10 justify-self-start py-1 text-error" disabled={busy} onClick={onCancel}>
                  Cancelar partida
                </Button>
                {scheduled && detail.cancel_until && (
                  <small className="text-[10.5px] text-ink-muted">Dá para cancelar até {whenText(detail.cancel_until)}.</small>
                )}
              </>
            )}
            {lateToCancel && (
              <p className="m-0 flex items-start gap-2 text-[11px] leading-normal text-ink-muted">
                <Info size={15} className="mt-px flex-none" aria-hidden="true" />
                Faltam menos de 24 h: não dá mais para cancelar. Quem não comparecer perde por W.O.
              </p>
            )}
          </div>
        )}

        {error && (
          <p className={cn(feedbackVariants(), "my-0")} role="alert">
            {error}
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
