import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Building2, CalendarDays, GitFork, Globe, Info, MapPin, Medal, Route, Ticket, Timer, Users } from "lucide-react";
import type { EventDetail } from "@/api/entries";
import { TierEmblem } from "@/components/arena/TierEmblem";
import { Card } from "@/components/ui/card";
import { eventFormatParts, eventNoun, tiers } from "@/data/arena";
import { cn } from "@/lib/utils";
import { formatDeadline, formatPrice } from "@/utils/format";
import { placeText, tiersText } from "./eventText";

/** Linha de dado (`.term` dos protótipos): ícone verde, texto e, opcionalmente, uma ação à direita. */
export function Term({ Icon, icon, children, action, className }: {
  Icon?: LucideIcon;
  /** Nó no lugar do ícone (ex.: os elos aceitos). */
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div data-slot="term" className={cn("flex min-h-8 items-center gap-2.5 text-[11.5px] leading-[1.45]", className)}>
      {icon ?? (Icon && <Icon size={17} className="flex-none text-brand" aria-hidden="true" />)}
      <span className="min-w-0 flex-1 wrap-anywhere [&_b]:font-bold [&_small]:inline [&_small]:text-[10px] [&_small]:text-ink-muted">{children}</span>
      {action}
    </div>
  );
}

/** Ícone ⓘ ao lado do preço: abre a folha "Pagamento e informações". */
export function PaymentInfoButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label="Informações de pagamento"
      title="Informações de pagamento"
      onClick={onClick}
      className={cn("grid size-9 flex-none place-items-center rounded-full bg-transparent p-0 text-brand hover:bg-icon-tile", className)}
    >
      <Info size={18} aria-hidden="true" />
    </button>
  );
}

/** O que conta na faixa de elos, por modalidade (RN18). */
function tierBasis(detail: EventDetail): string {
  if (detail.sport === "futebol") return "conta o elo do time no formato";
  if (detail.sport === "corrida") return detail.distance_km ? `conta o seu elo nos ${detail.distance_km} km` : "conta o seu elo na distância";
  return "conta o seu elo no tênis";
}

/**
 * Aba Informações do D2: data e hora, local, formato e tipo, vagas, preço (com o ⓘ nos pagos), elos aceitos,
 * prazo das inscrições e, no tênis, o bônus no ranking (RN16).
 */
export function EventFacts({ detail, onPaymentInfo }: { detail: EventDetail; onPaymentInfo?: () => void }) {
  const sport = detail.sport ?? "futebol";
  const paid = (detail.price_cents ?? 0) > 0;
  const formatParts = eventFormatParts({ sport, format: detail.format, distanceKm: detail.distance_km, eventType: detail.competition_type });
  const accepted = (detail.accepted_tiers ?? []).filter((tier) => tier in tiers);
  const noun = eventNoun[sport];
  const deadline = formatDeadline(detail.registration_deadline);
  const closed = !detail.registration_open;
  const bonus = detail.tennis_bonus;
  return (
    <Card elevated className="grid gap-1 px-3.5 py-3" aria-label="Informações do evento">
      <Term Icon={CalendarDays}>{formatDeadline(detail.starts_at) || "Data a definir"}</Term>
      <Term Icon={MapPin}>{placeText(detail) || "Local a definir"}</Term>
      {formatParts.length > 0 && <Term Icon={sport === "corrida" ? Route : GitFork}>{formatParts.join(" · ")}</Term>}
      {detail.capacity ? (
        <Term Icon={Users}>
          {detail.entries_count} de {detail.capacity} {noun.entrants}
          <small> · {detail.spots_left === 1 ? "1 vaga" : `${detail.spots_left} vagas`}</small>
        </Term>
      ) : null}
      <Term Icon={Ticket} action={paid && onPaymentInfo ? <PaymentInfoButton onClick={onPaymentInfo} /> : undefined}>
        {paid ? <b>{formatPrice(detail.price_cents)}</b> : "Gratuito"}
        {paid && <small>{sport === "futebol" ? " por time" : ""} · pagamento direto ao organizador</small>}
      </Term>
      <Term
        icon={
          accepted.length ? (
            <span className="flex min-w-[17px] flex-none items-center" aria-hidden="true">
              {accepted.map((tier, index) => (
                <TierEmblem key={tier} tier={tier} decorative className={cn("size-[22px]", index > 0 && "-ml-1")} />
              ))}
            </span>
          ) : (
            <Globe size={17} className="flex-none text-brand" aria-hidden="true" />
          )
        }
      >
        {accepted.length ? `Para ${tiersText(accepted)}` : "Aberto a todos"}
        {accepted.length > 0 && <small> · {tierBasis(detail)}</small>}
      </Term>
      <Term Icon={Timer}>
        {detail.revocation_pending
          ? "Inscrições suspensas enquanto a administração decide sobre o evento"
          : closed
            ? "Inscrições encerradas"
            : <>Inscrições até <b>{deadline}</b>{paid && <small> · pagos fecham 12 h antes do início</small>}</>}
      </Term>
      {bonus && (
        <Term Icon={Medal}>
          Bônus no ranking
          <small>
            {" "}· campeão +{bonus.champion}, vice +{bonus.runner_up}, 3º e 4º +{bonus.semifinalist} (com {bonus.min_entries} ou mais
            inscritos{bonus.applies ? "" : "; ainda não vale"})
          </small>
        </Term>
      )}
    </Card>
  );
}

/** Cartão do organizador ("Contato"), com o nome público. */
export function OrganizerCard({ name, onContact }: { name: string; onContact?: () => void }) {
  return (
    <Card elevated className="flex items-center gap-2.5 px-3.5 py-3">
      <span className="grid size-[38px] flex-none place-items-center rounded-xl bg-tile text-brand">
        <Building2 size={19} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-[12.5px] wrap-anywhere">{name}</b>
        <small className="block text-[10.5px] text-ink-muted">Organizador</small>
      </span>
      {onContact && (
        <button
          type="button"
          onClick={onContact}
          aria-label={`Contato de ${name}`}
          className="inline-flex min-h-9 flex-none items-center rounded-field border-[1.5px] border-solid border-line-strong bg-transparent px-3 text-[11px] font-bold text-ink hover:bg-[#fff6] noite:hover:bg-[#ffffff0d]"
        >
          Contato
        </button>
      )}
    </Card>
  );
}

/** Aviso do pagamento fora do Arena, abaixo das informações dos eventos pagos. */
export function PaymentHint() {
  return (
    <p className="m-0 flex items-start gap-2 px-1 text-[10.5px] leading-normal text-ink-muted">
      <Info size={15} className="mt-px flex-none" aria-hidden="true" />
      Pagamento fora do Arena, direto ao organizador. A inscrição paga reserva a vaga por 48 h ou até 12 h antes do
      evento, o que vier primeiro.
    </p>
  );
}
