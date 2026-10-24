import { useEffect, useRef, useState } from "react";
import { Timer, Trophy } from "lucide-react";
import type { Profile, Sport } from "../api/client";
import { CategoryCard } from "../components/ranking/CategoryCard";
import { CategorySheet } from "../components/ranking/CategorySheet";
import { LegendsEntry } from "../components/ranking/LegendsEntry";
import { PositionState } from "../components/ranking/PositionState";
import type { PositionStateKind } from "../components/ranking/PositionState";
import { TeamSwitch } from "../components/ranking/TeamSwitch";
import { TierPicker } from "../components/ranking/TierPicker";
import { TierPlate } from "../components/ranking/TierPlate";
import { TierPositionHero } from "../components/ranking/TierPositionHero";
import { TierSwitch } from "../components/ranking/TierSwitch";
import { TierWindow } from "../components/ranking/TierWindow";
import {
  activeSports,
  categoryDetail,
  categoryQuery,
  categoryText,
  isTeamRanking,
  rankingKey,
  subjectNoun,
} from "../components/ranking/category";
import type { RankingCategory, RankingState } from "../components/ranking/category";
import { inTier } from "../components/ranking/tierText";
import { collapsedEntries, expandedEntries } from "../components/ranking/windowEntries";
import { useRanking } from "../components/ranking/useRanking";
import { useRankingOverview } from "../components/ranking/useRankingOverview";
import { rankedTier } from "../components/play/tierLines";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadError } from "@/components/ui/load-error";
import { tierOrder } from "../data/arena";
import type { RunDistance, Screen, TierKey } from "../data/arena";

/** Linhas ao redor do titular: duas acima e duas abaixo. */
const AROUND = 2;
/** Linhas de outro elo: os 5 primeiros (a 6ª, do pedido `limit=6`, é a linha esmaecida). */
const TOP = 5;

/** A categoria inicial: a restaurada da pilha, a modalidade pedida (se o titular a tem) ou a primeira ativa. */
function initialState(
  profiles: readonly Profile[],
  initial: RankingState | undefined,
  initialSport: Sport | undefined,
  initialDistance: RunDistance | undefined,
): RankingState {
  const active = activeSports(profiles);
  if (initial && active.includes(initial.sport)) return { ...initial };
  return {
    sport: initialSport && active.includes(initialSport) ? initialSport : (active[0] ?? "futebol"),
    kind: "time",
    format: "society",
    position: profiles.find((profile) => profile.sport === "futebol")?.position ?? "atacante",
    distance: initialDistance ?? 5,
    teamId: null,
  };
}

interface RankingPageProps {
  profiles: Profile[];
  /** Os perfis ainda estão sendo lidos: a categoria inicial depende deles. */
  loading?: boolean;
  /** Modalidade já escolhida ao abrir (por exemplo, a corrida, pelo "Ver ranking" de "Suas marcas"). */
  initialSport?: Sport;
  /** Distância já escolhida ao abrir a corrida. */
  initialDistance?: RunDistance;
  /** Categoria guardada na pilha (a escolha feita antes de abrir o Salão), que volta ao voltar. */
  initial?: RankingState;
  /** Avisa a escolha (categoria e time) para o aplicativo guardá-la na pilha. */
  onChange?: (state: RankingState) => void;
  go: (screen: Screen, context?: { ranking?: RankingState }) => void;
  onOpenUser?: (userId: number) => void;
  onExpired: () => void;
}

/**
 * Tela Ranking, "você no centro": o cartão Categoria (abre a folha de filtros), os chips dos times (ranking de Times com
 * mais de um time ativo), a entrada do Salão dos Lendários e a placa contínua do elo. Cada elo é um ranking próprio
 * (1º ao último dentro do elo; a posição geral não aparece): a placa mostra a posição do titular no elo dele, as
 * diferenças para o 1º e para o próximo e uma janela de duas linhas acima e duas abaixo. As linhas fora da janela
 * aparecem na borda esmaecida e abrem o elo inteiro (por páginas, com o titular sempre à vista). As setas trocam de elo
 * (pulando os vazios; do Diamante para cima abre o Salão). Sem elo, a placa da posição mostra o estado atual e os chips
 * Bronze a Diamante escolhem a faixa (Bronze por padrão). Dados: `GET /rankings/overview` e `GET /rankings?tier=…`.
 */
