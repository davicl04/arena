import { ArrowLeft } from "lucide-react";
import { IconButton } from "@/components/ui/button";
import { StateBadge } from "@/components/events/StateBadge";
import { headerNames, matchPhases, orderedSides, sideName } from "@/data/match";
import type { MatchDetail } from "@/api/matches";
import { TeamMark } from "./TeamMark";

/**
 * Cabeçalho da partida (P2): barra `forest` com o voltar, os brasões com o elo no canto, "Ferrugem × Leões" e o
 * estado da partida (Combinando, Agendada…). No tênis, as fotos dos atletas.
 */
export function MatchHeader({ detail, onBack }: { detail: MatchDetail; onBack: () => void }) {
  const sides = orderedSides(detail);
  const [first, second] = sides;
  const phase = matchPhases[detail.phase] ?? { label: detail.phase, tone: "draft" as const };
  const [firstName, secondName] = headerNames(sides);
  return (
    <header data-slot="match-header" className="flex flex-none flex-wrap items-center gap-x-1 gap-y-0 bg-forest py-2 pr-3 pl-1 text-white">
      <IconButton tone="glass" aria-label="Voltar" onClick={onBack}>
        <ArrowLeft size={21} aria-hidden="true" />
      </IconButton>
      <div className="flex min-w-[11.5rem] flex-1 items-center gap-2">
        {first && <TeamMark side={first} />}
        <h1 className="flex min-w-0 flex-1 items-center justify-center gap-2 font-sans text-[12px] font-normal text-white">
          <span className="sr-only">{sides.map((side) => sideName(side)).join(" contra ")}</span>
          <b aria-hidden="true" className="min-w-0 truncate" title={sideName(first)}>{firstName}</b>
          <span aria-hidden="true" className="font-display text-[12px] font-extrabold text-mint">×</span>
          <b aria-hidden="true" className="min-w-0 truncate" title={sideName(second)}>{secondName}</b>
        </h1>
        {second && <TeamMark side={second} />}
      </div>
      {/* Em telas muito estreitas o selo desce para a linha de baixo, para os nomes não serem cortados. */}
      <StateBadge tone={phase.tone} surface="dark" className="mr-0.5 ml-auto flex-none">{phase.label}</StateBadge>
    </header>
  );
}
