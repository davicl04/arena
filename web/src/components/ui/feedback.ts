import { cva } from 'class-variance-authority'

/*
 * Mensagem em bloco que fica na tela (.error, .success do antigo styles.css): tom `error` (resumo do formulário,
 * sessão expirada, falha do `/me` na entrada). Confirmações passageiras viram toast (`components/ui/toast.tsx`) e
 * erros de carregamento usam `LoadError`. O tom `success` só continua para a `NotificationsPage`, que será migrada
 * depois da conciliação com o plano de notificações.
 */
export const feedbackVariants = cva('my-3 rounded-field p-3 text-[12px] leading-[1.6]', {
  variants: {
    tone: {
      error: 'bg-error-bg text-error',
      success: 'bg-success-bg text-brand',
    },
  },
  defaultVariants: { tone: 'error' },
})
