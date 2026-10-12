import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { CircleCheck, CircleDashed, CircleX, FilePenLine, Flag, Hourglass, Receipt, Send, ShieldAlert, Undo2, Users } from 'lucide-react'
import type { OrganizerEventDetail } from '@/api/events'
import { sentence } from '@/api/organizer'
import { teamButton } from '@/components/teams/styles'
import { cn } from '@/lib/utils'
import { formatDeadline, plural } from '@/utils/format'
import { shortDate } from '@/utils/relativeTime'
import { CHECKLIST_STEP } from './eventForm'
import { entrantsUnit, eventRefusalText } from './eventView'

type Tone = 'now' | 'wait' | 'bad' | 'calm'
const toneClass: Record<Tone, string> = {
  now: 'bg-white shadow-[inset_0_0_0_1.5px_var(--color-mint),var(--shadow-card)] [&_[data-slot=now-icon]]:text-brand',
  wait: 'bg-warning-bg [&_[data-slot=now-icon]]:text-warning',
  bad: 'bg-[#fff0f2] [&_[data-slot=now-icon]]:text-danger',
  calm: 'bg-white [&_[data-slot=now-icon]]:text-brand',
}

/** Cartão "Agora" (`.nowc` e `.banner` do G3): ícone, título, texto, conteúdo extra e ações. */
function NowCard({ tone, Icon, title, children, extra, actions }: {
  tone: Tone
  Icon: LucideIcon
  title: string
  children?: ReactNode
  extra?: ReactNode
  actions?: ReactNode
}) {
  return <section aria-labelledby="now-title" data-slot="next-action" data-tone={tone} className={cn('rounded-card p-3.5 text-[12.5px] text-ink', toneClass[tone])}>
    <div className="flex items-start gap-3">
      <Icon data-slot="now-icon" size={22} className="mt-px flex-none" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <span className="block text-[9.5px] font-extrabold tracking-[0.1em] text-ink-muted uppercase">Agora</span>
        <h2 id="now-title" className="text-[14px] leading-[1.3] wrap-anywhere">{title}</h2>
        {children && <p className="mt-0.5 text-[11px] leading-[1.5] wrap-anywhere text-ink-muted">{children}</p>}
      </div>
    </div>
    {extra}
    {actions && <div className="mt-3 flex flex-wrap gap-2 *:min-w-[min(100%,150px)] *:flex-1">{actions}</div>}
  </section>
}

/** Checklist do rascunho: cada item com o que falta e "Preencher" (abre o assistente no passo do item). */
function Checklist({ detail, onFill }: { detail: OrganizerEventDetail; onFill: (step: number) => void }) {
  return <ul className="m-0 mt-3 grid list-none gap-0 rounded-xl bg-subtle p-0 px-3" aria-label="Checklist do rascunho">
    {detail.checklist.map(item => <li key={item.key} className="flex min-h-11 items-center gap-2.5 border-0 border-b border-solid border-line py-1.5 last:border-b-0">
      {item.done ? <CircleCheck size={17} className="flex-none text-brand" aria-hidden="true" /> : <CircleDashed size={17} className="flex-none text-ink-muted" aria-hidden="true" />}
      <span className="min-w-0 flex-1">
        <b className="block text-[12px]">{item.label}<span className="sr-only">{item.done ? ': completo' : ': falta'}</span></b>
        {!item.done && item.message && <small className="text-[10.5px] leading-[1.4] text-ink-muted">{item.message}</small>}
      </span>
      {!item.done && <button type="button" className="min-h-9 flex-none border-0 bg-transparent px-1 text-[11px] font-bold text-brand"
        aria-label={`Preencher ${item.label.toLowerCase()}`} onClick={() => onFill(CHECKLIST_STEP[item.key])}>Preencher</button>}
    </li>)}
  </ul>
}

/**
 * Próxima ação do organizador (G3), vinda de `next_action` da API: completar o rascunho (checklist e "Publicar"
 * desabilitado até completar), publicar ou enviar à aprovação, aguardar a administração (com "Retirar da aprovação"),
 * corrigir a recusa, analisar comprovantes, enviar devoluções, acompanhar as inscrições e assim por diante.
 */
