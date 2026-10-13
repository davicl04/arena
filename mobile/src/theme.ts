/**
 * Tokens visuais do app. Os mesmos valores estão em `global.css` (@theme) para as classes do NativeWind:
 * ao alterar um token aqui, altere também lá (e vice-versa). Os nomes seguem os tokens da web
 * (`brand`, `ink`, `ink-muted`, `line`, `app`); os valores são os do mobile.
 * Use este objeto só onde a classe não chega: props de cor (placeholderTextColor, ActivityIndicator,
 * Switch) e estilos que continuam em `style`.
 */
export const colors = {
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
} as const

/** Raios em pontos (dp). Classes: rounded-control, rounded-lg, rounded-card, rounded-sheet. */
export const radius = { control: 8, lg: 12, card: 16, sheet: 20 } as const
