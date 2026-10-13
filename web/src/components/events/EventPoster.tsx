import type { ReactNode } from "react";
import { Check, CircleAlert, Globe, Lock, Plus } from "lucide-react";
import type { Sport } from "@/api/client";
import { ArenaMark } from "@/components/Brand";
import SportIcon from "@/components/SportIcon";
import { TierEmblem } from "@/components/arena/TierEmblem";
import {
  entryState as entryStates,
  eventFormatParts,
  eventNoun,
  eventPhase as eventPhases,
  eventState as eventStates,
  tiers,
} from "@/data/arena";
import type { EntryState, EventPhase, EventState, EventType, FootballFormat, TierKey } from "@/data/arena";
import { cn } from "@/lib/utils";
import { eventDateParts, formatPrice } from "@/utils/format";
import { StateBadge } from "./StateBadge";

export interface EventPosterProps {
  name: string;
  /** Modalidade; nula só no rascunho ainda sem modalidade (sem linha de formato nem ícone). */
  sport: Sport | null;
  /** Início do evento (ISO, UTC); sem data (rascunho), o cartaz mostra "—". */
  startsAt: string | null;
  /** Formato do futebol. */
  format?: FootballFormat | null;
  /** Distância da prova de corrida, em km. */
  distanceKm?: number | null;
  /** Tipo do campeonato (futebol e tênis). */
  eventType?: EventType | null;
  /** Valor da inscrição em centavos; 0 é "Gratuito"; nulo (rascunho sem a escolha) é "A definir". */
  priceCents: number | null;
  /** Elos aceitos (RN18), como vêm da API; vazio ou nulo é "aberto a todos" (globo). */
  acceptedTiers?: readonly TierKey[] | null;
  /** Ocupação: inscrições (confirmadas ou reservadas, como a tela decidir) e vagas. Mostra a barra. */
  entries?: { count: number; capacity: number } | null;
  /** Estado do evento no canto (O3, G3 e a prévia do V4). */
  state?: EventState | null;
  /** Fase do cartaz (`phase` da API): no lugar do rótulo e do tom de `state` ("Inscrições encerradas"). */
  phase?: EventPhase | null;
  /** Texto do selo no lugar do rótulo do estado (ex.: "Vai para aprovação" na prévia do V4). */
  stateLabel?: string;
  /** Estado da inscrição de quem vê (E2), no rodapé do cartaz da lista (no detalhe, use o `StatusCard`). */
  entryState?: EntryState | null;
  /** Fora da faixa de elos de quem vê (E2): apagado, com cadeado e "Fora da faixa". */
  locked?: boolean;
  /** Pendências do organizador (comprovantes, partidas sem data, divergências), no rodapé do cartaz da lista (O3). */
  pendingCount?: number;
  /** Ícone da modalidade no rodapé, quando não há selo (O3 e prévia do V4). */
  showSport?: boolean;
  /** Organizador, acima do nome na variante `hero` (D2). */
  organizer?: string | null;
  /** `card`: cartaz da lista (E2, O3); `hero`: topo do detalhe e da gestão (D2, G3), com os chips. */
  size?: "card" | "hero";
  /** Torna o cartaz da lista um botão (abre o detalhe ou a gestão). */
  onClick?: () => void;
  className?: string;
}

const root =
  "relative isolate grid min-w-0 overflow-hidden rounded-panel border-0 bg-[radial-gradient(130%_80%_at_100%_0%,#1d5a3d_0%,var(--color-forest)_60%)] p-3 text-left text-white";

/**
 * Cartaz verde-escuro do evento (E2 do Jogar, O3 do organizador): dia grande e mês, elos aceitos ou globo,
 * nome, formato ou distância e tipo, preço ou "Gratuito", barra de inscrições e selos. Fora da faixa, fica
 * apagado com cadeado. A variante `hero` é o topo do detalhe (D2) e da gestão (G3).
 */
