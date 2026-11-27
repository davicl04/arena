import { useId } from 'react'
import type { CSSProperties } from 'react'
import { useOpenItem } from './useOpenItem'

/*
 * Sanfona da landing ("Mais da Arena"): nome grande e indicador +/−; o primeiro item começa aberto e só um fica aberto
 * por vez, com o título em menta. Abre pelo mouse, pelo foco e pelo clique/toque. O nome é um botão com `aria-expanded`
 * e `aria-controls`, que cobre o item inteiro; o texto fica numa região rotulada por ele (`.landing-sanfona*` em
 * ui.css). Cada item é um bloco da revelação ao rolar.
 */
export function LandingAccordion({ items }: { items: readonly { name: string; text: string }[] }) {
  const { open, itemProps, buttonProps } = useOpenItem()
  const baseId = useId()
  return (
    <div className="landing-sanfona">
      {items.map((item, index) => {
        const buttonId = `${baseId}-botao-${index}`
        const panelId = `${baseId}-painel-${index}`
        return (
          <div
            key={item.name}
            className="landing-sanfona-item"
            data-aberta={open === index || undefined}
            data-reveal=""
            style={{ '--reveal-ordem': index } as CSSProperties}
            {...itemProps(index)}
          >
            <h3 className="landing-sanfona-titulo">
              <button type="button" id={buttonId} className="landing-sanfona-botao" aria-controls={panelId} {...buttonProps(index)}>
                {item.name}
                <span aria-hidden="true" className="landing-sanfona-sinal" />
              </button>
            </h3>
            <div id={panelId} role="region" aria-labelledby={buttonId} className="landing-sanfona-painel">
              <div>
                <p>{item.text}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
