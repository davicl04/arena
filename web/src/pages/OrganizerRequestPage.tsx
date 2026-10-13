import { useState } from 'react'
import { Banknote, BadgeCheck, Gavel, Hourglass, Receipt, ShieldCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { City, Profile } from '../api/client'
import { getOrganizerStatus, refusalText, sentence } from '../api/organizer'
import type { OrganizerRequest } from '../api/organizer'
import { ArenaMark } from '../components/Brand'
import { OrganizerRequestForm } from '../components/organizer/OrganizerRequestForm'
import { useResource } from '../hooks/useResource'
import { Button } from '@/components/ui/button'
import { feedbackVariants } from '@/components/ui/feedback'
import { LoadError } from '@/components/ui/load-error'
import { SectionTitle } from '@/components/ui/section-title'

const rules: [LucideIcon, string, string][] = [
  [Banknote, 'Pagamento fora do Arena', 'Você recebe as inscrições por Pix e informa a chave. O Arena não recebe nem repassa dinheiro.'],
  [Receipt, 'Você analisa os comprovantes', 'Aprova ou recusa com motivo; quem não envia no prazo perde a vaga.'],
  [Gavel, 'Você resolve divergências', 'Quando os placares não batem, sua decisão vale e fica registrada.'],
  [ShieldCheck, 'Eventos pagos passam pela administração', 'Antes de publicar, o Arena confere os dados do evento.'],
]

/** Bloco de situação claro (pedido enviado, em análise, já organizador). */
function Situation({ Icon, title, text, tone }: { Icon: LucideIcon; title: string; text: string; tone: 'wait' | 'ok' }) {
  return <div className="flex gap-3 rounded-card bg-white p-3.5">
    <span className={tone === 'wait' ? 'grid size-10 flex-none place-items-center rounded-xl bg-warning-bg text-warning' : 'grid size-10 flex-none place-items-center rounded-xl bg-success-bg text-brand'}><Icon size={20} /></span>
    <div className="min-w-0"><b className="block text-[13.5px]">{title}</b><small className="mt-0.5 text-[11px] leading-[1.5] text-ink-muted">{text}</small></div>
  </div>
}

/**
 * "Seja organizador" (P5): as regras do papel antes do formulário do pedido. Com pedido em análise ou a
 * permissão já ativa, mostra a situação no lugar do formulário.
 */
export default function OrganizerRequestPage({ cities, profiles, onBack, onExpired }: {
  cities: City[]
  profiles: Profile[]
  onBack: () => void
  onExpired: () => void
}) {
  const status = useResource(getOrganizerStatus, onExpired, { fallback: 'Não foi possível conferir o seu pedido de organizador.' })
  const [sent, setSent] = useState<OrganizerRequest | null>(null)
  const defaultCityId = (profiles.find(profile => profile.sport === 'futebol') ?? profiles[0])?.city_id ?? null
  const state = status.data?.state
  const back = <Button variant="secondary" className="mt-3.5 w-full" onClick={onBack}>Voltar ao Menu</Button>

  return <>
    <section className="relative overflow-hidden rounded-panel bg-[radial-gradient(120%_90%_at_100%_0%,#1d5a3d_0%,var(--color-forest)_60%)] px-[18px] pt-4 pb-5 text-white" aria-labelledby="organizer-hero">
      <ArenaMark className="pointer-events-none absolute -right-6 -bottom-5 h-[110px] w-[180px] text-white opacity-[0.06]" />
      <p className="text-[10px] font-bold tracking-[0.1em] text-mint">ORGANIZAR NO ARENA</p>
      <h2 id="organizer-hero" className="mt-1 text-[22px] text-white">Campeonatos e provas</h2>
      <p className="mt-1.5 max-w-[300px] text-[12px] leading-[1.5] text-white/70">Crie campeonatos e provas, gerencie inscrições e monte as tabelas. A permissão é concedida pela administração.</p>
    </section>

    {status.loading && <p role="status" className="mt-4 text-[12px]">Carregando…</p>}
    {status.error && <LoadError size="screen" text={status.error} cause={status.errorCause} onRetry={status.reload} />}

    {sent ? <div className="mt-4" role="status">
      <Situation Icon={Hourglass} tone="wait" title="Pedido enviado" text={`O pedido de ${sent.display_name} está em análise. A resposta chega nas notificações.`} />
      {back}
    </div>
      : state === 'em_analise' ? <div className="mt-4">
        <Situation Icon={Hourglass} tone="wait" title="Pedido em análise" text="Você já tem um pedido em análise. A resposta chega nas notificações." />
        {back}
      </div>
        : state === 'aprovado' ? <div className="mt-4">
          <Situation Icon={BadgeCheck} tone="ok" title="Você é organizador" text="A seção Organizador já aparece no Menu." />
          {back}
        </div>
          : !status.loading && <>
            <SectionTitle title="Como funciona" />
            <ul className="grid gap-2" aria-label="Regras do organizador">
              {rules.map(([Icon, title, text]) => <li key={title} className="flex gap-3 rounded-[14px] bg-white p-3">
                <Icon size={20} className="flex-none text-brand" aria-hidden="true" />
                <div className="min-w-0"><b className="block text-[12.5px]">{title}</b><small className="text-[11px] leading-[1.45] text-ink-muted">{text}</small></div>
              </li>)}
            </ul>
            <SectionTitle title="Seu pedido" />
            {state === 'recusado' && status.data?.request && <p className={feedbackVariants()}>
              Seu pedido anterior foi recusado. Motivo: {sentence(refusalText(status.data.request.reason_code, status.data.request.reason_detail))}</p>}
            {state === 'revogado' && status.data?.revocation && <p className={feedbackVariants()}>
              Sua permissão foi revogada. Motivo: {sentence(status.data.revocation.reason)}</p>}
            <OrganizerRequestForm cities={cities} defaultCityId={defaultCityId} onSent={setSent} onExpired={onExpired} />
          </>}
  </>
}
