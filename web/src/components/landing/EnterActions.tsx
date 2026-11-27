import { Button } from '@/components/ui/button'
import { landingEntry } from '@/data/landing'
import type { AuthMode } from '@/pages/AuthPage'

/*
 * Par de entrada da landing (hero e fecho): "Entrar na Arena" abre a tela de entrada no modo Entrar e, abaixo,
 * "Primeira vez por aqui? Crie sua conta →" abre no modo Criar conta. A seta desliza no hover e no foco.
 */
export function EnterActions({ onEnter }: { onEnter: (mode: AuthMode) => void }) {
  return (
    <div className="flex flex-col items-center gap-3.5">
      <Button type="button" className="h-[52px] px-7 text-[15px]" onClick={() => onEnter('login')}>
        {landingEntry.enter}
      </Button>
      <p className="text-[14px] text-ink-muted">
        {landingEntry.firstTime}{' '}
        <button
          type="button"
          className="group inline-flex min-h-6 items-center gap-1 border-0 bg-transparent p-0 font-bold text-mint"
          onClick={() => onEnter('register')}
        >
          {landingEntry.register}
          <span
            aria-hidden="true"
            className="inline-block group-hover:translate-x-1 group-focus-visible:translate-x-1 motion-safe:transition-transform motion-safe:duration-250"
          >
            →
          </span>
        </button>
      </p>
    </div>
  )
}
