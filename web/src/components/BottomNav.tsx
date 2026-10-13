import { cn } from "@/lib/utils";
import { navItems } from "../data/arena";
import type { Screen } from "../data/arena";
import { ArenaMark } from "./Brand";

/*
 * Navegação inferior do painel do app, com o botão Jogar em destaque.
 * Ativo: texto em negrito e moldura no ícone. O Jogar fica em extranegrito quando inativo
 * e em negrito quando ativo (mesma precedência das regras antigas). No escuro, a barra fica preta translúcida, a moldura
 * do item ativo é dourada e o botão Jogar ganha o brilho menta (`--shadow-play`).
 */
export default function BottomNav({
  active,
  onGo,
  playAttention = false,
}: {
  active: Screen;
  onGo: (screen: Screen) => void;
  /** Busca, proposta, oferta ou partida combinando (`attention` de `GET /me/play`): acende o ponto menta do JOGAR. */
  playAttention?: boolean;
}) {
  return (
    <nav
      className="absolute inset-x-0 bottom-0 z-nav grid h-[82px] grid-cols-5 items-center border-t border-line bg-nav px-1 pt-[7px] pb-[11px] backdrop-blur-[14px] app-narrow:h-[calc(82px+env(safe-area-inset-bottom))] app-narrow:pb-[calc(11px+env(safe-area-inset-bottom))]"
      aria-label="Navegação principal"
    >
      {navItems.map(({ screen, label, Icon }) => {
        const on = active === screen;
        return (
          <button
            key={screen}
            className={cn(
              "flex h-[55px] flex-col items-center justify-center gap-1 border-0 bg-transparent px-1.5 py-px text-[9px] text-ink-muted",
              screen === "play" && "font-extrabold tracking-[0.03em] text-heading",
              on && "font-bold text-heading",
            )}
            aria-current={on ? "page" : undefined}
            aria-describedby={screen === "play" && playAttention ? "play-attention-note" : undefined}
            onClick={() => onGo(screen)}
          >
            {screen === "play" ? (
              <span className="relative -mt-[25px] grid size-[55px] shrink-0 place-items-center rounded-full border-4 border-solid border-app bg-brand text-on-brand shadow-play">
                <ArenaMark compact className="size-[29px]" />
                {playAttention && (
                  <span
                    data-testid="play-attention"
                    aria-hidden="true"
                    className="absolute top-px right-px size-3 rounded-full border-2 border-solid border-app bg-mint"
                  />
                )}
              </span>
            ) : screen === "ranking" ? (
              <ArenaMark className="h-[21px] w-[27px]" />
            ) : (
              <Icon
                size={21}
                className={cn(
                  "box-content rounded-[14px] border border-solid border-transparent px-2 py-[5px]",
                  on && "border-line shadow-[0_2px_6px_#4950571f] noite:border-[#f4de9a55] noite:shadow-none",
                )}
              />
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
}
