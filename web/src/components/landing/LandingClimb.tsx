import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { tierOrder, tiers, tierTints } from '@/data/arena'
import { landingClimb } from '@/data/landing'
import { useScrollProgress } from '@/hooks/useLandingScroll'

/** Os cinco elos, do Bronze ao Lendário: nome e brasão de `tiers`, tom de `tierTints` e o texto da landing. */
const climbTiers = tierOrder.map(key => ({
  key,
  name: tiers[key].name,
  image: tiers[key].image,
  tone: tierTints[key],
  text: landingClimb.texts[key],
}))

/** Elo ativo para o progresso da seção (0 a 1): cada elo ocupa uma fatia igual da rolagem. */
function climbIndex(progress: number, count: number = climbTiers.length): number {
  return Math.min(count - 1, Math.max(0, Math.floor(progress * count)))
}

const tone = (value: string) => ({ '--elo-tom': value }) as CSSProperties
const on = (active: boolean) => (active ? '' : undefined)

/*
 * Subida de elo, entre as modalidades e "Como funciona". Explicativa: nenhum elo é atribuído a uma pessoa, e não há
 * rating, pontos nem posições.
 * - Com movimento (`useScrollProgress` ativo): a seção é alta e o palco fica preso na tela (`data-presa`). O progresso
 *   da rolagem escolhe o elo ativo: brasão, nome e texto trocam por opacidade e deslocamento, o fundo radial passa ao
 *   tom do elo, e o trilho vertical se preenche em dourado pela variável `--progresso` que o hook escreve na seção.
 * - Com "reduzir movimento" (ou fora da landing): sem rolagem presa, sem trilho e sem troca; os cinco elos aparecem em
 *   sequência, cada um no seu tom.
 * Nos dois casos, os cinco nomes e textos ficam na leitura (a troca só usa opacidade); brasões, fundo e trilho são
 * decorativos.
 */
export function LandingClimb() {
  const ref = useRef<HTMLElement>(null)
  const [active, setActive] = useState(0)
  const pinned = useScrollProgress(ref, progress => setActive(climbIndex(progress)))
  const current = (index: number) => on(pinned && index === active)
  return (
    <section
      ref={ref}
      aria-labelledby="landing-elo-title"
      className="landing-elo"
      data-presa={on(pinned)}
      data-elo={pinned ? climbTiers[active].key : undefined}
    >
      <div className="landing-elo-palco">
        {pinned && (
          <div className="landing-elo-fundo" aria-hidden="true">
            {climbTiers.map((tier, index) => <span key={tier.key} style={tone(tier.tone)} data-ativo={current(index)} />)}
          </div>
        )}
        <h2 id="landing-elo-title" className="landing-elo-sobretitulo">{landingClimb.eyebrow}</h2>
        <div className="landing-elo-corpo">
          {pinned && (
            <div className="landing-elo-trilho" aria-hidden="true">
              {climbTiers.map((tier, index) => (
                <span key={tier.key} style={{ '--elo-degrau': index } as CSSProperties} data-ativo={current(index)}>
                  {tier.name}
                </span>
              ))}
            </div>
          )}
          <ol className="landing-elo-lista">
            {climbTiers.map((tier, index) => (
              <li key={tier.key} className="landing-elo-item" style={tone(tier.tone)} data-ativo={current(index)}>
                <img className="landing-elo-brasao" src={tier.image} alt="" width={260} height={146} />
                <div>
                  <h3 className="landing-elo-nome">{tier.name}</h3>
                  <p>{tier.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
