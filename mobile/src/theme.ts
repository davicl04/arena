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
  'glass-button': 'rgba(8,20,14,0.45)',
  'glass-light': '#ffffffd9',
  'glass-muted': '#ffffffb3',
  'glass-line': '#ffffff33',
  'glass-field': '#ffffff1a',
  'glass-danger': '#ffb4a8',
  'glass-accent': '#8fe0b4',
  /** Só em JS: a sombra do texto sobre a foto continua em `style`. */
  'text-shadow': '#0009',
} as const

/** Raios em pontos (dp). Classes: rounded-control, rounded-lg, rounded-card, rounded-sheet. */
export const radius = { control: 8, lg: 12, card: 16, sheet: 20 } as const