export function EventPoster({
  name,
  sport,
  startsAt,
  format,
  distanceKm,
  eventType,
  priceCents,
  acceptedTiers,
  entries,
  state,
  phase,
  stateLabel,
  entryState,
  locked = false,
  pendingCount = 0,
  showSport = false,
  organizer,
  size = "card",
  onClick,
  className,
}: EventPosterProps) {
  const hero = size === "hero";
  const date = eventDateParts(startsAt);
  const formatParts = sport ? eventFormatParts({ sport, format, distanceKm, eventType }) : [];
  const price = priceCents == null ? "A definir" : formatPrice(priceCents, { compact: true });
  const tierKeys = (acceptedTiers ?? []).filter((tier) => tier in tiers);
  const closed = state === "encerrado" || state === "cancelado";
  const stateInfo = phase ? eventPhases[phase] : state ? eventStates[state] : null;
  const entryInfo = entryState ? entryStates[entryState] : null;
  const unit = sport ? eventNoun[sport].entrants : "inscritos";

  const footerBadge: ReactNode = entryInfo ? (
    <FooterPill>
      {entryState === "confirmada" && <Check aria-hidden="true" />}
      {entryInfo.short}
    </FooterPill>
  ) : locked ? (
    <FooterPill>
      <Lock aria-hidden="true" />
      Fora da faixa
    </FooterPill>
  ) : pendingCount > 0 ? (
    <FooterPill className="bg-[#ff8a9a26] text-[#ffb3bd]">
      <CircleAlert aria-hidden="true" />
      <span aria-hidden="true">{pendingCount}</span>
      <span className="sr-only">{pendingCount === 1 ? "1 pendência" : `${pendingCount} pendências`}</span>
    </FooterPill>
  ) : showSport && sport ? (
    <span className="[&_[data-slot=sport-icon]]:mix-blend-screen [&_[data-slot=sport-icon]]:[filter:invert(1)]">
      <SportIcon sport={sport} size={22} />
    </span>
  ) : null;

  const content = (
    <span className="@container/poster grid min-w-0 content-end gap-[3px]">
      <ArenaMark className="pointer-events-none absolute bottom-10 -left-5 -z-10 h-[110px] w-[180px] text-white opacity-5" />
      <span
        className={cn(
          "absolute top-2.5 left-3 grid text-[10px] font-bold tracking-[0.08em] text-mint uppercase",
          hero && "top-3.5 left-3.5",
        )}
      >
        <span aria-hidden="true" className="grid">
          <b
            className={cn(
              "font-display text-[34px] leading-none font-extrabold tracking-[-0.02em] text-white normal-case",
              hero && "text-[44px]",
            )}
          >
            {date?.day ?? "—"}
          </b>
          {date ? (hero ? `${date.month} · ${date.weekday}` : date.month) : "sem data"}
        </span>
        <span className="sr-only">{date ? date.label : "Sem data definida"}</span>
      </span>
      <span
        className={cn(
          "absolute top-3 right-2.5",
          stateInfo && "@min-[126px]/poster:top-10",
          hero && "top-3.5 right-3.5",
          hero && stateInfo && "@min-[126px]/poster:top-11",
        )}
      >
        <TierAccess tiers={tierKeys} hero={hero} />
      </span>
      {stateInfo && (
        // Selo do estado no canto; no cartaz estreito (duas colunas a 320 px), desce para antes do nome.
        <span
          className={cn(
            "mb-1 flex justify-self-start @min-[126px]/poster:absolute @min-[126px]/poster:top-3 @min-[126px]/poster:right-2.5 @min-[126px]/poster:mb-0 @min-[126px]/poster:max-w-[calc(100%-66px)]",
            hero && "@min-[126px]/poster:top-3.5 @min-[126px]/poster:right-3.5",
          )}
        >
          <StateBadge surface="dark" tone={stateInfo.tone} className="rounded-[9px] text-right text-[9px] whitespace-normal">
            {stateLabel ?? stateInfo.label}
          </StateBadge>
        </span>
      )}
      {hero && organizer && <span className="text-[10.5px] text-white/65">{organizer}</span>}
      {hero ? (
        <h2 className="text-[22px] leading-[1.15] wrap-anywhere">{name}</h2>
      ) : (
        <b className="font-display text-[14px] leading-[1.2] font-bold wrap-anywhere">{name}</b>
      )}
      {!hero && formatParts.length > 0 && (
        <span className="text-[10px] text-white/63">{formatParts.join(" · ")}</span>
      )}
      {hero && (
        <span className="mt-2 flex flex-wrap gap-1.5">
          {formatParts.map((part) => (
            <span key={part} className="rounded-full bg-white/8 px-[9px] py-1 text-[10.5px] font-bold">
              {part}
            </span>
          ))}
          <span className="rounded-full bg-mint px-[9px] py-1 text-[10.5px] font-bold text-night">{price}</span>
        </span>
      )}
      {entries && entries.capacity > 0 && (
        <span className={cn("block", hero && "mt-2")}>
          <span className="mt-1.5 block h-[5px] overflow-hidden rounded-[3px] bg-white/12" aria-hidden="true">
            <span
              className="block h-full rounded-[3px] bg-mint"
              style={{ width: `${Math.min(100, Math.max(0, (entries.count / entries.capacity) * 100))}%` }}
            />
          </span>
          <small className="mt-1 block text-[9.5px] text-white/63">
            {entries.count} de {entries.capacity} {unit}
          </small>
        </span>
      )}
      {!hero && (
        <span className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5 font-display text-[12px] font-extrabold text-mint">
          <span>{price}</span>
          {footerBadge}
        </span>
      )}
    </span>
  );

  const classes = cn(
    root,
    hero ? "min-h-[220px] p-3.5 pt-[86px]" : "min-h-[196px] pt-[62px]",
    locked && "opacity-55 grayscale-[0.8]",
    closed && !locked && "opacity-60",
    className,
  );
  if (onClick && !hero)
    return (
      <button type="button" data-slot="event-poster" data-locked={locked || undefined} className={classes} onClick={onClick}>
        {content}
      </button>
    );
  return (
    <div data-slot="event-poster" data-size={size} data-locked={locked || undefined} className={classes}>
      {content}
    </div>
  );
}

