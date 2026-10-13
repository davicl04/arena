import { useEffect, useId, useState } from "react";
import type { KeyboardEvent } from "react";
import { MapPin, Plus, Search } from "lucide-react";
import { ApiError } from "@/api/client";
import { connection } from "@/api/connection";
import { listCourts, suggestCourt } from "@/api/matches";
import type { CourtOut, MatchDetail } from "@/api/matches";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { feedbackVariants } from "@/components/ui/feedback";
import { LoadError } from "@/components/ui/load-error";
import { toast } from "@/components/ui/toast";
import { courtKindOf } from "@/data/match";
import { reportActionError } from "@/hooks/useSubmit";
import { cn } from "@/lib/utils";

/*
 * Quadra da proposta (RN07): busca no catálogo da cidade (`GET /courts`, com as sugestões em revisão desta partida
 * primeiro) ou "Sugerir outra quadra" (nome e endereço), que fica "em revisão" e vale só nesta partida.
 * O catálogo começa vazio: sem quadras publicadas, a sugestão é o caminho. A sugestão enviada (ou a existente que foi
 * escolhida) é confirmada em toast; a lista que não carregou é um `LoadError`; só a validação do nome e a recusa de campo
 * do servidor ficam no formulário da sugestão.
 */

const SEARCH_DELAY_MS = 300;
/** Id da sugestão que ainda não foi enviada (campeonato): ela só existe quando o agendamento a leva no corpo. */
export const DEFERRED_COURT_ID = 0;
const optionClass =
  "flex w-full items-center gap-2.5 rounded-[13px] border border-solid border-line bg-white px-2.5 py-2 text-left text-ink aria-pressed:border-brand aria-pressed:shadow-[inset_0_0_0_1px_var(--color-brand)]";

function CourtOption({ court, selected, onSelect }: { court: CourtOut; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" className={optionClass} aria-pressed={selected} onClick={onSelect}>
      <span className="grid size-8 flex-none place-items-center rounded-[10px] bg-tile text-brand">
        <MapPin size={16} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[12px]">{court.name}</b>
        <small className="block truncate text-[10px] text-ink-muted">
          {court.provisional ? "Em revisão · usada só nesta partida" : (court.address ?? "Sem endereço informado")}
        </small>
      </span>
      {court.provisional && <Badge className="flex-none bg-warning-bg text-warning">Sugestão em revisão</Badge>}
    </button>
  );
}

