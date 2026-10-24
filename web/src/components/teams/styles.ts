import { cva } from 'class-variance-authority'

/*
 * Botões dos protótipos de Times (.btn, .btn.sm, .btn.mint, .btn.line-dk, .btn.secondary): `mint` e `line` sobre a placa
 * `forest`; `brand` e `outline` sobre fundos claros (listas do elenco); `danger` confirma remoções.
 */
export const teamButton = cva('inline-flex min-w-0 items-center justify-center gap-1.5 border border-solid font-bold whitespace-nowrap disabled:opacity-45', {
  variants: {
    tone: {
      mint: 'border-transparent bg-mint text-night',
      line: 'border-white/25 bg-transparent text-white hover:bg-white/8',
      brand: 'border-transparent bg-brand text-on-brand hover:bg-brand-hover',
      outline: 'border-line-strong bg-surface text-brand hover:bg-subtle',
      danger: 'border-transparent bg-danger text-white',
    },
    size: {
      sm: 'min-h-[34px] rounded-[11px] px-[11px] text-[11px] [&_svg]:size-4',
      md: 'min-h-[42px] rounded-control px-3.5 text-[12px] [&_svg]:size-[17px]',
      block: 'min-h-[46px] w-full rounded-control px-4 text-[12.5px] [&_svg]:size-[17px]',
    },
  },
  defaultVariants: { tone: 'mint', size: 'sm' },
})

/** Sobretítulo menta da placa e das telas escuras (.eyebrow dentro de .dk). */
export const darkEyebrow = 'block text-[9px] font-bold tracking-[0.12em] text-mint uppercase'

/** Rótulo de grupo em caixa alta (.grp-lbl, .preview-lbl). */
export const groupLabel = 'mt-4 mb-1 text-[10px] font-extrabold tracking-[0.08em] uppercase'

/** Ação de texto verde (.lnk; menta sobre o escuro com `text-mint`). */
export const textAction = 'min-h-9 border-0 bg-transparent px-0 py-1.5 text-[11px] font-bold text-brand'

/** Erro que fica na tela sobre o escuro (formulário, estado), no lugar de `feedbackVariants`, que é claro. Confirmações viram toast. */
export const darkNotice = cva('mt-3 rounded-[10px] px-2.5 py-2 text-[11.5px] leading-[1.5]', {
  variants: { tone: { error: 'bg-[#b9374940] text-[#ffd0d7]' } },
  defaultVariants: { tone: 'error' },
})
