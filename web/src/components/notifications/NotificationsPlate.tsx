import { ArrowLeft, CheckCheck } from 'lucide-react'
import type { NotificationSummary } from '@/api/notifications'
import { Button, IconButton } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { NotificationFilter } from '@/data/notifications'

const filters: { value: NotificationFilter; label: string }[] = [
  { value: 'tudo', label: 'Tudo' },
  { value: 'responder', label: 'Para responder' },
  { value: 'partidas', label: 'Partidas' },
  { value: 'times', label: 'Times' },
  { value: 'eventos', label: 'Eventos' },
]

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** Linha de resumo da placa; sem o resumo lido ainda, nada. */
function SummaryLine({ summary }: { summary: NotificationSummary | null }) {
  if (!summary) return null
  const unread = summary.unread_count
  const pending = summary.pending_count
  const asking = (count: number) => count === 1 ? 'pede sua resposta' : 'pedem sua resposta'
  let content
  if (unread > 0 && pending > 0) content = <><b>{plural(unread, 'não lida', 'não lidas')}</b> · <b>{pending}</b> {asking(pending)}</>
  else if (unread > 0) content = <b>{plural(unread, 'não lida', 'não lidas')}</b>
  else if (pending > 0) content = <>Tudo lido · <b>{pending}</b> ainda {asking(pending)}</>
  else content = 'Tudo em dia'
  return <p className="relative px-5 pb-3.5 text-[12px] text-white/70 [&_b]:font-semibold [&_b]:text-mint" aria-live="polite">{content}</p>
}

/** Número e nome acessível de cada chip: Para responder mostra as pendências; as categorias, as não lidas (só quando há). */
function chipCount(filter: NotificationFilter, summary: NotificationSummary | null): { count: number; label: string } | null {
  if (!summary) return null
  if (filter === 'responder') return summary.pending_count > 0 ? { count: summary.pending_count, label: plural(summary.pending_count, 'pendência', 'pendências') } : null
  if (filter === 'tudo') return null
  const unread = summary.unread_by_category[filter]
  return unread > 0 ? { count: unread, label: plural(unread, 'não lida', 'não lidas') } : null
}

/**
 * Placa da tela de notificações: `forest` com raio inferior de 26 px e o Coliseu ao fundo, voltar, título, "Ler todas"
 * (só com não lidas), a linha de resumo e os cinco filtros (grupo de escolha única; setas movem o foco).
 */
export function NotificationsPlate({ summary, filter, busy, onFilter, onBack, onReadAll }: {
  summary: NotificationSummary | null
  filter: NotificationFilter
  busy: boolean
  onFilter: (filter: NotificationFilter) => void
  onBack: () => void
  onReadAll: () => void
}) {
  return <header className="relative overflow-hidden rounded-b-[26px] bg-forest pb-1 text-white">
    <span aria-hidden="true" className="pointer-events-none absolute -bottom-[60px] left-1/2 h-[200px] w-[380px] -translate-x-1/2 bg-white opacity-[0.05] mask-[url(/images/brand/coliseum.svg)] mask-contain mask-center mask-no-repeat" />
    <div className="relative flex min-h-[56px] items-center gap-1.5 pt-1.5 pr-2.5 pl-1.5">
      <IconButton tone="glass" aria-label="Voltar" className="focus-visible:outline-mint" onClick={onBack}><ArrowLeft size={21} /></IconButton>
      <h1 className="min-w-0 flex-1 text-[17px] text-white">Notificações</h1>
      {summary !== null && summary.unread_count > 0 && <Button variant="glass-link" className="inline-flex min-h-11 flex-none items-center gap-1.5 self-center rounded-full px-2.5 py-0 focus-visible:outline-mint" disabled={busy} onClick={onReadAll}>
        <CheckCheck size={15} aria-hidden="true" />Ler todas
      </Button>}
    </div>
    <SummaryLine summary={summary} />
    <ToggleGroup aria-label="Filtrar notificações" value={[filter]}
      className="relative w-full flex-nowrap gap-1.5 overflow-x-auto rounded-none px-4 pb-3.5 [scrollbar-width:none]"
      onValueChange={next => { const chosen = next[0] as NotificationFilter | undefined; if (chosen && chosen !== filter) onFilter(chosen) }}>
      {filters.map(item => {
        const badge = chipCount(item.value, summary)
        return <ToggleGroupItem key={item.value} value={item.value} aria-label={badge ? `${item.label}, ${badge.label}` : item.label}
          className="h-auto min-h-9 flex-none gap-1.5 rounded-full bg-white/7 px-3 py-[7px] text-[11px] font-semibold text-white/80 hover:bg-white/12 hover:text-white focus-visible:ring-mint/70 data-pressed:bg-mint data-pressed:text-night data-pressed:hover:bg-mint data-pressed:hover:text-night">
          {item.label}
          {badge && <em aria-hidden="true" className="font-mono text-[10px] not-italic opacity-80">{badge.count}</em>}
        </ToggleGroupItem>
      })}
    </ToggleGroup>
  </header>
}
