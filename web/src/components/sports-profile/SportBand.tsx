import { useId } from 'react'
import type { CSSProperties } from 'react'
import type { Profile, Sport } from '@/api/client'
import SportIcon from '@/components/SportIcon'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { bandLabel, profileSummary } from './profileSteps'

/**
 * Faixa de uma modalidade na tela "Suas modalidades" (132 px, cantos de 20 px), com o símbolo grande e translúcido no canto
 * pela máscara alfa (`SportIcon mask`, sem PNG de fundo branco no escuro). Inativa: superfície do tema, "Toque para ativar",
 * nome e a frase da modalidade. Ativa: degradê `forest → #005a36` (bloco escuro por design, igual nos dois temas), selo
 * menta "● Ativa", nome em branco e o resumo do perfil. A faixa inteira é o botão; o nome acessível traz modalidade e
 * estado, e a frase ou o resumo vira a descrição.
 */
export function SportBand({ sport, label, description, profile, onOpen }: {
  sport: Sport
  label: string
  description: string
  profile?: Profile
  onOpen: () => void
}) {
  const detailId = useId()
  const active = Boolean(profile)
  return (
    <button type="button" aria-label={bandLabel(sport, profile)} aria-describedby={detailId} onClick={onOpen}
      className={cn('relative block h-[132px] w-full overflow-hidden rounded-[20px] border border-solid border-surface-edge text-left shadow-card',
        active ? 'bg-[linear-gradient(120deg,var(--color-forest),#005a36)]' : 'surface hover:bg-hover')}>
      <span aria-hidden="true" className={cn('absolute -right-3.5 -bottom-[18px]', active ? 'opacity-16' : 'opacity-8')}
        style={{ '--sport-icon-color': active ? '#fff' : 'var(--color-icon-tile-ink)' } as CSSProperties}>
        <SportIcon sport={sport} size={150} mask />
      </span>
      <span className="absolute inset-4 flex flex-col justify-between">
        {active
          ? <Badge className="self-start rounded-full bg-mint px-[9px] py-1 font-semibold text-[#04100a]">● Ativa</Badge>
          : <Badge className="self-start rounded-full px-[9px] py-1 font-semibold">Toque para ativar</Badge>}
        <span className="min-w-0">
          <strong className={cn('block font-display text-[24px] leading-tight font-bold', active ? 'text-white' : 'text-heading')}>{label}</strong>
          <span id={detailId} className={cn('mt-[3px] line-clamp-2 block text-[11px] leading-[1.45]', active ? 'text-white/80' : 'text-ink-muted')}>
            {profile ? profileSummary(profile) : description}
          </span>
        </span>
      </span>
    </button>
  )
}
