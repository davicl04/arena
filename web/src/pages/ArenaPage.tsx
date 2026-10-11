import { useEffect, useRef, useState } from "react";
import { ArrowLeft, MapPin, Shield, Trophy } from "lucide-react";
import { ApiError, request, sports } from "../api/client";
import type { City, Profile, ProfileInput, Sport, User } from "../api/client";
import SportCard from "../components/SportCard";
import BottomNav from "../components/BottomNav";
import { Button, IconButton } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { feedbackVariants } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import HomePage from "./HomePage";
import ProfilePage from "./ProfilePage";
import EditProfilePage from "./EditProfilePage";
import MenuPage from "./MenuPage";
import AdminReports from "../components/AdminReports";
import BlockedAccountsPage from "./BlockedAccountsPage";
import ConnectionsPage from "./ConnectionsPage";
import UserProfilePage from "./UserProfilePage";
import NotificationsPage from "./NotificationsPage";
import SocialCommunity from "../components/SocialCommunity";
import { rankingTiers, sportIcons } from "../data/arena";
import type { ConnectionsTab, Screen } from "../data/arena";

/** Uma tela da pilha de navegação, com o contexto necessário para restaurá-la ao voltar. */
interface Entry {
  screen: Screen;
  userId?: number;
  tab?: ConnectionsTab;
  mutual?: boolean;
}
/** Subtítulo das telas Jogar e Ranking. */
const subtitle = "mb-[25px] text-[12px] leading-[1.6] text-ink-muted";
const rootScreens: Screen[] = ["home", "ranking", "play", "community", "profile"];
const titles: Record<Screen, string> = {
  home: "Início",
  ranking: "Ranking",
  play: "Jogar",
  community: "Comunidade",
  profile: "Perfil",
  "edit-profile": "Editar perfil",
  menu: "Menu",
  moderation: "Moderação",
  blocked: "Contas bloqueadas",
  connections: "Conexões",
  "user-profile": "Perfil",
  notifications: "Notificações",
  sports: "Suas modalidades",
};