export function CourtPicker({
  detail,
  selected,
  onSelect,
  canSuggest,
  onExpired,
  deferSuggestion = false,
}: {
  /** A partida (ou, no campeonato, o recorte que a lista de partidas tem): a cidade e o tipo de quadra. */
  detail: Pick<MatchDetail, "id" | "city" | "sport" | "format">;
  selected: CourtOut | null;
  onSelect: (court: CourtOut) => void;
  canSuggest: boolean;
  onExpired: () => void;
  /**
   * Campeonato: o organizador não usa `POST /courts/suggestions` (só os representantes); a sugestão vira uma quadra
   * provisória (`id` 0) e segue no corpo do agendamento (`court_suggestion`).
   */
  deferSuggestion?: boolean;
}) {
  const id = useId();
  const kind = courtKindOf(detail);
  const [query, setQuery] = useState("");
  const [courts, setCourts] = useState<CourtOut[] | null>(null);
  const [failure, setFailure] = useState("");
  const [failureCause, setFailureCause] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [suggesting, setSuggesting] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestError, setSuggestError] = useState("");

  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(
      () => {
        listCourts({ cityId: detail.city.id, kind, q: query, matchId: detail.id })
          .then((page) => {
            if (!alive) return;
            setCourts(page.items);
            setFailure("");
            setFailureCause(null);
          })
          .catch((cause: unknown) => {
            if (!alive) return;
            if (cause instanceof ApiError && cause.status === 401) onExpired();
            setFailure(cause instanceof Error && cause.message ? cause.message : "Não foi possível carregar as quadras.");
            setFailureCause(cause);
            setCourts([]);
          });
      },
      query ? SEARCH_DELAY_MS : 0,
    );
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [detail.city.id, detail.id, kind, query, onExpired, attempt]);

  /* Se a lista falhou por conexão, lê de novo uma única vez quando ela volta (como `useResource`). */
  const connectionFailure = failureCause instanceof ApiError && failureCause.isConnection;
  useEffect(() => {
    if (!connectionFailure) return;
    return connection.onRestored(() => setAttempt((count) => count + 1));
  }, [connectionFailure]);

  function retry() {
    setFailure("");
    setFailureCause(null);
    setCourts(null);
    setAttempt((count) => count + 1);
  }

  async function suggest() {
    if (busy) return;
    const cleanName = name.trim();
    if (cleanName.length < 2 || cleanName.length > 80) {
      setSuggestError("O nome da quadra precisa ter de 2 a 80 caracteres.");
      return;
    }
    if (deferSuggestion) {
      setSuggestError("");
      const court: CourtOut = {
        id: DEFERRED_COURT_ID,
        name: cleanName,
        address: address.trim() || null,
        kind: kind ?? "society",
        city: detail.city,
        state: "em_revisao",
        provisional: true,
      };
      onSelect(court);
      toast.info(`${cleanName} será sugerida ao agendar: fica em revisão e vale só nesta partida.`);
      setSuggesting(false);
      setName("");
      setAddress("");
      return;
    }
    setBusy(true);
    setSuggestError("");
    try {
      const result = await suggestCourt({ match_id: detail.id, name: cleanName, address: address.trim() || null });
      onSelect(result.court);
      if (result.existing) toast.info(`${result.court.name} já estava no catálogo ou nesta partida e foi selecionada.`);
      else toast.warning(`${result.court.name} foi sugerida.`, { description: 'Fica em revisão e vale só nesta partida até a aprovação da administração.' });
      setSuggesting(false);
      setName("");
      setAddress("");
      setCourts((old) => (old && !old.some((item) => item.id === result.court.id) ? [result.court, ...old] : old));
    } catch (cause) {
      const report = reportActionError(cause, "Não foi possível sugerir a quadra.", onExpired);
      if (report.kind === "form") setSuggestError(report.message);
    } finally {
      setBusy(false);
    }
  }

  /** Enter nos campos da sugestão sugere a quadra, sem enviar a proposta que está em volta. */
  function onEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void suggest();
  }

  const list = courts ?? [];
  const rest = selected ? list.filter((court) => court.id !== selected.id) : list;
  return (
    <div className="grid gap-2" data-slot="court-picker">
      <span className="text-[12px] font-bold" id={`${id}-label`}>
        Quadra em {detail.city.name}
      </span>
      <div role="group" aria-labelledby={`${id}-label`} className="grid gap-1.5">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
          <label htmlFor={`${id}-q`} className="sr-only">
            Buscar quadra
          </label>
          <input
            id={`${id}-q`}
            type="search"
            autoComplete="off"
            placeholder="Buscar quadra pelo nome"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Enter na busca não envia a proposta que está em volta.
              if (event.key === "Enter") event.preventDefault();
            }}
            className="min-h-11 py-2 pl-9 text-[12.5px]"
          />
        </div>
        {selected && <CourtOption court={selected} selected onSelect={() => onSelect(selected)} />}
        {courts === null && (
          <p role="status" className="m-0 py-1 text-[11px] text-ink-muted">
            Buscando quadras…
          </p>
        )}
        {failure && <LoadError size="section" text={failure} cause={failureCause} onRetry={retry} />}
        {rest.map((court) => (
          <CourtOption key={court.id} court={court} selected={false} onSelect={() => onSelect(court)} />
        ))}
        {courts !== null && !failure && rest.length === 0 && !selected && (
          <p className="m-0 py-1 text-[11px] leading-normal text-ink-muted">
            {query.trim() ? `Nenhuma quadra de ${detail.city.name} para “${query.trim()}”.` : `Ainda não há quadras publicadas em ${detail.city.name}.`}
            {canSuggest ? " Sugira a quadra onde vocês vão jogar." : ""}
          </p>
        )}
      </div>
      {canSuggest && !suggesting && (
        <button
          type="button"
          className={cn(optionClass, "border-dashed")}
          onClick={() => setSuggesting(true)}
        >
          <span className="grid size-8 flex-none place-items-center rounded-[10px] bg-tile text-brand">
            <Plus size={16} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <b className="block text-[12px]">Sugerir outra quadra</b>
            <small className="block text-[10px] text-ink-muted">Entra no catálogo depois da revisão</small>
          </span>
        </button>
      )}
      {suggesting && (
        <div role="group" aria-label="Sugerir outra quadra" className="grid gap-1.5 rounded-[13px] border border-dashed border-line-strong p-3">
          <label htmlFor={`${id}-name`} className="m-0 text-[12px] font-bold">
            Nome da quadra
          </label>
          <input id={`${id}-name`} data-autofocus maxLength={80} value={name} onChange={(event) => setName(event.target.value)} onKeyDown={onEnter} placeholder="Ex.: Arena Sudoeste" />
          <label htmlFor={`${id}-address`} className="m-0 mt-1 text-[12px] font-bold">
            Endereço <span className="font-normal text-ink-muted">(opcional)</span>
          </label>
          <input id={`${id}-address`} maxLength={160} value={address} onChange={(event) => setAddress(event.target.value)} onKeyDown={onEnter} placeholder="Rua, número e bairro" />
          <p className="m-0 text-[10.5px] leading-normal text-ink-muted">
            A administração revisa a sugestão. Até lá, ela vale só para esta partida.
          </p>
          {suggestError && (
            <p className={cn(feedbackVariants(), "my-0")} role="alert">
              {suggestError}
            </p>
          )}
          <div className="flex gap-2 *:flex-1">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setSuggesting(false)}>
              Voltar
            </Button>
            <Button type="button" disabled={busy} onClick={() => void suggest()}>
              {busy ? "Enviando…" : "Sugerir quadra"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
