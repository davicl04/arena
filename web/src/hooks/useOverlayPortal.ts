import { Fragment, createElement } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useDialogContainer } from '@/components/ui/dialog'
import { overlayScrim } from '@/components/ui/overlay-variants'
import { useWideLayout } from './useLayout'

/**
 * Folhas e telas cheias em tablet e computador (ticket 02 da web responsiva). No celular nada muda: a sobreposição fica
 * onde a tela a renderiza. Em tela larga ela entra por portal no `app-frame` (o contêiner do `DialogContainerProvider`),
 * para o painel centralizar na janela e o fundo cobrir a navegação lateral mesmo quando a tela vive dentro de um `main`
 * que contém o posicionamento (o Perfil usa `@container-size`). `scrim: true` acrescenta, só em tela larga, o fundo
 * escurecido de quem não tem um (telas cheias); ele não fecha ao clique.
 *
 * Cruzar 768 px com a sobreposição aberta a remonta (muda de lugar na árvore); o foco volta a ela (useDialogFocus).
 * Quem chama o gancho continua montado e guarda o próprio estado, mas os nós do DOM e os componentes filhos são
 * recriados: um efeito preso a um nó (posição de rolagem, IntersectionObserver, ouvinte num elemento) depende de `wide`
 * para seguir o nó novo (PostViewer), e o estado que precisa sobreviver fica em quem chama, não num filho.
 */
export function useOverlayPortal() {
  const container = useDialogContainer()
  const wide = useWideLayout()
  function render(node: ReactNode, { scrim = false } = {}): ReactNode {
    if (!wide) return node
    const content = scrim
      ? createElement(Fragment, null, createElement('div', { 'data-slot': 'overlay-scrim', 'aria-hidden': true, className: overlayScrim }), node)
      : node
    return container ? createPortal(content, container) : content
  }
  return { wide, render }
}
