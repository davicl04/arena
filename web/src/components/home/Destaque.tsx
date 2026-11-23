import type { ArenaNotification } from '@/api/notifications'
import { NotificationLead } from '@/components/notifications/NotificationLead'
import { Button } from '@/components/ui/button'
import { SectionTitle } from '@/components/ui/section-title'
import { morePendingLabel, urgencyLabel } from '@/data/home'
import { notificationView, pendingDeadline, pendingView } from '@/data/notifications'
import { cn } from '@/lib/utils'

/**
 * Destaque do Início ("Para responder"): o cabeçalho com o total de pendências (`pending_count`) num selo âmbar e um cartão
 * claro com a primeira pendência da lista do servidor (já ordenada por urgência): o *lead* das notificações, "Mais urgente"
 * (prazo no fim, critério `warn`) ou "Aguardando você", o rótulo e a linha secundária, o prazo ("sem prazo" ou "faltam
 * {tempo}", âmbar com `warn`) e o botão visual "Responder". Com `warn`, o cartão ganha a borda âmbar à esquerda. O cartão
 * inteiro é um único botão (`onOpen`: marca como lida e leva ao aviso); nada se aceita ou recusa aqui. Com mais de uma
 * pendência, o link "+ n pendências · ver todas" chama `onOpenAll`. Quem usa só o renderiza quando há pendência.
 * O Início do Expo tem o mesmo Destaque, com os mesmos textos.
 */
export function Destaque({ notification, total, now, isAdmin = false, onOpen, onOpenAll }: {
  /** A primeira pendência da lista (`GET /me/notifications/pending?limit=1`). */
  notification: ArenaNotification
  /** Total de pendências abertas (`pending_count` do resumo). */
  total: number
  now: number
  isAdmin?: boolean
  onOpen: (notification: ArenaNotification) => void
  onOpenAll: () => void
}) {
  const view = notificationView(notification, { isAdmin })
  const pending = pendingView(notification)
  const deadline = pendingDeadline(notification, now)
  const urgency = urgencyLabel(deadline.warn)
  const secondary = pending.secondary || view.text
  const due = deadline.left === null ? 'sem prazo' : `faltam ${deadline.left}`
  const more = morePendingLabel(total)
  const name = [`${urgency}: ${pending.label.toLocaleLowerCase('pt-BR')}`, secondary, due].filter(Boolean).join('. ')
  return <section aria-labelledby="destaque-title" data-slot="destaque">
    <SectionTitle
      title={<span id="destaque-title">Para responder</span>}
      action={<span aria-label={`${total} ${total === 1 ? 'pendência' : 'pendências'}`}
        className="flex-none rounded-full bg-warning-bg px-[9px] py-[3px] font-mono text-[11px] font-bold text-warning tabular-nums">{total}</span>}
    />
    <button type="button" data-slot="destaque-card" data-warn={deadline.warn ? '' : undefined} aria-label={name}
      onClick={() => onOpen(notification)}
      className={cn('block w-full cursor-pointer rounded-card border border-solid border-line surface p-3.5 text-left shadow-card noite:border-surface-edge',
        deadline.warn && 'border-l-[3px] border-l-[#d99400] noite:border-l-[#d99400]')}>
      <span className="flex items-start gap-3">
        <NotificationLead view={view} />
        <span className="min-w-0 flex-1">
          <span data-slot="destaque-urgency" className={cn('block text-[10px] font-bold tracking-[0.06em] uppercase', deadline.warn ? 'text-warning' : 'text-eyebrow')}>{urgency}</span>
          <b className="mt-[3px] block font-display text-[15px] leading-[1.3] font-bold wrap-break-word text-heading">{pending.label}</b>
          {secondary && <small className="mt-0.5 line-clamp-2 text-[11.5px] leading-[1.4] wrap-break-word text-ink-muted">{secondary}</small>}
        </span>
      </span>
      <span className="mt-3.5 flex items-center justify-between gap-2">
        <span data-slot="destaque-deadline" className={cn('min-w-0 truncate rounded-full px-2 py-[3px] font-mono text-[10px] font-bold',
          deadline.warn ? 'bg-warning-bg text-warning' : deadline.left === null ? 'bg-subtle text-ink-muted' : 'bg-success-bg text-brand')}>{due}</span>
        <span aria-hidden="true" className="inline-flex h-9 flex-none items-center rounded-control bg-brand px-3.5 text-[12px] font-bold text-on-brand shadow-primary">Responder</span>
      </span>
    </button>
    {more && <Button variant="link" className="mt-1.5 min-h-11" aria-label={`Ver todas as ${total} pendências`} onClick={onOpenAll}>{more}</Button>}
  </section>
}
