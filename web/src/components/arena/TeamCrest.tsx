import { useId, useState } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { apiUrl } from "@/api/client";
import { cn } from "@/lib/utils";
import { teamInitials } from "@/utils/teamInitials";

/* Contorno do escudo (viewBox 40×44), o mesmo dos protótipos de Times e do Jogar. */
const shield = "M20 2 L37 8 V21 C37 31 29 38 20 42 C11 38 3 31 3 21 V8 Z";

/*
 * Tamanhos (largura × altura) dos protótipos: xs 20×22 (linhas da árvore, tabela cruzada, chips) ·
 * sm 26×29 (árvore espelhada, pílulas, faixa do convite, notificações) · md 34×37 (carteirinha C5) ·
 * lg 52×57 (cabeçalhos) · xl 78×86 (destaque da placa) · 2xl 120×132 (prévia do Criar time).
 */
const crestVariants = cva("inline-block flex-none", {
  variants: {
    size: {
      xs: "h-[22px] w-5",
      sm: "h-[29px] w-[26px]",
      md: "h-[37px] w-[34px]",
      lg: "h-[57px] w-[52px]",
      xl: "h-[86px] w-[78px]",
      "2xl": "h-[132px] w-[120px]",
    },
  },
  defaultVariants: { size: "md" },
});
export type TeamCrestSize = NonNullable<VariantProps<typeof crestVariants>["size"]>;

export interface TeamCrestProps {
  /** Nome do time: texto alternativo ("Brasão de …") e, sem `initials`, as iniciais do escudo neutro. */
  name: string;
  /** Iniciais vindas da API (`initials`); sem elas, calculadas do nome pela mesma regra do servidor. */
  initials?: string;
  /** Caminho do brasão enviado, como as fotos (resolvido por `apiUrl`). Sem ele, ou se falhar, usa o escudo neutro. */
  path?: string | null;
  size?: TeamCrestSize;
  /** Use quando o nome do time já aparece ao lado: o brasão fica oculto para leitores de tela. */
  decorative?: boolean;
  className?: string;
}

/**
 * Brasão do time: a imagem enviada recortada no escudo, com filete claro, ou o escudo neutro com as
 * iniciais. Times não têm cores próprias; o neutro usa os tons do aplicativo.
 */
export function TeamCrest({
  name,
  initials,
  path,
  size,
  decorative = false,
  className,
}: TeamCrestProps) {
  const clipId = `crest-${useId().replace(/[^\w-]/g, "")}`;
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const image = path && failedPath !== path ? path : null;
  const a11y = decorative
    ? { "aria-hidden": true as const }
    : { role: "img", "aria-label": `Brasão de ${name}` };
  return (
    <svg
      data-slot="team-crest"
      viewBox="0 0 40 44"
      className={cn(crestVariants({ size }), className)}
      {...a11y}
    >
      {image ? (
        <>
          <defs>
            <clipPath id={clipId}>
              <path d={shield} />
            </clipPath>
          </defs>
          <path d={shield} className="fill-tile" />
          <image
            href={apiUrl(image)}
            width="40"
            height="44"
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clipId})`}
            onError={() => setFailedPath(image)}
          />
          <path d={shield} fill="none" stroke="#fff" strokeOpacity={0.55} strokeWidth={1.6} />
        </>
      ) : (
        <>
          <path d={shield} className="fill-tile stroke-line-strong" strokeWidth={1.4} />
          <text
            x="20"
            y="25"
            textAnchor="middle"
            fontSize="11"
            className="fill-ink font-display font-extrabold"
          >
            {initials || teamInitials(name)}
          </text>
        </>
      )}
    </svg>
  );
}
