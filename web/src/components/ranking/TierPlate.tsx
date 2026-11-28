import type { CSSProperties, ReactNode } from 'react'
import { tierTints } from '@/data/arena'
import type { TierKey } from '@/data/arena'
import { cn } from '@/lib/utils'

/**
 * Placa contínua: um bloco `rounded-card` com o gradiente do tom do elo para o `forest` e o Coliseu em marca-d'água, que
 * junta a troca de elo (`TierSwitch`), a posição do titular (`TierPositionHero`) ou a nota "Os 5 primeiros no Ouro:" e a
 * janela de linhas (`TierWindow`). O Lendário ganha o contorno dourado do Salão.
 */
export function TierPlate({ tier, label, busy = false, slot = 'tier-plate', children }: {
  tier: TierKey
  /** Nome acessível da região: "Ranking do Diamante". Sem ele, a placa é só visual (a placa da sua posição no computador). */
  label?: string
  busy?: boolean
  /** `tier-head`: no computador, a placa se divide em sua posição (`tier-head`) e troca de elo com a lista (ver RankingPage). */
  slot?: 'tier-plate' | 'tier-head'
  children: ReactNode
}) {
  const Tag = label ? 'section' : 'div'
  return (
    <Tag data-slot={slot} data-tier={tier} aria-label={label} aria-busy={label ? busy : undefined}
      style={{ '--tint': tierTints[tier] } as CSSProperties}
      className={cn('relative overflow-hidden rounded-card bg-[linear-gradient(180deg,color-mix(in_srgb,var(--tint)_85%,var(--color-forest))_0%,var(--color-forest)_55%)] pb-2.5 text-white',
        tier === 'lendario' && 'shadow-[inset_0_0_0_1px_#F4DE9A40]')}>
      <span aria-hidden="true" className="pointer-events-none absolute -top-2.5 -right-[60px] h-[150px] w-[260px] bg-white opacity-[0.06] mask-[url(/images/brand/coliseum.svg)] mask-contain mask-center mask-no-repeat" />
      {children}
    </Tag>
  )
}
