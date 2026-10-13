/**
 * Tokens visuais do app. Os mesmos valores estão em `global.css` (@theme e o bloco escuro) para as classes do NativeWind:
 * ao alterar um token aqui, altere também lá (e vice-versa). Os nomes seguem os tokens da web
 * (`brand`, `ink`, `ink-muted`, `line`, `app`); os valores são os do mobile.
 * Tema claro e escuro (docs/plano-tema.md): `lightColors` e `darkColors` têm os mesmos nomes. Onde a classe não chega
 * (props de cor como placeholderTextColor, ActivityIndicator, Switch, ícones, e estilos em `style`), use
 * `useThemeColors()` de `hooks/useTheme`, que devolve o objeto do tema resolvido. `colors` é o claro: sirva-se dele só
 * para tons que não mudam com o tema (vidro, forest, night, mint, legend, elos).
 */
export const lightColors = {
  brand: '#005a36',
  'brand-soft': '#edf3ef',
  ink: '#343d39',
  'ink-muted': '#606965',
  'ink-soft': '#626970',
  line: '#cdd4d0',
  app: '#e2e4e9',
  field: '#fafbfa',
  placeholder: '#727b76',
  error: '#94351e',
  danger: '#b42318',
  like: '#ff8a80',
  scrim: '#0008',
  glass: 'rgba(8,20,14,0.92)',
  'glass-ink': '#08140e',
  'glass-pill': 'rgba(8,20,14,0.6)',
  'glass-light': '#ffffffd9',
  'glass-muted': '#ffffffb3',
  'glass-line': '#ffffff33',
  'glass-field': '#ffffff1a',
  'glass-danger': '#ffb4a8',
  'glass-accent': '#8fe0b4',
  /** Barra escura da Comunidade, etiqueta de vidro do post e tela de nova publicação. */
  forest: '#0b2218',
  'forest-field': '#ffffff14',
  'forest-line': '#ffffff2e',
  'glass-tag': 'rgba(12,22,17,0.6)',
  'mint-track': '#8fe0b44d',
  /** Cartazes, cartões S1 e blocos de times e eventos (mesmos nomes da web). */
  mint: '#8fe0b4',
  night: '#08140e',
  subtle: '#f1f2f5',
  tile: '#dfe3e0',
  'line-strong': '#a3aaa7',
  'success-bg': '#eaf5ed',
  'warning-bg': '#fdf3e2',
  warning: '#6f4305',
  amber: '#f6c26b',
  'danger-soft': '#ff8a9a',
  /** Tons do toast e do aviso de conexão: aviso e informação (sucesso usa `mint`, erro usa `danger-soft`). */
  'warning-soft': '#f4c56a',
  'info-soft': '#c9d6cf',
  /** Superfície sólida do toast e da faixa de conexão (no Expo o vidro não tem desfoque) e a linha que a contorna. */
  toast: 'rgba(8,20,14,0.94)',
  'toast-line': '#ffffff17',
  /** Dourado do Salão dos Lendários (entrada, subtela e linhas do elo Lendário). */
  legend: '#F4DE9A',
  /** Tom de cada elo na placa contínua do Ranking: o topo da placa tinge do tom para `forest`. */
  'tier-bronze-tint': '#7a4a22',
  'tier-prata-tint': '#5d6670',
  'tier-ouro-tint': '#7a5a12',
  'tier-diamante-tint': '#1d5c6a',
  'tier-lendario-tint': '#5a4a10',
  /** Superfície de cartão (era `bg-white`); folha; texto sobre `brand`; títulos e rótulos fortes. */
  surface: '#ffffff',
  sheet: '#ffffff',
  'on-brand': '#ffffff',
  heading: '#343d39',
  /** Quadro de ícone verde-claro e o ícone dele (dourado no escuro); sobretítulos; borda acesa do cartão escuro. */
  'icon-tile': '#005a3612',
  'icon-tile-ink': '#005a36',
  eyebrow: '#606965',
  'surface-edge': 'transparent',
  /** Fundo da navegação inferior. */
  nav: '#ffffff',
}

export type ThemeColors = { [K in keyof typeof lightColors]: string }

/**
 * Escuro "Estádio à noite": preto esverdeado, menta nos botões e o dourado dos elos em sobretítulos e quadros de ícone.
 * Vidro, forest, night, mint, legend, toast e os tons dos elos não mudam (já são escuros por design).
 */
export const darkColors: ThemeColors = {
  ...lightColors,
  brand: '#8fe0b4',
  'brand-soft': '#8fe0b41a',
  ink: '#d2dcd6',
  'ink-muted': '#87978e',
  'ink-soft': '#87978e',
  line: '#ffffff1a',
  app: '#040806',
  field: '#0b130f',
  placeholder: '#7d8b83',
  error: '#ff9b85',
  danger: '#ff8a80',
  subtle: '#ffffff10',
  tile: '#16201b',
  'line-strong': '#ffffff40',
  'success-bg': '#8fe0b41a',
  'warning-bg': '#f4c56a1a',
  warning: '#f4c56a',
  surface: '#0f1813',
  sheet: '#0b120e',
  'on-brand': '#04100a',
  heading: '#ffffff',
  'icon-tile': '#f4de9a14',
  'icon-tile-ink': '#f4de9a',
  eyebrow: '#f4de9acc',
  'surface-edge': '#ffffff12',
  nav: '#040806',
}

/** Valores do claro (compatibilidade): use `useThemeColors()` para cores que mudam com o tema. */
export const colors = lightColors

/** Raios em pontos (dp). Classes: rounded-control, rounded-lg, rounded-card, rounded-sheet. */
export const radius = { control: 8, lg: 12, card: 16, sheet: 20 } as const
