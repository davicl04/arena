import { EnterActions } from '@/components/landing/EnterActions'
import { landingHero } from '@/data/landing'
import { prefersReducedMotion } from '@/lib/motion'
import type { AuthMode } from '@/pages/AuthPage'

/*
 * Hero "Estádio à noite", em tela cheia: refletores, brilho do gramado e arco do campo (decoração oculta para leitores
 * de tela, `.landing-*` em ui.css), o título com "arena" em menta, o texto de apoio e o par de entrada, com entrada
 * escalonada (`motion-safe:animate-hero-in`, atraso por `--hero-delay`). A seta de rolagem leva ao conteúdo seguinte
 * (`nextId`), com rolagem suave só sem "reduzir movimento".
 */
export function LandingHero({ onEnter, nextId }: { onEnter: (mode: AuthMode) => void; nextId: string }) {
  const { title } = landingHero
  return (
    <section aria-labelledby="landing-title" className="relative flex min-h-dvh flex-col overflow-clip">
      <div aria-hidden="true" className="landing-stage">
        <span className="landing-beam landing-beam-l" />
        <span className="landing-beam landing-beam-r" />
        <span className="landing-glow" />
        <span className="landing-pitch" />
      </div>
      <div className="relative flex flex-1 flex-col items-center justify-center gap-[18px] px-4 pt-24 pb-[110px] text-center">
        <h1
          id="landing-title"
          className="max-w-[16ch] text-[clamp(40px,7.4vw,92px)] leading-[1.02] tracking-[-0.03em] [--hero-delay:150ms] motion-safe:animate-hero-in"
        >
          {title.before}
          <span className="text-mint">{title.highlight}</span>
          {title.after}
        </h1>
        <p className="max-w-[48ch] text-[16px] leading-[1.7] text-ink-muted [--hero-delay:240ms] motion-safe:animate-hero-in">
          {landingHero.lede}
        </p>
        <div className="mt-2.5 [--hero-delay:330ms] motion-safe:animate-hero-in">
          <EnterActions onEnter={onEnter} />
        </div>
      </div>
      <ScrollCue targetId={nextId} />
    </section>
  )
}

/** Seta fina de rolagem, com balanço suave; leva ao início da seção `targetId`. */
function ScrollCue({ targetId }: { targetId: string }) {
  return (
    <button
      type="button"
      aria-label={landingHero.scrollLabel}
      className="absolute bottom-[26px] left-1/2 grid h-16 w-12 -translate-x-1/2 place-items-center rounded-[24px] border-0 bg-transparent text-info-soft hover:text-mint"
      onClick={() =>
        document
          .getElementById(targetId)
          ?.scrollIntoView?.({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
      }
    >
      <svg
        viewBox="0 0 22 44"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="h-11 w-[22px] motion-safe:animate-bob"
      >
        <path d="M11 2v38" />
        <path d="M3 32l8 8 8-8" />
      </svg>
    </button>
  )
}
