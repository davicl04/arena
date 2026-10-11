import { useEffect, useState } from "react";
import { CalendarDays, ChevronRight, Menu, Trophy } from "lucide-react";
import { request } from "../api/client";
import type { Profile, SocialUser, User } from "../api/client";
import { IconButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import ProfileGallery from "../components/ProfileGallery";
import ProfileHeader from "../components/ProfileHeader";
import ProfileTabs, { ProfilePanel } from "../components/ProfileTabs";
import type { ProfileTab } from "../components/ProfileTabs";
import Avatar from "../components/Avatar";
import type { ConnectionsTab, Screen } from "../data/arena";

const stats = ["Taxa de vitória", "Partidas", "Pontos de elo"];

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
  const [profileTab, setProfileTab] = useState<ProfileTab>("Fotos");
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
        avatar={<Avatar key={user.avatar?.id ?? "initials"} user={user} className="grid size-full place-items-center" />}
        coverUrl={user.cover?.url ?? null}
        isPublic={user.social_public}
        followerCount={counts?.followers ?? null}
        followingCount={counts?.following ?? null}
        sportList={profiles.map((p) => p.sport)}
        trailing={
          <IconButton tone="cover" aria-label="Menu" onClick={() => go("menu")}>
            <Menu size={21} />
          </IconButton>
        }
        onEdit={() => go("edit-profile")}
        onFollowers={() => openConnections(user.id, "followers")}
        onFollowing={() => openConnections(user.id, "following")}
      />
      <div className="overflow-hidden rounded-card border border-solid border-line">
        <button
          className="flex min-h-[61px] w-full items-center gap-3 border-0 bg-transparent px-[13px] py-2.5 text-left text-brand"
          onClick={() => go("sports")}
        >
          <Trophy size={21} />
          <span className="flex-1">
            <b className="block text-[11px] text-ink">Minhas modalidades</b>
            <small className="mt-[3px] text-[9px] text-ink-muted">Cidade, posição e disponibilidade</small>
          </span>
          <ChevronRight size={17} />
        </button>
      </div>
      <SectionTitle title="Suas estatísticas" />
      <div className="grid grid-cols-3 gap-2">
        {stats.map((label) => (
          <div key={label} className="rounded-control bg-white px-2 py-[13px] text-center">
            <b className="block font-display text-[18px] font-bold">—</b>
            <span className="mt-[3px] block text-[9px] text-ink-muted">{label}</span>
          </div>
        ))}
      </div>
      <ProfileTabs value={profileTab} onChange={setProfileTab} />
      <ProfilePanel tab={profileTab}>
        {profileTab === "Fotos" ? (
          <ProfileGallery
            userId={user.id}
            username={user.username}
            ownerName={user.name}
            viewerId={user.id}
            own
            onNewPhoto={() => go("community")}
            onExpired={onExpired}
          />
        ) : (
          <EmptyState
            Icon={CalendarDays}
            title="Sua história em campo"
            text="Quando as partidas estiverem disponíveis, seus resultados ficam registrados aqui."
          />
        )}
      </ProfilePanel>
    </>
  );
}
