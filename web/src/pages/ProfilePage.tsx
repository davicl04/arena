import { useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  Medal,
  Settings,
  Shield,
  Trophy,
} from "lucide-react";
import { sports } from "../api/client";
import type { Profile, User } from "../api/client";
import EmptyState from "../components/EmptyState";
import ProfileTabs from "../components/ProfileTabs";
import { cover, sportIcons } from "../data/arena";
import type { Screen } from "../data/arena";

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
  const initials = user.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
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
        <div className="avatar">{initials}</div>
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
          Perfil privado
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
      <ProfileTabs value={profileTab} onChange={setProfileTab} />
      <div
        id="profile-content"
        role="tabpanel"
        aria-labelledby={`tab-${profileTab}`}
      >
        <EmptyState
          Icon={profileTab === "Partidas" ? CalendarDays : Medal}
          title={
            profileTab === "Fotos"
              ? "Nenhuma foto por aqui"
              : profileTab === "Partidas"
                ? "Sua história em campo"
                : "Sua trajetória começa aqui"
          }
          text="Seus registros aparecerão aqui quando esta área estiver disponível."
        />
      </div>
    </>
  );
}
