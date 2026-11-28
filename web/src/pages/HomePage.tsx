import { useCallback } from "react";
import { Zap } from "lucide-react";
import { ApiError } from "../api/client";
import type { Profile, Sport } from "../api/client";
import { loadProfileEvents } from "../api/entries";
import { markNotificationRead } from "../api/notifications";
import type { ArenaNotification } from "../api/notifications";
import type { MatchCard } from "../api/matches";
import { getMyStandings } from "../api/play";
import { useNow } from "../hooks/useNow";
import { useWideLayout } from "../hooks/useLayout";
import { useResource } from "../hooks/useResource";
import { usePendingNotifications } from "../hooks/usePendingNotifications";
import type { NotificationSummaryState } from "../hooks/useNotificationSummary";
import { nextScheduledMatch } from "../components/play/matchView";
import { Logo } from "../components/Brand";
import { NotificationBell } from "../components/notifications/NotificationBell";
import { Placar } from "../components/home/Placar";
import { CHAMPIONSHIPS_LIMIT, championshipsSport, mergeChampionships, missingSportsCount, primaryButtonLabel } from "../data/home";
import { Destaque } from "../components/home/Destaque";
import { Pilulas } from "../components/home/Pilulas";
import { ProximoPasso } from "../components/home/ProximoPasso";
import { Campeonatos } from "../components/home/Campeonatos";
import type { CampeonatosState } from "../components/home/Campeonatos";
import { Button } from "@/components/ui/button";
import type { RunDistance, Screen } from "../data/arena";
import { notificationView } from "../data/notifications";
import type { NotificationFilter, NotificationTarget } from "../data/notifications";