export function NextActionCard({ detail, busy, onSubmit, onWithdraw, onFill, onReceipts, onShowEntries }: {
  detail: OrganizerEventDetail
  /** Ação em curso (publicar ou retirar). */
  busy: boolean
  onSubmit: () => void
  onWithdraw: () => void
  /** Abre o assistente no passo indicado (rascunho). */
  onFill: (step?: number) => void
  /** Abre Comprovantes e devoluções (tela `event-receipts`). */
  onReceipts: () => void
  onShowEntries: () => void
}) {
  const action = detail.next_action
  const paid = Boolean(detail.price_cents)
  const submitLabel = paid ? 'Enviar para aprovação' : 'Publicar'
  const count = action.count ?? 0
  const missing = detail.checklist.filter(item => !item.done).length
  const submit = <button type="button" className={teamButton({ tone: 'brand', size: 'md' })} disabled={!detail.can_submit || busy}
    aria-describedby={detail.can_submit ? undefined : 'now-submit-hint'} onClick={onSubmit}>
    <Send aria-hidden="true" />{busy ? (paid ? 'Enviando…' : 'Publicando…') : submitLabel}
  </button>
  const submitHint = <p id="now-submit-hint" className="mt-2 text-[10.5px] leading-[1.45] text-ink-muted">
    {detail.can_submit ? '' : 'Complete os itens que faltam para liberar. '}Evento gratuito publica direto; pago vai para a aprovação da administração.
  </p>

  switch (action.kind) {
    case 'aguardar_revogacao':
      return <NowCard tone="wait" Icon={ShieldAlert} title="A administração decide se o evento segue">
        Sua permissão de organizador foi revogada. As inscrições ficam suspensas e a gestão fica só de leitura até a decisão.
      </NowCard>
    case 'corrigir_recusa':
      return <NowCard tone="bad" Icon={CircleX} title="Recusado pela administração"
        extra={missing > 0 ? <Checklist detail={detail} onFill={onFill} /> : undefined}
        actions={<button type="button" className={teamButton({ tone: 'brand', size: 'md' })} onClick={() => onFill()}><FilePenLine aria-hidden="true" />Corrigir e reenviar</button>}>
        {detail.refusal ? `Motivo: ${sentence(eventRefusalText(detail.refusal.reason_code, detail.refusal.reason_detail))}` : 'Revise os dados.'} Corrija e envie de novo para aprovação.
      </NowCard>
    case 'completar_rascunho':
      return <NowCard tone="now" Icon={FilePenLine} title="Complete o rascunho"
        extra={<><Checklist detail={detail} onFill={onFill} />{submitHint}</>} actions={submit}>
        {missing === 1 ? 'Falta 1 item' : `Faltam ${missing} itens`} para {paid ? 'enviar à aprovação' : 'publicar'}.
      </NowCard>
    case 'publicar':
      return <NowCard tone="now" Icon={CircleCheck} title={paid ? 'Pronto para enviar à aprovação' : 'Pronto para publicar'} extra={submitHint}
        actions={<>{submit}<button type="button" className={teamButton({ tone: 'outline', size: 'md' })} onClick={() => onFill()}><FilePenLine aria-hidden="true" />Revisar dados</button></>}>
        Todos os itens do checklist estão completos.
      </NowCard>
    case 'aguardar_aprovacao':
      return <NowCard tone="wait" Icon={Hourglass} title="Em aprovação pela administração"
        actions={<button type="button" className={teamButton({ tone: 'outline', size: 'md' })} disabled={busy} onClick={onWithdraw}>{busy ? 'Retirando…' : 'Retirar da aprovação'}</button>}>
        {detail.submitted_at ? `Enviado em ${shortDate(detail.submitted_at)}. ` : ''}Eventos pagos só são publicados depois da conferência. Você recebe a resposta nas notificações. Para editar, retire da aprovação.
      </NowCard>
    case 'analisar_comprovantes':
      return <NowCard tone="now" Icon={Receipt} title={`${plural(count, 'comprovante', 'comprovantes')} para analisar`}
        actions={<button type="button" className={teamButton({ tone: 'brand', size: 'md' })} onClick={onReceipts}>Analisar</button>}>
        {detail.registration_deadline ? `Inscrições fecham ${formatDeadline(detail.registration_deadline)}.` : 'Confira valor e favorecido antes de aprovar.'}
      </NowCard>
    case 'enviar_devolucoes':
      return <NowCard tone="now" Icon={Undo2} title={`${plural(count, 'devolução', 'devoluções')} para enviar`}
        actions={<button type="button" className={teamButton({ tone: 'brand', size: 'md' })} onClick={onReceipts}>Enviar devoluções</button>}>
        Devolva o valor por Pix e anexe o comprovante de cada devolução.
      </NowCard>
    case 'aguardar_devolucoes':
      return <NowCard tone="calm" Icon={Hourglass} title={`${plural(count, 'devolução aguardando', 'devoluções aguardando')} os participantes`}
        actions={<button type="button" className={teamButton({ tone: 'outline', size: 'md' })} onClick={onReceipts}>Ver devoluções</button>}>
        Sem resposta em 7 dias, a devolução conta como recebida. Uma contestação vai para a administração.
      </NowCard>
    case 'acompanhar_inscricoes':
      return <NowCard tone="now" Icon={Users} title={`Inscrições abertas até ${formatDeadline(action.deadline)}`}
        actions={<button type="button" className={teamButton({ tone: 'outline', size: 'md' })} onClick={onShowEntries}>Ver inscritos</button>}>
        {detail.capacity ? `${detail.entries_count} de ${detail.capacity} ${entrantsUnit(detail.sport)}` : ''}{paid ? ' · os comprovantes chegam para você analisar.' : '.'}
      </NowCard>
    case 'aguardar_inicio':
      return <NowCard tone="calm" Icon={Flag} title={`Inscrições encerradas · começa ${formatDeadline(action.deadline)}`}>
        A tabela e as partidas ficam disponíveis numa próxima etapa do Arena.
      </NowCard>
    default:
      if (detail.state === 'cancelado')
        return <NowCard tone="bad" Icon={CircleX} title="Evento cancelado">
          {detail.cancel_reason ? `Motivo: ${detail.cancel_reason}` : 'Os inscritos foram avisados.'}
        </NowCard>
      return <NowCard tone="calm" Icon={CircleCheck} title={detail.state === 'encerrado' ? 'Evento encerrado' : detail.state === 'em_andamento' ? 'Evento em andamento' : 'Nada pendente'}>
        Nada pendente por aqui.
      </NowCard>
  }
}