export default function RankingPage({ loading = false, ...props }: RankingPageProps) {
  if (loading) return <p role="status">Carregando ranking…</p>;
  if (!activeSports(props.profiles).length) {
    return (
      <EmptyState
        Icon={Trophy}
        title="Você ainda não joga nenhuma modalidade"
        text="O Ranking mostra os elos das modalidades em que você tem perfil ativo. Configure futebol, tênis ou corrida para entrar."
        action={
          <Button className="mt-4" onClick={() => props.go("sports")}>
            Configurar modalidade
          </Button>
        }
      />
    );
  }
  return <RankingContent {...props} />;
}

function RankingContent({
  profiles,
  initialSport,
  initialDistance,
  initial,
  onChange,
  go,
  onOpenUser,
  onExpired,
}: Omit<RankingPageProps, "loading">) {
  const [state, setState] = useState<RankingState>(() => initialState(profiles, initial, initialSport, initialDistance));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tierSel, setTierSel] = useState<TierKey | null>(null);
  const [expanded, setExpanded] = useState(false);
  const plateRef = useRef<HTMLDivElement>(null);

  const category: RankingCategory = state;
  const query = categoryQuery(category);
  const teamRanking = isTeamRanking(category);
  const ranking = rankingKey(category);
  const running = category.sport === "corrida";

  const overview = useRankingOverview(query, teamRanking ? state.teamId : null, onExpired);
  const ov = overview.overview;
  const classified = ov?.classified_count ?? 0;
  const counts = ov?.tier_counts;

  const selected = ov ? (ov.mine.find((line) => line.team?.id === ov.selected_team_id) ?? ov.mine[0] ?? null) : null;
  const myTier = selected ? rankedTier(selected) : null;
  const viewTier: TierKey = tierSel ?? myTier ?? "bronze";
  const own = Boolean(selected && myTier && viewTier === myTier && selected.tier_position != null);
  const total = counts ? (own ? (selected?.tier_size ?? counts[viewTier]) : counts[viewTier]) : 0;
  const showPlate = Boolean(ov) && classified > 0;

  // Outro elo: os 5 primeiros (limit=6, a 6ª é a linha esmaecida). O elo do titular já vem do overview (`window`).
  const preview = useRanking({ ...query, tier: viewTier }, onExpired, { enabled: showPlate && !own && total > 0, limit: TOP + 1 });
  // O elo inteiro, por páginas e a partir do 1º, só depois de tocar numa borda.
  const full = useRanking({ ...query, tier: viewTier }, onExpired, { enabled: showPlate && expanded && total > 0 });
  const fullReady = expanded && Boolean(full.page);
  const fullError = expanded ? full.error || full.moreError : "";

  // Ao abrir o elo inteiro, a linha do titular volta para o meio da tela.
  useEffect(() => {
    if (fullReady) plateRef.current?.querySelector("[aria-current]")?.scrollIntoView?.({ block: "center" });
  }, [fullReady]);

  function leaveFull() {
    setExpanded(false);
    full.reload();
  }
  function update(change: Partial<RankingState>) {
    const next = { ...state, ...change };
    setState(next);
    onChange?.(next);
    setTierSel(null);
    leaveFull();
  }
  function chooseTier(tier: TierKey) {
    setTierSel(tier);
    leaveFull();
  }
  const openHall = () => go("legends", { ranking: state });

  const known = own ? (ov?.window ?? []) : preview.items;
  const center = selected?.tier_position ?? 0;
  const first = own ? Math.max(1, center - AROUND) : 1;
  const last = own ? Math.min(total, center + AROUND) : Math.min(TOP, total);
  const entries = fullReady
    ? expandedEntries(full.items, own ? known : [], total, full.hasMore)
    : collapsedEntries(known, first, last, total);
  const noun = (count: number) => subjectNoun(category, count);

  const index = tierOrder.indexOf(viewTier);
  const filled = (tier: TierKey) => (counts?.[tier] ?? 0) > 0;
  const down = tierOrder.slice(0, index).reverse().find(filled) ?? null;
  const up = tierOrder.slice(index + 1).find(filled) ?? null;

  const stateKind: PositionStateKind | null = !selected
    ? teamRanking
      ? "no-team"
      : null
    : myTier
      ? null
      : selected.state === "sem_marca"
        ? "no-mark"
        : "placement";

  const nTop = Math.min(TOP, total);
  const note =
    total === 0
      ? `Ninguém ${inTier(viewTier)} ainda.`
      : fullReady
        ? `Todos os ${total} ${noun(total)} ${inTier(viewTier)}:`
        : `${myTier ? `Você está ${inTier(myTier)}. ` : ""}${nTop === 1 ? "O primeiro" : `Os ${nTop} primeiros`} ${inTier(viewTier)}:`;

  const teamLines = (ov ?? overview.last)?.mine ?? [];
  return (
    <div id="ranking-panel" aria-busy={overview.loading} className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <CategoryCard sport={category.sport} text={categoryText(category)} onOpen={() => setSheetOpen(true)} />
      {teamRanking && (
        <TeamSwitch
          lines={teamLines}
          selectedTeamId={ov?.selected_team_id ?? state.teamId}
          onSelect={(teamId) => update({ teamId })}
        />
      )}
      {overview.loading ? (
        <p role="status">Carregando ranking…</p>
      ) : overview.error ? (
        <LoadError
          size="screen"
          title="Não foi possível carregar o ranking"
          text={overview.error}
          cause={overview.errorCause}
          onRetry={overview.reload}
        />
      ) : (
        ov && (
          <>
            {classified > 0 && (
              <LegendsEntry
                count={ov.tier_counts.lendario}
                slots={ov.legend_slots}
                preview={ov.legends_preview}
                mine={myTier === "lendario"}
                onOpen={openHall}
              />
            )}
            {stateKind && (
              <PositionState
                kind={stateKind}
                line={selected}
                distance={category.distance}
                onPlay={() => go("play")}
                onTeams={() => go("teams")}
              />
            )}
            {classified > 0 && !myTier && <TierPicker value={viewTier} onChange={chooseTier} />}
            {showPlate ? (
              <TierPlate
                tier={viewTier}
                label={`Ranking ${inTier(viewTier)}`}
                busy={(!own && preview.loading) || (expanded && !full.page && !full.error)}
              >
                <TierSwitch
                  tier={viewTier}
                  count={total}
                  noun={noun(total)}
                  down={down}
                  up={up}
                  onTier={chooseTier}
                  onHall={openHall}
                />
                <div ref={plateRef}>
                  {own && selected ? (
                    <TierPositionHero line={selected} tier={viewTier} ranking={ranking} />
                  ) : (
                    <p className="relative mx-4 mt-2.5 mb-2 text-[11px] text-white/70">{note}</p>
                  )}
                  {!own && preview.loading ? (
                    <p role="status" className="relative px-4 py-3 text-[11.5px] text-white/70">
                      Carregando ranking…
                    </p>
                  ) : !own && preview.error ? (
                    <LoadError
                      size="section"
                      tone="dark"
                      title="Não foi possível carregar o elo"
                      text={preview.error}
                      cause={preview.errorCause}
                      onRetry={preview.reload}
                    />
                  ) : (
                    <TierWindow
                      entries={entries}
                      ranking={ranking}
                      noun={noun}
                      busy={expanded && (full.loading || full.busy)}
                      onExpand={() => setExpanded(true)}
                      onMore={() => void full.loadMore()}
                      onOpenUser={onOpenUser}
                    />
                  )}
                  {fullError && (
                    <div className="relative mx-4 mt-2 grid justify-items-start gap-0.5" aria-live="polite">
                      <p className="m-0 text-[11.5px] leading-normal text-danger-soft" role="alert">
                        {fullError}
                      </p>
                      <Button variant="glass-link" onClick={() => (full.error ? full.reload() : void full.loadMore())}>
                        Tentar de novo
                      </Button>
                    </div>
                  )}
                  {expanded && (
                    <Button
                      variant="glass-secondary"
                      className="relative mx-2.5 mt-2 w-[calc(100%-20px)] border border-solid border-white/18"
                      onClick={leaveFull}
                    >
                      {own ? "Mostrar só ao seu redor" : `Mostrar só os ${TOP} primeiros`}
                    </Button>
                  )}
                </div>
              </TierPlate>
            ) : (
              running ? (
                <EmptyState
                  Icon={Timer}
                  title={`Ninguém com marca nos ${category.distance} km ainda`}
                  text="O ranking usa o melhor tempo das últimas 52 semanas de cada atleta. A primeira marca já classifica."
                  action={
                    stateKind === "no-mark" ? undefined : (
                      <Button variant="link" className="mt-2" onClick={() => go("play")}>
                        Registrar uma corrida
                      </Button>
                    )
                  }
                />
              ) : (
                <EmptyState
                  Icon={Trophy}
                  title="Ninguém classificado ainda"
                  text={`O ranking de ${categoryDetail(category)} começa quando as primeiras partidas forem confirmadas. São ${ov.required} partidas para sair da classificação.`}
                />
              )
            )}
          </>
        )
      )}
      {sheetOpen && (
        <CategorySheet
          profiles={profiles}
          category={category}
          onChange={(change) => update(change)}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}
