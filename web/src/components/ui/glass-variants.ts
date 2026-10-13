import { cva } from 'class-variance-authority'

/*
 * Mensagens sobre o vidro escuro (.glass-error, .glass-muted): erro que fica na tela (`role="alert"`, formulário) e
 * texto neutro centralizado (carregando, lista vazia). Aplique no `p` existente. Confirmações viram toast.
 */
export const glassMessageVariants = cva('text-[11.5px]', {
  variants: {
    tone: {
      error: 'rounded-[10px] bg-[#b9374940] px-2.5 py-2 leading-[1.5] text-[#ffd0d7]',
      muted: 'py-3.5 text-center text-[#ffffffb3]',
    },
  },
  defaultVariants: { tone: 'error' },
})
