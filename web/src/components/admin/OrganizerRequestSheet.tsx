import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, Info, X } from 'lucide-react'
import { decideOrganizerRequest, refusalError, refusalInput } from '@/api/admin'
import { ORGANIZER_LIMITS, ORGANIZER_REFUSAL_REASONS, refusalText, sportNames } from '@/api/organizer'
import type { AdminOrganizerRequest, OrganizerRefusalReason } from '@/api/organizer'
import { SocialPhoto } from '@/components/SocialPhoto'
import { errorClass, textareaClass } from '@/components/organizer/fieldStyles'
import { isStale, useSubmit } from '@/hooks/useSubmit'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { feedbackVariants } from '@/components/ui/feedback'
import { Sheet, SheetActions } from '@/components/ui/sheet'
import { relativeTime, shortDate } from '@/utils/relativeTime'

const stateLabels = { em_analise: 'Em análise', aprovado: 'Aprovado', recusado: 'Recusado', cancelado: 'Cancelado pelo autor' } as const

/** Lista de termos (dl) em duas colunas, no fundo sutil da folha. */
export function InfoList({ items, children }: { items: [string, ReactNode][]; children?: ReactNode }) {
  return <div className="mt-3 rounded-xl bg-subtle p-[13px]">
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5">
      {items.map(([term, value]) => <div key={term} className="min-w-0">
        <dt className="text-[9px] font-extrabold tracking-[0.08em] text-ink-muted uppercase">{term}</dt>
        <dd className="mt-0.5 text-[12px] font-semibold wrap-anywhere">{value}</dd>
      </div>)}
    </dl>
    {children}
  </div>
}

/**
 * Folha do pedido de organizador (AD1): dados do pedido, "Ver perfil" e, na fila, Aprovar | Recusar. Recusar
 * exige o motivo do contrato; em "Outro", o detalhe.
 */
