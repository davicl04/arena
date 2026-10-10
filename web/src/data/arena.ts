import { FootballIcon, TennisIcon, RunningIcon } from "../components/SportIcon";
import { Home, Trophy, User, Users, Zap } from "lucide-react";

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
  | "sports";
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

export const rankingTiers = [
  { name: "Bronze", image: "bronze" },
  { name: "Prata", image: "prata" },
  { name: "Ouro", image: "ouro" },
  { name: "Diamante", image: "diamante" },
  { name: "Lendário", image: "lendario" },
] as const;
