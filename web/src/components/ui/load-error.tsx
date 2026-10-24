import { ApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/*
 * Erro de carregamento (plano de toasts, A5): o conteúdo da tela ou da seção não veio. `size="screen"` ocupa a tela, com o
 * Coliseu em `ink` a 15% (12% de branco no `tone="dark"`), título em Sora 16 px, texto de até ~30 caracteres e o botão
 * primário "Tentar novamente"; `size="section"` é a variante compacta, para uma seção dentro de uma tela (comentários,
 * histórico, elenco): sem o Coliseu, título de 14 px e botão de texto. Se a falha foi de conexão (`cause` é um `ApiError`
 * com `isConnection`), o texto vira "Sem conexão com a ARENA. Vamos tentar de novo assim que voltar.": `useResource` e
 * `usePagedList` já recarregam sozinhos, uma vez, quando a conexão volta. É `role="alert"`, como os blocos que substitui.
 */
export const CONNECTION_LOAD_TEXT = 'Sem conexão com a ARENA. Vamos tentar de novo assim que voltar.'

export function LoadError({ title = 'Não foi possível carregar', text, onRetry, size, tone = 'light', cause, className }: {
  title?: string
  /** O que aconteceu; ignorado quando `cause` é uma falha de conexão. */
  text: string
  onRetry: () => void
  size: 'screen' | 'section'
  tone?: 'light' | 'dark'
  /** O erro lançado pelo carregamento (para reconhecer a falta de conexão). */
  cause?: unknown
  className?: string
}) {
  const dark = tone === 'dark'
  const screen = size === 'screen'
  const connection = cause instanceof ApiError && cause.isConnection
  return <div role="alert" data-slot="load-error" data-size={size} data-tone={tone}
    className={cn('grid justify-items-center text-center', screen ? 'gap-2 px-6 py-12' : 'gap-1 px-3 py-5', dark ? 'text-white' : 'text-ink', className)}>
    {screen && <span aria-hidden="true" className={cn('mb-2 h-[86px] w-[150px] bg-current mask-[url(/images/brand/coliseum.svg)] mask-contain mask-center mask-no-repeat', dark ? 'opacity-[0.12]' : 'opacity-15')} />}
    <h2 className={cn('font-display', screen ? 'text-[16px]' : 'text-[14px]')}>{title}</h2>
    <p className={cn('m-0 max-w-[30ch] text-[12px] leading-[1.6]', dark ? 'text-white/65' : 'text-ink-muted')}>{connection ? CONNECTION_LOAD_TEXT : text}</p>
    {screen
      ? <Button type="button" variant={dark ? 'glass' : 'primary'} className="mt-2" onClick={onRetry}>Tentar novamente</Button>
      : <Button type="button" variant={dark ? 'glass-link' : 'text'} className={dark ? undefined : 'min-h-9 py-1'} onClick={onRetry}>Tentar novamente</Button>}
  </div>
}
