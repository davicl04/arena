import { useState } from 'react'
import type { PointerEvent } from 'react'

/*
 * Item aberto das colunas e da sanfona da landing: o primeiro começa aberto e só um fica aberto por vez. Abre pelo
 * ponteiro do mouse (o toque não abre ao passar, para a rolagem no celular não mexer nas colunas), pelo foco e pelo
 * clique/toque. Escolher o item já aberto o mantém aberto.
 */
export function useOpenItem() {
  const [open, setOpen] = useState(0)
  return {
    open,
    /** Para o contêiner do item: abre ao passar o mouse. */
    itemProps: (index: number) => ({
      onPointerEnter: (event: PointerEvent) => {
        if (event.pointerType === 'mouse') setOpen(index)
      },
    }),
    /** Para o botão do item: abre pelo foco e pelo clique/toque, e expõe o estado expandido. */
    buttonProps: (index: number) => ({
      'aria-expanded': open === index,
      onFocus: () => setOpen(index),
      onClick: () => setOpen(index),
    }),
  }
}
