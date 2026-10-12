import { TeamCrest } from "@/components/arena/TeamCrest";
import { TierEmblem } from "@/components/arena/TierEmblem";
import { SocialPhoto } from "@/components/SocialPhoto";
import { tiers } from "@/data/arena";
import { sideName } from "@/data/match";
import type { MatchSideOut } from "@/api/matches";
import { cn } from "@/lib/utils";

/**
 * Marca de um lado da partida: o brasão do time com o elo no canto, ou a foto do atleta no tênis. O elo só aparece
 * quando o pareamento o guardou (`tier`); quem está em classificação não tem elo, nem aqui nem em lugar nenhum.
 */
export function TeamMark({ side, size = "sm", className }: { side: MatchSideOut; size?: "sm" | "lg"; className?: string }) {
  const name = sideName(side);
  const tier = side.tier && side.tier in tiers ? side.tier : null;
  return (
    <span data-slot="team-mark" className={cn("relative inline-grid flex-none", className)}>
      {side.team ? (
        <TeamCrest name={side.team.name} initials={side.team.initials} path={side.team.crest_url} size={size === "lg" ? "lg" : "sm"} />
      ) : (
        <SocialPhoto
          path={side.athlete?.avatar_url ?? null}
          name={name}
          size="comment"
          className={size === "lg" ? "size-[52px] flex-[0_0_52px] text-[14px]" : "size-[29px] flex-[0_0_29px] text-[10px]"}
        />
      )}
      {tier && (
        <TierEmblem
          tier={tier}
          size="xs"
          className={cn("absolute drop-shadow-[0_1px_2px_#000a]", size === "lg" ? "-right-2.5 -bottom-1 size-6" : "-right-1.5 -bottom-[3px] size-[15px]")}
        />
      )}
    </span>
  );
}
