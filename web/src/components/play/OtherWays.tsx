import { ChevronRight, Flag, Shield, Trophy } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Sport } from '@/api/client'
import { Card } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import { cn } from '@/lib/utils'

const rowClass = 'flex min-h-[60px] w-full items-center gap-[11px] border-0 bg-transparent px-0 py-[11px] text-left text-inherit [&+&]:border-t [&+&]:border-solid [&+&]:border-line'

function Row({ Icon, title, text, onClick, badge }: { Icon: LucideIcon; title: string; text: string; onClick?: () => void; badge?: string }) {
  const body = <>
    <span className="grid size-[38px] flex-none place-items-center rounded-xl bg-tile text-brand"><Icon size={19} /></span>
    <span className="min-w-0 flex-1">
      <b className="block text-[12.5px]">{title}</b>
      <small className="mt-0.5 text-[10.5px] leading-[1.5] text-ink-muted">{text}</small>
    </span>
    {badge && <span className="flex-none rounded-full bg-[#4950571a] px-2 py-[3px] text-[9px] font-bold">{badge}</span>}
    {onClick && <ChevronRight size={18} className="text-ink-muted" />}
  </>
  return onClick
    ? <button type="button" data-slot="other-way" className={cn(rowClass, 'rounded-none enabled:hover:bg-[#f6f7f9]')} onClick={onClick}>{body}</button>
    : <div data-slot="other-way" className={rowClass}>{body}</div>
}

/**
 * "Outras formas de jogar" abaixo da placa: Meu time (futebol) e Campeonatos ou Provas, que abre a lista de eventos
 * publicados da modalidade da aba (E2).
 */
export function OtherWays({ sport, onTeams, onEvents }: { sport: Sport; onTeams: () => void; onEvents: () => void }) {
  const run = sport === 'corrida'
  return <section aria-labelledby="play-other-ways" className="px-5">
    <SectionTitle className="mt-[22px] mb-2.5" title={<span id="play-other-ways">{run ? 'Provas' : 'Outras formas de jogar'}</span>} />
    <Card className="px-3.5 py-1 shadow-card">
      {sport === 'futebol' && <Row Icon={Shield} title="Meu time" text="Elenco, convites e pedidos para entrar" onClick={onTeams} />}
      <Row Icon={run ? Flag : Trophy} title={run ? 'Provas' : 'Campeonatos'} onClick={onEvents}
        text={run
          ? 'Provas de corrida abertas, com inscrição pelo Arena'
          : `Campeonatos de ${sport === 'tenis' ? 'tênis' : 'futebol'} abertos, com inscrição pelo Arena`} />
    </Card>
  </section>
}
