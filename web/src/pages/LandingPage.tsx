import { Logo } from '@/components/Brand'
import { EnterActions } from '@/components/landing/EnterActions'
import { LandingHero } from '@/components/landing/LandingHero'
import { arenaTagline, landingClosing } from '@/data/landing'
import type { AuthMode } from '@/pages/AuthPage'

/** Âncora do fecho; a seta do hero leva ao primeiro conteúdo depois dele. */
const CLOSING_ID = 'landing-fecho'

/*
 * Landing da web, escura por design nos dois temas (`escuro-por-design`): cabeçalho só com a marca, hero, fecho
 * "Os portões estão abertos." e rodapé. As seções informativas entram entre o hero e o fecho, e a seta do hero aponta
 * para a primeira delas. Os pontos de entrada (o par do hero e o do fecho) chamam `onEnter` com o modo escolhido; quem
 * decide a troca para a tela de entrada é o contêiner da tela pública.
 */
export default function LandingPage({ onEnter }: { onEnter: (mode: AuthMode) => void }) {
  return (
    <div className="escuro-por-design relative min-h-dvh overflow-x-clip bg-app">
      <header className="absolute inset-x-0 top-0 z-[1] px-[clamp(16px,4vw,48px)] py-6">
        <Logo className="text-heading" />
      </header>
      <main id="main">
        <LandingHero onEnter={onEnter} nextId={CLOSING_ID} />
        <section
          id={CLOSING_ID}
          aria-labelledby="landing-fecho-title"
          className="flex flex-col items-center gap-5 px-[clamp(16px,4vw,48px)] py-[clamp(72px,11vw,140px)] text-center"
        >
          <h2 id="landing-fecho-title" className="max-w-[18ch] text-[clamp(30px,4.4vw,52px)] leading-[1.05] tracking-[-0.03em]">
            {landingClosing.title}
          </h2>
          <EnterActions onEnter={onEnter} />
        </section>
      </main>
      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-solid border-line px-[clamp(16px,4vw,48px)] py-7 text-[12px] text-ink-muted">
        <Logo className="text-heading" />
        <span>{arenaTagline}</span>
      </footer>
    </div>
  )
}
