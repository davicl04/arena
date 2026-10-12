import { cva, type VariantProps } from "class-variance-authority";
import { tiers } from "@/data/arena";
import type { TierKey } from "@/data/arena";
import { cn } from "@/lib/utils";

/*
 * Tamanhos dos protótipos: xs 16 (pílulas de formato) · sm 22 (padrão, linhas) · md 32 (célula de
 * formato da carteirinha) · lg 44 (linha do elo do Jogar) · xl 52 (cartazes e ranking).
 */
const emblemVariants = cva("inline-block flex-none object-contain", {
  variants: {
    size: {
      xs: "size-4",
      sm: "size-[22px]",
      md: "size-8",
      lg: "size-11",
      xl: "size-[52px]",
    },
  },
  defaultVariants: { size: "sm" },
});
export type TierEmblemSize = NonNullable<VariantProps<typeof emblemVariants>["size"]>;

export interface TierEmblemProps {
  /**
   * Elo com a classificação completa (obtenha com `shownTier`). **Nunca** use para quem está em
   * classificação: nesse caso, `PlacementBadge` ou `PlacementMeter`.
   */
  tier: TierKey;
  size?: TierEmblemSize;
  /** Mostra o nome do elo ao lado do brasão (o texto herda a fonte do contexto). */
  showName?: boolean;
  /** Use quando o nome do elo já aparece no texto vizinho. */
  decorative?: boolean;
  className?: string;
}

/** Brasão do elo (Bronze a Lendário), com o nome opcional. Uma chave desconhecida não mostra nada. */
export function TierEmblem({
  tier,
  size,
  showName = false,
  decorative = false,
  className,
}: TierEmblemProps) {
  const info = tiers[tier];
  if (!info) return null;
  const image = (
    <img
      data-slot="tier-emblem"
      src={info.image}
      alt={showName || decorative ? "" : `Elo ${info.name}`}
      className={cn(emblemVariants({ size }), !showName && className)}
    />
  );
  if (!showName) return image;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      {image}
      <span>
        {!decorative && <span className="sr-only">Elo </span>}
        {info.name}
      </span>
    </span>
  );
}
