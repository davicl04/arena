import { cva } from 'class-variance-authority'

/*
 * Mensagem de retorno em bloco (.error, .notice, .success do antigo styles.css): tom `error` (erro e aviso
 * de sessão/conexão) ou `success`. Aplique no elemento que já existe (`p` ou `div`), com o papel
 * acessível de quem usa (`role="alert"` ou `role="status"`). Botão de nova tentativa: `Button variant="text"`.
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
