import type { Sport } from "../api/client";

type IconProps = { size?: number };

/*
 * Ícone provisório da modalidade (PNG com fundo branco, multiplicado sobre o fundo).
 * `data-slot="sport-icon"` permite ao chip ajustar tamanho mínimo e inversão quando ativo.
 */
export default function SportIcon({
  sport,
  size = 24,
}: IconProps & { sport: Sport }) {
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
