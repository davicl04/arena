import { Megaphone, OctagonX } from "lucide-react";
import { eventMessagesPath } from "@/api/events";
import type { EventMessage } from "@/api/events";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { feedbackVariants } from "@/components/ui/feedback";
import { LoadError } from "@/components/ui/load-error";
import { usePagedList } from "@/hooks/usePagedList";
import { cn } from "@/lib/utils";
import { formatDeadline } from "@/utils/format";
import { relativeTime } from "@/utils/relativeTime";

/**
 * Canal de avisos do evento (0003, seção 10.1): o organizador escreve e os inscritos leem, do mais recente ao mais
 * antigo. O aviso automático do cancelamento aparece em destaque.
 */
export function EventNotices({ eventId, onExpired }: { eventId: number; onExpired: () => void }) {
  const list = usePagedList<EventMessage>(eventMessagesPath(eventId), onExpired);
  return (
    <section aria-labelledby={`avisos-${eventId}`} className="grid gap-2">
      <h2 id={`avisos-${eventId}`} className="flex items-center gap-2 px-1 text-[13px]">
        <Megaphone size={16} className="text-brand" aria-hidden="true" />
        Avisos do organizador
      </h2>
      {list.loading ? (
        <p role="status" className="m-0 px-1 text-[11px] text-ink-muted">
          Carregando avisos…
        </p>
      ) : list.error ? (
        <LoadError size="section" title="Não foi possível carregar os avisos" text={list.error.message} cause={list.error} onRetry={list.reload} />
      ) : list.items.length === 0 ? (
        <p className="m-0 surface rounded-card px-3.5 py-3 inset-ring inset-ring-surface-edge text-[11px] leading-normal text-ink-muted">
          Nenhum aviso do organizador por enquanto. Os avisos aparecem aqui e nas suas notificações.
        </p>
      ) : (
        <Card className="overflow-hidden p-0">
          <ol className="m-0 grid list-none p-0">
            {list.items.map((message) => {
              const cancelled = message.kind === "evento_cancelado";
              return (
                <li
                  key={message.id}
                  data-kind={message.kind}
                  className={cn(
                    "grid gap-1 px-3.5 py-3 [&+&]:border-t [&+&]:border-solid [&+&]:border-line",
                    cancelled && "bg-[#fff0f2] noite:bg-error-bg",
                  )}
                >
                  {cancelled && (
                    <b className="flex items-center gap-1.5 text-[11.5px] text-danger">
                      <OctagonX size={15} aria-hidden="true" />
                      Evento cancelado
                    </b>
                  )}
                  <p className="m-0 text-[12px] leading-normal whitespace-pre-line wrap-anywhere text-ink">{message.body}</p>
                  <small className="text-[10px] text-ink-muted">
                    {message.author?.name ?? "Organizador"} ·{" "}
                    <time dateTime={message.created_at} title={formatDeadline(message.created_at)}>
                      {relativeTime(message.created_at)}
                    </time>
                  </small>
                </li>
              );
            })}
          </ol>
        </Card>
      )}
      {list.moreError && (
        <p className={cn(feedbackVariants(), "my-0")} role="alert">
          {list.moreError}
        </p>
      )}
      {list.hasMore && (
        <Button variant="secondary" className="w-full" disabled={list.busy} onClick={() => void list.loadMore()}>
          {list.busy ? "Carregando…" : "Ver avisos anteriores"}
        </Button>
      )}
    </section>
  );
}
