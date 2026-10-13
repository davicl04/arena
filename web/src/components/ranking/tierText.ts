import { tiers } from '@/data/arena'
import type { TierKey } from '@/data/arena'

/** "no Diamante" / "no Salão" (o Lendário é o elo do Salão). */
export const inTier = (tier: TierKey) => (tier === 'lendario' ? 'no Salão' : `no ${tiers[tier].name}`)
/** "do Diamante" / "do Salão". */
export const ofTier = (tier: TierKey) => (tier === 'lendario' ? 'do Salão' : `do ${tiers[tier].name}`)
/** "o Diamante" / "o Salão". */
export const theTier = (tier: TierKey) => (tier === 'lendario' ? 'o Salão' : `o ${tiers[tier].name}`)
