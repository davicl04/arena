import { FootballIcon, TennisIcon, RunningIcon } from "../components/SportIcon";
import { Home, Trophy, User, Users, Zap } from "lucide-react";
import { positions } from "../api/client";
import type { Position } from "../api/client";

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
  | "admin-organizer-requests";
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
];
const playScreens: Screen[] = ["teams", "team-form", "team-invite", "join"];

/**
 * Aba acesa na navegação inferior para a tela atual. Perfis e conexões herdam a aba da raiz da pilha
 * (de onde foram abertos); as telas de Meus times acendem "JOGAR" e as de organizador, "Perfil".
 */
export function activeNavFor(screen: Screen, root: Screen): Screen {
  if (screen === "user-profile" || screen === "connections") {
    if (root === "notifications" || root === "sports") return "home";
    if (profileScreens.includes(root)) return "profile";
    return playScreens.includes(root) ? "play" : root;
  }
  if (profileScreens.includes(screen) || screen === "sports") return "profile";
  if (playScreens.includes(screen)) return "play";
  return screen === "notifications" ? "home" : screen;
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
