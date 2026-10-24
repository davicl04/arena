import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Shield } from "lucide-react";
import { ApiError, request, sports } from "../api/client";
import type { City, Profile, ProfileInput, Sport, User } from "../api/client";
import SportCard from "../components/SportCard";
import BottomNav from "../components/BottomNav";
import { IconButton } from "@/components/ui/button";
import { LoadError } from "@/components/ui/load-error";
import { DialogContainerProvider } from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/toast";
import { ConnectionNotice } from "../components/ConnectionNotice";
import { cn } from "@/lib/utils";
import { usePlayBoard } from "../hooks/usePlayBoard";
import { useNotificationSummary } from "../hooks/useNotificationSummary";
import { NotificationBell } from "../components/notifications/NotificationBell";
import { connection } from "../api/connection";
import { reportActionError } from "../hooks/useSubmit";
import HomePage from "./HomePage";
import ProfilePage from "./ProfilePage";
import EditProfilePage from "./EditProfilePage";
import MenuPage from "./MenuPage";
import AdminReports from "../components/AdminReports";
import BlockedAccountsPage from "./BlockedAccountsPage";
import ConnectionsPage from "./ConnectionsPage";
import type { ProfileTab } from "../components/ProfileTabs";
import UserProfilePage from "./UserProfilePage";
import NotificationsPage from "./NotificationsPage";
import FollowRequestsPage from "./FollowRequestsPage";
import PlayPage from "./PlayPage";
import RankingPage from "./RankingPage";
import LegendsPage from "./LegendsPage";
import type { RankingState } from "../components/ranking/category";
import OrganizerRequestPage from "./OrganizerRequestPage";
import AdminOrganizerRequests from "../components/admin/AdminOrganizerRequests";
import SocialCommunity from "../components/SocialCommunity";
import { activeNavFor, eventNoun } from "../data/arena";
import type { ConnectionsTab, RunDistance, Screen } from "../data/arena";
import type { NotificationFilter } from "../data/notifications";
// Meus times (frente C): carteirinhas, criar/editar, convidar e entrar pelo link.
import TeamsPage from "./TeamsPage";
import TeamFormPage from "./TeamFormPage";
import JoinPage from "./JoinPage";
import { InviteFlow } from "../components/teams/InviteFlow";
// Comprovantes e devoluções do organizador (A2) e filas da administração (AD1).
import ReceiptsPage from "./ReceiptsPage";
import AdminPaidEvents from "../components/admin/AdminPaidEvents";
import AdminRevokedEvents from "../components/admin/AdminRevokedEvents";
import AdminRefundDisputes from "../components/admin/AdminRefundDisputes";
// Filas da administração da etapa 3: quadras sugeridas e W.O. contestados.
import AdminCourtSuggestions from "../components/admin/AdminCourtSuggestions";
import AdminWalkoverDisputes from "../components/admin/AdminWalkoverDisputes";
// Eventos do organizador (frente W-org1): lista O3, Criar evento V4 e gestão G3.
import OrganizerEventsPage from "./OrganizerEventsPage";
import EventWizard from "./EventWizard";
import EventManagePage from "./EventManagePage";
// Campeonatos e provas do atleta (etapa 2): lista E2 e detalhe D2.
import EventsPage from "./EventsPage";
import EventPage from "./EventPage";
// Partida do Jogar (etapa 3): condições, quadras, reserva, chat, cancelamento e W.O.
import MatchPage from "./MatchPage";
// Campeonatos (etapa 4): chaveamento e tabela, agenda das partidas e decisão do resultado pelo organizador.
import BracketPage from "./BracketPage";
import EventMatchesPage from "./EventMatchesPage";
import ResultDecisionPage from "./ResultDecisionPage";

