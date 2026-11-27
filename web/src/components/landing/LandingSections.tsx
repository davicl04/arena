import { sports } from '@/api/client'
import SportIcon from '@/components/SportIcon'
import { landingMore, landingSectionTitles, landingSportDetails, landingSteps, stepLabel } from '@/data/landing'
import { ExpandableColumns } from './ExpandableColumns'
import type { ColumnItem } from './ExpandableColumns'
import { LandingAccordion } from './LandingAccordion'
import { RomanNumeral } from './RomanNumeral'

/*
 * Seções informativas da landing, entre o hero e o fecho. Nenhuma tem título visível acima: o `h2` de cada uma fica só
 * para leitores de tela, mantendo a ordem dos títulos (h1 do hero, h2 da seção, h3 das colunas e dos itens).
 */

const sportColumns: ColumnItem[] = sports.map(sport => {
  const details = landingSportDetails[sport.value]
  return {
    key: sport.value,
    tone: details.tone,
    kicker: sport.symbol,
    title: sport.label,
    // Marca d'água da modalidade: só o símbolo, na cor de título (`.landing-coluna-marca`).
    decoration: <span className="landing-coluna-marca"><SportIcon sport={sport.value} forma="marca" size={480} /></span>,
    content: (
      <>
        <p>{details.description}</p>
        <ul className="landing-coluna-etiquetas">
          {details.tags.map(tag => <li key={tag}>{tag}</li>)}
        </ul>
      </>
    ),
  }
})

const stepColumns: ColumnItem[] = landingSteps.map(step => ({
  key: String(step.numeral),
  tone: step.tone,
  kicker: stepLabel(step.numeral),
  kickerHidden: true,
  title: step.title,
  decoration: <RomanNumeral value={step.numeral} />,
  content: <p>{step.text}</p>,
}))

/** Modalidades em colunas, logo depois do hero (a seta de rolagem do hero leva para cá). */
export function LandingSports({ id }: { id: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="landing-secao-colunas">
      <h2 id={`${id}-title`} className="sr-only">{landingSectionTitles.sports}</h2>
      <ExpandableColumns items={sportColumns} variant="modalidades" />
    </section>
  )
}

/** "Como funciona": quatro passos nas mesmas colunas, com numerais romanos. */
export function LandingSteps() {
  return (
    <section aria-labelledby="landing-passos-title" className="landing-secao-colunas">
      <h2 id="landing-passos-title" className="sr-only">{landingSectionTitles.steps}</h2>
      <ExpandableColumns items={stepColumns} variant="passos" />
    </section>
  )
}

/** "Mais da Arena": Times, Campeonatos, Comunidade e Privacidade, numa sanfona. */
export function LandingMore() {
  return (
    <section aria-labelledby="landing-mais-title" className="px-[clamp(16px,4vw,48px)] py-[clamp(72px,11vw,140px)]">
      <h2 id="landing-mais-title" className="sr-only">{landingSectionTitles.more}</h2>
      <div className="mx-auto max-w-[1084px]">
        <LandingAccordion items={landingMore} />
      </div>
    </section>
  )
}
