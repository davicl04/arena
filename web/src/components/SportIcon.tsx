import type { Sport } from "../api/client";
import { SELO_COROA, SELO_RAIO_DISCO, SELO_VIEWBOX, SELOS_GEOMETRIA, SIMBOLO_VIEWBOX } from "../data/selos";
import { cn } from "../lib/utils";
import { IconTile } from "./ui/icon-tile";

/** Formas vetoriais do ícone de modalidade (geometria de `src/data/selos.ts`, gerada por `scripts/gerar_selos.py`). */
export type SportIconForma = "selo" | "aro" | "marca";

type SportIconProps =
  /** Selo: disco, coroa, anel e símbolo, nas cores dos tokens `selo-disco` e `selo-detalhe` (mudam com o tema por CSS). */
  | { sport: Sport; forma: "selo"; size?: number; className?: string }
  /**
   * Símbolo com aro (desenho a 85% da caixa) ou marca d'água (só o símbolo, ocupando a caixa), numa cor só.
   * `cor` é qualquer cor CSS, como `var(--color-on-brand)`; sem ela, o ícone herda a cor do texto (`currentColor`).
   */
  | { sport: Sport; forma: "aro" | "marca"; cor?: string; size?: number; className?: string };

/* O símbolo com aro ocupa 85% da caixa: a mesma geometria numa caixa de visão 1/0,85 maior. */
const LADO_ARO = (2 * SELO_RAIO_DISCO) / 0.85;
const VIEWBOX_ARO = `${-LADO_ARO / 2} ${-LADO_ARO / 2} ${LADO_ARO} ${LADO_ARO}`;

/**
 * Ícone de modalidade, decorativo (`aria-hidden`), com `data-slot="sport-icon"`. A forma é sempre escolhida por `forma`,
 * nunca pela medida: `selo` (nos ladrilhos redondos, ver `SeloLadrilho`), `aro` (tamanhos pequenos) e `marca` (marca
 * d'água). As três desenham SVG em linha, sem PNG, máscara ou inversão; a cor vem de tokens ou de `cor`, então a troca de
 * tema recolore pelo CSS, sem renderizar de novo nem piscar.
 */
export default function SportIcon(props: SportIconProps) {
  const { sport, forma, size = 24, className } = props;
  const geometria = SELOS_GEOMETRIA[sport];
  const comum = {
    "data-slot": "sport-icon",
    "data-forma": forma,
    "aria-hidden": true,
    focusable: false,
    width: size,
    height: size,
    className: cn("inline-block flex-none", className),
  } as const;
  if (forma === "selo") {
    return (
      <svg {...comum} viewBox={SELO_VIEWBOX}>
        <circle r={SELO_RAIO_DISCO} className="fill-selo-disco" />
        <g className="fill-selo-detalhe">
          <path d={SELO_COROA} />
          <path d={geometria.simbolo} />
        </g>
      </svg>
    );
  }
  const cor = props.cor ?? "currentColor";
  return forma === "aro" ? (
    <svg {...comum} viewBox={VIEWBOX_ARO}>
      <path d={geometria.simboloComAro} style={{ fill: cor }} />
    </svg>
  ) : (
    <svg {...comum} viewBox={SIMBOLO_VIEWBOX}>
      <path d={geometria.simbolo} style={{ fill: cor }} />
    </svg>
  );
}

/**
 * Ladrilho redondo com o selo da modalidade: o quadro de ícone redondo (`IconTile shape="round"`, tingido `icon-tile`)
 * no tamanho de cada contexto, com o selo a 75% do diâmetro.
 */
export function SeloLadrilho({ sport, size }: { sport: Sport; size: number }) {
  return (
    <IconTile shape="round" aria-hidden="true" className="flex-none" style={{ width: size, height: size }}>
      <SportIcon sport={sport} forma="selo" size={Math.round(size * 0.75)} />
    </IconTile>
  );
}