/** Uma tela da pilha de navegação, com o contexto necessário para restaurá-la ao voltar. */
interface Entry {
  screen: Screen;
  userId?: number;
  tab?: ConnectionsTab;
  mutual?: boolean;
  /** Comunidade aberta já na nova publicação (quadro "Nova foto" do perfil). */
  compose?: boolean;
  /** Time da tela (editar time, convidar); em `team-form`, a ausência indica criação. */
  teamId?: number;
  /** Token do link do time (`join`), lido do endereço compartilhado. */
  token?: string;
  /** Convidar (`team-invite`) aberto já na aba Link e QR (botão de QR da carteirinha). */
  link?: boolean;
  /** Meus times (`teams`) aberto já com a folha de convites recebidos (notificação de convite). */
  invites?: boolean;
  /** Meus times (`teams`) aberto já na lista "Pedidos para entrar" do time (notificação de pedido). */
  requests?: boolean;
  /** Evento da tela (gestão, comprovantes, detalhe); em `event-wizard`, a ausência indica criação. */
  eventId?: number;
  /** Modalidade da lista de eventos (`events`) e do detalhe: a corrida chama os eventos de "Provas". */
  sport?: Sport;
  /** Passo do Criar evento (`event-wizard`) ao abrir um rascunho ("Preencher" do checklist). */
  step?: number;
  /**
   * Partida da tela `match` (e, em `play`, a proposta ou a oferta de vaga dessa partida a abrir em tela cheia); em
   * `event-matches`, a partida cuja folha de agendamento abre junto; em `result-decision`, a partida a decidir.
   */
  matchId?: number;
  /** Distância da corrida escolhida ao abrir o Ranking pelo "Ver ranking" de "Suas marcas" (com `sport: "corrida"`). */
  distance?: RunDistance;
  /** Categoria e time do Ranking (`ranking`): guarda a escolha ao abrir o Salão (`legends`) e a devolve ao voltar. */
  ranking?: RankingState;
  /** Aba do detalhe do evento (`event`) a abrir: a Tabela (notificações da tabela e do encerramento). */
  section?: "tabela";
  /** Filtro (chip) da tela de notificações: abre num chip (a placa do Início abre "Para responder") e guarda o escolhido. */
  filter?: NotificationFilter;
}
const rootScreens: Screen[] = ["home", "ranking", "play", "community", "profile"];
const titles: Record<Screen, string> = {
  home: "Início",
  ranking: "Ranking",
  legends: "Salão dos Lendários",
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
  "follow-requests": "Pedidos para seguir",
  sports: "Suas modalidades",
  teams: "Meus times",
  "team-form": "Criar time",
  "team-invite": "Convidar",
  join: "Entrar no time",
  "organizer-request": "Seja organizador",
  "admin-organizer-requests": "Pedidos de organizador",
  "organizer-events": "Meus eventos",
  "event-wizard": "Novo evento",
  "event-manage": "Gestão do evento",
  "event-receipts": "Comprovantes",
  "admin-paid-events": "Eventos pagos",
  "admin-revoked-events": "Organizador revogado",
  "admin-refund-disputes": "Devoluções contestadas",
  "admin-court-suggestions": "Sugestões de quadra",
  "admin-walkover-disputes": "W.O. contestados",
  events: eventNoun.futebol.many,
  event: eventNoun.futebol.one,
  match: "Partida",
  "event-bracket": "Chaveamento",
  "event-matches": "Partidas",
  "result-decision": "Decidir resultado",
};
/** Título da barra conforme o contexto: edição de time ou de rascunho e eventos da corrida ("Provas"). */
function titleFor(entry: Entry): string {
  if (entry.mutual) return "Seguidores em comum";
  if (entry.screen === "team-form" && entry.teamId) return "Editar time";
  if (entry.screen === "event-wizard" && entry.eventId) return "Editar rascunho";
  if (entry.sport && (entry.screen === "events" || entry.screen === "event"))
    return entry.screen === "events" ? eventNoun[entry.sport].many : eventNoun[entry.sport].one;
  return titles[entry.screen];
}