/** Pílula do rodapé do cartaz (`.p-f .badge`): neutra sobre o verde-escuro. */
function FooterPill({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full bg-white/8 px-2 py-[3px] font-sans text-[9.5px] leading-tight font-bold whitespace-nowrap text-white [&_svg]:size-3 [&_svg]:flex-none",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Elos aceitos sobrepostos, ou o globo de "aberto a todos" (com o texto para leitores de tela). */
function TierAccess({ tiers: keys, hero }: { tiers: TierKey[]; hero: boolean }) {
  if (!keys.length)
    return (
      <span className="text-mint">
        <Globe size={hero ? 24 : 22} aria-hidden="true" />
        <span className="sr-only">Aberto a todos</span>
      </span>
    );
  const names = keys.map((key) => tiers[key].name);
  const text = names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}` : names[0];
  return (
    <span className="flex">
      {keys.map((key, index) => (
        <TierEmblem
          key={key}
          tier={key}
          decorative
          className={cn(hero ? "size-9" : "size-7", index > 0 && (hero ? "-ml-2" : "-ml-1.5"))}
        />
      ))}
      <span className="sr-only">Para {text}</span>
    </span>
  );
}

/** Último cartaz da lista do organizador (O3): "Novo evento", tracejado. */
export function NewEventPoster({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      data-slot="new-event-poster"
      onClick={onClick}
      className={cn(
        "grid min-h-[196px] min-w-0 content-center justify-items-center gap-2 rounded-panel border-[1.5px] border-dashed border-line-strong bg-transparent p-3 text-center text-[12px] font-bold text-brand",
        className,
      )}
    >
      <Plus size={26} aria-hidden="true" />
      Novo evento
    </button>
  );
}