export function OrganizerRequestSheet({ item, onClose, onOpenUser, onDecided, onStale, onExpired }: {
  item: AdminOrganizerRequest
  onClose: () => void
  onOpenUser: (id: number) => void
  onDecided: (decided: AdminOrganizerRequest, message: string) => void
  /** O pedido já foi decidido ou cancelado (409/404): o `useSubmit` avisa com a mensagem do servidor; a fila recarrega e a folha fecha. */
  onStale: () => void
  onExpired: () => void
}) {
  const id = useId()
  const [refusing, setRefusing] = useState(false)
  const [reason, setReason] = useState<OrganizerRefusalReason | null>(null)
  const [detail, setDetail] = useState('')
  const [attempted, setAttempted] = useState(false)
  const { busy, error, setError, run } = useSubmit(onExpired)
  const problem = attempted ? refusalError(reason, detail) : null
  const firstName = item.requester.name.trim().split(/\s+/)[0]
  const pending = item.state === 'em_analise'

  /** Decide; um pedido que deixou de estar em análise (409/404) avisa a fila em vez de manter o item na lista. */
  function decide(input: Parameters<typeof decideOrganizerRequest>[1], fallback: string) {
    return run(() => decideOrganizerRequest(item.id, input), fallback, cause => { if (isStale(cause)) onStale() })
  }
  async function approve() {
    const decided = await decide({ decision: 'aprovar' }, 'Não foi possível aprovar o pedido.')
    if (decided) onDecided(decided, `${item.display_name} agora é organizador.`)
  }
  async function refuse() {
    setAttempted(true)
    if (refusalError(reason, detail) || !reason) return
    const decided = await decide(refusalInput(reason, detail), 'Não foi possível recusar o pedido.')
    if (decided) onDecided(decided, `Pedido de ${item.display_name} recusado.`)
  }

  return <Sheet title="Pedido de organizador" onClose={onClose}>
    <div className="mt-1 flex items-center gap-3">
      <SocialPhoto path={item.requester.avatar_url} name={item.requester.name} size="lg" className="mb-0" />
      <div className="min-w-0">
        <b className="block font-display text-[16px] wrap-anywhere">{item.display_name}</b>
        <small className="text-[11px] text-ink-muted">Pedido de {item.requester.name} · {relativeTime(item.created_at)}</small>
      </div>
    </div>
    <InfoList items={[
      ['Cidade', `${item.city.name} · ${item.city.state}`],
      ['Modalidades', sportNames(item.sports)],
      ['Contato', item.contact],
      ['Link', item.link ? <a className="text-brand underline" href={item.link} target="_blank" rel="noopener noreferrer nofollow ugc">{item.link}</a> : '—'],
    ]}>
      <div className="mt-2.5">
        <p className="text-[9px] font-extrabold tracking-[0.08em] text-ink-muted uppercase">Experiência</p>
        <p className={item.experience ? 'mt-0.5 text-[12px] leading-[1.5] whitespace-pre-line wrap-anywhere' : 'mt-0.5 text-[12px] text-ink-muted'}>{item.experience || 'Não informada'}</p>
      </div>
    </InfoList>
    <Button variant="link" className="mt-1.5 justify-self-start" onClick={() => { onClose(); onOpenUser(item.requester.id) }}>Ver perfil de {firstName}</Button>

    {!pending && <div className="mt-2 rounded-xl border border-solid border-line p-3 text-[12px] leading-[1.5]">
      <b>{stateLabels[item.state]}</b>
      {item.decided_at && <> · {shortDate(item.decided_at)}</>}
      {item.decided_by && item.state !== 'cancelado' && <> · por {item.decided_by.name}</>}
      {item.state === 'recusado' && <p className="mt-1 text-ink-muted">Motivo: {refusalText(item.reason_code, item.reason_detail)}</p>}
    </div>}

    {pending && !refusing && <SheetActions>
      <Button disabled={busy} onClick={() => void approve()}><Check size={17} aria-hidden="true" />{busy ? 'Aprovando…' : 'Aprovar organizador'}</Button>
      <Button variant="secondary" disabled={busy} onClick={() => { setRefusing(true); setError('') }}><X size={17} aria-hidden="true" />Recusar</Button>
    </SheetActions>}

    {pending && refusing && <div className="mt-3 grid gap-2.5 rounded-card p-3.5 shadow-[inset_0_0_0_1.5px_#b9374955]">
      <b id={`${id}-reason`} className="text-[13px]">Motivo da recusa</b>
      <div role="group" aria-labelledby={`${id}-reason`} aria-describedby={problem && !reason ? `${id}-problem` : undefined} className="flex flex-wrap gap-1.5">
        {ORGANIZER_REFUSAL_REASONS.map(option => <Chip key={option.value} type="button" aria-pressed={reason === option.value}
          className="aria-pressed:border-danger aria-pressed:bg-danger" onClick={() => setReason(option.value)}>{option.label}</Chip>)}
      </div>
      <label htmlFor={`${id}-detail`} className="m-0">Detalhe para quem pediu {reason === 'outro' ? '(obrigatório)' : '(opcional)'}</label>
      <textarea id={`${id}-detail`} className={textareaClass} rows={2} maxLength={ORGANIZER_LIMITS.detailMax} value={detail}
        aria-invalid={Boolean(problem && reason)} aria-describedby={problem ? `${id}-problem` : undefined} onChange={event => setDetail(event.target.value)} />
      {problem && <p id={`${id}-problem`} className={errorClass} role="alert">{problem}</p>}
      <p className="flex items-start gap-2 text-[11px] leading-[1.5] text-ink-muted"><Info size={15} className="mt-px flex-none text-brand" aria-hidden="true" />A pessoa vê o motivo e pode enviar um novo pedido.</p>
      <SheetActions className="mt-0">
        <Button variant="secondary" disabled={busy} onClick={() => { setRefusing(false); setAttempted(false); setError('') }}>Voltar</Button>
        <Button className="bg-danger-ink shadow-none hover:bg-[#9a1e14]" disabled={busy} onClick={() => void refuse()}>{busy ? 'Recusando…' : 'Recusar pedido'}</Button>
      </SheetActions>
    </div>}
    {error && <p className={feedbackVariants()} role="alert">{error}</p>}
  </Sheet>
}
