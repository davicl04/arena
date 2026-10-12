import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Shield } from "lucide-react";
import { ApiError, request, sports } from "../api/client";
import type { City, Profile, ProfileInput, Sport, User } from "../api/client";
import SportCard from "../components/SportCard";
import BottomNav from "../components/BottomNav";
import { Button, IconButton } from "@/components/ui/button";
import { feedbackVariants } from "@/components/ui/feedback";
import { DialogContainerProvider } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { usePlayBoard } from "../hooks/usePlayBoard";
import HomePage from "./HomePage";
import ProfilePage from "./ProfilePage";
import EditProfilePage from "./EditProfilePage";
import MenuPage from "./MenuPage";
import AdminReports from "../components/AdminReports";
import BlockedAccountsPage from "./BlockedAccountsPage";
import ConnectionsPage from "./ConnectionsPage";
import UserProfilePage from "./UserProfilePage";
import NotificationsPage from "./NotificationsPage";
import PlayPage from "./PlayPage";
import RankingPage from "./RankingPage";
import OrganizerRequestPage from "./OrganizerRequestPage";
import AdminOrganizerRequests from "../components/admin/AdminOrganizerRequests";
import SocialCommunity from "../components/SocialCommunity";
import { activeNavFor, eventNoun } from "../data/arena";
import type { ConnectionsTab, Screen } from "../data/arena";
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
  /** Partida da tela `match` (e, em `play`, a proposta ou a oferta de vaga dessa partida a abrir em tela cheia). */
  matchId?: number;
}
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
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
  function changeTab(tab: ConnectionsTab) {
    setStack((old) => [...old.slice(0, -1), { ...old[old.length - 1], tab }]);
  }
  /* Meus times (frente C). */
  /** Guarda na tela atual o time do cartão centralizado, para voltar ao mesmo cartão. */
  const selectTeam = useCallback((teamId: number) => {
    setStack((old) => [...old.slice(0, -1), { ...old[old.length - 1], teamId }]);
  }, []);
  /** A folha de convites abre uma vez; ao voltar a Meus times, não reabre. */
  const consumeInvitesRequest = useCallback(() => {
    setStack((old) => old.map((entry) => (entry.invites ? { ...entry, invites: false } : entry)));
  }, []);
  /** A rolagem até "Pedidos para entrar" acontece uma vez. */
  const consumeRequestsRequest = useCallback(() => {
    setStack((old) => old.map((entry) => (entry.requests ? { ...entry, requests: false } : entry)));
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
  const title = titleFor(current);
  const activeNav = activeNavFor(screen, stack[0].screen);
  const profileLayout = screen === "profile" || screen === "user-profile";
  // A Comunidade e o Jogar têm barra (ou placa) própria, de ponta a ponta, presa ao topo do `main`.
  const communityLayout = screen === "community" || screen === "play";
  // Meus times: placa ou tela escura própria, de ponta a ponta, com o título e o voltar/fechar dentro dela.
  const teamsLayout = (["teams", "team-form", "team-invite", "join"] as Screen[]).includes(screen);
  const darkLayout = screen === "team-form" || screen === "team-invite" || screen === "event-wizard";
  // Comprovantes (A2): placa `forest` própria, com o voltar e o nome do evento dentro dela.
  const plateLayout = screen === "event-receipts";
  // Eventos do organizador: placa ou tela escura própria (o Criar evento é escuro de ponta a ponta).
  const eventsLayout = (["organizer-events", "event-wizard", "event-manage"] as Screen[]).includes(screen);
  // Partida (P2 + C1): cabeçalho próprio e chat que rola por dentro, acima da navegação inferior.
  const matchLayout = screen === "match";

  return (
    <DialogContainerProvider container={frame}>
    <div className="grid min-h-dvh place-items-center p-6 app-narrow:p-0">
      <div ref={setFrame} data-slot="app-frame" className="relative h-[844px] max-h-[calc(100dvh-48px)] w-[390px] overflow-hidden rounded-app border border-solid border-line bg-app shadow-app app-narrow:h-dvh app-narrow:max-h-none app-narrow:w-full app-narrow:rounded-none app-narrow:border-0 app-narrow:shadow-none">
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
            matchLayout && "overflow-y-hidden px-0 pt-0 pb-[82px] app-narrow:pb-[calc(82px+env(safe-area-inset-bottom))]",
          )}
          aria-label={title}
        >
          {screen !== "home" && !profileLayout && !communityLayout && !teamsLayout && !plateLayout && !eventsLayout && !matchLayout && (
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
              matches={playBoard.board?.matches}
              go={go}
              onExpired={onExpired}
            />
          )}
          {screen === "profile" && (
            <ProfilePage
              user={user}
              profiles={profiles}
              go={go}
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
            <RankingPage profiles={profiles} go={go} onOpenUser={openUser} onExpired={onExpired} />
          )}
          {screen === "community" && (
            <SocialCommunity
              viewerId={user.id}
              onOpenUser={openUser}
              onExpired={onExpired}
              composeOnOpen={Boolean(current.compose)}
              onComposeStarted={consumeComposeRequest}
            />
          )}
          {screen === "notifications" && (
            <NotificationsPage
              isAdmin={user.is_admin}
              onOpenUser={openUser}
              onNavigate={({ screen: next, ...context }) => go(next, context)}
              onExpired={onExpired}
            />
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
              onDeleted={back}
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
              onSport={setScreenSport}
              onTeams={() => go("teams")}
              onManage={(eventId) => go("event-manage", { eventId })}
              onOpenUser={openUser}
              onExpired={onExpired}
            />
          )}
          {/* Partida do Jogar (etapa 3). */}
          {screen === "match" && current.matchId !== undefined && (
            <MatchPage key={current.matchId} matchId={current.matchId} viewerId={user.id} onBack={back} onExpired={onExpired} />
          )}
        </main>
        <BottomNav active={activeNav} onGo={go} playAttention={playBoard.board?.attention} />
      </div>
    </div>
    </DialogContainerProvider>
  );
}
