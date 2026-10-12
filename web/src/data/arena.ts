import { FootballIcon, TennisIcon, RunningIcon } from "../components/SportIcon";
import { Home, Trophy, User, Users, Zap } from "lucide-react";
import { positions } from "../api/client";
import type { Position, Sport } from "../api/client";

export type Screen =
  | "home"
  | "ranking"
  | "play"
  | "community"
  | "profile"
  | "edit-profile"
  | "menu"
  | "moderation"
  | "blocked"
  | "connections"
  | "user-profile"
  | "notifications"
  | "sports"
  // Etapa 1 (Times e organizador): telas declaradas, renderizadas pelas frentes de cada área.
  | "teams"
  | "team-form"
  | "team-invite"
  | "join"
  | "organizer-request"
  | "admin-organizer-requests"
  // Etapa 2 (eventos): organizador, administração e atleta; renderizadas pelas frentes seguintes.
  | "organizer-events"
  | "event-wizard"
  | "event-manage"
  | "event-receipts"
  | "admin-paid-events"
  | "admin-revoked-events"
  | "admin-refund-disputes"
  | "events"
  | "event"
  // Etapa 3 (Jogar): a partida (condições, chat e resultado), aberta pela placa e pelas notificações, e as filas da administração.
  | "match"
  | "admin-court-suggestions"
  | "admin-walkover-disputes";
export type ConnectionsTab = "followers" | "following";
export { version as appVersion } from "../../package.json";
export const cover = "/images/arena-cover.jpg";
export const sportIcons = {
  futebol: FootballIcon,
  tenis: TennisIcon,
  corrida: RunningIcon,
};
export const navItems = [
  { screen: "home", label: "Início", Icon: Home },
  { screen: "ranking", label: "Ranking", Icon: Trophy },
  { screen: "play", label: "JOGAR", Icon: Zap },
  { screen: "community", label: "Comunidade", Icon: Users },
  { screen: "profile", label: "Perfil", Icon: User },
] as const;

/* Telas empilhadas que acendem uma aba da navegação diferente da própria (como o Menu acende "Perfil"). */
const profileScreens: Screen[] = [
  "edit-profile",
  "menu",
  "moderation",
  "blocked",
  "organizer-request",
  "admin-organizer-requests",
  "organizer-events",
  "event-wizard",
  "event-manage",
  "event-receipts",
  "admin-paid-events",
  "admin-revoked-events",
  "admin-refund-disputes",
  "admin-court-suggestions",
  "admin-walkover-disputes",
];
const playScreens: Screen[] = ["teams", "team-form", "team-invite", "join", "events", "event", "match"];

/**
 * Aba acesa na navegação inferior para a tela atual. Perfis e conexões herdam a aba da raiz da pilha
 * (de onde foram abertos); as telas de Meus times, dos eventos do atleta e da partida acendem "JOGAR", e as de
 * organizador e administração (inclusive as filas de quadras e de W.O.), "Perfil"; Notificações acendem "Início",
 * ou "Perfil" quando abertas pelo Menu.
 */
export function activeNavFor(screen: Screen, root: Screen): Screen {
  if (screen === "user-profile" || screen === "connections") {
    if (root === "notifications" || root === "sports") return "home";
    if (profileScreens.includes(root)) return "profile";
    return playScreens.includes(root) ? "play" : root;
  }
  if (profileScreens.includes(screen) || screen === "sports") return "profile";
  if (playScreens.includes(screen)) return "play";
  // Notificações acendem "Início" (o sino) ou "Perfil", quando abertas pela linha do Menu.
  if (screen === "notifications") return root === "profile" ? "profile" : "home";
  return screen;
}

export const rankingTiers = [
  { name: "Bronze", image: "bronze" },
  { name: "Prata", image: "prata" },
  { name: "Ouro", image: "ouro" },
  { name: "Diamante", image: "diamante" },
  { name: "Lendário", image: "lendario" },
] as const;

/** Chave do elo, a mesma usada pela API (`bronze`, `prata`, `ouro`, `diamante`, `lendario`). */
export type TierKey = (typeof rankingTiers)[number]["image"];
export interface TierInfo {
  key: TierKey;
  name: string;
  /** Brasão do elo em `public/images/brand/`. */
  image: string;
}
/** Elos por chave, derivados de `rankingTiers` (mesma ordem de progressão). */
export const tiers = Object.fromEntries(
  rankingTiers.map((tier) => [
    tier.image,
    { key: tier.image, name: tier.name, image: `/images/brand/${tier.image}.svg` },
  ]),
) as Record<TierKey, TierInfo>;

/** Partidas confirmadas para sair da classificação no futebol e no tênis (a corrida classifica na primeira marca). */
export const placementRequired = 3;
/**
 * Elo que pode ser exibido: só com a classificação completa. Nunca se atribui elo a quem ainda está
 * em classificação, mesmo que a resposta traga uma chave.
 */
export function shownTier(
  tier: TierKey | null | undefined,
  played: number,
  required: number = placementRequired,
): TierKey | null {
  return tier && tier in tiers && played >= required ? tier : null;
}

