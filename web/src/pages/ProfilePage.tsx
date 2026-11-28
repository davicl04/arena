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
import { useWideLayout } from "../hooks/useLayout";

type StatsState = { status: "loading" } | { status: "error" } | { status: "ready"; stats: ProfileStats };

/** "62%" (arredondado) ou "—" sem partidas. */
const winRateText = (rate: number | null) => (rate == null ? "—" : `${Math.round(rate)}%`);

/* Blocos de estatística: os do celular, um pouco maiores no computador. */
const statBox = "rounded-control surface px-2 py-[13px] text-center lg:py-4";
const statNumber = "block font-display text-[18px] font-bold lg:text-[22px] lg:leading-[30px]";
const statLabel = "mt-[3px] block text-[9px] text-ink-muted lg:mt-1 lg:text-[11px]";

/** Blocos "Suas estatísticas": os números vêm do servidor; carregando ou com erro ficam "—" sem bloquear o perfil. */
function ProfileStatsBlocks({ state }: { state: StatsState }) {
  const stats = state.status === "ready" ? state.stats : null;
  return (
    <div className="grid grid-cols-3 gap-2 lg:gap-3" aria-busy={state.status === "loading"}>
      <div className={statBox}>
        <b className={statNumber}>{stats ? winRateText(stats.win_rate) : "—"}</b>
        <span className={statLabel}>Taxa de vitória</span>
      </div>
      <div className={statBox}>
        <b className={statNumber}>{stats ? stats.played : "—"}</b>
        <span className={statLabel}>Partidas</span>
      </div>
      <div className={statBox}>
        {stats?.best_tier ? (
          <b className="flex items-center justify-center gap-1 font-display text-[14px] leading-[22px] font-bold lg:text-[16px] lg:leading-[30px]">
            <TierEmblem tier={stats.best_tier} size="sm" showName />
          </b>
        ) : (
          <b className={stats?.in_placement ? "block text-[12px] leading-[22px] font-bold lg:text-[13px] lg:leading-[30px]" : statNumber}>
            {stats?.in_placement ? "Em classificação" : "—"}
          </b>
        )}
        <span className={statLabel}>Melhor elo</span>
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
  // Em tablet e computador, Notificações e Menu ficam na navegação lateral (sem o sino e o menu da capa).
  const wide = useWideLayout();
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
  const header = (
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
        wide ? undefined : <div className="flex items-center gap-1.5">
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
  );
  const sportsLink = (
    <div className="overflow-hidden rounded-card border border-solid border-line md:col-start-1 md:row-start-2 md:flex">
      <button
        className="flex min-h-[61px] w-full items-center gap-3 border-0 bg-transparent px-[13px] py-2.5 text-left text-brand md:px-4 lg:gap-4 lg:px-5"
        onClick={() => go("sports")}
      >
        <Trophy size={21} className="md:shrink-0 lg:size-6" />
        <span className="flex-1">
          <b className="block text-[11px] text-ink lg:text-[14px]">Minhas modalidades</b>
          <small className="mt-[3px] text-[9px] text-ink-muted lg:text-[12px]">Cidade, posição e disponibilidade</small>
        </span>
        <ChevronRight size={17} className="md:shrink-0" />
      </button>
    </div>
  );
  const content = (
    <>
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
  /*
   * Tablet e computador: medida larga (`data-largura="larga"`). Capa e cabeçalho na largura da coluna e, abaixo,
   * "Minhas modalidades" e "Suas estatísticas" lado a lado numa faixa; depois as abas. O celular segue numa coluna,
   * com os mesmos elementos (o cartão das modalidades só ganha classes de posição a partir de `md:`).
   */
  if (wide)
    return (
      <div data-largura="larga" data-slot="perfil-largo">
        {header}
        {/* Título das estatísticas na 1ª linha; o cartão das modalidades e os blocos dividem a 2ª, com a mesma altura. */}
        <div data-slot="perfil-faixa" className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-4 lg:grid-cols-[minmax(20rem,5fr)_minmax(0,7fr)] lg:gap-x-6">
          {sportsLink}
          <SectionTitle title="Suas estatísticas" className="col-start-2 row-start-1 mt-0" />
          <div className="col-start-2 row-start-2 min-w-0">
            <ProfileStatsBlocks state={statsState} />
          </div>
        </div>
        {content}
      </div>
    );
  return (
    <>
      {header}
      {sportsLink}
      <SectionTitle title="Suas estatísticas" />
      <ProfileStatsBlocks state={statsState} />
      {content}
    </>
  );
}
