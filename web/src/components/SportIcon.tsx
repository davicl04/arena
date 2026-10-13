import type { Sport } from "../api/client";
import { useTheme } from "../hooks/useTheme";

type IconProps = { size?: number };

/*
 * Ícone provisório da modalidade. No claro, o PNG com fundo branco é multiplicado sobre o fundo. No escuro, o branco
 * apareceria: o ícone vira uma máscara do PNG com alfa (`{sport}-alfa.png`, gerado por `scripts/gerar-icones-alfa.py`)
 * pintada de branco, ou de `--sport-icon-color` (o chip ativo usa o texto sobre a marca). O estilo em linha anula as
 * inversões que telas escuras aplicam ao PNG do claro (`filter`, `mix-blend-mode`).
 * `data-slot="sport-icon"` permite ao chip ajustar tamanho mínimo e inversão quando ativo.
 */
export default function SportIcon({
  sport,
  size = 24,
}: IconProps & { sport: Sport }) {
  const { resolved } = useTheme();
  if (resolved === "dark") {
    const mask = `url(/images/sports/${sport}-alfa.png) center / 138% no-repeat`;
    return (
      <span
        data-slot="sport-icon"
        className="inline-block flex-none"
        aria-hidden="true"
        style={{ width: size, height: size, filter: "none", mixBlendMode: "normal", background: "var(--sport-icon-color, #fff)", mask, WebkitMask: mask }}
      />
    );
  }
  return (
    <span
      data-slot="sport-icon"
      className="inline-flex flex-none items-center justify-center overflow-hidden mix-blend-multiply"
      aria-hidden="true"
      style={{ width: size, height: size }}
    >
      <img
        className="block size-[138%] max-w-none flex-none object-contain"
        src={`/images/sports/${sport}.png`}
        alt=""
      />
    </span>
  );
}

export function FootballIcon(props: IconProps) {
  return <SportIcon sport="futebol" {...props} />;
}

export function TennisIcon(props: IconProps) {
  return <SportIcon sport="tenis" {...props} />;
}

export function RunningIcon(props: IconProps) {
  return <SportIcon sport="corrida" {...props} />;
}
