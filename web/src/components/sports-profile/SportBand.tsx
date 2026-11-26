import { useId } from 'react'
import type { Profile, Sport } from '@/api/client'
import SportIcon from '@/components/SportIcon'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { bandLabel, profileSummary } from './profileSteps'

/**
 * Faixa de uma modalidade na tela "Suas modalidades" (132 px, cantos de 20 px), com a marca d'água da modalidade (só o
 * símbolo, `SportIcon forma="marca"`, grande e translúcido, cortado no canto): branca na ativa e na tinta do quadro de
 * ícone do tema (`icon-tile-ink`) na inativa, herdada do texto, então a troca de tema a recolore pelo CSS. A caixa de
 * 150 px fica 14 px para fora à direita e embaixo, onde ficava a do ícone antigo (cujo `-bottom-[18px]` incluía 4 px de
 * folga da linha do `span` em linha, que o SVG não tem). Inativa: superfície do tema, "Toque para ativar", nome e a
 * frase da modalidade. Ativa: degradê `forest → #005a36` (bloco escuro por design, igual nos dois temas), selo menta
 * "● Ativa", nome em branco e o resumo do perfil. A faixa inteira é o botão; o nome acessível traz modalidade e estado,
 * e a frase ou o resumo vira a descrição.
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
      <span aria-hidden="true" className={cn('absolute -right-3.5 -bottom-3.5', active ? 'text-white opacity-16' : 'text-icon-tile-ink opacity-8')}>
        <SportIcon sport={sport} forma="marca" size={150} />
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
