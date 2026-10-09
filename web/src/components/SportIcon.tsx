import type { Sport } from "../api/client";

type IconProps = { size?: number };

export default function SportIcon({
  sport,
  size = 24,
}: IconProps & { sport: Sport }) {
  return (
    <span
      className="modality-icon"
      aria-hidden="true"
      style={{ width: size, height: size }}
    >
      <img src={`/images/sports/${sport}.png`} alt="" />
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
