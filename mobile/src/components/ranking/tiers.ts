import type { TierCounts } from '../../api/results'
import { tierOrder, tiers } from '../../data/arena'
import type { TierKey } from '../../data/arena'

/** Nenhum classificado em nenhum elo (usado antes da primeira leitura). */
export const emptyTierCounts: TierCounts = { bronze: 0, prata: 0, ouro: 0, diamante: 0, lendario: 0 }

/**
 * Elo vizinho **com integrantes** (as setas da troca de elo pulam os elos vazios): `direction` 1 é para cima (rumo ao Lendário)
 * e -1 para baixo. Sem nenhum, `null` e a seta fica desabilitada.
 */
export function tierNeighbor(counts: TierCounts, tier: TierKey, direction: 1 | -1): TierKey | null {
  for (let index = tierOrder.indexOf(tier) + direction; index >= 0 && index < tierOrder.length; index += direction) {
    if (counts[tierOrder[index]] > 0) return tierOrder[index]
  }
  return null
}

/** O Lendário é o Salão: "Salão" na troca de elo e "no Salão" nas frases. */
export const tierName = (tier: TierKey) => (tier === 'lendario' ? 'Salão' : tiers[tier].name)
/** "no Diamante" / "no Salão". */
export const inTier = (tier: TierKey) => (tier === 'lendario' ? 'no Salão' : `no ${tiers[tier].name}`)
/** "do Diamante" / "do Salão". */
export const ofTier = (tier: TierKey) => (tier === 'lendario' ? 'do Salão' : `do ${tiers[tier].name}`)
/** "o Diamante" / "o Salão". */
export const theTier = (tier: TierKey) => (tier === 'lendario' ? 'o Salão' : `o ${tiers[tier].name}`)
