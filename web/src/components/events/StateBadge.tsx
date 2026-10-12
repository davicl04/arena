import type { ReactNode } from "react";
import { cva } from "class-variance-authority";
import type { StateTone } from "@/data/arena";
import { cn } from "@/lib/utils";

/*
 * Selo de estado dos protótipos (`.est`): pílula de 9,5 px em negrito. `surface="light"` nas listas claras
 * (organizador, comprovantes, administração) e `surface="dark"` sobre o cartaz ou a placa `forest`.
 * Os tons vêm de `eventState`/`entryState` em `data/arena.ts`.
 */
const badgeVariants = cva(
  "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-[3px] text-[9.5px] leading-tight font-extrabold whitespace-nowrap [&_svg]:size-3 [&_svg]:flex-none",
  {
    variants: {
      surface: { light: "", dark: "" },
      tone: { draft: "", pending: "", open: "", live: "", closed: "", danger: "" },
    },
    compoundVariants: [
      { surface: "light", tone: "draft", className: "bg-subtle text-ink-muted" },
      { surface: "light", tone: "pending", className: "bg-warning-bg text-warning" },
      { surface: "light", tone: "open", className: "bg-success-bg text-brand" },
      { surface: "light", tone: "live", className: "bg-forest text-mint" },
      { surface: "light", tone: "closed", className: "bg-[#49505714] text-ink-muted" },
      { surface: "light", tone: "danger", className: "bg-[#fff0f2] text-danger" },
      { surface: "dark", tone: "draft", className: "bg-white/8 text-white/70" },
      { surface: "dark", tone: "pending", className: "bg-[#f6c26b26] text-[#f6c26b]" },
      { surface: "dark", tone: "open", className: "bg-mint text-night" },
      { surface: "dark", tone: "live", className: "bg-mint/15 text-mint" },
      { surface: "dark", tone: "closed", className: "bg-white/8 text-white/55" },
      { surface: "dark", tone: "danger", className: "bg-[#ff8a9a26] text-[#ffb3bd]" },
    ],
    defaultVariants: { surface: "light", tone: "draft" },
  },
);

export interface StateBadgeProps {
  tone: StateTone;
  surface?: "light" | "dark";
  children: ReactNode;
  className?: string;
}

/** Selo de estado (evento, inscrição, comprovante ou decisão). */
export function StateBadge({ tone, surface = "light", children, className }: StateBadgeProps) {
  return (
    <span data-slot="state-badge" data-tone={tone} className={cn(badgeVariants({ tone, surface }), className)}>
      {children}
    </span>
  );
}