export default function ArenaPage({
  user,
  onUser,
  onLogout,
  onExpired: expireSession,
  joinToken,
  onJoinOpened,
}: {
  user: User;
  onUser: (user: User) => void;
  onLogout: () => void;
  /** Sessão expirada; `joinToken` devolve ao App o link do time ainda aberto, para o próximo login reabri-lo. */
  onExpired: (joinToken?: string) => void;
  /** Token do link do time lido do endereço (`/entrar/{token}`): abre a tela `join` sobre o Início. */
  joinToken?: string | null;
  /** Consome o token, para um novo login na mesma aba não reabrir o link. */
  onJoinOpened?: () => void;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  // Aba do perfil próprio: fica em memória para a volta da tela da partida cair em Partidas.
  const [profileTab, setProfileTab] = useState<ProfileTab>("Fotos");
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  // Erro de carregamento de perfis e cidades (LoadError); o erro de uma ação (sair, salvar perfil) é toast.
  const [loadFailure, setLoadFailure] = useState<{ message: string; cause: unknown } | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [stack, setStack] = useState<Entry[]>(() =>
    joinToken ? [{ screen: "home" }, { screen: "join", token: joinToken }] : [{ screen: "home" }],
  );
  useEffect(() => {
    if (joinToken) onJoinOpened?.();
  }, [joinToken, onJoinOpened]);
  // O token do link é consumido ao abrir; se a sessão expirar com a tela `join` ainda na pilha, ele volta ao App.
  const stackRef = useRef(stack);
  useEffect(() => {
    stackRef.current = stack;
  }, [stack]);
  const onExpired = useCallback(() => {
    const open = [...stackRef.current].reverse().find((entry) => entry.screen === "join");
    expireSession(open?.token);
  }, [expireSession]);
  const current = stack[stack.length - 1];
  const screen = current.screen;
  const viewedUserId = current.userId ?? 0;
  const connectionsTab = current.tab ?? "followers";
  const mainRef = useRef<HTMLElement>(null);
  // Moldura do app: os diálogos (Dialog) entram nela, não na viewport (ver ui/dialog.tsx).
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  // Placa do Jogar (GET /me/play): alimenta a tela Jogar e o ponto menta da navegação.
  const playBoard = usePlayBoard(onExpired, screen === "play" || screen === "home");
  // Resumo das notificações (GET /me/notifications/summary): sino das abas raiz, chips, Menu e placa do Início.
  // Relido quando a aba raiz muda ou quando se entra ou se volta a ela vindo de uma subtela (uma ação em Meus times,
  // na partida ou no evento pode ter resolvido uma pendência), ao voltar à janela e a cada 60 s.
  const notifications = useNotificationSummary(onExpired, rootScreens.includes(screen) ? screen : `${stack[0].screen}:subtela`);
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
          setLoadFailure({ message: err instanceof Error && err.message ? err.message : "Não foi possível carregar os seus dados.", cause: err });
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
  // Falha por conexão: relê uma única vez quando a conexão volta (as demais esperam o "Tentar novamente").
  const loadLost = loadFailure?.cause instanceof ApiError && loadFailure.cause.isConnection;
  useEffect(() => {
    if (!loadLost) return;
    return connection.onRestored(() => {
      setLoading(true);
      setLoadFailure(null);
      setAttempt((v) => v + 1);
    });
  }, [loadLost]);
  function show(update: (old: Entry[]) => Entry[]) {
    setStack(update);
    mainRef.current?.scrollTo({ top: 0 });
    mainRef.current?.focus();
  }
  /**
   * Abas principais zeram a pilha; as demais telas empilham e voltam à anterior.
   * `context` leva os dados da tela (ex.: `{ teamId }` em Editar time e Convidar).
   */
  function go(next: Screen, context: Omit<Entry, "screen"> = {}) {
    const entry = { ...context, screen: next };
    if (rootScreens.includes(next)) show(() => [entry]);
    else show((old) => [...old, entry]);
  }
  function back() {
    show((old) => (old.length > 1 ? old.slice(0, -1) : [{ screen: "home" }]));
  }
  function openComposer() {
    show(() => [{ screen: "community", compose: true }]);
  }
  const consumeComposeRequest = useCallback(() => {
    setStack((old) =>
      old.map((entry) => (entry.compose ? { ...entry, compose: false } : entry)),
    );
  }, []);
  function openUser(id: number) {
    if (id === user.id) go("profile");
    else show((old) => [...old, { screen: "user-profile", userId: id }]);
  }
  function openConnections(userId: number, tab: ConnectionsTab, mutual = false) {
    show((old) => [...old, { screen: "connections", userId, tab, mutual }]);
  }
  /** Guarda na tela de notificações o chip escolhido, para voltar do aviso ao mesmo filtro. */
  const selectNotificationFilter = useCallback((filter: NotificationFilter) => {
    setStack((old) => [...old.slice(0, -1), { ...old[old.length - 1], filter }]);
  }, []);
  function changeTab(tab: ConnectionsTab) {
    setStack((old) => [...old.slice(0, -1), { ...old[old.length - 1], tab }]);
  }
  /* Meus times (frente C). */
  /** Guarda na tela atual o time do cartão centralizado, para voltar ao mesmo cartão. */
  const selectTeam = useCallback((teamId: number) => {
    setStack((old) => [...old.slice(0, -1), { ...old[old.length - 1], teamId }]);
  }, []);
  /** Guarda na entrada do Ranking a categoria e o time escolhidos, para voltar do Salão à mesma escolha. */
  const selectRanking = useCallback((ranking: RankingState) => {
    setStack((old) => [...old.slice(0, -1), { ...old[old.length - 1], ranking }]);
  }, []);
  /** A folha de convites abre uma vez; ao voltar a Meus times, não reabre. */
  const consumeInvitesRequest = useCallback(() => {
    setStack((old) => old.map((entry) => (entry.invites ? { ...entry, invites: false } : entry)));
  }, []);
  /** A rolagem até "Pedidos para entrar" acontece uma vez. */
  const consumeRequestsRequest = useCallback(() => {
    setStack((old) => old.map((entry) => (entry.requests ? { ...entry, requests: false } : entry)));
  }, []);
  /** A folha de agendamento da partida abre uma vez; ao voltar das partidas, não reabre. */
  const consumeScheduleRequest = useCallback(() => {
    setStack((old) => old.map((entry) => (entry.screen === "event-matches" && entry.matchId !== undefined ? { ...entry, matchId: undefined } : entry)));
  }, []);
  /** Modalidade da lista ou do detalhe do evento na tela atual: título ("Provas") e a volta ao mesmo filtro. */
  const setScreenSport = useCallback((sport: Sport) => {
    setStack((old) => {
      const last = old[old.length - 1];
      return last.sport === sport ? old : [...old.slice(0, -1), { ...last, sport }];
    });
  }, []);
  /**
   * Sai da tela atual para Meus times com `teamId` no carrossel: volta à Meus times logo abaixo na pilha ou a empilha
   * (Criar time, encerrar, link do time).
   */
  function showTeams(teamId?: number, invites = false) {
    show((old) => {
      const rest = old.slice(0, -1);
      const below = rest[rest.length - 1];
      const entry: Entry = { screen: "teams", teamId, invites };
      return below?.screen === "teams" ? [...rest.slice(0, -1), entry] : [...rest, entry];
    });
  }

  /* Eventos do organizador (frente W-org1). */
  /** Sai do Criar evento para a gestão do evento: volta à gestão logo abaixo na pilha ou a empilha. */
  function showEventManage(eventId: number) {
    show((old) => {
      const rest = old.slice(0, -1);
      const below = rest[rest.length - 1];
      const entry: Entry = { screen: "event-manage", eventId };
      return below?.screen === "event-manage" && below.eventId === eventId ? [...rest.slice(0, -1), entry] : [...rest, entry];
    });
  }

  // A falha ao salvar sobe ao SportCard, que a classifica (reportActionError) e a mostra como toast ou junto ao formulário.
  async function save(sport: Sport, input: ProfileInput) {
    const profile = await request<Profile>(
      `/me/sports-profiles/${sport}`,
      "PUT",
      input,
    );
    setProfiles((old) => [...old.filter((p) => p.sport !== sport), profile]);
  }
  async function logout() {
    setBusy(true);
    try {
      await request("/auth/logout", "POST");
      onLogout();
    } catch (err) {
      reportActionError(err, "Não foi possível sair da conta. Tente novamente.", onExpired);
    } finally {
      setBusy(false);
    }
  }
  const firstName = user.name.trim().split(/\s+/)[0];
  const title = titleFor(current);
  const activeNav = activeNavFor(screen, stack[0].screen);
  const profileLayout = screen === "profile" || screen === "user-profile";
  // A Comunidade e o Jogar têm barra (ou placa) própria, de ponta a ponta, presa ao topo do `main`.
  const communityLayout = screen === "community" || screen === "play";
  // Meus times: placa ou tela escura própria, de ponta a ponta, com o título e o voltar/fechar dentro dela.
  const teamsLayout = (["teams", "team-form", "team-invite", "join"] as Screen[]).includes(screen);
  const darkLayout = screen === "team-form" || screen === "team-invite" || screen === "event-wizard";
  // Comprovantes (A2) e Notificações: placa `forest` própria, com o voltar e o título dentro dela.
  const plateLayout = screen === "event-receipts" || screen === "notifications";
  // Eventos do organizador: placa ou tela escura própria (o Criar evento é escuro de ponta a ponta).
  const eventsLayout = (["organizer-events", "event-wizard", "event-manage", "event-bracket", "event-matches", "result-decision"] as Screen[]).includes(screen);
  // Partida (P2 + C1): cabeçalho próprio e chat que rola por dentro, acima da navegação inferior.
  const matchLayout = screen === "match";
  // Ranking: barra própria (título e sino, sem voltar). Salão dos Lendários: tela escura com o voltar dentro dela.
  const rankingLayout = screen === "ranking";
  const legendsLayout = screen === "legends";

  return (
    <DialogContainerProvider container={frame}>
    <div className="grid min-h-dvh place-items-center p-6 app-narrow:p-0">
      <div ref={setFrame} data-slot="app-frame" className="relative h-[844px] max-h-[calc(100dvh-48px)] w-[390px] overflow-hidden rounded-app border border-solid border-line bg-app bg-(image:--app-glow) bg-no-repeat shadow-app app-narrow:h-dvh app-narrow:max-h-none app-narrow:w-full app-narrow:rounded-none app-narrow:border-0 app-narrow:shadow-none">
        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className={cn(
            "h-full overflow-x-hidden overflow-y-auto px-5 pt-[18px] pb-28 outline-none scrollbar-hidden app-narrow:pb-[calc(112px+env(safe-area-inset-bottom))]",
            profileLayout && "@container-size pt-0",
            communityLayout && "px-0 pt-0",
            (teamsLayout || plateLayout || eventsLayout) && "px-0 pt-0",
            darkLayout && "bg-forest",
            legendsLayout && "bg-night px-0 pt-0",
            matchLayout && "overflow-y-hidden px-0 pt-0 pb-[82px] app-narrow:pb-[calc(82px+env(safe-area-inset-bottom))]",
          )}
          aria-label={title}
        >
          {screen !== "home" && !profileLayout && !communityLayout && !teamsLayout && !plateLayout && !eventsLayout && !matchLayout && !rankingLayout && !legendsLayout && (
            <header className="-mx-2 -mt-2 mb-[18px] flex min-h-[54px] items-center justify-between">
              <IconButton aria-label="Voltar" onClick={back}>
                <ArrowLeft size={21} />
              </IconButton>
              <h1 className="text-[17px]">{title}</h1>
              <span className="w-11" />
            </header>
          )}
          {rankingLayout && (
            <header className="-mt-2 -mr-2 mb-3 flex min-h-[54px] items-center justify-between">
              <h1 className="text-[17px]">{title}</h1>
              <NotificationBell tone="light" count={notifications.count} onOpen={() => go("notifications")} />
            </header>
          )}
          {loadFailure && (
            <LoadError
              size="section"
              title="Não foi possível carregar seus dados"
              text={loadFailure.message}
              cause={loadFailure.cause}
              onRetry={() => {
                setLoading(true);
                setLoadFailure(null);
                setAttempt((v) => v + 1);
              }}
            />
          )}
          {screen === "home" && (
            <HomePage
              firstName={firstName}
              profiles={profiles}
              loading={loading}
              matches={playBoard.board?.matches}
              summary={notifications}
              isAdmin={user.is_admin}
              go={go}
              onExpired={onExpired}
            />
          )}
          {screen === "profile" && (
            <ProfilePage
              user={user}
              profiles={profiles}
              go={go}
              matches={playBoard.board?.matches ?? null}
              tab={profileTab}
              onTabChange={setProfileTab}
              notificationCount={notifications.count}
              onNewPhoto={openComposer}
              openConnections={openConnections}
              onExpired={onExpired}
            />
          )}
          {screen === "play" && (
            <PlayPage
              profiles={profiles}
              cities={cities}
              loading={loading}
              board={playBoard}
              openMatch={current.matchId}
              notificationCount={notifications.count}
              go={go}
              onExpired={onExpired}
            />
          )}
          {screen === "sports" && (
            <>
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
                      onExpired={onExpired}
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
          {screen === "ranking" && !loadFailure && (
            <RankingPage
              profiles={profiles}
              loading={loading}
              initialSport={current.sport}
              initialDistance={current.distance}
              initial={current.ranking}
              onChange={selectRanking}
              go={go}
              onOpenUser={openUser}
              onExpired={onExpired}
            />
          )}
          {screen === "legends" && current.ranking && (
            <LegendsPage ranking={current.ranking} onBack={back} onOpenUser={openUser} onExpired={onExpired} />
          )}
          {screen === "community" && (
            <SocialCommunity
              viewerId={user.id}
              onOpenUser={openUser}
              onExpired={onExpired}
              notificationCount={notifications.count}
              onNotifications={() => go("notifications")}
              composeOnOpen={Boolean(current.compose)}
              onComposeStarted={consumeComposeRequest}
            />
          )}
          {screen === "notifications" && (
            <NotificationsPage
              isAdmin={user.is_admin}
              summary={notifications}
              filter={current.filter ?? "tudo"}
              onFilter={selectNotificationFilter}
              onBack={back}
              onOpenFollowRequests={() => go("follow-requests")}
              onNavigate={({ screen: next, ...context }) => go(next, context)}
              onExpired={onExpired}
            />
          )}
          {screen === "follow-requests" && (
            <FollowRequestsPage summary={notifications} onOpenUser={openUser} onExpired={onExpired} />
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
              onOrganizerRequest={() => go("organizer-request")}
              onOrganizerRequests={() => go("admin-organizer-requests")}
              onPaidEvents={() => go("admin-paid-events")}
              onRevokedEvents={() => go("admin-revoked-events")}
              onRefundDisputes={() => go("admin-refund-disputes")}
              onCourtSuggestions={() => go("admin-court-suggestions")}
              onWalkoverDisputes={() => go("admin-walkover-disputes")}
              onOrganizerEvents={() => go("organizer-events")}
              onOpenEvent={(eventId) => go("event-manage", { eventId })}
              onNewEvent={() => go("event-wizard")}
              onNotifications={() => go("notifications")}
              notificationCount={notifications.count}
              onLogout={logout}
              onExpired={onExpired}
            />
          )}
          {screen === "moderation" && user.is_admin && (
            <AdminReports onExpired={onExpired} />
          )}
          {screen === "organizer-request" && (
            <OrganizerRequestPage
              cities={cities}
              profiles={profiles}
              onBack={back}
              onExpired={onExpired}
            />
          )}
          {screen === "admin-organizer-requests" && user.is_admin && (
            <AdminOrganizerRequests onOpenUser={openUser} onExpired={onExpired} />
          )}
          {screen === "admin-paid-events" && user.is_admin && <AdminPaidEvents onExpired={onExpired} />}
          {screen === "admin-revoked-events" && user.is_admin && <AdminRevokedEvents onExpired={onExpired} />}
          {screen === "admin-refund-disputes" && user.is_admin && <AdminRefundDisputes onExpired={onExpired} />}
          {screen === "admin-court-suggestions" && user.is_admin && <AdminCourtSuggestions onExpired={onExpired} />}
          {screen === "admin-walkover-disputes" && user.is_admin && <AdminWalkoverDisputes onExpired={onExpired} />}
          {screen === "event-receipts" && current.eventId !== undefined && (
            <ReceiptsPage key={current.eventId} eventId={current.eventId} onBack={back} onExpired={onExpired} />
          )}
          {/* Meus times (frente C). */}
          {screen === "teams" && (
            <TeamsPage
              viewerId={user.id}
              selectedTeamId={current.teamId}
              openInvites={Boolean(current.invites)}
              onInvitesOpened={consumeInvitesRequest}
              showRequests={Boolean(current.requests)}
              onRequestsShown={consumeRequestsRequest}
              onSelectTeam={selectTeam}
              onBack={back}
              onCreate={() => go("team-form")}
              onEdit={(team) => go("team-form", { teamId: team.id })}
              onInvite={(team) => go("team-invite", { teamId: team.id })}
              onLink={(team) => go("team-invite", { teamId: team.id, link: true })}
              onOpenUser={openUser}
              onExpired={onExpired}
            />
          )}
          {screen === "team-form" && (
            <TeamFormPage
              key={current.teamId ?? "novo"}
              teamId={current.teamId}
              user={user}
              profiles={profiles}
              cities={cities}
              onDone={(team) => showTeams(team.id)}
              onClosed={() => showTeams()}
              onBack={back}
              onExpired={onExpired}
            />
          )}
          {screen === "team-invite" && current.teamId !== undefined && (
            <InviteFlow
              key={`${current.teamId}-${current.link ? "link" : "pessoa"}`}
              teamId={current.teamId}
              initialTab={current.link ? "link" : "pessoa"}
              onClose={back}
              onExpired={onExpired}
            />
          )}
          {screen === "join" && current.token && (
            <JoinPage
              key={current.token}
              token={current.token}
              onClose={back}
              onOpenTeams={(team, invites) => showTeams(team.id, invites)}
              onExpired={onExpired}
            />
          )}
          {/* Eventos do organizador (frente W-org1). */}
          {screen === "organizer-events" && (
            <OrganizerEventsPage
              onBack={back}
              onOpen={(eventId) => go("event-manage", { eventId })}
              onCreate={() => go("event-wizard")}
              onExpired={onExpired}
            />
          )}
          {screen === "event-wizard" && (
            <EventWizard
              key={`${current.eventId ?? "novo"}-${current.step ?? ""}`}
              eventId={current.eventId}
              initialStep={current.step}
              cities={cities}
              onClose={back}
              onDone={(event) => showEventManage(event.id)}
              onExpired={onExpired}
            />
          )}
          {screen === "event-manage" && current.eventId !== undefined && (
            <EventManagePage
              key={current.eventId}
              eventId={current.eventId}
              onBack={back}
              onEdit={(step) => go("event-wizard", { eventId: current.eventId, step })}
              onReceipts={() => go("event-receipts", { eventId: current.eventId })}
              onBracket={() => go("event-bracket", { eventId: current.eventId })}
              onMatches={() => go("event-matches", { eventId: current.eventId })}
              onDeleted={back}
              onExpired={onExpired}
            />
          )}
          {/* Campeonatos (etapa 4): chaveamento, partidas e decisão, do organizador. */}
          {screen === "event-bracket" && current.eventId !== undefined && (
            <BracketPage
              key={current.eventId}
              eventId={current.eventId}
              onBack={back}
              onMatches={() => go("event-matches", { eventId: current.eventId })}
              onExpired={onExpired}
            />
          )}
          {screen === "event-matches" && current.eventId !== undefined && (
            <EventMatchesPage
              key={current.eventId}
              eventId={current.eventId}
              initialMatchId={current.matchId}
              onInitialShown={consumeScheduleRequest}
              onBack={back}
              onOpenMatch={(matchId) => go("match", { matchId })}
              onDecide={(matchId) => go("result-decision", { matchId })}
              onExpired={onExpired}
            />
          )}
          {screen === "result-decision" && current.matchId !== undefined && (
            <ResultDecisionPage
              key={current.matchId}
              matchId={current.matchId}
              onBack={back}
              onOpenChat={() => go("match", { matchId: current.matchId })}
              onDone={back}
              onExpired={onExpired}
            />
          )}
          {/* Campeonatos e provas do atleta (etapa 2). */}
          {screen === "events" && (
            <EventsPage
              sport={current.sport ?? "futebol"}
              profiles={profiles}
              cities={cities}
              loading={loading}
              onSport={setScreenSport}
              onOpen={(eventId, sport) => go("event", { eventId, sport })}
              onSports={() => go("sports")}
              onExpired={onExpired}
            />
          )}
          {screen === "event" && current.eventId !== undefined && (
            <EventPage
              key={current.eventId}
              eventId={current.eventId}
              initialSection={current.section}
              onSport={setScreenSport}
              onTeams={() => go("teams")}
              onManage={(eventId) => go("event-manage", { eventId })}
              onOpenUser={openUser}
              onExpired={onExpired}
            />
          )}
          {/* Partida do Jogar (etapa 3). */}
          {screen === "match" && current.matchId !== undefined && (
            <MatchPage
              key={current.matchId}
              matchId={current.matchId}
              viewerId={user.id}
              onBack={back}
              onSchedule={(eventId) => go("event-matches", { eventId, matchId: current.matchId })}
              onDecide={() => go("result-decision", { matchId: current.matchId })}
              onExpired={onExpired}
            />
          )}
        </main>
        <BottomNav active={activeNav} onGo={go} playAttention={playBoard.board?.attention} />
        <ConnectionNotice frame={frame} />
        <Toaster container={frame} />
      </div>
    </div>
    </DialogContainerProvider>
  );
}
