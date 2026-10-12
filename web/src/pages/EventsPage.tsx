import { useState } from "react";
import { ChevronRight, Flag, Lock, MapPin, Trophy } from "lucide-react";
import { sports } from "../api/client";
import type { City, Profile, Sport } from "../api/client";
import { eventsPath, myEntriesPath } from "../api/entries";
import type { EventCard, MyEntry } from "../api/entries";
import { EventPoster } from "../components/events/EventPoster";
import { StateBadge } from "../components/events/StateBadge";
import { isLocked } from "../components/events/entryCta";
import { entryState, eventNoun, sportIcons } from "../data/arena";
import { usePagedList } from "../hooks/usePagedList";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { feedbackVariants } from "@/components/ui/feedback";
import { ListGroup, ListHeading } from "@/components/ui/list-row";
import { cn } from "@/lib/utils";
import { eventDateParts } from "@/utils/format";

/** Linha abaixo do cartaz: o motivo do cadeado ou por que não dá para se inscrever agora. */
function posterNote(card: EventCard, locked: boolean): string {
  if (locked) return card.eligibility.message ?? "Fora da faixa de elos do evento.";
  if (card.my_entry) return "";
  if (card.revocation_pending) return "Inscrições suspensas";
  if (card.phase === "inscricoes_encerradas") return "Inscrições encerradas";
  if (card.capacity && card.entries_count >= card.capacity) return "Vagas esgotadas";
  return "";
}

/** Artigo e nome no singular: "nenhum campeonato", "nenhuma prova". */
const none = (sport: Sport) => (sport === "corrida" ? "Nenhuma prova aberta" : "Nenhum campeonato aberto");

/** Cartazes da modalidade e da cidade, paginados, com o estado vazio honesto. */
function EventGrid({ path, sport, cityName, onAllCities, onOpen, onExpired }: {
  path: string;
  sport: Sport;
  /** Cidade do filtro; sem ela, todas as cidades. */
  cityName: string | null;
  onAllCities?: () => void;
  onOpen: (card: EventCard) => void;
  onExpired: () => void;
}) {
  const list = usePagedList<EventCard>(path, onExpired);
  const noun = eventNoun[sport];
  if (list.loading) return <p role="status">Carregando {noun.many.toLowerCase()}…</p>;
  if (list.error)
    return (
      <div className={feedbackVariants()} role="alert">
        {list.error.message}{" "}
        <Button variant="text" className="inline min-h-0 p-0" onClick={list.reload}>
          Tentar novamente
        </Button>
      </div>
    );
  if (list.items.length === 0)
    return (
      <EmptyState
        Icon={sport === "corrida" ? Flag : Trophy}
        title={cityName ? `${none(sport)} em ${cityName}` : none(sport)}
        text={`Quando um organizador publicar ${sport === "corrida" ? "uma prova" : "um campeonato"}${cityName ? " na sua cidade" : ""}, ${sport === "corrida" ? "ela" : "ele"} aparece aqui.`}
        action={
          onAllCities ? (
            <Button variant="secondary" className="mt-4" onClick={onAllCities}>
              Ver todas as cidades
            </Button>
          ) : undefined
        }
      />
    );
  return (
    <>
      <ul className="m-0 grid list-none grid-cols-[repeat(2,minmax(0,1fr))] gap-2.5 p-0" aria-label={noun.many}>
        {list.items.map((card) => {
          const locked = isLocked(card);
          const note = posterNote(card, locked);
          return (
            <li key={card.id} className="grid min-w-0 content-start gap-1">
              <EventPoster
                name={card.name}
                sport={card.sport ?? sport}
                startsAt={card.starts_at}
                format={card.format}
                distanceKm={card.distance_km}
                eventType={card.competition_type}
                priceCents={card.price_cents ?? 0}
                acceptedTiers={card.accepted_tiers}
                entries={card.capacity ? { count: card.entries_count, capacity: card.capacity } : null}
                state={card.state === "em_andamento" ? "em_andamento" : null}
                entryState={card.my_entry?.state ?? null}
                locked={locked}
                onClick={() => onOpen(card)}
              />
              {note && (
                <small className="flex items-start gap-1 px-1 text-[10px] leading-[1.4] text-ink-muted">
                  {locked && <Lock size={12} className="mt-px flex-none" aria-hidden="true" />}
                  {note}
                </small>
              )}
            </li>
          );
        })}
      </ul>
      {list.moreError && (
        <p className={feedbackVariants()} role="alert">
          {list.moreError}
        </p>
      )}
      {list.hasMore && (
        <Button variant="secondary" className="mt-3.5 w-full" disabled={list.busy} onClick={() => void list.loadMore()}>
          {list.busy ? "Carregando…" : `Carregar mais ${noun.many.toLowerCase()}`}
        </Button>
      )}
    </>
  );
}

