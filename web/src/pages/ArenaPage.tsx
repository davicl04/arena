import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, Bell, MapPin, Shield, Trophy, Users } from "lucide-react";
import { ApiError, request, sports } from "../api/client";
import type { City, Profile, ProfileInput, Sport, User } from "../api/client";
import SportCard from "../components/SportCard";
import { ArenaMark } from "../components/Brand";
import EmptyState from "../components/EmptyState";
import HomePage from "./HomePage";
import ProfilePage from "./ProfilePage";
import { navItems, rankingTiers, sportIcons } from "../data/arena";
import type { Screen } from "../data/arena";

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
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [screen, setScreen] = useState<Screen>("home");
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
  function go(next: Screen) {
    setScreen(next);
    setMessage("");
    mainRef.current?.scrollTo({ top: 0 });
    mainRef.current?.focus();
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
  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      onUser(await request<User>("/me", "PATCH", { name: form.get("name") }));
      setMessage("Nome atualizado.");
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }
  const firstName = user.name.trim().split(/\s+/)[0];
  const title = {
    home: "Início",
    ranking: "Ranking",
    play: "Jogar",
    community: "Comunidade",
    profile: "Perfil",
    settings: "Configurações",
    notifications: "Notificações",
    sports: "Suas modalidades",
  }[screen];
  const activeNav = ["settings", "sports"].includes(screen)
    ? "profile"
    : screen === "notifications"
      ? "home"
      : screen;

  return (
    <div className="app-shell">
      <div className="arena-app">
        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className={`screen ${screen === "profile" ? "profile-screen" : ""}`}
          aria-label={title}
        >
          {screen !== "home" && screen !== "profile" && (
            <header className="page-topbar">
              <button
                className="icon-btn"
                aria-label="Voltar ao início"
                onClick={() => go("home")}
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
          {message && (
            <p className="success" role="status">
              {message}
            </p>
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
            <ProfilePage user={user} profiles={profiles} go={go} />
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
            <>
              <div className="page-heading">
                <p className="eyebrow">O ESPORTE CONECTA</p>
                <h2>Comunidade</h2>
              </div>
              <EmptyState
                Icon={Users}
                title="Novas conexões em breve"
                text="Este será seu espaço para acompanhar outros atletas e compartilhar sua trajetória."
              />
              <button
                className="primary full-width"
                onClick={() => go("profile")}
              >
                Ver meu perfil
              </button>
            </>
          )}
          {screen === "notifications" && (
            <EmptyState
              Icon={Bell}
              title="Tudo em dia"
              text="As notificações das suas atividades estarão disponíveis em breve."
            />
          )}
          {screen === "settings" && (
            <>
              <section className="settings-card">
                <h2>Dados da conta</h2>
                <form onSubmit={rename}>
                  <fieldset disabled={busy}>
                    <label htmlFor="new-name">Nome completo</label>
                    <input
                      id="new-name"
                      name="name"
                      defaultValue={user.name}
                      required
                      minLength={2}
                      maxLength={100}
                    />
                    <label htmlFor="account-email">E-mail</label>
                    <input
                      id="account-email"
                      value={user.email}
                      readOnly
                      type="email"
                    />
                    <button className="primary full-width" type="submit">
                      {busy ? "Salvando…" : "Salvar nome"}
                    </button>
                  </fieldset>
                </form>
              </section>
              <aside className="privacy-strip">
                <Shield size={20} />
                <p>
                  Seu perfil é privado. Sua data de nascimento não aparece no
                  perfil.
                </p>
              </aside>
              <button
                className="secondary full-width"
                disabled={busy}
                onClick={logout}
              >
                {busy ? "Aguarde…" : "Sair da conta"}
              </button>
            </>
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
