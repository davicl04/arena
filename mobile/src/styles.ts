/**
 * Classes NativeWind compartilhadas (antigo StyleSheet de `components/ui`).
 * Tamanhos de fonte em px arbitrário (`text-[14px]`) para não herdar a altura de linha das escalas do Tailwind.
 * Sem classes montadas dinamicamente: variantes são strings completas, escolhidas por mapa ou condição.
 * `flex: 1` do React Native = `grow basis-0` (o `flex-1` do Tailwind também liga flexShrink e usa basis 0%).
 * Não junte duas classes que definem a mesma propriedade (ex.: `mb-2.5` e `mb-0`): a ordem do CSS, não a da string, decide.
 */
export const tw = {
  screen: 'grow basis-0 bg-app',
  content: 'p-6 pb-12',
  brand: 'text-[34px] font-extrabold tracking-[-2px] text-brand',
  eyebrow: 'mb-3 text-[11px] font-bold tracking-[2px] text-brand',
  title: 'mb-3.5 text-[34px] font-bold tracking-[-1px] text-ink',
  heading: 'mb-2.5 text-[23px] font-bold text-ink',
  /** `heading` sem margem inferior, para cabeçalhos em linha. */
  headingInline: 'text-[23px] font-bold text-ink',
  body: 'mb-4 text-[14px] leading-[22px] text-ink-muted',
  card: 'mb-4.5 rounded-card bg-white p-5.5',
  label: 'mt-3 mb-2 text-[13px] font-semibold text-ink',
  input: 'min-h-12 rounded-control border border-line bg-field p-3 text-[16px] text-ink',
  error: 'my-3.5 text-[14px] leading-[22px] text-error',
  success: 'my-3.5 text-[14px] text-brand',
  row: 'flex-row flex-wrap items-center gap-2.5',
  chip: {
    base: 'my-1 min-h-11 justify-center rounded-control border p-3',
    idle: 'border-line',
    selected: 'border-brand bg-brand',
  },
  chipText: {
    idle: 'text-[13px] text-ink',
    /** Texto do chip selecionado: herda o estilo do texto do botão primário. */
    selected: 'text-[14px] font-semibold text-white',
  },
} as const

/** Junta classes condicionais, ignorando valores falsos. */
export const cx = (...values: (string | false | null | undefined)[]) => values.filter(Boolean).join(' ')
