import { footballFormats } from '../../data/arena'
import type { FootballFormat } from '../../data/arena'

/** Opção das escolhas em chips da placa (`PlateChips` da frente da placa): o valor, o texto e o nome falado. */
export interface FormatChip<T extends string = FootballFormat> {
  value: T
  /** Texto principal ("Society"). */
  label: string
  /** Tamanho do time em campo, em letra menor ao lado do rótulo ("7×7"). */
  size: string
  /** Nome acessível ("Society 7 contra 7"). */
  accessibilityLabel: string
}

/** Formatos do futebol como chips das placas ("Society 7×7"): a placa do Jogar e a folha "Preparar busca" (dados; o visual é da tela). */
export const formatChips: FormatChip[] = footballFormats.map(format => ({
  value: format.value,
  label: format.label,
  size: format.size,
  accessibilityLabel: `${format.label} ${format.players} contra ${format.players}`,
}))