/** "Minhas inscrições" da modalidade: inscrições em curso (ocupam vaga ou com devolução), acima dos cartazes. */
function MyEntries({ entries, onOpen }: { entries: MyEntry[]; onOpen: (entry: MyEntry) => void }) {
  return (
    <section aria-labelledby="minhas-inscricoes" className="mb-4">
      <ListHeading id="minhas-inscricoes" className="mt-0">
        Minhas inscrições
      </ListHeading>
      <ListGroup className="shadow-card">
        {entries.map((entry) => {
          const date = eventDateParts(entry.event.starts_at);
          const info = entryState[entry.state];
          return (
            <button
              key={entry.id}
              type="button"
              className="flex min-h-[58px] w-full items-center gap-3 border-0 bg-transparent px-3.5 py-2.5 text-left text-inherit enabled:hover:bg-[#f6f7f9] [&+&]:border-t [&+&]:border-solid [&+&]:border-line"
              onClick={() => onOpen(entry)}
            >
              <span className="grid w-10 flex-none justify-items-center rounded-[10px] bg-forest py-1 text-mint" aria-hidden="true">
                <b className="font-display text-[15px] leading-none text-white">{date?.day ?? "—"}</b>
                <small className="text-[9px] font-bold tracking-[0.08em] uppercase">{date?.month ?? ""}</small>
              </span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <b className="text-[12px] wrap-anywhere">{entry.event.name}</b>
                <small className="text-[10.5px] text-ink-muted">
                  {date ? date.label : "Data a definir"}
                  {entry.subject.team ? ` · ${entry.subject.team.name}` : ""}
                </small>
              </span>
              {info && (
                <StateBadge tone={info.tone} className="flex-none">
                  {info.short}
                </StateBadge>
              )}
              <ChevronRight size={16} className="flex-none text-ink-muted" aria-hidden="true" />
            </button>
          );
        })}
      </ListGroup>
    </section>
  );
}

/**
 * Campeonatos e provas do atleta (E2 do Jogar): chips das modalidades, a cidade do perfil da modalidade (com a
 * opção de ver todas), "Minhas inscrições" em curso e os cartazes verde-escuros, com os fora da faixa apagados e
 * com cadeado. Só eventos reais: sem eventos publicados, o estado vazio.
 */
export default function EventsPage({ sport, profiles, cities, loading, onSport, onOpen, onSports, onExpired }: {
  sport: Sport;
  profiles: Profile[];
  cities: City[];
  /** Perfis esportivos ainda carregando (a cidade do filtro vem deles). */
  loading: boolean;
  onSport: (sport: Sport) => void;
  onOpen: (eventId: number, sport: Sport) => void;
  /** Suas modalidades, para definir a cidade do perfil. */
  onSports: () => void;
  onExpired: () => void;
}) {
  const [allCities, setAllCities] = useState(false);
  const mine = usePagedList<MyEntry>(myEntriesPath("ativas"), onExpired);
  const profile = profiles.find((item) => item.sport === sport);
  const city = cities.find((item) => item.id === profile?.city_id) ?? null;
  const filtered = Boolean(city) && !allCities;
  const label = sports.find((item) => item.value === sport)?.label ?? "";
  const myEntries = mine.items.filter((entry) => entry.event.sport === sport);
  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap gap-[7px]" role="group" aria-label="Modalidade">
        {sports.map((item) => {
          const Icon = sportIcons[item.value];
          return (
            <Chip key={item.value} aria-pressed={sport === item.value} onClick={() => onSport(item.value)}>
              <Icon size={15} />
              {item.label}
            </Chip>
          );
        })}
      </div>
      <div className="mb-4 flex min-h-11 items-center gap-2 rounded-xl bg-white px-[13px] py-1.5 text-[11px]">
        <MapPin size={16} className="flex-none text-brand" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">
          {loading ? "Carregando cidade…" : filtered && city ? city.name : city ? "Todas as cidades" : `Sem cidade no perfil de ${label} · todas as cidades`}
        </span>
        {!loading &&
          (city ? (
            <Button variant="link" className="flex-none" aria-pressed={!filtered} onClick={() => setAllCities((value) => !value)}>
              {filtered ? "Ver todas" : `Só ${city.name}`}
            </Button>
          ) : (
            <Button variant="link" className="flex-none" onClick={onSports}>
              Definir cidade
            </Button>
          ))}
      </div>
      {myEntries.length > 0 && <MyEntries entries={myEntries} onOpen={(entry) => onOpen(entry.event.id, sport)} />}
      {mine.error && (
        <p className={cn(feedbackVariants(), "mt-0")} role="alert">
          Não foi possível carregar as suas inscrições. {mine.error.message}
        </p>
      )}
      {loading ? (
        <p role="status">Carregando {eventNoun[sport].many.toLowerCase()}…</p>
      ) : (
        <EventGrid
          path={eventsPath(sport, filtered ? city?.id : null)}
          sport={sport}
          cityName={filtered ? (city?.name ?? null) : null}
          onAllCities={filtered ? () => setAllCities(true) : undefined}
          onOpen={(card) => onOpen(card.id, card.sport ?? sport)}
          onExpired={onExpired}
        />
      )}
    </div>
  );
}
