import { useSyncExternalStore } from 'react'

/*
 * Faixa de layout da web responsiva: celular (até 767 px), tablet (768 a 1023 px) e computador (a partir de 1024 px).
 *
 * Fonte única no JavaScript; a do CSS são as variantes `md:` (tablet e acima) e `lg:` (computador) do Tailwind, com os
 * mesmos limites (`--breakpoint-md` e `--breakpoint-lg`, em `ui.css`, seção "Estrutura responsiva"). Use o gancho só
 * para diferenças de ESTRUTURA (elementos que existem numa faixa e não na outra, como os itens Notificações e Menu da
 * lateral ou o sino dos cabeçalhos das abas); diferenças de aparência vão por CSS, com as variantes. Sem `matchMedia`
 * (testes no jsdom, ambiente sem janela), responde celular: o DOM do celular é o padrão.
 */
export type Layout = 'celular' | 'tablet' | 'computador'

/** Consultas das faixas largas; repetem `--breakpoint-md` (48rem = 768 px) e `--breakpoint-lg` (64rem = 1024 px). */
export const LAYOUT_QUERIES = {
  tablet: '(min-width: 48rem)',
  computador: '(min-width: 64rem)',
} as const

function mediaLists(): MediaQueryList[] | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return [window.matchMedia(LAYOUT_QUERIES.tablet), window.matchMedia(LAYOUT_QUERIES.computador)]
}

function readLayout(): Layout {
  const lists = mediaLists()
  if (!lists) return 'celular'
  const [tablet, computador] = lists
  if (computador.matches) return 'computador'
  return tablet.matches ? 'tablet' : 'celular'
}

function subscribe(onChange: () => void): () => void {
  const lists = mediaLists()
  if (!lists) return () => {}
  for (const list of lists) list.addEventListener?.('change', onChange)
  return () => {
    for (const list of lists) list.removeEventListener?.('change', onChange)
  }
}

/** Faixa atual, atualizada quando a janela cruza 768 ou 1024 px. */
export function useLayout(): Layout {
  return useSyncExternalStore(subscribe, readLayout, () => 'celular')
}

/** Tablet ou computador: há navegação lateral (e não a inferior). */
export function useWideLayout(): boolean {
  return useLayout() !== 'celular'
}
