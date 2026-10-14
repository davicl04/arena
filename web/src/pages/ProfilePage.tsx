import { useEffect, useState } from "react";
import { ChevronRight, Menu, Trophy } from "lucide-react";
import { request } from "../api/client";
import type { Profile, SocialUser, User } from "../api/client";
import type { MatchCard } from "../api/matches";
import { getProfileStats } from "../api/profile";
import type { ProfileStats } from "../api/profile";
import { TierEmblem } from "@/components/arena/TierEmblem";
import { MatchTimeline } from "@/components/profile-matches/MatchTimeline";
import { IconButton } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/section-title";
import ProfileGallery from "../components/ProfileGallery";
import ProfileHeader from "../components/ProfileHeader";
import { NotificationBell } from "../components/notifications/NotificationBell";
import ProfileTabs, { ProfilePanel } from "../components/ProfileTabs";
import type { ProfileTab } from "../components/ProfileTabs";
import Avatar from "../components/Avatar";
import type { ConnectionsTab, Screen } from "../data/arena";

type StatsState = { status: "loading" } | { status: "error" } | { status: "ready"; stats: ProfileStats };

/** "62%" (arredondado) ou "—" sem partidas. */
const winRateText = (rate: number | null) => (rate == null ? "—" : `${Math.round(rate)}%`);

/** Blocos "Suas estatísticas": os números vêm do servidor; carregando ou com erro ficam "—" sem bloquear o perfil. */
function ProfileStatsBlocks({ state }: { state: StatsState }) {
  const stats = state.status === "ready" ? state.stats : null;
  return (
    <div className="grid grid-cols-3 gap-2" aria-busy={state.status === "loading"}>
      <div className="rounded-control surface px-2 py-[13px] text-center">
        <b className="block font-display text-[18px] font-bold">{stats ? winRateText(stats.win_rate) : "—"}</b>
        <span className="mt-[3px] block text-[9px] text-ink-muted">Taxa de vitória</span>
      </div>
      <div className="rounded-control surface px-2 py-[13px] text-center">
        <b className="block font-display text-[18px] font-bold">{stats ? stats.played : "—"}</b>
        <span className="mt-[3px] block text-[9px] text-ink-muted">Partidas</span>
      </div>
      <div className="rounded-control surface px-2 py-[13px] text-center">
        {stats?.best_tier ? (
          <b className="flex items-center justify-center gap-1 font-display text-[14px] leading-[22px] font-bold">
            <TierEmblem tier={stats.best_tier} size="sm" showName />
          </b>
        ) : (
          <b className={stats?.in_placement ? "block text-[12px] leading-[22px] font-bold" : "block font-display text-[18px] font-bold"}>
            {stats?.in_placement ? "Em classificação" : "—"}
          </b>
        )}
        <span className="mt-[3px] block text-[9px] text-ink-muted">Melhor elo</span>
      </div>
    </div>
  );
}

export default function ProfilePage({
  user,
  profiles,
  go,
  matches,
  tab,
  onTabChange,
  notificationCount = 0,
  onNewPhoto,
  openConnections,
  onExpired,
}: {
  user: User;
  profiles: Profile[];
  /** `context.matchId` abre a tela da partida (toque em um registro da aba Partidas). */
  go: (screen: Screen, context?: { matchId?: number }) => void;
  /** Partidas da placa do Jogar, se o shell já a leu (próxima partida da aba Partidas); sem ela, a aba a lê. */
  matches?: readonly MatchCard[] | null;
  /** Aba ativa guardada pelo shell (sobrevive à ida à tela da partida); sem ela, a página guarda a própria. */
  tab?: ProfileTab;
  onTabChange?: (tab: ProfileTab) => void;
  /** Não lidas mais pedidos para seguir (resumo das notificações do ArenaPage): o número do sino. */
  notificationCount?: number;
  /** Abre a Comunidade já na nova publicação. */
  onNewPhoto: () => void;
  openConnections: (userId: number, tab: ConnectionsTab) => void;
  onExpired: () => void;
}) {
  const [ownTab, setOwnTab] = useState<ProfileTab>("Fotos");
  const profileTab = tab ?? ownTab;
  const setProfileTab = onTabChange ?? setOwnTab;
  const [statsState, setStatsState] = useState<StatsState>({ status: "loading" });
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
  useEffect(() => {
    let alive = true;
    getProfileStats()
      .then((stats) => {
        if (alive) setStatsState({ status: "ready", stats });
      })
      .catch(() => {
        if (alive) setStatsState({ status: "error" });
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
          <div className="flex items-center gap-1.5">
            <NotificationBell tone="cover" count={notificationCount} onOpen={() => go("notifications")} />
            <IconButton tone="cover" aria-label="Menu" onClick={() => go("menu")}>
              <Menu size={21} />
            </IconButton>
          </div>
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
      <ProfileStatsBlocks state={statsState} />
      <ProfileTabs value={profileTab} onChange={setProfileTab} />
      <ProfilePanel tab={profileTab}>
        {profileTab === "Fotos" ? (
          <ProfileGallery
            userId={user.id}
            username={user.username}
            ownerName={user.name}
            viewerId={user.id}
            own
            onNewPhoto={onNewPhoto}
            onExpired={onExpired}
          />
        ) : (
          <MatchTimeline
            own
            userId={user.id}
            matches={matches}
            onOpenMatch={(matchId) => go("match", { matchId })}
            onPlay={() => go("play")}
            onExpired={onExpired}
          />
        )}
      </ProfilePanel>
    </>
  );
}