export default function ArenaPage({
  user,
  onUser,
  onLogout,
  onExpired,
}: {
  user: User;
  onUser: (user: User) => void;
  onLogout: () => void;
  onExpired: () => void;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [stack, setStack] = useState<Entry[]>([{ screen: "home" }]);
  const current = stack[stack.length - 1];
  const screen = current.screen;
  const viewedUserId = current.userId ?? 0;
  const connectionsTab = current.tab ?? "followers";
  const [rankingSport, setRankingSport] = useState<Sport>("futebol");
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([
      request<Profile[]>("/me/sports-profiles"),
      request<City[]>("/cities"),
    ])
      .then(([p, c]) => {
        if (alive) {
          setProfiles(p);
          setCities(c);
        }
      })
      .catch((err) => {
        if (alive) {
          setError(err.message);
          if (err instanceof ApiError && err.status === 401) onExpired();
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  function show(update: (old: Entry[]) => Entry[]) {
    setStack(update);
    mainRef.current?.scrollTo({ top: 0 });
    mainRef.current?.focus();
  }
  /** Abas principais zeram a pilha; as demais telas empilham e voltam à anterior. */
  function go(next: Screen) {
    if (rootScreens.includes(next)) show(() => [{ screen: next }]);
    else show((old) => [...old, { screen: next }]);
  }
  function back() {
    show((old) => (old.length > 1 ? old.slice(0, -1) : [{ screen: "home" }]));
  }
  function openUser(id: number) {
    if (id === user.id) go("profile");
    else show((old) => [...old, { screen: "user-profile", userId: id }]);
  }
  function openConnections(userId: number, tab: ConnectionsTab, mutual = false) {
    show((old) => [...old, { screen: "connections", userId, tab, mutual }]);
  }
  function changeTab(tab: ConnectionsTab) {
    setStack((old) => [...old.slice(0, -1), { ...old[old.length - 1], tab }]);
  }

  function handleError(err: unknown) {
    if (err instanceof ApiError && err.status === 401) onExpired();
    setError(err instanceof Error ? err.message : "Tente novamente.");
  }
  async function save(sport: Sport, input: ProfileInput) {
    try {
      const profile = await request<Profile>(
        `/me/sports-profiles/${sport}`,
        "PUT",
        input,
      );
      setProfiles((old) => [...old.filter((p) => p.sport !== sport), profile]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onExpired();
      throw err;
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await request("/auth/logout", "POST");
      onLogout();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }
  const firstName = user.name.trim().split(/\s+/)[0];
  const title = current.mutual ? "Seguidores em comum" : titles[screen];
  const root = stack[0].screen;
  const activeNav =
    screen === "user-profile" || screen === "connections"
      ? root === "notifications" || root === "sports"
        ? "home"
        : ["edit-profile", "menu", "moderation", "blocked"].includes(root)
          ? "profile"
          : root
      : ["edit-profile", "menu", "moderation", "blocked", "sports"].includes(screen)
        ? "profile"
        : screen === "notifications"
          ? "home"
          : screen;
  const profileLayout = screen === "profile" || screen === "user-profile";

  return (
    <div className="grid min-h-dvh place-items-center p-6 app-narrow:p-0">
      <div className="relative h-[844px] max-h-[calc(100dvh-48px)] w-[390px] overflow-hidden rounded-app border border-solid border-line bg-app shadow-app app-narrow:h-dvh app-narrow:max-h-none app-narrow:w-full app-narrow:rounded-none app-narrow:border-0 app-narrow:shadow-none">
        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className={cn(
            "h-full overflow-x-hidden overflow-y-auto px-5 pt-[18px] pb-28 outline-none scrollbar-hidden app-narrow:pb-[calc(112px+env(safe-area-inset-bottom))]",
            profileLayout && "@container-size pt-0",
          )}
          aria-label={title}
        >
          {screen !== "home" && !profileLayout && (
            <header className="-mx-2 -mt-2 mb-[18px] flex min-h-[54px] items-center justify-between">
              <IconButton aria-label="Voltar" onClick={back}>
                <ArrowLeft size={21} />
              </IconButton>
              <h1 className="text-[17px]">{title}</h1>
              <span className="w-11" />
            </header>
          )}
          {error && (
            <div className={feedbackVariants()} role="alert">
              {error}
              <Button
                variant="text"
                onClick={() => {
                  setLoading(true);
                  setError("");
                  setAttempt((v) => v + 1);
                }}
              >
                Recarregar dados
              </Button>
            </div>
          )}
          {screen === "home" && (
            <HomePage
              firstName={firstName}
              profiles={profiles}
              loading={loading}
              go={go}
            />
          )}
          {screen === "profile" && (
            <ProfilePage
              user={user}
              profiles={profiles}
              go={go}
              openConnections={openConnections}
              onExpired={onExpired}
            />
          )}
          {(screen === "sports" || screen === "play") && (
            <>
              {screen === "play" && (
                <>
                  <Eyebrow>ESCOLHA SEU ESPORTE</Eyebrow>
                  <h2 className="mt-[5px] mb-1.5 text-[24px]">Qual é o jogo de hoje?</h2>
                  <p className={subtitle}>
                    Prepare seu perfil para encontrar sua próxima partida. O
                    agendamento de partidas estará disponível em breve.
                  </p>
                </>
              )}
              {loading ? (
                <p role="status">Carregando modalidades…</p>
              ) : (
                <div className="grid gap-3">
                  {sports.map((s) => (
                    <SportCard
                      key={s.value}
                      {...s}
                      sport={s.value}
                      profile={profiles.find((p) => p.sport === s.value)}
                      cities={cities}
                      onSave={save}
                    />
                  ))}
                </div>
              )}
              <aside className="my-[18px] flex items-start gap-2.5 rounded-control bg-[#005a360c] p-3.5 text-brand">
                <Shield size={20} />
                <p className="text-[11px] leading-[1.7] text-ink-muted">
                  Seus perfis começam privados. Você cuida dos dados da sua
                  trajetória.
                </p>
              </aside>
            </>
          )}
          {screen === "ranking" && (
            <>
              <div className="mt-1.5 mb-[17px]">
                <Eyebrow>CADA JOGO CONTA</Eyebrow>
                <h2 className="mt-[3px] text-[28px]">Ranking</h2>
                <p className={subtitle}>Reconstrua sua arena a cada elo.</p>
              </div>
              <div
                className="mb-6 flex flex-wrap justify-center gap-2.5"
                aria-label="Elos do ranking"
              >
                {rankingTiers.map((tier) => (
                  <figure
                    key={tier.image}
                    className="m-0 w-[calc((100%-20px)/3)] rounded-xl bg-forest px-1.5 py-3 text-center"
                  >
                    <img
                      className="inline h-[52px] w-full align-baseline object-contain"
                      src={`/images/brand/${tier.image}.svg`}
                      alt=""
                    />
                    <figcaption className="mt-1.5 text-[11px] font-bold text-[#edebe2]">
                      {tier.name}
                    </figcaption>
                  </figure>
                ))}
              </div>
              <div className="mb-3.5 flex flex-wrap gap-[7px]">
                {sports.map((s) => {
                  const Icon = sportIcons[s.value];
                  return (
                    <Chip
                      key={s.value}
                      aria-pressed={rankingSport === s.value}
                      onClick={() => setRankingSport(s.value)}
                    >
                      <Icon size={15} />
                      {s.label}
                    </Chip>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-white px-[13px] py-[11px] text-[11px]">
                <MapPin size={16} />
                {cities.find(
                  (c) =>
                    c.id ===
                    profiles.find((p) => p.sport === rankingSport)?.city_id,
                )?.name || "Cidade ainda não definida"}
              </div>
              <EmptyState
                Icon={Trophy}
                title="Seu elo começa em campo"
                text="O ranking estará disponível após a integração dos resultados das partidas."
              />
              <Button
                variant="secondary"
                className="mt-[18px] w-full"
                onClick={() => go("sports")}
              >
                Configurar modalidade
              </Button>
            </>
          )}
          {screen === "community" && (
            <SocialCommunity viewerId={user.id} onOpenUser={openUser} onExpired={onExpired} />
          )}
          {screen === "notifications" && (
            <NotificationsPage onOpenUser={openUser} onExpired={onExpired} />
          )}
          {screen === "edit-profile" && (
            <EditProfilePage
              user={user}
              onUser={onUser}
              onExpired={onExpired}
              openBlocked={() => go("blocked")}
            />
          )}
          {screen === "blocked" && <BlockedAccountsPage onExpired={onExpired} />}
          {screen === "connections" && (
            <ConnectionsPage
              key={`${viewedUserId}-${current.mutual ? "mutual" : "all"}`}
              ownUserId={user.id}
              userId={viewedUserId}
              tab={connectionsTab}
              mutual={Boolean(current.mutual)}
              onTab={changeTab}
              onOpenUser={openUser}
              onExpired={onExpired}
            />
          )}
          {screen === "user-profile" && (
            <UserProfilePage
              key={viewedUserId}
              userId={viewedUserId}
              ownUserId={user.id}
              onBack={back}
              onOpenConnections={openConnections}
              onExpired={onExpired}
            />
          )}
          {screen === "menu" && (
            <MenuPage
              isAdmin={user.is_admin}
              busy={busy}
              onEditProfile={() => go("edit-profile")}
              onSports={() => go("sports")}
              onModeration={() => go("moderation")}
              onLogout={logout}
            />
          )}
          {screen === "moderation" && user.is_admin && (
            <AdminReports onExpired={onExpired} />
          )}
        </main>
        <BottomNav active={activeNav} onGo={go} />
      </div>
    </div>
  );
}
