import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { placementRequired } from "@/data/arena";
import { cn } from "@/lib/utils";

/*
 * Círculo tracejado "n/3". Tamanhos: xs 16 (pílulas) · sm 26 (cabeçalho da partida) · md 30 (célula de
 * formato) · lg 44 (linha do elo). Tons: `mint` (linha do elo na placa: número menta), `dark` (pílulas e
 * carteirinha sobre a placa) e `light` (fundos claros).
 */
const badgeVariants = cva(
  "inline-grid flex-none place-items-center rounded-full border-dashed font-display leading-none font-extrabold tabular-nums",
  {
    variants: {
      size: {
        xs: "size-4 border text-[6.5px]",
        sm: "size-[26px] border-[1.5px] text-[8.5px]",
        md: "size-[30px] border-[1.5px] text-[9px]",
        lg: "size-11 border-2 text-[12px]",
      },
      tone: {
        mint: "border-white/35 text-mint",
        dark: "border-current text-white opacity-75",
        light: "border-current text-ink-muted",
      },
    },
    defaultVariants: { size: "sm", tone: "dark" },
  },
);
type BadgeVariants = VariantProps<typeof badgeVariants>;

/** Partidas contadas, limitadas a 0…required. */
const clampPlayed = (played: number, required: number) =>
  Math.min(Math.max(0, Math.floor(played)), required);

export interface PlacementBadgeProps {
  /** Partidas confirmadas na classificação. */
  played: number;
  /** Partidas exigidas para sair da classificação (3 no futebol e no tênis). */
  required?: number;
  size?: BadgeVariants["size"];
  tone?: BadgeVariants["tone"];
  /** Use quando "n de 3 partidas" já aparece no texto vizinho. */
  decorative?: boolean;
  className?: string;
}

/** Círculo tracejado com "n/3", no lugar do elo enquanto a classificação não termina. */
export function PlacementBadge({
  played,
  required = placementRequired,
  size,
  tone,
  decorative = false,
  className,
}: PlacementBadgeProps) {
  const done = clampPlayed(played, required);
  const a11y = decorative
    ? { "aria-hidden": true as const }
    : { role: "img", "aria-label": `${done} de ${required} partidas de classificação` };
  return (
    <span
      data-slot="placement-badge"
      className={cn(badgeVariants({ size, tone }), className)}
      {...a11y}
    >
      {done}/{required}
    </span>
  );
}

export interface PlacementMeterProps {
  played: number;
  required?: number;
  /** Título da linha, como "Em classificação" ou "Em classificação como goleiro". */
  title?: ReactNode;
  /** Complemento depois de "n de 3 partidas", como "enfrenta qualquer nível" (linha do elo do Jogar). */
  hint?: string;
  /** `dark` sobre a placa `forest` (padrão) ou `light` sobre fundos claros. */
  tone?: "dark" | "light";
  className?: string;
}

/**
 * Linha da classificação (H1 do Jogar): "n/3" no círculo tracejado, título, "n de 3 partidas" e três
 * barrinhas. É o que aparece no lugar do elo para quem ainda não tem classificação.
 */
export function PlacementMeter({
  played,
  required = placementRequired,
  title = "Em classificação",
  hint,
  tone = "dark",
  className,
}: PlacementMeterProps) {
  const done = clampPlayed(played, required);
  const dark = tone === "dark";
  return (
    <div
      data-slot="placement-meter"
      className={cn("flex min-w-0 items-center gap-2.5 text-left", className)}
    >
      <PlacementBadge
        played={done}
        required={required}
        size="lg"
        tone={dark ? "mint" : "light"}
        decorative
      />
      <div className="min-w-0">
        {title && <b className="block font-display text-[14px] font-bold">{title}</b>}
        <small className={cn("mt-0.5 block text-[10.5px]", dark ? "text-white/65" : "text-ink-muted")}>
          {done} de {required} partidas
          {hint && ` · ${hint}`}
        </small>
        <div className="mt-1.5 flex gap-1" aria-hidden="true">
          {Array.from({ length: required }, (_, index) => (
            <span
              key={index}
              data-on={index < done ? "" : undefined}
              className={cn(
                "h-[5px] w-[22px] rounded-[3px]",
                index < done ? (dark ? "bg-mint" : "bg-brand") : dark ? "bg-white/15" : "bg-line",
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
