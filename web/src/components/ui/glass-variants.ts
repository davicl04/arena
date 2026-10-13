import { cva } from 'class-variance-authority'

/*
 * Mensagens sobre o vidro escuro (.glass-error, .glass-notice, .glass-muted): erro (`role="alert"`), aviso de
 * sucesso (`role="status"`) e texto neutro centralizado (carregando, lista vazia). Aplique no `p` existente.
 */
export const glassMessageVariants = cva('text-[11.5px]', {
  variants: {
    tone: {
      error: 'rounded-[10px] bg-[#b9374940] px-2.5 py-2 leading-[1.5] text-[#ffd0d7]',
      notice: 'rounded-[10px] bg-[#8fe0b41f] px-2.5 py-2 leading-[1.5] text-[#c9f2db]',
      muted: 'py-3.5 text-center text-[#ffffffb3]',
    },
  },
  defaultVariants: { tone: 'error' },
})
