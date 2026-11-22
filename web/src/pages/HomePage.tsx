import { ChevronRight, Medal, Zap } from "lucide-react";
import { ApiError, sports } from "../api/client";
import type { Profile, Sport } from "../api/client";
import { markNotificationRead } from "../api/notifications";
import type { ArenaNotification } from "../api/notifications";
import type { MatchCard } from "../api/matches";
import { getMyStandings } from "../api/play";
import { useNow } from "../hooks/useNow";
import { useResource } from "../hooks/useResource";
import { usePendingNotifications } from "../hooks/usePendingNotifications";
import type { NotificationSummaryState } from "../hooks/useNotificationSummary";
import { nextScheduledMatch } from "../components/play/matchView";
import { Logo } from "../components/Brand";
import { NotificationBell } from "../components/notifications/NotificationBell";
import { Placar } from "../components/home/Placar";
import { primaryButtonLabel } from "../data/home";
import { Destaque } from "../components/home/Destaque";
import { Pilulas } from "../components/home/Pilulas";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile } from "@/components/ui/icon-tile";
import { SectionTitle } from "@/components/ui/section-title";
import { cover } from "../data/arena";
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
  /** Modalidades ainda sem perfil: o cartão "Seu próximo passo" só aparece enquanto houver alguma. */
  const missingSports = sports.filter((s) => !profiles.some((p) => p.sport === s.value)).length;
  return (
    <>
      <header className="flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-0.5">
          <NotificationBell tone="light" count={summary?.count ?? 0} onOpen={() => go("notifications")} />
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
      <SectionTitle
        title="Perto de você"
        action={
          <Button variant="link" onClick={() => go("sports")}>
            Minha cidade
          </Button>
        }
      />
      <div className="relative h-[178px] overflow-hidden rounded-panel bg-ink noite:bg-[#495057] shadow-[0_4px_14px_#0002]">
        <img
          className="size-full object-cover"
          src={cover}
          alt="Esporte ao ar livre ao pôr do sol"
        />
        <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent_20%,#000c)]" />
        <div className="absolute inset-x-4 bottom-[15px] flex flex-col gap-[3px] text-white">
          <Eyebrow as="span" className="text-[#fffd]">
            VIVA O ESPORTE
          </Eyebrow>
          <strong className="font-display text-[17px] font-bold">
            Sua próxima arena
          </strong>
          <small className="text-[10px] text-[#fffd]">
            {profiles.length
              ? "Novas atividades em breve."
              : "Configure sua cidade e suas modalidades."}
          </small>
        </div>
      </div>
      {/* Só enquanto falta alguma modalidade: com as três cadastradas, o passo já foi dado. */}
      {!loading && missingSports > 0 && (
        <>
          <SectionTitle title="Seu próximo passo" />
          <button
            className="flex w-full items-center gap-[11px] rounded-card border border-solid border-line bg-surface p-3.5 text-left noite:border-surface-edge"
            onClick={() => go("sports")}
          >
            <IconTile>
              <Medal size={22} />
            </IconTile>
            <span className="flex-1">
              <b className="text-[12px] text-heading">Complete seu perfil esportivo</b>
              <small className="mt-1 text-[10px] leading-[1.5] text-ink-muted">
                Mostre onde e como você gosta de jogar.
              </small>
            </span>
            <ChevronRight size={19} />
          </button>
        </>
      )}
    </>
  );
}
