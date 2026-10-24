import { ArrowLeft } from "lucide-react";
import { TierEmblem } from "../components/arena/TierEmblem";
import { RankingLine } from "../components/ranking/RankingLine";
import { categoryQuery, categoryText, rankingKey } from "../components/ranking/category";
import type { RankingState } from "../components/ranking/category";
import { useRanking } from "../components/ranking/useRanking";
import { Button, IconButton } from "@/components/ui/button";
import { LoadError } from "@/components/ui/load-error";

/** A regra do Lendário em uma frase, com as vagas ocupadas. */
function rule(slots: number, count: number): string {
  if (slots <= 0) return "Topo 15% dos classificados com os pontos de Diamante. As vagas abrem com 7 classificados.";
  return `Topo ${slots} (15% dos classificados) com os pontos de Diamante. ${count} de ${slots} ${slots === 1 ? "vaga ocupada" : "vagas ocupadas"}.`;
}

/**
 * Salão dos Lendários: subtela escura do Ranking, aberta pela entrada do Salão e pela seta do Diamante. Mostra o brasão, a
 * categoria, a regra do elo ("Topo 12 (15% dos classificados) com os pontos de Diamante. 12 de 12 vagas ocupadas") e a
 * lista numerada de `GET /rankings?tier=lendario` (a mesma linha com forma recente; a do titular com contorno menta), por
 * páginas. O rodapé lembra como se sai do Salão. A barra tem o voltar e não tem o sino.
 */
export default function LegendsPage({
  ranking: category,
  onBack,
  onOpenUser,
  onExpired,
}: {
  ranking: RankingState;
  onBack: () => void;
  onOpenUser?: (userId: number) => void;
  onExpired: () => void;
}) {
  const list = useRanking({ ...categoryQuery(category), tier: "lendario" }, onExpired);
  const key = rankingKey(category);
  const page = list.page;
  const count = page?.tier_counts.lendario ?? list.items.length;
  return (
    <div className="relative min-h-full overflow-hidden bg-[radial-gradient(90%_50%_at_50%_18%,#3d3412_0%,var(--color-night)_70%)] pb-5 text-white">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-[120px] -left-4 h-[240px] w-[420px] bg-white opacity-[0.05] mask-[url(/images/brand/coliseum.svg)] mask-contain mask-center mask-no-repeat"
      />
      <div className="relative flex min-h-[58px] items-center px-2.5 pt-2">
        <IconButton tone="glass" aria-label="Voltar" className="focus-visible:outline-mint" onClick={onBack}>
          <ArrowLeft size={21} />
        </IconButton>
      </div>
      <header className="relative grid justify-items-center px-6 pb-[18px] text-center">
        <TierEmblem tier="lendario" size="xl" decorative className="size-[120px] drop-shadow-[0_10px_30px_#D9A21B66]" />
        <p className="m-0 mt-1.5 mb-1 text-[10px] font-bold tracking-[0.1em] text-legend uppercase">{categoryText(category)}</p>
        <h1 className="text-[19px] text-white">Salão dos Lendários</h1>
        {page && <p className="m-0 mt-1.5 text-[11.5px] leading-normal text-white/65">{rule(page.legend_slots, count)}</p>}
      </header>
      <div aria-busy={list.loading} className="relative px-4">
        {list.loading ? (
          <p role="status" className="text-center text-[12px] text-white/70">
            Carregando ranking…
          </p>
        ) : list.error ? (
          <LoadError
            size="screen"
            tone="dark"
            title="Não foi possível carregar o Salão"
            text={list.error}
            cause={list.errorCause}
            onRetry={list.reload}
          />
        ) : list.items.length ? (
          <>
            <ol data-slot="legends-list" className="m-0 grid list-none gap-2 p-0">
              {list.items.map((row) => (
                <RankingLine
                  key={`${row.rank_position}-${row.team?.id ?? row.athlete?.id}`}
                  row={row}
                  ranking={key}
                  tone="hall"
                  onOpenUser={onOpenUser}
                />
              ))}
            </ol>
            {list.moreError && (
              <p className="mt-3 mb-0 text-[11.5px] text-danger-soft" role="alert">
                {list.moreError}
              </p>
            )}
            {list.hasMore && (
              <Button
                variant="glass-secondary"
                className="mt-3 w-full border border-solid border-white/18"
                disabled={list.busy}
                onClick={() => void list.loadMore()}
              >
                {list.busy ? "Carregando…" : "Carregar mais"}
              </Button>
            )}
          </>
        ) : (
          <p className="m-0 text-center text-[12px] leading-[1.6] text-white/70">Nenhum Lendário ainda nesta categoria.</p>
        )}
      </div>
      <p className="relative mx-6 mt-3.5 mb-0 text-center text-[10.5px] leading-normal text-white/45">
        Quem sai do topo 15% ou perde os pontos de Diamante volta ao Diamante no próximo cálculo.
      </p>
    </div>
  );
}