export default function HomePage({
  firstName,
  profiles,
  loading,
  profilesFailed = false,
  matches = [],
  summary,
  isAdmin = false,
  go,
  onExpired,
}: {
  firstName: string;
  profiles: Profile[];
  loading: boolean;
  /** A leitura dos perfis falhou (o shell mostra o erro): sem lista confirmada, não convida a preparar perfis. */
  profilesFailed?: boolean;
  /** Partidas do titular lidas pela placa (`GET /me/play`): a próxima agendada vai ao Placar. */
  matches?: MatchCard[];
  /** Resumo das notificações (ArenaPage): o número do sino e o Destaque "Para responder". */
  summary?: NotificationSummaryState;
  /** Conta administrativa: alguns avisos levam às filas da administração. */
  isAdmin?: boolean;
  go: (
    screen: Screen,
    context?: Omit<NotificationTarget, "screen"> & { filter?: NotificationFilter; sport?: Sport; distance?: RunDistance },
  ) => void;
  onExpired: () => void;
}) {
  // Relógio de 60 s: recalcula a Contagem e troca o Placar para a partida seguinte quando `starts_at` passa.
  const now = useNow(60_000);
  // Em tablet e computador, o atalho de notificações fica na navegação lateral.
  const wide = useWideLayout();
  const nextMatch = nextScheduledMatch(matches, now);
  // Só uma lista vazia confirmada conta como "sem perfis": carregando ou com falha, não convida a prepará-los.
  const hasProfiles = loading || profilesFailed || profiles.length > 0;
  // Destaque "Para responder": só a pendência mais urgente (o total vem do resumo); só é lida quando o resumo diz que há pendências.
  const pendingCount = summary?.data?.pending_count ?? 0;
  const pending = usePendingNotifications(onExpired, {
    limit: 1,
    enabled: pendingCount > 0,
    version: summary?.data ? `${summary.data.pending_count}:${summary.data.unread_count}` : undefined,
  });
  async function openPending(notification: ArenaNotification) {
    const { target } = notificationView(notification, { isAdmin });
    if (!notification.read_at) {
      try {
        summary?.setData(await markNotificationRead(notification.id));
      } catch (cause) {
        // Marcar como lida é secundário: a navegação segue; só a sessão expirada interrompe.
        if (cause instanceof ApiError && cause.status === 401) {
          onExpired();
          return;
        }
      }
    }
    if (target) {
      const { screen, ...context } = target;
      go(screen, context);
    } else go("notifications", { filter: "responder" });
  }
  // Classificação das Pílulas ("Seu elo"): uma única leitura; o elo de quem já se classificou, ou "n de 3".
  const standings = useResource(getMyStandings, onExpired);
  // Perfis confirmados pelo shell (sem nova leitura): `null` enquanto carregam ou se a leitura falhou.
  const profileList = loading || profilesFailed ? null : profiles;
  // Campeonatos: uma leitura `GET /events` por perfil (modalidade e cidade), em paralelo, só com perfis. A lista do shell é
  // estado (mesma referência entre renderizações): a leitura acontece uma vez por montagem e de novo só se o shell a reler.
  const loadChampionships = useCallback(
    () => loadProfileEvents(profileList ?? [], CHAMPIONSHIPS_LIMIT).then((lists) => mergeChampionships(lists)),
    [profileList],
  );
  const championships = useResource(loadChampionships, onExpired, {
    enabled: Boolean(profileList?.length),
    fallback: "Não foi possível carregar os campeonatos.",
  });
  const championshipsState: CampeonatosState = loading
    ? { kind: "loading" }
    : !profileList
      ? { kind: "profiles-failed" }
      : profileList.length === 0
        ? { kind: "no-profiles" }
        : championships.loading
          ? { kind: "loading" }
          : championships.error
            ? { kind: "error", message: championships.error, cause: championships.errorCause, onRetry: championships.reload }
            : { kind: "ready", shown: championships.data ?? [] };
  const allSport = profileList?.length
    ? championshipsSport(championshipsState.kind === "ready" ? championshipsState.shown : [], profileList)
    : null;
  return (
    <>
      <header className="flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-0.5">
          {!wide && <NotificationBell tone="light" count={summary?.count ?? 0} onOpen={() => go("notifications")} />}
        </div>
      </header>
      <section className="pt-[26px] pb-[21px]">
        <p className="mb-[5px] text-[10px] font-bold tracking-[0.08em] text-ink-muted uppercase">
          {new Date(now).toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
        <h1 className="text-[25px] leading-[1.25] wrap-anywhere">
          A arena te chama, {firstName}
        </h1>
      </section>
      <Placar match={nextMatch} now={now} hasProfiles={hasProfiles} onOpen={(matchId) => go("match", { matchId })} />
      <Button className="mt-3 mb-1 h-[52px] w-full text-[14px]" onClick={() => go("play")}>
        <Zap size={20} fill="currentColor" />
        {primaryButtonLabel({ hasProfiles, hasNextMatch: nextMatch !== null })}
      </Button>
      {pendingCount > 0 && pending.items.length > 0 && (
        <Destaque
          notification={pending.items[0]}
          total={pendingCount}
          now={now}
          isAdmin={isAdmin}
          onOpen={(notification) => void openPending(notification)}
          onOpenAll={() => go("notifications", { filter: "responder" })}
        />
      )}
      <Pilulas
        standings={standings.data}
        standingsLoading={standings.loading}
        profiles={loading || profilesFailed ? null : profiles}
        profilesLoading={loading}
        onOpenRanking={(target) => (target ? go("ranking", target) : go("ranking"))}
        onOpenModalities={() => go("sports")}
      />
      {/* Só enquanto falta alguma modalidade, com a lista confirmada: com as três cadastradas, o passo já foi dado. */}
      {profileList && missingSportsCount(profileList) > 0 && <ProximoPasso onOpen={() => go("sports")} />}
      <Campeonatos
        state={championshipsState}
        profiles={profileList}
        allSport={allSport}
        onOpenModalities={() => go("sports")}
        onOpenEvents={(sport) => go("events", { sport })}
        onOpenEvent={(event) => go("event", event.sport ? { eventId: event.id, sport: event.sport } : { eventId: event.id })}
      />
    </>
  );
}
