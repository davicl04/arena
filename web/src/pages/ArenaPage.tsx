import { useEffect, useRef, useState } from "react";
import { ArrowLeft, MapPin, Shield, Trophy } from "lucide-react";
import { ApiError, request, sports } from "../api/client";
import type { City, Profile, ProfileInput, Sport, User } from "../api/client";
import SportCard from "../components/SportCard";
import { ArenaMark } from "../components/Brand";
import EmptyState from "../components/EmptyState";
import HomePage from "./HomePage";
import ProfilePage from "./ProfilePage";
import EditProfilePage from "./EditProfilePage";
import AppSettingsPage from "./AppSettingsPage";
import BlockedAccountsPage from "./BlockedAccountsPage";
import ConnectionsPage from "./ConnectionsPage";
import UserProfilePage from "./UserProfilePage";
import NotificationsPage from "./NotificationsPage";
import SocialCommunity from "../components/SocialCommunity";
import { navItems, rankingTiers, sportIcons } from "../data/arena";
import type { ConnectionsTab, Screen } from "../data/arena";

/** Uma tela da pilha de navegação, com o contexto necessário para restaurá-la ao voltar. */
interface Entry {
  screen: Screen;
  userId?: number;
  tab?: ConnectionsTab;
  mutual?: boolean;
}
const rootScreens: Screen[] = ["home", "ranking", "play", "community", "profile"];
const titles: Record<Screen, string> = {
  home: "Início",
  ranking: "Ranking",
  play: "Jogar",
  community: "Comunidade",
  profile: "Perfil",
  "edit-profile": "Editar perfil",
  "app-settings": "Configurações",
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
        : root === "edit-profile" || root === "app-settings" || root === "blocked"
          ? "profile"
          : root
      : ["edit-profile", "app-settings", "blocked", "sports"].includes(screen)
        ? "profile"
        : screen === "notifications"
          ? "home"
          : screen;
  const profileLayout = screen === "profile" || screen === "user-profile";

  return (
    <div className="app-shell">
      <div className="arena-app">
        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className={`screen ${profileLayout ? "profile-screen" : ""}`}
          aria-label={title}
        >
          {screen !== "home" && !profileLayout && (
            <header className="page-topbar">
              <button
                className="icon-btn"
                aria-label="Voltar"
                onClick={back}
              >
                <ArrowLeft size={21} />
              </button>
              <h1>{title}</h1>
              <span className="topbar-spacer" />
            </header>
          )}
          {error && (
            <div className="notice" role="alert">
              {error}
              <button
                className="text-button"
                onClick={() => {
                  setLoading(true);
                  setError("");
                  setAttempt((v) => v + 1);
                }}
              >
                Recarregar dados
              </button>
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
                  <p className="eyebrow">ESCOLHA SEU ESPORTE</p>
                  <h2 className="flow-title">Qual é o jogo de hoje?</h2>
                  <p className="flow-subtitle">
                    Prepare seu perfil para encontrar sua próxima partida. O
                    agendamento de partidas estará disponível em breve.
                  </p>
                </>
              )}
              {loading ? (
                <p role="status">Carregando modalidades…</p>
              ) : (
                <div className="sports-grid">
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
              <aside className="privacy-strip">
                <Shield size={20} />
                <p>
                  Seus perfis começam privados. Você cuida dos dados da sua
                  trajetória.
                </p>
              </aside>
            </>
          )}
          {screen === "ranking" && (
            <>
              <div className="page-heading">
                <p className="eyebrow">CADA JOGO CONTA</p>
                <h2>Ranking</h2>
                <p className="flow-subtitle">
                  Reconstrua sua arena a cada elo.
                </p>
              </div>
              <div className="ranking-tiers" aria-label="Elos do ranking">
                {rankingTiers.map((tier) => (
                  <figure key={tier.image}>
                    <img src={`/images/brand/${tier.image}.svg`} alt="" />
                    <figcaption>{tier.name}</figcaption>
                  </figure>
                ))}
              </div>
              <div className="chip-row">
                {sports.map((s) => {
                  const Icon = sportIcons[s.value];
                  return (
                    <button
                      key={s.value}
                      className={`sport-chip ${rankingSport === s.value ? "active" : ""}`}
                      aria-pressed={rankingSport === s.value}
                      onClick={() => setRankingSport(s.value)}
                    >
                      <Icon size={15} />
                      {s.label}
                    </button>
                  );
                })}
              </div>
              <div className="filter-bar">
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
              <button
                className="secondary full-width"
                onClick={() => go("sports")}
              >
                Configurar modalidade
              </button>
            </>
          )}
          {screen === "community" && (
            <SocialCommunity onOpenUser={openUser} onExpired={onExpired} />
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
          {screen === "app-settings" && (
            <AppSettingsPage
              isAdmin={user.is_admin}
              busy={busy}
              onLogout={logout}
              onExpired={onExpired}
            />
          )}
        </main>
        <nav className="bottom-nav" aria-label="Navegação principal">
          {navItems.map(({ screen: target, label, Icon }) => (
            <button
              key={target}
              className={`${activeNav === target ? "active" : ""} ${target === "play" ? "play-nav" : ""}`}
              aria-current={activeNav === target ? "page" : undefined}
              onClick={() => go(target)}
            >
              {target === "play" ? (
                <span className="play-circle">
                  <ArenaMark compact />
                </span>
              ) : target === "ranking" ? (
                <ArenaMark />
              ) : (
                <Icon size={21} />
              )}
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
