import { Bell, CalendarDays, ChevronRight, Medal, Zap } from "lucide-react";
import { sports } from "../api/client";
import type { Profile } from "../api/client";
import { getUnreadCount } from "../api/notifications";
import { useResource } from "../hooks/useResource";
import { Logo } from "../components/Brand";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile } from "@/components/ui/icon-tile";
import { SectionTitle } from "@/components/ui/section-title";
import { cover, sportIcons } from "../data/arena";
import type { Screen } from "../data/arena";

export default function HomePage({
  firstName,
  profiles,
  loading,
  go,
  onExpired,
}: {
  firstName: string;
  profiles: Profile[];
  loading: boolean;
  go: (screen: Screen) => void;
  onExpired: () => void;
}) {
  // Indicador de não lidas no sino (os pedidos para seguir não entram nessa contagem).
  const unread = useResource(getUnreadCount, onExpired);
  const count = typeof unread.data?.unread_count === "number" ? unread.data.unread_count : 0;
  return (
    <>
      <header className="flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-0.5">
          <IconButton
            aria-label={count ? `Notificações, ${count} ${count === 1 ? "não lida" : "não lidas"}` : "Notificações"}
            className="relative"
            onClick={() => go("notifications")}
          >
            <Bell size={21} />
            {count > 0 && (
              <span
                aria-hidden="true"
                data-testid="unread-indicator"
                className="absolute top-1.5 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[9px] leading-none font-bold text-white ring-2 ring-app"
              >
                {count > 9 ? "9+" : count}
              </span>
            )}
          </IconButton>
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
                  <Badge>{profile?.level || "Sem classificação"}</Badge>
                </div>
                <p className="mt-[11px] text-[12px] text-ink-muted">{s.label}</p>
                <div className="mt-[3px] mb-[9px] flex items-baseline gap-[7px]">
                  <strong className="font-display text-[28px] font-bold">—</strong>
                  <span className="text-[12px] text-ink-muted">pontos</span>
                </div>
                <div className="h-[7px] rounded-[5px] bg-app" />
                <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-ink-muted">
                  <span>
                    {profile
                      ? "Sua trajetória começa aqui"
                      : "Adicione seu perfil esportivo"}
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
        className="flex items-center gap-3 p-[13px] shadow-[0_2px_9px_#0000000c]"
      >
        <span className="grid h-[53px] w-[47px] place-items-center rounded-xl bg-ink text-app">
          <CalendarDays size={23} />
        </span>
        <div>
          <h3 className="mt-[3px] mb-1.5 text-[12px]">Nenhuma partida agendada</h3>
          <p className="text-[10px] leading-[1.5] text-ink-muted">
            Seu próximo encontro aparecerá aqui.
          </p>
        </div>
      </Card>
      <SectionTitle
        title="Perto de você"
        action={
          <Button variant="link" onClick={() => go("sports")}>
            Minha cidade
          </Button>
        }
      />
      <div className="relative h-[178px] overflow-hidden rounded-panel bg-ink shadow-[0_4px_14px_#0002]">
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
        className="flex w-full items-center gap-[11px] rounded-card border border-solid border-line bg-white p-3.5 text-left"
        onClick={() => go("sports")}
      >
        <IconTile>
          <Medal size={22} />
        </IconTile>
        <span className="flex-1">
          <b className="text-[12px]">Complete seu perfil esportivo</b>
          <small className="mt-1 text-[10px] leading-[1.5] text-ink-muted">
            Mostre onde e como você gosta de jogar.
          </small>
        </span>
        <ChevronRight size={19} />
      </button>
    </>
  );
}