/** Formatos do futebol, com o tamanho do elenco em campo (o ranking de times é separado por formato). */
export const footballFormats = [
  { value: "futsal", label: "Futsal", players: 5, size: "5×5" },
  { value: "society", label: "Society", players: 7, size: "7×7" },
  { value: "campo", label: "Campo", players: 11, size: "11×11" },
] as const;
export type FootballFormat = (typeof footballFormats)[number]["value"];
export type FootballFormatInfo = (typeof footballFormats)[number];
/** Formato do futebol por chave da API. */
export const footballFormat = Object.fromEntries(
  footballFormats.map((format) => [format.value, format]),
) as Record<FootballFormat, FootballFormatInfo>;

/** Siglas das posições (elenco, vagas e chaves). Os rótulos completos ficam em `positions`, no cliente da API. */
export const positionShort: Record<Position, string> = {
  goleiro: "GOL",
  defesa: "DEF",
  meio_campo: "MEI",
  atacante: "ATA",
};
/** Posições com rótulo e sigla, na ordem de `positions`. */
export const positionOptions = positions.map((position) => ({
  ...position,
  short: positionShort[position.value],
}));

/** Distâncias padrão da corrida (chips da placa e marcas). `km` é a distância oficial, usada no ritmo. */
export const runDistances = [
  { value: 3, label: "3 km", km: 3 },
  { value: 5, label: "5 km", km: 5 },
  { value: 10, label: "10 km", km: 10 },
  { value: 21, label: "21 km", km: 21.0975 },
  { value: 42, label: "42 km", km: 42.195 },
] as const;
export type RunDistance = (typeof runDistances)[number]["value"];

/** Papéis no time (RN02): rótulo e a linha da carteirinha para quem está vendo. */
export const teamRoles = [
  { value: "representante", label: "Representante", viewer: "você representa" },
  { value: "membro", label: "Membro", viewer: "você é membro" },
] as const;
export type TeamRole = (typeof teamRoles)[number]["value"];
export type TeamRoleInfo = (typeof teamRoles)[number];
/** Papel no time por chave da API. */
export const teamRole = Object.fromEntries(
  teamRoles.map((role) => [role.value, role]),
) as Record<TeamRole, TeamRoleInfo>;

/* ===== Etapa 2: eventos, inscrições e comprovantes ===== */

/** Índice por `value` de uma lista de mapeamento (a ordem da lista é a de exibição). */
function byValue<T extends { value: string }>(items: readonly T[]) {
  return Object.fromEntries(items.map((item) => [item.value, item])) as Record<T["value"], T>;
}

/**
 * Tom do selo de estado (`StateBadge`), igual nos eventos e nas inscrições: `draft` rascunho ou reservada,
 * `pending` aguardando alguém, `open` aberto ou confirmado, `live` em andamento, `closed` encerrado e
 * `danger` recusado ou cancelado.
 */
export type StateTone = "draft" | "pending" | "open" | "live" | "closed" | "danger";

/** Estados do evento (chaves do plano). "Publicado" aparece como "Inscrições abertas". */
export const eventStates = [
  { value: "rascunho", label: "Rascunho", tone: "draft" },
  { value: "em_aprovacao", label: "Em aprovação", tone: "pending" },
  { value: "publicado", label: "Inscrições abertas", tone: "open" },
  { value: "em_andamento", label: "Em andamento", tone: "live" },
  { value: "encerrado", label: "Encerrado", tone: "closed" },
  { value: "cancelado", label: "Cancelado", tone: "danger" },
] as const satisfies readonly { value: string; label: string; tone: StateTone }[];
export type EventState = (typeof eventStates)[number]["value"];
export const eventState = byValue(eventStates);

/**
 * Fase do cartaz (`phase` da API): o estado "publicado" se divide pelo prazo das inscrições. Os rótulos do canto do
 * cartaz e o tom do selo; os demais repetem `eventStates`.
 */
export const eventPhases = [
  { value: "rascunho", label: "Rascunho", tone: "draft" },
  { value: "em_aprovacao", label: "Em aprovação", tone: "pending" },
  { value: "inscricoes_abertas", label: "Inscrições abertas", tone: "open" },
  { value: "inscricoes_encerradas", label: "Inscrições encerradas", tone: "closed" },
  { value: "em_andamento", label: "Em andamento", tone: "live" },
  { value: "encerrado", label: "Encerrado", tone: "closed" },
  { value: "cancelado", label: "Cancelado", tone: "danger" },
] as const satisfies readonly { value: string; label: string; tone: StateTone }[];
export type EventPhase = (typeof eventPhases)[number]["value"];
export const eventPhase = byValue(eventPhases);

/**
 * Estados da inscrição, com as chaves do contrato (0003, seção 13). `label` é o da lista do organizador (G3, A2);
 * `short`, o selo do cartaz do atleta (E2). A recusa (`rejeitada`) vale para o comprovante: o inscrito pode enviar
 * outro até o fim da reserva.
 */
