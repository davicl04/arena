import { footballFormats } from '@/data/arena'
import type { FootballFormat } from '@/data/arena'
import type { PlateOption } from './PlateChips'

/** Formatos do futebol como opções das placas ("Society 7×7"): a placa do Jogar e a folha "Preparar busca". */
export const formatChips: PlateOption<FootballFormat>[] = footballFormats.map(format => ({
  value: format.value,
  label: <>{format.label}<small className="font-semibold opacity-70">{format.size}</small></>,
  ariaLabel: `${format.label} ${format.players} contra ${format.players}`,
}))
