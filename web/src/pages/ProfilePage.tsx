import { useEffect, useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  Medal,
  Settings,
  Shield,
  Trophy,
} from "lucide-react";
import { apiUrl, request, sports } from "../api/client";
import type { Page, Post, Profile, User } from "../api/client";
import EmptyState from "../components/EmptyState";
import ProfileTabs from "../components/ProfileTabs";
import { cover, sportIcons } from "../data/arena";
import type { Screen } from "../data/arena";
import Avatar from "../components/Avatar";

export default function ProfilePage({
  user,
  profiles,
  go,
}: {
  user: User;
  profiles: Profile[];
  go: (screen: Screen) => void;
}) {
  const [profileTab, setProfileTab] = useState("Atividades");
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (profileTab !== "Fotos") return;
    let alive = true;
    request<Page<Post>>(`/users/${user.id}/posts`)
      .then((page) => { if (alive) { setPosts(page.items); setCursor(page.next_cursor); } })
      .catch((err: unknown) => { if (alive) { setPosts([]); setError(err instanceof Error ? err.message : "Não foi possível carregar as fotos."); } })
    return () => { alive = false; };
  }, [profileTab, user.id]);
  async function loadMore() {
    if (!cursor || busy) return;
    setBusy(true); setError("");
    try {
      const page = await request<Page<Post>>(`/users/${user.id}/posts?cursor=${encodeURIComponent(cursor)}`);
      setPosts(old => [...(old ?? []), ...page.items]); setCursor(page.next_cursor);
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível carregar mais fotos."); }
    finally { setBusy(false); }
  }
  return (
    <>
      <div
        className="profile-cover"
        style={{ backgroundImage: `url("${cover}")` }}
      >
        <button
          className="icon-btn"
          aria-label="Configurações"
          onClick={() => go("settings")}
        >
          <Settings size={21} />
        </button>
      </div>
      <section className="profile-intro">
        <Avatar key={user.avatar?.id ?? "initials"} user={user} className="avatar" />
        <button
          className="secondary edit-profile"
          onClick={() => go("settings")}
        >
          Editar perfil
        </button>
        <h1>{user.name}</h1>
        <p>{user.email}</p>
        <div className="profile-sports">
          {profiles.map((p) => {
            const Icon = sportIcons[p.sport];
            return (
              <span className="sport-chip" key={p.sport}>
                <Icon size={13} />
                {sports.find((s) => s.value === p.sport)?.label}
              </span>
            );
          })}
          {!profiles.length && (
            <span className="muted">Adicione sua primeira modalidade</span>
          )}
        </div>
        <p className="profile-counts">
          <Shield size={13} />
          Conta {user.social_public ? "pública" : "privada"}
        </p>
      </section>
      <div className="profile-actions">
        <button onClick={() => go("sports")}>
          <Trophy size={21} />
          <span>
            <b>Minhas modalidades</b>
            <small>Cidade, posição e disponibilidade</small>
          </span>
          <ChevronRight size={17} />
        </button>
      </div>
      <div className="section-title">
        <h2>Suas estatísticas</h2>
      </div>
      <div className="stats-grid">
        <div>
          <b>—</b>
          <span>Taxa de vitória</span>
        </div>
        <div>
          <b>—</b>
          <span>Partidas</span>
        </div>
        <div>
          <b>—</b>
          <span>Pontos de elo</span>
        </div>
      </div>
      <ProfileTabs value={profileTab} onChange={(value) => { setPosts(null); setCursor(null); setError(""); setProfileTab(value); }} />
      <div
        id="profile-content"
        role="tabpanel"
        aria-labelledby={`tab-${profileTab}`}
      >
      {error && <p className="error" role="alert">{error}</p>}
      {profileTab === "Fotos" && posts?.length ? <div className="profile-photo-grid" aria-label="Publicações de fotos">
          {posts.map((post) => <img key={post.id} src={apiUrl(post.image_url)} alt={post.caption || `Publicação de ${user.name}`} />)}
        </div> : profileTab === "Fotos" && posts === null ? <p role="status">Carregando fotos…</p> : <EmptyState
          Icon={profileTab === "Partidas" ? CalendarDays : Medal}
          title={
            profileTab === "Fotos"
              ? "Nenhuma foto por aqui"
              : profileTab === "Partidas"
                ? "Sua história em campo"
                : "Sua trajetória começa aqui"
          }
          text="Seus registros aparecerão aqui quando esta área estiver disponível."
        />}
      </div>
      {profileTab === "Fotos" && cursor && <button className="secondary full-width" disabled={busy} onClick={() => void loadMore()}>Carregar mais fotos</button>}
    </>
  );
}