export const entryStates = [
  { value: "reservada", label: "Vaga reservada", short: "Reservada", tone: "draft" },
  { value: "em_analise", label: "Comprovante em análise", short: "Em análise", tone: "pending" },
  { value: "confirmada", label: "Confirmada", short: "Inscrito", tone: "open" },
  { value: "rejeitada", label: "Comprovante recusado", short: "Recusado", tone: "danger" },
  { value: "expirada", label: "Reserva expirada", short: "Expirada", tone: "closed" },
  { value: "cancelada", label: "Cancelada", short: "Cancelada", tone: "closed" },
  { value: "devolucao_pendente", label: "Devolução pendente", short: "Devolução pendente", tone: "pending" },
  { value: "devolucao_contestada", label: "Devolução contestada", short: "Contestada", tone: "danger" },
  { value: "devolvida", label: "Devolvida", short: "Devolvida", tone: "closed" },
] as const satisfies readonly { value: string; label: string; short: string; tone: StateTone }[];
export type EntryState = (typeof entryStates)[number]["value"];
export const entryState = byValue(entryStates);

/** Tipos de evento do futebol e do tênis (a corrida é sempre prova, sem tipo). */
export const eventTypes = [
  { value: "todos_contra_todos", label: "Todos contra todos" },
  { value: "eliminacao_simples", label: "Eliminação simples" },
] as const;
export type EventType = (typeof eventTypes)[number]["value"];
export const eventType = byValue(eventTypes);
/** Vagas permitidas na eliminação simples (nos demais tipos, livres). */
export const eliminationCapacities = [4, 8, 16] as const;

/** Nome do evento e do inscrito por modalidade ("Campeonatos" de times, "Provas" de corredores…). */
export const eventNoun: Record<Sport, { one: string; many: string; entrant: string; entrants: string }> = {
  futebol: { one: "Campeonato", many: "Campeonatos", entrant: "time", entrants: "times" },
  tenis: { one: "Campeonato", many: "Campeonatos", entrant: "atleta", entrants: "atletas" },
  corrida: { one: "Prova", many: "Provas", entrant: "corredor", entrants: "corredores" },
};

export interface EventFormatInput {
  sport: Sport;
  /** Formato do futebol. */
  format?: FootballFormat | null;
  /** Distância da prova de corrida, em km. */
  distanceKm?: number | null;
  /** Tipo do campeonato (futebol e tênis). */
  eventType?: EventType | null;
}
/**
 * Partes da linha de formato do evento, na ordem do cartaz: "Society 7×7" e "Eliminação simples" no futebol,
 * "Eliminação simples" no tênis e "10 km" e "Prova" na corrida. Itens ausentes ficam de fora.
 */
export function eventFormatParts({ sport, format, distanceKm, eventType: type }: EventFormatInput): string[] {
  if (sport === "corrida")
    return [distanceKm ? `${distanceKm.toLocaleString("pt-BR")} km` : "", "Prova"].filter(Boolean);
  const football = sport === "futebol" && format ? footballFormat[format] : null;
  return [football ? `${football.label} ${football.size}` : "", type ? (eventType[type]?.label ?? "") : ""].filter(
    Boolean,
  );
}

/** Motivos de recusa do comprovante pelo organizador (A2); "Outro" pede detalhe. */
export const receiptRefusalReasons = [
  { value: "valor_diferente", label: "Valor diferente" },
  { value: "favorecido_errado", label: "Favorecido errado" },
  { value: "comprovante_ilegivel", label: "Comprovante ilegível" },
  { value: "fora_do_prazo", label: "Data fora do prazo" },
  { value: "outro", label: "Outro" },
] as const;
export type ReceiptRefusalReason = (typeof receiptRefusalReasons)[number]["value"];
export const receiptRefusalReason = byValue(receiptRefusalReasons);

/** Motivos de recusa de evento pago pela administração (AD1); o evento volta a rascunho com o motivo. */
export const eventRefusalReasons = [
  { value: "pix_incompleto", label: "Dados do Pix incompletos" },
  { value: "preco_ou_datas", label: "Preço ou datas inconsistentes" },
  { value: "conteudo_inadequado", label: "Conteúdo inadequado" },
  { value: "outro", label: "Outro" },
] as const;
export type EventRefusalReason = (typeof eventRefusalReasons)[number]["value"];
export const eventRefusalReason = byValue(eventRefusalReasons);

/** Tipos de chave Pix: rótulo, forma no meio da frase ("chave por e-mail"), exemplo e teclado do campo. */
export const pixKeyTypes = [
  { value: "cpf", label: "CPF", inline: "CPF", placeholder: "000.000.000-00", inputMode: "numeric" },
  { value: "email", label: "E-mail", inline: "e-mail", placeholder: "nome@email.com", inputMode: "email" },
  { value: "telefone", label: "Telefone", inline: "telefone", placeholder: "(61) 90000-0000", inputMode: "tel" },
  { value: "aleatoria", label: "Aleatória", inline: "chave aleatória", placeholder: "Chave aleatória", inputMode: "text" },
] as const;
export type PixKeyType = (typeof pixKeyTypes)[number]["value"];
export const pixKeyType = byValue(pixKeyTypes);
