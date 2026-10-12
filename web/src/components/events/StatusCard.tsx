import { useEffect, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, EqualNot, Hourglass, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRemaining, parseIso } from "@/utils/format";

/*
 * Cartão S1 do Jogar: verde-escuro, com o anel das horas restantes no estado "aguardando" e, nos demais,
 * o ícone do estado. Serve à vaga reservada e ao comprovante (etapa 2) e ao resultado da partida (etapa 3).
 * O texto ("fecha seg, 20 out · 16:00") vem de quem usa, com `formatDeadline`.
 */
export type StatusTone = "aguardando" | "confirmado" | "divergente" | "neutro";

const toneIcon: Record<StatusTone, LucideIcon> = {
  aguardando: Hourglass,
  confirmado: Check,
  divergente: EqualNot,
  neutro: Info,
};
const toneCircle: Record<StatusTone, string> = {
  aguardando: "bg-[#f6c26b26] text-[#f6c26b]",
  confirmado: "bg-mint text-night shadow-[0_0_0_6px_#8fe0b42e]",
  divergente: "bg-[#ff8a9a26] text-danger-soft",
  neutro: "bg-white/10 text-mint",
};

/** Agora, atualizado a cada `intervalMs` enquanto `enabled` (o anel acompanha o prazo). */
function useNow(enabled: boolean, intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs]);
  return now;
}

export interface DeadlineRingProps {
  /** Prazo (ISO). */
  deadline: string;
  /** Início da janela do prazo (ISO), como a reserva ou o início da partida; sem ele, `windowHours` antes do prazo. */
  windowStart?: string | null;
  /** Duração da janela, quando não há `windowStart` (48 h na reserva e no resultado). */
  windowHours?: number;
  className?: string;
}

/** Anel âmbar com as horas restantes ("46 h"); o texto completo fica para leitores de tela. */
export function DeadlineRing({ deadline, windowStart, windowHours = 48, className }: DeadlineRingProps) {
  const now = useNow(true);
  const end = parseIso(deadline)?.getTime() ?? now;
  const start = parseIso(windowStart)?.getTime() ?? end - windowHours * 3_600_000;
  const total = Math.max(1, end - start);
  const left = end - now;
  const fraction = Math.min(1, Math.max(0, left / total));
  const remaining = formatRemaining(left);
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  return (
    <span
      data-slot="deadline-ring"
      data-fraction={fraction.toFixed(3)}
      className={cn("relative grid size-12 flex-none place-items-center", className)}
    >
      <svg viewBox="0 0 48 48" className="absolute inset-0 size-full" aria-hidden="true">
        <circle cx="24" cy="24" r={radius} fill="none" stroke="#ffffff22" strokeWidth="4" />
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke="#f6c26b"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${circumference * fraction} ${circumference}`}
          transform="rotate(-90 24 24)"
          className="motion-safe:transition-[stroke-dasharray] motion-safe:duration-700"
        />
      </svg>
      <span aria-hidden="true" className="relative font-display text-[10px] font-extrabold text-[#f6c26b] tabular-nums">
        {remaining.short}
      </span>
      <span className="sr-only">{remaining.long}</span>
    </span>
  );
}

export interface StatusCardProps {
  tone: StatusTone;
  title: ReactNode;
  /** Texto do cartão; use `<b>` para o prazo ou os placares ("fecha <b>seg, 20 out · 16:00</b>"). */
  children?: ReactNode;
  /** Prazo (ISO): no tom "aguardando", troca o ícone pelo anel das horas restantes. */
  deadline?: string | null;
  windowStart?: string | null;
  windowHours?: number;
  /** Ícone no lugar do padrão do tom (ex.: `FileSearch` no comprovante em análise). */
  icon?: LucideIcon;
  /** Pílula menta à direita, como "+3 pts" ou o nome do time inscrito. */
  pill?: ReactNode;
  /** Botões do cartão (`StatusCardButton`). */
  actions?: ReactNode;
  className?: string;
}

/** Cartão de estado S1 (aguardando, confirmado, divergente ou genérico). */
export function StatusCard({
  tone,
  title,
  children,
  deadline,
  windowStart,
  windowHours,
  icon,
  pill,
  actions,
  className,
}: StatusCardProps) {
  const Icon = icon ?? toneIcon[tone];
  const ring = tone === "aguardando" && parseIso(deadline);
  return (
    <div
      data-slot="status-card"
      data-tone={tone}
      className={cn(
        "relative flex min-w-0 gap-3 rounded-card bg-forest p-3.5 text-white",
        tone === "divergente" || actions ? "items-start" : "items-center",
        className,
      )}
    >
      {ring && deadline ? (
        <DeadlineRing deadline={deadline} windowStart={windowStart} windowHours={windowHours} />
      ) : (
        <span className={cn("grid size-10 flex-none place-items-center rounded-full", toneCircle[tone])}>
          <Icon size={20} aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <b className="block font-display text-[13px] font-bold">{title}</b>
        {children && (
          <small className="mt-[3px] block text-[10.5px] leading-normal text-white/70 [&_b]:font-bold [&_b]:text-white">
            {children}
          </small>
        )}
        {actions && <div className="mt-2.5 flex flex-wrap gap-2 *:flex-1">{actions}</div>}
      </div>
      {pill && (
        <span className="flex-none rounded-full bg-mint px-2.5 py-[5px] font-display text-[11px] font-extrabold whitespace-nowrap text-night">
          {pill}
        </span>
      )}
    </div>
  );
}

/** Botão do cartão S1: `primary` em menta e `secondary` com contorno claro. */
export function StatusCardButton({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" }) {
  return (
    <button
      type="button"
      data-slot="status-card-button"
      className={cn(
        "inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded-field border border-solid px-[11px] text-[11px] font-bold whitespace-nowrap [&_svg]:size-4",
        variant === "primary" ? "border-transparent bg-mint text-night" : "border-white/25 bg-transparent text-white hover:bg-white/8",
        className,
      )}
      {...props}
    />
  );
}
