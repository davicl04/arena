/*
 * Sobreposições em tablet e computador (ticket 02 da web responsiva). No celular, folhas sobem da base e telas cheias
 * cobrem o app; a partir de `md:` (768 px) elas viram diálogo ou painel centralizado na janela, sobre o fundo
 * escurecido que cobre também a navegação lateral. As classes abaixo só têm variante `md:`: no celular não mudam nada.
 *
 * `widePanel`: tela cheia (proposta, cronômetro, publicar foto, ver post, Story, vidro de tela cheia) como painel de
 * 480 px de largura e até 832 px de altura (a janela menos 2 rem de cada lado), com os cantos da folha, sombra de
 * diálogo e um anel claro sutil que separa o painel escuro do fundo escurecido no tema escuro. A tela cheia mantém o
 * próprio fundo e o próprio layout em coluna; o conteúdo pensado para 390 px não estica.
 * Acrescente ao `className` da tela; `md:h-auto`/`md:max-w-*` depois dele ajustam altura e largura.
 *
 * `overlayScrim`: fundo escurecido das telas cheias em tela larga (as folhas e o Dialog já têm o seu). Entra pelo gancho
 * `useOverlayPortal` (hooks/useOverlayPortal.ts) e não fecha a tela ao clique, como hoje no celular (não há fundo).
 */
export const widePanel = 'md:inset-auto md:top-1/2 md:left-1/2 md:z-sheet md:h-[min(52rem,calc(100%-4rem))] md:w-[calc(100%-4rem)] md:max-w-[30rem] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-sheet md:shadow-dialog md:ring-1 md:ring-white/10'

export const overlayScrim = 'absolute inset-0 z-scrim bg-scrim motion-safe:animate-glass-in'
