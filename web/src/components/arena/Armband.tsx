import { cn } from "@/lib/utils";

export interface ArmbandProps {
  /**
   * `corner` (padrão): selo menta "C" no canto da foto, no elenco e nos convites; o elemento pai precisa
   * de `relative`. `inline`: braçadeira dourada ao lado do nome, no chat da partida (C1).
   */
  variant?: "corner" | "inline";
  /** Tamanho do selo `corner`: sm 13 px (faixa do convite) · md 15 px (padrão) · lg 20 px (folha do atleta). */
  size?: "sm" | "md" | "lg";
  /** Contorno do selo `corner`: `light` (branco, sobre fundos claros) ou `dark` (sobre a placa `forest`). */
  ring?: "light" | "dark";
  className?: string;
}

const cornerSizes = {
  sm: "size-[13px] text-[7px]",
  md: "size-[15px] text-[8.5px]",
  lg: "size-5 text-[11px]",
};

/** Braçadeira de capitão "C", que identifica os representantes do time (`aria-label="Representante"`). */
export function Armband({
  variant = "corner",
  size = "md",
  ring = "light",
  className,
}: ArmbandProps) {
  if (variant === "inline")
    return (
      <span
        data-slot="armband"
        role="img"
        aria-label="Representante"
        title="Representante"
        className={cn("inline-grid flex-none place-items-center self-center", className)}
      >
        <svg
          viewBox="0 0 22 14"
          aria-hidden="true"
          className="block h-[13px] w-5 drop-shadow-[0_1px_1px_#0003]"
        >
          <rect x="1" y="1" width="20" height="12" rx="3" fill="#f2c14e" />
          <path d="M5 1 V13 M17 1 V13" className="stroke-forest" strokeOpacity={0.25} />
          <text
            x="11"
            y="10.4"
            textAnchor="middle"
            fontSize="8.5"
            className="fill-forest font-display font-extrabold"
          >
            C
          </text>
        </svg>
      </span>
    );
  return (
    <span
      data-slot="armband"
      role="img"
      aria-label="Representante"
      title="Representante"
      className={cn(
        "absolute -right-1 -bottom-[3px] grid place-items-center rounded-[4px] border-[1.5px] border-solid bg-mint font-display leading-none font-extrabold text-night",
        cornerSizes[size],
        ring === "dark" ? "border-forest" : "border-white",
        className,
      )}
    >
      C
    </span>
  );
}
