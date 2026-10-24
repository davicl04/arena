import { cva } from 'class-variance-authority'

/*
 * Mensagem em bloco que fica na tela (.error do antigo styles.css): tom `error` (resumo do formulário, sessão expirada,
 * falha do `/me` na entrada, "Carregar mais" que falhou). Confirmações passageiras viram toast
 * (`components/ui/toast.tsx`) e erros de carregamento usam `LoadError`.
 */
export const feedbackVariants = cva('my-3 rounded-field p-3 text-[12px] leading-[1.6]', {
  variants: {
    tone: {
      error: 'bg-error-bg text-error',
    },
  },
  defaultVariants: { tone: 'error' },
})
