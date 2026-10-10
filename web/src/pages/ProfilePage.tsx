import { useEffect, useState } from "react";
import { CalendarDays, ChevronRight, Medal, Menu, Trophy } from "lucide-react";
import { request } from "../api/client";
import type { Profile, SocialUser, User } from "../api/client";
import EmptyState from "../components/EmptyState";
import PhotoGrid from "../components/PhotoGrid";
import ProfileHeader from "../components/ProfileHeader";
import ProfileTabs from "../components/ProfileTabs";
import Avatar from "../components/Avatar";
import type { ConnectionsTab, Screen } from "../data/arena";

export default function ProfilePage({
  user,
  profiles,
  go,
  openConnections,
  onExpired,
}: {
  user: User;
  profiles: Profile[];
  go: (screen: Screen) => void;
  openConnections: (userId: number, tab: ConnectionsTab) => void;
  onExpired: () => void;
}) {
  const [profileTab, setProfileTab] = useState("Atividades");
  const [counts, setCounts] = useState<{ followers: number; following: number } | null>(null);
  useEffect(() => {
    let alive = true;
    request<SocialUser>(`/users/${user.id}`)
      .then((person) => {
        if (alive) setCounts({ followers: person.follower_count, following: person.following_count });
      })
      .catch(() => {
        /* As contagens são complementares: sem elas a linha de conexões não aparece. */
      });
    return () => {
      alive = false;
    };
  }, [user.id]);
  return (
    <>
      <ProfileHeader
        mode="own"
        name={user.name}
        username={user.username}
        avatar={<Avatar key={user.avatar?.id ?? "initials"} user={user} className="avatar-content" />}
        coverUrl={user.cover?.url ?? null}
        isPublic={user.social_public}
        followerCount={counts?.followers ?? null}
        followingCount={counts?.following ?? null}
        sportList={profiles.map((p) => p.sport)}
        trailing={
          <button className="icon-btn" aria-label="Menu" onClick={() => go("menu")}>
            <Menu size={21} />
          </button>
        }
        onEdit={() => go("edit-profile")}
        onFollowers={() => openConnections(user.id, "followers")}
        onFollowing={() => openConnections(user.id, "following")}
      />
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
      <div id="profile-content" role="tabpanel" aria-labelledby={`tab-${profileTab}`}>
        {profileTab === "Fotos" ? (
          <PhotoGrid
            userId={user.id}
            ownerName={user.name}
            onExpired={onExpired}
            empty={<EmptyState Icon={Medal} title="Nenhuma foto por aqui" text="Seus registros aparecerão aqui quando esta área estiver disponível." />}
          />
        ) : (
          <EmptyState
            Icon={profileTab === "Partidas" ? CalendarDays : Medal}
            title={profileTab === "Partidas" ? "Sua história em campo" : "Sua trajetória começa aqui"}
            text="Seus registros aparecerão aqui quando esta área estiver disponível."
          />
        )}
      </div>
    </>
  );
}
