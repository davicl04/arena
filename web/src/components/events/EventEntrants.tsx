import { Users } from "lucide-react";
import type { Sport } from "@/api/client";
import { publicEntriesPath } from "@/api/entries";
import type { PublicEntry } from "@/api/entries";
import { SocialPhoto } from "@/components/SocialPhoto";
import { TeamCrest } from "@/components/arena/TeamCrest";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { feedbackVariants } from "@/components/ui/feedback";
import { LoadError } from "@/components/ui/load-error";
import { eventNoun } from "@/data/arena";
import { usePagedList } from "@/hooks/usePagedList";
import { cn } from "@/lib/utils";
import { formatShortDate, parseIso } from "@/utils/format";

/** Aba Inscritos do D2: só as inscrições confirmadas, na ordem da confirmação, com o selo "Você" na de quem vê. */
export function EventEntrants({ eventId, sport, myEntryId, onOpenUser, onExpired }: {
  eventId: number;
  sport: Sport;
  /** Inscrição de quem vê (destaca a linha). */
  myEntryId: number | null;
  onOpenUser?: (id: number) => void;
  onExpired: () => void;
}) {
  const list = usePagedList<PublicEntry>(publicEntriesPath(eventId), onExpired);
  const noun = eventNoun[sport];
  if (list.loading)
    return (
      <p role="status" className="m-0 px-1 text-[11px] text-ink-muted">
        Carregando inscritos…
      </p>
    );
  if (list.error) return <LoadError size="section" title="Não foi possível carregar os inscritos" text={list.error.message} cause={list.error} onRetry={list.reload} />;
  if (list.items.length === 0)
    return (
      <EmptyState
        Icon={Users}
        title="Nenhuma inscrição confirmada"
        text={`Os ${noun.entrants} aparecem aqui quando a inscrição é confirmada.`}
        className="rounded-card bg-white"
      />
    );
  return (
    <div className="grid gap-2">
      <Card elevated className="px-3.5 py-1">
        <ul className="m-0 grid list-none p-0" aria-label={`${noun.entrants[0].toUpperCase()}${noun.entrants.slice(1)} confirmados`}>
          {list.items.map((item) => {
            const team = item.subject.team;
            const athlete = item.subject.athlete;
            const name = team?.name ?? athlete?.name ?? "Inscrição";
            const mine = item.id === myEntryId;
            const confirmed = parseIso(item.confirmed_at);
            return (
              <li key={item.id} className="flex min-h-[52px] items-center gap-2.5 py-2 [&+&]:border-t [&+&]:border-solid [&+&]:border-line">
                {team ? (
                  <TeamCrest name={team.name} initials={team.initials} path={team.crest_url} size="sm" decorative />
                ) : athlete && onOpenUser ? (
                  <button type="button" className="rounded-full border-0 bg-transparent p-0" aria-label={`Abrir perfil de ${athlete.name}`} onClick={() => onOpenUser(athlete.id)}>
                    <SocialPhoto path={athlete.avatar_url} name={athlete.name} size="comment" className="size-8 flex-[0_0_32px]" />
                  </button>
                ) : (
                  <SocialPhoto path={athlete?.avatar_url ?? null} name={name} size="comment" className="size-8 flex-[0_0_32px]" />
                )}
                <span className="grid min-w-0 flex-1 gap-px">
                  <b className="flex min-w-0 flex-wrap items-center gap-1.5 text-[12px] wrap-anywhere">
                    {name}
                    {mine && <span className="rounded-full bg-success-bg px-[7px] py-px text-[9.5px] font-extrabold text-brand">Você</span>}
                  </b>
                  <small className="text-[10.5px] text-ink-muted">
                    {athlete ? `@${athlete.username} · ` : ""}
                    {confirmed ? `confirmado em ${formatShortDate(confirmed)}` : "confirmado"}
                  </small>
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
      {list.moreError && (
        <p className={cn(feedbackVariants(), "my-0")} role="alert">
          {list.moreError}
        </p>
      )}
      {list.hasMore && (
        <Button variant="secondary" className="w-full" disabled={list.busy} onClick={() => void list.loadMore()}>
          {list.busy ? "Carregando…" : "Carregar mais inscritos"}
        </Button>
      )}
    </div>
  );
}
