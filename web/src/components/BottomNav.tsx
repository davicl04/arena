import { Bell, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { navItems } from "../data/arena";
import type { Screen } from "../data/arena";
import { notificationCountText, notificationLabel } from "../data/notifications";
import { useWideLayout } from "../hooks/useLayout";
import { ArenaMark, Logo } from "./Brand";

/** Telas abertas pelos atalhos do pé da navegação lateral (tablet e computador). */
export type NavShortcut = "notifications" | "menu";

/*
 * Navegação principal do app, com o botão Jogar em destaque. Um só `nav` ("Navegação principal") com os cinco destinos,
 * em três apresentações (faixas em hooks/useLayout.ts):
 * - celular: barra inferior absoluta no `app-frame`, como sempre foi;
 * - tablet (`md:`): trilho lateral compacto (88 px) com o símbolo da marca e os destinos em ícone e rótulo curto;
 * - computador (`lg:`): barra lateral (256 px) com o `Logo`, os destinos em linha e o Jogar como botão `bg-brand`.
 * Em tablet e computador (só nelas, pelo gancho), a lateral envolve o `nav` e traz no pé Notificações (com a contagem) e
 * Menu, que substituem o sino e o atalho de menu dos cabeçalhos das abas. Com uma dessas telas aberta, o atalho fica
 * ativo (`aria-current`) no lugar do destino.
 * Ativo: texto em negrito e moldura no ícone. O Jogar fica em extranegrito quando inativo e em negrito quando ativo
 * (mesma precedência das regras antigas). No escuro, a barra fica preta translúcida, a moldura do item ativo é dourada e o
 * botão Jogar ganha o brilho menta (`--shadow-play`).
 */
const itemClass =
  "flex h-[55px] flex-col items-center justify-center gap-1 border-0 bg-transparent px-1.5 py-px text-[9px] text-ink-muted md:relative md:h-auto md:min-h-16 md:w-full md:rounded-[14px] md:py-1.5 md:text-[10px] md:hover:bg-hover lg:min-h-12 lg:flex-row lg:justify-start lg:gap-3 lg:px-2 lg:text-[13px] lg:font-semibold";
const frameClass = "rounded-[14px] border border-solid border-transparent px-2 py-[5px]";
const frameOnClass = "border-line shadow-[0_2px_6px_#4950571f] noite:border-[#f4de9a55] noite:shadow-none";

export default function BottomNav({
  active,
  onGo,
  playAttention = false,
  notificationCount = 0,
  shortcut = null,
  onShortcut,
}: {
  active: Screen;
  onGo: (screen: Screen) => void;
  /** Busca, proposta, oferta ou partida combinando (`attention` de `GET /me/play`): acende o ponto menta do JOGAR. */
  playAttention?: boolean;
  /** Total do sino (não lidas + pedidos para seguir), no atalho Notificações da lateral. */
  notificationCount?: number;
  /** Tela de atalho aberta agora (Notificações ou Menu): o atalho da lateral fica ativo no lugar do destino. */
  shortcut?: NavShortcut | null;
  /** Abre a tela do atalho da lateral. */
  onShortcut?: (screen: NavShortcut) => void;
}) {
  const wide = useWideLayout();
  const current = wide && shortcut ? null : active;
  const nav = (
    <nav
      className="absolute inset-x-0 bottom-0 z-nav grid h-[calc(82px+env(safe-area-inset-bottom))] grid-cols-5 items-center border-t border-line bg-nav px-1 pt-[7px] pb-[calc(11px+env(safe-area-inset-bottom))] backdrop-blur-[14px] md:static md:mt-6 md:flex md:h-auto md:flex-col md:items-stretch md:gap-1 md:border-t-0 md:bg-transparent md:px-0 md:pt-0 md:pb-0 md:backdrop-blur-none"
      aria-label="Navegação principal"
    >
      {navItems.map(({ screen, label, Icon }) => {
        const on = current === screen;
        return (
          <button
            key={screen}
            className={cn(
              itemClass,
              screen === "play" && "font-extrabold tracking-[0.03em] text-heading lg:my-2 lg:font-extrabold lg:bg-brand lg:tracking-[0.06em] lg:text-on-brand lg:shadow-play lg:hover:bg-brand-hover",
              on && "font-bold text-heading lg:font-bold",
              screen === "play" && on && "lg:text-on-brand",
            )}
            aria-current={on ? "page" : undefined}
            aria-describedby={screen === "play" && playAttention ? "play-attention-note" : undefined}
            onClick={() => onGo(screen)}
          >
            {screen === "play" ? (
              <span className="relative -mt-[25px] grid size-[55px] shrink-0 place-items-center rounded-full border-4 border-solid border-app bg-brand text-on-brand shadow-play md:mt-0 md:size-12 md:border-0 lg:h-8 lg:w-[45px] lg:rounded-none lg:bg-transparent lg:shadow-none">
                <ArenaMark compact className="size-[29px] md:size-[26px] lg:size-[24px]" />
                {playAttention && (
                  <span
                    data-testid="play-attention"
                    aria-hidden="true"
                    className="absolute top-px right-px size-3 rounded-full border-2 border-solid border-app bg-mint lg:top-0 lg:right-1.5"
                  />
                )}
              </span>
            ) : screen === "ranking" ? (
              // Mesma moldura dos outros ícones (invisível quando inativa), para o nome do Ranking ficar na linha deles.
              <span className={cn("grid", frameClass, on && frameOnClass)}>
                <ArenaMark className="h-[21px] w-[27px]" />
              </span>
            ) : (
              <Icon size={21} className={cn("box-content lg:w-[27px]", frameClass, on && frameOnClass)} />
            )}
            <span>{label}</span>
          </button>
        );
      })}
      {playAttention && (
        <span id="play-attention-note" className="sr-only">
          Há uma busca, proposta ou partida em andamento
        </span>
      )}
    </nav>
  );
  if (!wide) return nav;
  const notificationsOn = shortcut === "notifications";
  const menuOn = shortcut === "menu";
  // Lateral de tablet e computador: marca, navegação principal e, no pé, os atalhos de Notificações e Menu.
  return (
    <div
      data-slot="app-sidebar"
      className="flex h-full min-h-0 flex-col overflow-y-auto border-r border-solid border-line bg-nav px-2 py-5 backdrop-blur-[14px] scrollbar-hidden lg:px-4 lg:py-6"
    >
      <div className="flex min-h-9 items-center justify-center text-heading lg:justify-start lg:px-2">
        <ArenaMark className="h-[26px] w-9 lg:hidden" />
        <Logo className="hidden lg:flex" />
      </div>
      {nav}
      <div className="mt-auto flex flex-col gap-1 border-t border-solid border-line pt-3">
        <button
          type="button"
          className={cn(itemClass, notificationsOn && "font-bold text-heading lg:font-bold")}
          aria-label={notificationLabel(notificationCount)}
          aria-current={notificationsOn ? "page" : undefined}
          onClick={() => onShortcut?.("notifications")}
        >
          <Bell size={21} className={cn("box-content lg:w-[27px]", frameClass, notificationsOn && frameOnClass)} />
          <span>Notificações</span>
          {notificationCount > 0 && (
            <span
              aria-hidden="true"
              data-testid="unread-indicator"
              className="absolute top-1.5 left-[calc(50%+6px)] grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[9px] leading-none font-bold text-on-brand tabular-nums ring-2 ring-nav lg:static lg:ml-auto lg:h-5 lg:min-w-5 lg:px-1.5 lg:text-[10px] lg:ring-0"
            >
              {notificationCountText(notificationCount)}
            </span>
          )}
        </button>
        <button
          type="button"
          className={cn(itemClass, menuOn && "font-bold text-heading lg:font-bold")}
          aria-current={menuOn ? "page" : undefined}
          onClick={() => onShortcut?.("menu")}
        >
          <Menu size={21} className={cn("box-content lg:w-[27px]", frameClass, menuOn && frameOnClass)} />
          <span>Menu</span>
        </button>
      </div>
    </div>
  );
}
