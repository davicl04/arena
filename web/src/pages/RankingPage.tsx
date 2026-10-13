import { useState } from "react";
import { Timer, Trophy } from "lucide-react";
import { sports } from "../api/client";
import type { Position, Profile, Sport } from "../api/client";
import type { RankingKey } from "../api/results";
import { MyRankingPlate, RankingRows } from "../components/ranking/RankingRows";
import { useRanking } from "../components/ranking/useRanking";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { feedbackVariants } from "@/components/ui/feedback";
import { LoadError } from "@/components/ui/load-error";
import { Tabs } from "@/components/ui/tabs";
import {
  footballFormat,
  footballFormats,
  positionOptions,
  rankingTiers,
  runDistances,
  sportIcons,
} from "../data/arena";
import type { FootballFormat, RunDistance, Screen } from "../data/arena";
import { plural } from "../utils/format";

type Kind = "time" | "individual";
const kinds = [
  { value: "time", label: "Times" },
  { value: "individual", label: "Individual" },
] as const;

/** Chave do ranking mostrada, para os textos; a API devolve a mesma em `ranking`. */
function rankingKey(sport: Sport, kind: Kind, distance: RunDistance): RankingKey {
  if (sport === "tenis") return "tenis";
  if (sport === "corrida") return `corrida_${distance}`;
  return kind === "time" ? "futebol_time" : "futebol_individual";
}

/**
 * Tela Ranking: os elos de referência no topo e a lista **geral** (sem cidade) de `GET /rankings`, por modalidade. No
 * futebol, Times | Individual, o formato e, no individual, a posição; no tênis, a lista única; na corrida, a distância,
 * com o melhor tempo das últimas 52 semanas de cada atleta (menor vence). Cada linha traz o brasão do elo de quem já se
 * classificou; a linha de quem vê fica em destaque e a placa "Sua posição" mostra também quem ainda está em classificação.
 */
