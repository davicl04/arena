import { useId } from 'react'
import type { ReactNode } from 'react'
import { ChevronRight, Info, QrCode } from 'lucide-react'
import type { AdminEvent } from '@/api/admin'
import type { EventPix, EventPoster as EventPosterData } from '@/api/events'
import { EventPoster } from '@/components/events/EventPoster'
import { errorClass, textareaClass } from '@/components/organizer/fieldStyles'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { SheetActions } from '@/components/ui/sheet'
import { ORGANIZER_LIMITS } from '@/api/organizer'
import { eventFormatParts, eventNoun, pixKeyType } from '@/data/arena'
import { cn } from '@/lib/utils'
import { eventDateParts, formatDeadline, formatPrice } from '@/utils/format'
import { InfoList } from './OrganizerRequestSheet'

/** Bloco de data da linha da fila (`.date-blk`): mês em caixa alta e o dia grande. */
function DateBlock({ iso }: { iso: string | null }) {
  const date = eventDateParts(iso)
  return <span className="grid h-12 w-11 flex-none place-content-center rounded-xl bg-forest text-center text-white" aria-hidden="true">
    <small className="text-[9px] font-bold tracking-[0.08em] text-mint uppercase">{date?.month ?? '—'}</small>
    <b className="font-display text-[18px] leading-none font-extrabold">{date?.day ?? '—'}</b>
  </span>
}

/** Linha das filas de eventos (AD1): data, nome, resumo e chevron; abre a folha. */
export function AdminEventRow({ event, text, badge, onOpen }: { event: Pick<EventPosterData, 'name' | 'starts_at'>; text: string; badge?: ReactNode; onOpen: () => void }) {
  const date = eventDateParts(event.starts_at)
  return <li>
    <button type="button" className="flex w-full items-center gap-3 rounded-card border-0 bg-surface p-2.5 text-left text-inherit shadow-[0_2px_8px_#0000000a] hover:bg-[#fbfbfc] noite:shadow-none noite:hover:bg-[#16241d] noite:inset-ring noite:inset-ring-surface-edge" onClick={onOpen}>
      <DateBlock iso={event.starts_at} />
      <span className="grid min-w-0 flex-1 justify-items-start gap-[3px]">
        <b className="max-w-full truncate text-[13px]">{event.name}</b>
        <small className="text-[10.5px] leading-[1.4] text-ink-muted">{date && <span className="sr-only">{date.label} · </span>}{text}</small>
        {badge}
      </span>
      <ChevronRight size={18} className="flex-none text-ink-muted" aria-hidden="true" />
    </button>
  </li>
}

/** Cartaz do evento (o mesmo do O3 e do E2), sem ação. */
export function AdminPoster({ event, className }: { event: EventPosterData; className?: string }) {
  if (!event.sport) return null
  return <EventPoster className={className} name={event.name} sport={event.sport} startsAt={event.starts_at} format={event.format}
    distanceKm={event.distance_km} eventType={event.competition_type} priceCents={event.price_cents ?? 0}
    acceptedTiers={event.accepted_tiers} state={event.state} phase={event.phase}
    stateLabel={event.revocation_pending ? 'Inscrições suspensas' : undefined}
    entries={event.capacity ? { count: event.entries_count, capacity: event.capacity } : null} />
}

/** Dados do evento na folha: organizador, inscrição, datas, local, vagas e contato. */
export function AdminEventInfo({ event }: { event: AdminEvent }) {
  const sport = event.sport
  const unit = sport ? eventNoun[sport].entrants : 'vagas'
  const category = sport ? eventFormatParts({ sport, format: event.format, distanceKm: event.distance_km, eventType: event.competition_type }).join(' · ') : ''
  const place = [event.venue, event.city && `${event.city.name} · ${event.city.state}`].filter(Boolean).join(' — ')
  return <InfoList items={[
    ['Organizador', event.organizer.display_name],
    ['Inscrição', formatPrice(event.price_cents)],
    ['Data', formatDeadline(event.starts_at) || '—'],
    ['Inscrições até', formatDeadline(event.registration_deadline) || '—'],
    ['Local', place || '—'],
    ['Vagas', event.capacity ? `${event.capacity} ${unit}` : '—'],
    ['Formato', category || '—'],
    ['Contato', event.contact ?? '—'],
  ]}>
    {event.course_notes && <div className="mt-2.5">
      <p className="text-[9px] font-extrabold tracking-[0.08em] text-ink-muted uppercase">Percurso</p>
      <p className="mt-0.5 text-[12px] leading-[1.5] whitespace-pre-line wrap-anywhere">{event.course_notes}</p>
    </div>}
  </InfoList>
}

