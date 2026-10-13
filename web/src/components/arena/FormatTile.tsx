import { footballFormat, placementRequired, shownTier, tiers } from "@/data/arena";
import type { FootballFormat, TierKey } from "@/data/arena";
import { cn } from "@/lib/utils";
import { PlacementBadge } from "./PlacementMeter";
import { TierEmblem } from "./TierEmblem";

export interface FormatTileProps {
  format: FootballFormat;
  /** Elo do time no formato, como vier da API. Só aparece com a classificação completa (`shownTier`). */
  tier: TierKey | null;
  /** Partidas confirmadas no formato (janela de 52 semanas). */
  played: number;
  required?: number;
  className?: string;
}

/**
 * Célula da grade Futsal | Society | Campo da carteirinha (C5), sobre a placa escura: o elo (nome em
 * menta), "n/3 jogos" durante a classificação ou "sem jogos", apagada.
 */
export function FormatTile({
  format,
  tier,
  played,
  required = placementRequired,
  className,
}: FormatTileProps) {
  const shown = shownTier(tier, played, required);
  const state = shown ? "ranked" : played > 0 ? "placement" : "empty";
  const done = Math.min(Math.max(0, played), required);
  return (
    <div
      data-slot="format-tile"
      data-state={state}
      className={cn(
        "grid min-w-0 justify-items-center gap-[3px] rounded-[13px] bg-black/18 px-1 pt-[9px] pb-2 text-center text-white",
        state === "empty" && "opacity-55",
        className,
      )}
    >
      {shown ? (
        <TierEmblem tier={shown} size="md" decorative />
      ) : (
        <PlacementBadge
          played={done}
          required={required}
          size="md"
          decorative
          className="text-white/65"
        />
      )}
      <b className="text-[10.5px] font-bold">{footballFormat[format].label}</b>
      <small
        className={cn(
          "max-w-full truncate text-[9px] text-white/55",
          shown && "font-bold text-mint",
        )}
      >
        {shown ? (
          <>
            <span className="sr-only">Elo </span>
            {tiers[shown].name}
          </>
        ) : state === "placement" ? (
          <>
            <span aria-hidden="true">
              {done}/{required} jogos
            </span>
            <span className="sr-only">
              {done} de {required} partidas de classificação
            </span>
          </>
        ) : (
          "sem jogos"
        )}
      </small>
    </div>
  );
}
