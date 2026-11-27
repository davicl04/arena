import { useId } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useOpenItem } from './useOpenItem'

export type ColumnItem = {
  key: string
  /** Cor de fundo da coluna (valor CSS, em geral um token `var(--color-…-tint)`). */
  tone: string
  /** Linha curta acima do título ("01", "Passo 01"). */
  kicker: string
  title: string
  /** Decoração (marca d'água, numeral), oculta para leitores de tela e posicionada por quem chama. */
  decoration?: ReactNode
  /** Conteúdo mostrado só com a coluna aberta. */
  content: ReactNode
}

/*
 * Colunas expansíveis da landing (modalidades e "Como funciona"): colunas altas lado a lado, cada uma no seu tom; a
 * aberta cresce e mostra o conteúdo. A primeira começa aberta e só uma fica aberta por vez; abrem pelo mouse, pelo foco
 * e pelo clique/toque. O título é um botão com `aria-expanded` e `aria-controls`, que cobre a coluna inteira (clique em
 * qualquer ponto) e põe o foco visível em volta dela. O nome do botão leva a linha curta ("Passo 01 Crie sua conta"),
 * para não se confundir com os convites da landing. Em telas estreitas, viram faixas empilhadas, com a aberta maior
 * (`.landing-colunas*` em ui.css). Cada coluna é um bloco da revelação ao rolar (`data-reveal`).
 */
export function ExpandableColumns({ items, variant }: { items: readonly ColumnItem[]; variant: 'modalidades' | 'passos' }) {
  const { open, itemProps, buttonProps } = useOpenItem()
  const baseId = useId()
  return (
    <ul className="landing-colunas" data-variante={variant}>
      {items.map((item, index) => {
        const panelId = `${baseId}-${item.key}-painel`
        const kickerId = `${baseId}-${item.key}-linha`
        const buttonId = `${baseId}-${item.key}-botao`
        const isOpen = open === index
        return (
          <li
            key={item.key}
            className="landing-coluna"
            data-aberta={isOpen || undefined}
            data-reveal=""
            style={{ '--coluna-tom': item.tone, '--reveal-ordem': index } as CSSProperties}
            {...itemProps(index)}
          >
            {item.decoration ? (
              <span aria-hidden="true" className="landing-coluna-decoracao">
                {item.decoration}
              </span>
            ) : null}
            <span id={kickerId} className="landing-coluna-kicker">{item.kicker}</span>
            <h3 className="landing-coluna-titulo">
              <button
                type="button"
                id={buttonId}
                className="landing-coluna-botao"
                aria-labelledby={`${kickerId} ${buttonId}`}
                aria-controls={panelId}
                {...buttonProps(index)}
              >
                {item.title}
              </button>
            </h3>
            <div id={panelId} className="landing-coluna-painel">
              <div>{item.content}</div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