export default function RankingPage({
  profiles,
  initialSport,
  initialDistance,
  go,
  onOpenUser,
  onExpired,
}: {
  profiles: Profile[];
  /** Modalidade já escolhida ao abrir (por exemplo, a corrida, pelo "Ver ranking" de "Suas marcas"). */
  initialSport?: Sport;
  /** Distância já escolhida ao abrir a corrida. */
  initialDistance?: RunDistance;
  go: (screen: Screen) => void;
  onOpenUser?: (userId: number) => void;
  onExpired: () => void;
}) {
  const [sport, setSport] = useState<Sport>(initialSport ?? "futebol");
  const [kind, setKind] = useState<Kind>("time");
  const [format, setFormat] = useState<FootballFormat>("society");
  const [position, setPosition] = useState<Position>(
    () => profiles.find((profile) => profile.sport === "futebol")?.position ?? "atacante",
  );
  const [distance, setDistance] = useState<RunDistance>(initialDistance ?? 5);

  const football = sport === "futebol";
  const ranking = useRanking(
    football
      ? { sport, kind, format, position: kind === "individual" ? position : undefined }
      : sport === "corrida"
        ? { sport, distance_km: distance }
        : { sport },
    onExpired,
  );
  const key = rankingKey(sport, kind, distance);
  const page = ranking.page;
  const running = sport === "corrida";
  const category = football
    ? `${footballFormat[format].label}${kind === "individual" ? ` · ${positionOptions.find((item) => item.value === position)?.label}` : ""}`
    : running
      ? `${distance} km`
      : "Tênis";

  return (
    <>
      <div className="mt-1.5 mb-[17px]">
        <Eyebrow>CADA JOGO CONTA</Eyebrow>
        <h2 className="mt-[3px] text-[28px]">Ranking</h2>
        <p className="mb-[25px] text-[12px] leading-[1.6] text-ink-muted">Reconstrua sua arena a cada elo.</p>
      </div>
      <div className="mb-6 flex flex-wrap justify-center gap-2.5" aria-label="Elos do ranking">
        {rankingTiers.map((tier) => (
          <figure key={tier.image} className="m-0 w-[calc((100%-20px)/3)] rounded-xl bg-forest px-1.5 py-3 text-center">
            <img className="inline h-[52px] w-full align-baseline object-contain" src={`/images/brand/${tier.image}.svg`} alt="" />
            <figcaption className="mt-1.5 text-[11px] font-bold text-[#edebe2]">{tier.name}</figcaption>
          </figure>
        ))}
      </div>

      <div className="mb-3.5 flex flex-wrap gap-[7px]" role="group" aria-label="Modalidade">
        {sports.map((item) => {
          const Icon = sportIcons[item.value];
          return (
            <Chip key={item.value} aria-pressed={sport === item.value} onClick={() => setSport(item.value)}>
              <Icon size={15} />
              {item.label}
            </Chip>
          );
        })}
      </div>

      {football && (
        <Tabs
          variant="track"
          items={kinds}
          value={kind}
          onChange={setKind}
          label="Tipo de ranking"
          idPrefix="ranking-kind-"
          controls="ranking-panel"
          className="mb-3"
        />
      )}
      {football && (
        <div className="mb-3 flex flex-wrap gap-[7px]" role="group" aria-label="Formato">
          {footballFormats.map((item) => (
            <Chip key={item.value} aria-pressed={format === item.value} onClick={() => setFormat(item.value)}>
              {item.label} {item.size}
            </Chip>
          ))}
        </div>
      )}
      {football && kind === "individual" && (
        <div className="mb-3 flex flex-wrap gap-[7px]" role="group" aria-label="Posição">
          {positionOptions.map((item) => (
            <Chip key={item.value} aria-pressed={position === item.value} onClick={() => setPosition(item.value)}>
              {item.label}
            </Chip>
          ))}
        </div>
      )}
      {running && (
        <div className="mb-3 flex flex-wrap gap-[7px]" role="group" aria-label="Distância">
          {runDistances.map((item) => (
            <Chip key={item.value} aria-pressed={distance === item.value} onClick={() => setDistance(item.value)}>
              {item.label}
            </Chip>
          ))}
        </div>
      )}

      <div
        id="ranking-panel"
        role={football ? "tabpanel" : undefined}
        aria-labelledby={football ? `ranking-kind-${kind}` : undefined}
        aria-busy={ranking.loading}
        className="grid grid-cols-[minmax(0,1fr)] gap-3"
      >
        {ranking.loading ? (
          <p role="status">Carregando ranking…</p>
        ) : ranking.error ? (
          <LoadError size="screen" title="Não foi possível carregar o ranking" text={ranking.error} cause={ranking.errorCause} onRetry={ranking.reload} />
        ) : (
          page && (
            <>
              <MyRankingPlate
                lines={page.mine}
                ranking={key}
                empty={
                  football && kind === "time" ? (
                    <p className="m-0 flex flex-wrap items-center justify-between gap-2 rounded-card bg-white p-3.5 text-[12px] leading-normal text-ink-muted">
                      Você ainda não faz parte de um time ativo.
                      <Button variant="link" onClick={() => go("teams")}>
                        Meus times
                      </Button>
                    </p>
                  ) : undefined
                }
              />
              {ranking.items.length ? (
                <section aria-label={`Ranking · ${category}`}>
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <h3 className="text-[14px]">{category}</h3>
                    <small className="text-[10.5px] text-ink-muted">
                      {plural(page.classified_count, "classificado", "classificados")}
                      {page.legend_slots > 0 && ` · ${plural(page.legend_slots, "vaga", "vagas")} de Lendário`}
                      {running && " · menor tempo vence"}
                    </small>
                  </div>
                  <RankingRows items={ranking.items} ranking={key} onOpenUser={onOpenUser} />
                  <div aria-live="polite">
                    {ranking.moreError && (
                      <p className={feedbackVariants()} role="alert">
                        {ranking.moreError}
                      </p>
                    )}
                  </div>
                  {ranking.hasMore && (
                    <Button
                      variant="secondary"
                      className="mt-3 w-full"
                      disabled={ranking.busy}
                      onClick={() => void ranking.loadMore()}
                    >
                      {ranking.busy ? "Carregando…" : "Carregar mais"}
                    </Button>
                  )}
                </section>
              ) : running ? (
                <EmptyState
                  Icon={Timer}
                  title={`Ninguém com marca nos ${category} ainda`}
                  text="O ranking usa o melhor tempo das últimas 52 semanas de cada atleta. A primeira marca já classifica."
                  action={
                    <Button variant="link" className="mt-2" onClick={() => go("play")}>
                      Registrar uma corrida
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  Icon={Trophy}
                  title="Ninguém classificado ainda"
                  text={`O ranking de ${category} começa quando as primeiras partidas forem confirmadas. São ${page.required} partidas para sair da classificação.`}
                />
              )}
            </>
          )
        )}
      </div>

      <Button variant="secondary" className="mt-[18px] w-full" onClick={() => go("sports")}>
        Configurar modalidade
      </Button>
    </>
  );
}
