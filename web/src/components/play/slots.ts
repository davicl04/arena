import type { OpenSlots } from '@/api/matches'
import { positionOptions } from '@/data/arena'
import { noSlots, slotTotal } from '@/data/match'

/** Vagas para avulsos (RN06): no máximo um goleiro e, somando as posições, o tamanho do formato menos um. */
export const MAX_GOALKEEPER_SLOTS = 1
export const emptySlots: OpenSlots = noSlots()

/** "2 vagas para avulsos: goleiro, 1 atacante" ou "Time completo, sem vagas para avulsos". */
export function slotsSummary(slots: OpenSlots | null | undefined): string {
  const total = slotTotal(slots)
  if (!slots || !total) return 'Time completo, sem vagas para avulsos'
  const parts = positionOptions
    .filter(option => slots[option.value] > 0)
    .map(option => `${slots[option.value] > 1 ? `${slots[option.value]} ` : ''}${option.label.toLocaleLowerCase('pt-BR')}`)
  return `${total} ${total === 1 ? 'vaga' : 'vagas'} para avulsos: ${parts.join(', ')}`
}
