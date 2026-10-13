import { CalendarDays, ChevronRight, Medal, Zap } from "lucide-react";
import { ApiError, sports } from "../api/client";
import type { Profile } from "../api/client";
import { markNotificationRead } from "../api/notifications";
import type { ArenaNotification } from "../api/notifications";
import type { MatchCard } from "../api/matches";
import { getMyStandings } from "../api/play";
import { useNow } from "../hooks/useNow";
import { useResource } from "../hooks/useResource";
import { usePendingNotifications } from "../hooks/usePendingNotifications";
import type { NotificationSummaryState } from "../hooks/useNotificationSummary";
import { MatchRow } from "../components/play/MyMatches";
import { nextScheduledMatch } from "../components/play/matchView";
import { formatDuration } from "../components/play/tierLines";
import { Logo } from "../components/Brand";
import { NotificationBell } from "../components/notifications/NotificationBell";
import { PendingPlate } from "../components/notifications/PendingPlate";
import { TierEmblem } from "../components/arena/TierEmblem";
import { modalityStanding } from "../components/arena/modalityStanding";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile } from "@/components/ui/icon-tile";
import { SectionTitle } from "@/components/ui/section-title";
import { cover, sportIcons } from "../data/arena";
import type { Screen } from "../data/arena";
import { notificationView } from "../data/notifications";
import type { NotificationFilter, NotificationTarget } from "../data/notifications";

export default function HomePage({
  firstName,
  profiles,
  loading,
  matches = [],
  summary,
  isAdmin = false,
  go,
  onExpired,
}: {
  firstName: string;
  profiles: Profile[];
  loading: boolean;
  /** Partidas do titular lidas pela placa (`GET /me/play`): a próxima agendada vai ao cartão "Próxima partida". */
  matches?: MatchCard[];
  /** Resumo das notificações (ArenaPage): o número do sino e a placa "Para responder". */
  summary?: NotificationSummaryState;
  /** Conta administrativa: alguns avisos levam às filas da administração. */
  isAdmin?: boolean;
  go: (screen: Screen, context?: Omit<NotificationTarget, "screen"> & { filter?: NotificationFilter }) => void;
  onExpired: () => void;
}) {
  const now = useNow(60_000);
  const nextMatch = nextScheduledMatch(matches, now);
  // Placa "Para responder": as 2 pendências mais urgentes; só é lida quando o resumo diz que há pendências.
  const pendingCount = summary?.data?.pending_count ?? 0;
  const pending = usePendingNotifications(onExpired, {
    limit: 2,
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
  // Classificação de cada modalidade: o elo de quem já se classificou, ou "n de 3 partidas".
  const standings = useResource(getMyStandings, onExpired);
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
          {new Date().toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
        <h1 className="text-[25px] leading-[1.25] wrap-anywhere">
          Bora jogar, {firstName}?
        </h1>
      </section>
      {pendingCount > 0 && pending.items.length > 0 && (
        <PendingPlate
          items={pending.items}
          total={pendingCount}
          now={now}
          isAdmin={isAdmin}
          onOpenItem={(notification) => void openPending(notification)}
          onOpenAll={() => go("notifications", { filter: "responder" })}
        />
      )}
      <SectionTitle
        title="Seu elo"
        action={
          <Button variant="link" onClick={() => go("ranking")}>
            Ver elos
          </Button>
        }
      />
      {loading ? (
        <p role="status">Carregando modalidades…</p>
      ) : (
        <div className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 scrollbar-none">
          {sports.map((s) => {
            const Icon = sportIcons[s.value];
            const profile = profiles.find((p) => p.sport === s.value);
            const standing = standings.data ? modalityStanding(s.value, standings.data) : null;
            return (
              <Card
                as="article"
                radius="panel"
                elevated
                key={s.value}
                className="max-w-[calc(100vw-48px)] flex-[0_0_314px] snap-center p-[17px]"
              >
                <div className="flex items-center justify-between gap-2">
                  <IconTile>
                    <Icon size={30} />
                  </IconTile>
                  <Badge data-testid={`standing-${s.value}`} className="gap-1.5">
                    {standing?.tier ? (
                      <TierEmblem tier={standing.tier} size="xs" showName />
                    ) : standing ? (
                      s.value === "corrida" ? "Sem marca" : `${standing.played} de ${standing.required} partidas`
                    ) : standings.loading ? (
                      <span aria-label="Carregando classificação">…</span>
                    ) : (
                      "Classificação indisponível"
                    )}
                  </Badge>
                </div>
                <p className="mt-[11px] text-[12px] text-ink-muted">{s.label}</p>
                <div className="mt-[3px] mb-[9px] flex items-baseline gap-[7px]">
                  <strong className="font-display text-[28px] font-bold">
                    {standing?.metric
                      ? standing.metric.unit === "tempo"
                        ? formatDuration(standing.metric.value)
                        : standing.metric.value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
                      : "—"}
                  </strong>
                  <span className="text-[12px] text-ink-muted">
                    {s.value === "corrida" ? "melhor tempo" : (standing?.metric?.unit ?? "pontos")}
                  </span>
                </div>
                <div className="h-[7px] rounded-[5px] bg-app" />
                <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-ink-muted">
                  <span>
                    {standing?.context ??
                      (profile
                        ? "Sua trajetória começa aqui"
                        : "Adicione seu perfil esportivo")}
                  </span>
                  <Button
                    variant="link"
                    className="text-[10px]"
                    onClick={() => go("sports")}
                  >
                    {profile ? "Ver perfil" : "Configurar"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Button className="mt-3 mb-1 h-[52px] w-full text-[14px]" onClick={() => go("play")}>
        <Zap size={20} fill="currentColor" />
        Encontrar partida
      </Button>
      <SectionTitle title="Próxima partida" />
      <Card
        as="article"
        className={nextMatch ? "px-[13px] py-0.5 shadow-[0_2px_9px_#0000000c] noite:shadow-none" : "flex items-center gap-3 p-[13px] shadow-[0_2px_9px_#0000000c] noite:shadow-none"}
      >
        {nextMatch ? (
          <MatchRow card={nextMatch} onOpen={(matchId) => go("match", { matchId })} />
        ) : (
          <>
            <span className="grid h-[53px] w-[47px] place-items-center rounded-xl bg-ink text-app noite:bg-icon-tile noite:text-icon-tile-ink">
              <CalendarDays size={23} />
            </span>
            <div>
              <h3 className="mt-[3px] mb-1.5 text-[12px]">Nenhuma partida agendada</h3>
              <p className="text-[10px] leading-[1.5] text-ink-muted">
                Seu próximo encontro aparecerá aqui.
              </p>
            </div>
          </>
        )}
      </Card>
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
  );
}
