import { createContext, useContext, useLayoutEffect } from 'react'

/**
 * Faixa da barra de status na área logada. Na web, o topo de cada tela encosta na borda. No aparelho, a barra de status fica
 * por cima, e o shell pinta essa faixa:
 * - `app` (padrão): fundo da tela, com os ícones da barra conforme o tema;
 * - `forest`: o verde-escuro das placas (Jogar, Comunidade, Meus times, notificações…), com os ícones claros;
 * - `bleed`: sem faixa; a tela desenha por baixo da barra (a capa do perfil) e usa `insets.top` no próprio topo.
 */
export type TopArea = 'app' | 'forest' | 'bleed'

const TopAreaContext = createContext<(area: TopArea) => void>(() => undefined)
export const TopAreaProvider = TopAreaContext.Provider

/** A tela (ou a placa que encosta no topo) declara o topo enquanto estiver montada; ao sair, volta ao padrão. `null` não declara nada. */
export function useTopArea(area: TopArea | null) {
  const set = useContext(TopAreaContext)
  useLayoutEffect(() => {
    if (!area) return
    set(area)
    return () => set('app')
  }, [area, set])
}
