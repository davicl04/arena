import { useRef } from 'react'
import type { CSSProperties } from 'react'
import { Logo } from '@/components/Brand'
import { EnterActions } from '@/components/landing/EnterActions'
import { LandingHero } from '@/components/landing/LandingHero'
import { LandingMore, LandingSports, LandingSteps } from '@/components/landing/LandingSections'
import { arenaTagline, landingClosing } from '@/data/landing'
import { LandingScrollContext, useLandingScroll } from '@/hooks/useLandingScroll'
import type { AuthMode } from '@/pages/AuthPage'

/** Âncora do fecho. */
const CLOSING_ID = 'landing-fecho'
/** Âncora das modalidades, a primeira seção depois do hero: a seta de rolagem leva para cá. */
const SPORTS_ID = 'landing-modalidades'

/*
 * Landing da web, escura por design nos dois temas (`escuro-por-design`): cabeçalho só com a marca, hero, modalidades
 * em colunas, "Como funciona" em colunas, "Mais da Arena" em sanfona, fecho "Os portões estão abertos." e rodapé. A
 * seta do hero leva às modalidades. Os pontos de entrada (o par do hero e o do fecho) chamam `onEnter` com o modo
 * escolhido; quem decide a troca para a tela de entrada é o contêiner da tela pública. O hook de rolagem da landing
 * revela os blocos `data-reveal` e fornece às seções o progresso das seções presas.
 */
export default function LandingPage({ onEnter }: { onEnter: (mode: AuthMode) => void }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const scroll = useLandingScroll(rootRef)
  return (
    <LandingScrollContext value={scroll}>
      <div ref={rootRef} className="escuro-por-design relative min-h-dvh overflow-x-clip bg-app">
        <header className="absolute inset-x-0 top-0 z-[1] px-[clamp(16px,4vw,48px)] py-6">
          <Logo className="text-heading" />
        </header>
        <main id="main">
          <LandingHero onEnter={onEnter} nextId={SPORTS_ID} />
          <LandingSports id={SPORTS_ID} />
          {/* A subida de elo entra aqui, entre as modalidades e "Como funciona". */}
          <LandingSteps />
          <LandingMore />
          <section
            id={CLOSING_ID}
            aria-labelledby="landing-fecho-title"
            className="flex flex-col items-center gap-5 px-[clamp(16px,4vw,48px)] py-[clamp(72px,11vw,140px)] text-center"
          >
            <h2 id="landing-fecho-title" data-reveal="" className="max-w-[18ch] text-[clamp(30px,4.4vw,52px)] leading-[1.05] tracking-[-0.03em]">
              {landingClosing.title}
            </h2>
            <div data-reveal="" style={{ '--reveal-ordem': 1 } as CSSProperties}>
              <EnterActions onEnter={onEnter} />
            </div>
          </section>
        </main>
        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-solid border-line px-[clamp(16px,4vw,48px)] py-7 text-[12px] text-ink-muted">
          <Logo className="text-heading" />
          <span>{arenaTagline}</span>
        </footer>
      </div>
    </LandingScrollContext>
  )
}