/** "Pix informado" pelo organizador, para conferir antes de publicar. */
export function PixInformed({ pix }: { pix: EventPix | null }) {
  const kind = pix?.key_type ? pixKeyType[pix.key_type] : null
  const items: [string, string][] = [
    ['Favorecido', pix?.beneficiary ?? '—'],
    [kind ? `Chave (${kind.label})` : 'Chave', pix?.key ?? '—'],
    ['Copia e Cola', pix?.copy_paste ? 'Informado' : 'Não informado'],
    ['Instruções', pix?.instructions ?? '—'],
  ]
  return <section aria-label="Pix informado" className="mt-2.5 rounded-xl border border-solid border-line p-3">
    <p className="flex items-center gap-2 text-[12px] font-bold"><QrCode size={16} className="text-brand" aria-hidden="true" />Pix informado</p>
    <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[12px]">
      {items.map(([term, value]) => <div key={term} className="contents">
        <dt className="text-ink-muted">{term}</dt>
        <dd className="font-semibold wrap-anywhere">{value}</dd>
      </div>)}
    </dl>
    {pix?.copy_paste && <details className="mt-2 text-[11px]">
      <summary className="cursor-pointer font-bold text-brand">Ver o código Copia e Cola</summary>
      <p className="mt-1 rounded-lg bg-subtle p-2 font-mono text-[10.5px] wrap-anywhere">{pix.copy_paste}</p>
    </details>}
  </section>
}

/**
 * Painel do motivo (recusa, cancelamento ou decisão): opções em chips (quando há), texto e as ações. A validação vem
 * de quem usa (`error`), com as mesmas mensagens do servidor.
 */
export function ReasonPanel({ title, options, option, onOption, textLabel, text, onText, max = ORGANIZER_LIMITS.detailMax, error, note, confirmLabel, busyLabel, busy, onConfirm, onCancel, tone = 'danger' }: {
  title: string
  options?: readonly { value: string; label: string }[]
  option?: string | null
  onOption?: (value: string) => void
  textLabel: string
  text: string
  onText: (value: string) => void
  max?: number
  error: string | null
  note: ReactNode
  confirmLabel: string
  busyLabel: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
  tone?: 'danger' | 'brand'
}) {
  const id = useId()
  return <div className={cn('mt-3 grid gap-2.5 rounded-card p-3.5', tone === 'danger' ? 'shadow-[inset_0_0_0_1.5px_#b9374955] noite:shadow-[inset_0_0_0_1.5px_#ff8a8055]' : 'shadow-[inset_0_0_0_1.5px_#005a3655] noite:shadow-[inset_0_0_0_1.5px_#8fe0b455]')}>
    <b id={`${id}-title`} className="text-[13px]">{title}</b>
    {options && <div role="group" aria-labelledby={`${id}-title`} className="flex flex-wrap gap-1.5">
      {options.map(item => <Chip key={item.value} type="button" aria-pressed={option === item.value}
        className="aria-pressed:border-danger aria-pressed:bg-danger" onClick={() => onOption?.(item.value)}>{item.label}</Chip>)}
    </div>}
    <label htmlFor={`${id}-text`} className="m-0">{textLabel}</label>
    <textarea id={`${id}-text`} data-autofocus={options ? undefined : true} className={textareaClass} rows={3} maxLength={max} value={text}
      aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : `${id}-note`} onChange={event => onText(event.target.value)} />
    {error && <p id={`${id}-error`} className={errorClass} role="alert">{error}</p>}
    <p id={`${id}-note`} className="flex items-start gap-2 text-[11px] leading-[1.5] text-ink-muted"><Info size={15} className="mt-px flex-none text-brand" aria-hidden="true" />{note}</p>
    <SheetActions className="mt-0">
      <Button variant="secondary" disabled={busy} onClick={onCancel}>Voltar</Button>
      <Button className={tone === 'danger' ? 'bg-danger-ink shadow-none hover:bg-[#9a1e14] noite:hover:bg-[#ffa39b]' : undefined} disabled={busy} onClick={onConfirm}>{busy ? busyLabel : confirmLabel}</Button>
    </SheetActions>
  </div>
}
