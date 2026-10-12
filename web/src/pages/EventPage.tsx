import { useCallback, useEffect, useId, useRef, useState } from "react";
import { GitFork, Lock, MapPin, OctagonX, PauseCircle, Route, Settings2, Upload } from "lucide-react";
import type { Sport } from "../api/client";
import {
  cancelEntry,
  confirmRefund,
  contestRefund,
  createEntry,
  getEntry,
  getEvent,
  pixInfo,
  sendReceipt,
} from "../api/entries";
import type { EventDetail, MyEntry } from "../api/entries";
import { EventPoster } from "../components/events/EventPoster";
import { EntryStatus } from "../components/events/EntryStatus";
import {
  CancelEntrySheet,
  ConfirmRefundSheet,
  ContactSheet,
  ContestRefundSheet,
  EnterSheet,
  ReceiptSheet,
} from "../components/events/EntrySheets";
import { EventEntrants } from "../components/events/EventEntrants";
import { EventFacts, OrganizerCard, PaymentHint, PaymentInfoButton, Term } from "../components/events/EventFacts";
import { placeText } from "../components/events/eventText";
import { EventNotices } from "../components/events/EventNotices";
import { PaymentInfoSheet } from "../components/events/PaymentInfoSheet";
import { entryCta, isLocked } from "../components/events/entryCta";
import { eventFormatParts } from "../data/arena";
import { useResource } from "../hooks/useResource";
import { useSubmit } from "../hooks/useSubmit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { feedbackVariants } from "@/components/ui/feedback";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatDeadline, parseIso } from "@/utils/format";

type Section = "info" | "tabela" | "percurso" | "inscritos";
type SheetKind = "enter" | "info" | "receipt" | "confirm-refund" | "contest" | "cancel" | "contact";
const DAY = 86_400_000;
/** Estados do evento em que o cartaz do detalhe mostra o selo (aberto não precisa de selo). */
const BADGE_STATES = ["em_andamento", "encerrado", "cancelado"] as const;

/**
 * Detalhe do evento do atleta (D2 do Jogar): cartaz no topo, o cartão S1 da inscrição de quem vê, os avisos do
 * organizador (para os inscritos), as abas Informações | Tabela (ou Percurso, na corrida) | Inscritos e o botão
 * fixo de inscrição, acima da navegação inferior. Inscrição gratuita confirmada na hora; paga com reserva, Pix,
 * comprovante e, no cancelamento do evento, a resposta à devolução.
 */
export default function EventPage({ eventId, onSport, onTeams, onManage, onOpenUser, onExpired }: {
  eventId: number;
  /** Modalidade do evento, para o título da barra ("Campeonato" ou "Prova"). */
  onSport?: (sport: Sport) => void;
  /** Futebol sem time representado: Meus times. */
  onTeams: () => void;
  /** Organizador do evento: abre a gestão. */
  onManage?: (eventId: number) => void;
  onOpenUser?: (id: number) => void;
  onExpired: () => void;
}) {
  const ids = useId();
  const loadEvent = useCallback(() => getEvent(eventId), [eventId]);
  const event = useResource(loadEvent, onExpired, { fallback: "Não foi possível carregar o evento." });
  const detail = event.data;
  const summaryId = detail?.my_entry?.id ?? null;
  const loadEntry = useCallback(() => getEntry(summaryId ?? 0), [summaryId]);
  const mine = useResource(loadEntry, onExpired, { enabled: summaryId !== null, fallback: "Não foi possível carregar a sua inscrição." });
  const entry = mine.data && mine.data.id === summaryId ? mine.data : null;
  const [section, setSection] = useState<Section>("info");
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [infoReturn, setInfoReturn] = useState<SheetKind | null>(null);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | undefined>(undefined);
  const action = useSubmit(onExpired);
  const { setError } = action;
  const sport = detail?.sport ?? "futebol";

  useEffect(() => {
    if (detail?.sport) onSport?.(detail.sport);
  }, [detail?.sport, onSport]);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const setEvent = event.setData;
  const setEntry = mine.setData;
  /** Relê o evento (e a inscrição) sem esconder a tela; a inscrição nova é lida quando o resumo muda. */
  const refresh = useCallback(async (next?: MyEntry) => {
    if (next) setEntry(next);
    try {
      setEvent(await getEvent(eventId));
      if (!next && summaryId !== null) setEntry(await getEntry(summaryId));
    } catch {
      /* a tela segue com os dados anteriores; a próxima leitura corrige */
    }
  }, [eventId, setEntry, setEvent, summaryId]);

  // A reserva (ou a recusa) vence enquanto a tela está aberta: relê no fim do prazo para mostrar "A vaga foi liberada".
  useEffect(() => {
    if (!entry || (entry.state !== "reservada" && entry.state !== "rejeitada")) return;
    const left = (parseIso(entry.reserved_until)?.getTime() ?? 0) - Date.now();
    if (left <= 0 || left > DAY) return;
    const id = window.setTimeout(() => void refresh(), left + 1500);
    return () => window.clearTimeout(id);
  }, [entry, refresh]);

  function notify(message: string) {
    window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(""), 6000);
  }
  function open(kind: SheetKind) {
    setError("");
    setSheet(kind);
  }
  function openInfo(from: SheetKind | null) {
    setInfoReturn(from);
    setSheet("info");
  }
  function closeSheet() {
    if (sheet === "info" && infoReturn) {
      setSheet(infoReturn);
      setInfoReturn(null);
      return;
    }
    setSheet(null);
    setInfoReturn(null);
  }

  if (event.loading) return <p role="status">Carregando evento…</p>;
  if (!detail)
    return (
      <div className={feedbackVariants()} role="alert">
        {event.error}{" "}
        <Button variant="text" className="inline min-h-0 p-0" onClick={event.reload}>
          Tentar novamente
        </Button>
      </div>
    );

  const current: EventDetail = detail;
  const paid = (current.price_cents ?? 0) > 0;
  const pix = pixInfo(current);
  const cta = entryCta(current, entry);
  const run = sport === "corrida";
  const locked = isLocked(current);
  const showLock = !current.is_organizer && !current.eligibility.eligible && current.eligibility.message && (!entry || ["expirada", "cancelada"].includes(entry.state));
  const sections: { value: Section; label: string }[] = [
    { value: "info", label: "Informações" },
    run ? { value: "percurso", label: "Percurso" } : { value: "tabela", label: "Tabela" },
    { value: "inscritos", label: "Inscritos" },
  ];
  const panelId = `${ids}-panel`;
  const badgeState = BADGE_STATES.find((state) => state === current.state) ?? null;

  async function enter(teamId: number | null) {
    const created = await action.run(() => createEntry(current.id, teamId), "Não foi possível concluir a inscrição.");
    if (!created) return;
    setSheet(null);
    notify(
      created.state === "confirmada"
        ? `Inscrição confirmada em ${current.name}.`
        : `Vaga reservada. Envie o comprovante até ${formatDeadline(created.reserved_until)}.`,
    );
    await refresh(created);
  }
  async function upload(file: File) {
    if (!entry) return;
    const updated = await action.run(() => sendReceipt(entry.id, file), "Não foi possível enviar o comprovante.");
    if (!updated) return;
    setSheet(null);
    notify(`Comprovante enviado. ${current.organizer.display_name} vai analisar o pagamento.`);
    await refresh(updated);
  }
  async function answerRefund(reason?: string) {
    if (!entry) return;
    const updated = await action.run(
      () => (reason === undefined ? confirmRefund(entry.id) : contestRefund(entry.id, reason)),
      "Não foi possível responder à devolução.",
    );
    if (!updated) return;
    setSheet(null);
    notify(reason === undefined ? "Recebimento da devolução confirmado." : "Contestação enviada à administração.");
    await refresh(updated);
  }
  async function giveUp() {
    if (!entry) return;
    const done = await action.run(async () => {
      await cancelEntry(entry.id);
      return true;
    }, "Não foi possível cancelar a inscrição.");
    if (!done) return;
    setSheet(null);
    notify("Inscrição cancelada. A vaga ficou livre.");
    await refresh();
  }

  return (
    <div className="grid gap-3 pb-2" data-event={current.id}>
      <EventPoster
        size="hero"
        name={current.name}
        sport={sport}
        startsAt={current.starts_at}
        format={current.format}
        distanceKm={current.distance_km}
        eventType={current.competition_type}
        priceCents={current.price_cents ?? 0}
        acceptedTiers={current.accepted_tiers}
        state={badgeState}
        organizer={current.organizer.display_name}
        locked={locked}
      />
      {current.state === "cancelado" && (
        <div role="note" className="flex gap-2.5 rounded-[14px] bg-error-bg p-3 text-left">
          <OctagonX size={20} className="flex-none text-error" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <b className="block text-[12.5px] text-error">Evento cancelado</b>
            <small className="mt-0.5 block text-[11px] leading-normal wrap-anywhere text-ink">
              {current.cancel_reason ? `Motivo: ${current.cancel_reason}` : "O organizador cancelou o evento."}
            </small>
          </div>
        </div>
      )}
      {current.revocation_pending && current.state !== "cancelado" && (
        <div role="note" className="flex gap-2.5 rounded-[14px] bg-subtle p-3">
          <PauseCircle size={20} className="flex-none text-ink-muted" aria-hidden="true" />
          <p className="m-0 text-[11px] leading-normal text-ink">
            <b className="block text-[12.5px]">Inscrições suspensas</b>A administração está decidindo se o evento segue.
          </p>
        </div>
      )}
      {current.is_organizer && (
        <Card elevated className="flex flex-wrap items-center gap-2.5 px-3.5 py-3">
          <Settings2 size={19} className="flex-none text-brand" aria-hidden="true" />
          <p className="m-0 min-w-0 flex-1 text-[11.5px] leading-normal text-ink">
            Você organiza {run ? "esta prova" : "este campeonato"}. Inscrições, comprovantes e avisos ficam na gestão.
          </p>
          {onManage && (
            <Button variant="secondary" size="compact" onClick={() => onManage(current.id)}>
              Abrir gestão
            </Button>
          )}
        </Card>
      )}
      {summaryId !== null && !entry && mine.loading && (
        <p role="status" className="m-0 px-1 text-[11px] text-ink-muted">
          Carregando sua inscrição…
        </p>
      )}
      {summaryId !== null && !entry && mine.error && (
        <div className={cn(feedbackVariants(), "my-0")} role="alert">
          {mine.error}{" "}
          <Button variant="text" className="inline min-h-0 p-0" onClick={mine.reload}>
            Tentar novamente
          </Button>
        </div>
      )}
      {entry && (
        <EntryStatus
          entry={entry}
          detail={current}
          pix={pix}
          busy={action.busy}
          onPayment={() => openInfo(null)}
          onConfirmRefund={() => open("confirm-refund")}
          onContestRefund={() => open("contest")}
        />
      )}
      {entry?.can_cancel && (
        <Button variant="text" className="-mt-1 min-h-9 justify-self-start px-1 text-[11.5px]" onClick={() => open("cancel")}>
          Desistir da inscrição
        </Button>
      )}
      {showLock && (
        <div className="flex gap-2.5 rounded-[14px] bg-error-bg p-3">
          <Lock size={20} className="flex-none text-error" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <b className="block text-[12.5px] text-ink">{current.eligibility.reason === "sem_time" ? "Inscrição por time" : "Fora da faixa"}</b>
            <small className="mt-0.5 block text-[11px] leading-normal text-ink-muted">
              {current.eligibility.message}
              {current.eligibility.reason === "sem_time" ? "" : " Eventos abertos aceitam qualquer nível."}
            </small>
          </div>
        </div>
      )}
      {current.can_read_messages && <EventNotices eventId={current.id} onExpired={onExpired} />}
      <Tabs
        variant="track"
        items={sections}
        value={section}
        onChange={setSection}
        label={`Seções ${run ? "da prova" : "do campeonato"}`}
        idPrefix={`${ids}-tab-`}
        controls={panelId}
      />
      <div id={panelId} role="tabpanel" aria-labelledby={`${ids}-tab-${section}`} className="grid gap-3">
        {section === "info" && (
          <>
            <EventFacts detail={current} onPaymentInfo={pix ? () => openInfo(null) : undefined} />
            <OrganizerCard name={current.organizer.display_name} onContact={current.contact ? () => open("contact") : undefined} />
            {paid && <PaymentHint />}
          </>
        )}
        {section === "tabela" && (
          <EmptyState
            Icon={GitFork}
            title="Tabela ainda não definida"
            text="A tabela aparece quando o organizador confirmar o chaveamento."
            className="rounded-card bg-white"
          />
        )}
        {section === "percurso" && (
          <Card elevated className="grid gap-1 px-3.5 py-3">
            <Term Icon={Route}>
              {eventFormatParts({ sport, distanceKm: current.distance_km }).join(" · ") || "Distância a definir"}
            </Term>
            <Term Icon={MapPin}>{placeText(current) || "Local a definir"}</Term>
            <p className="m-0 mt-1 text-[11.5px] leading-normal whitespace-pre-line wrap-anywhere text-ink-muted">
              {current.course_notes || "O organizador ainda não descreveu o percurso."}
            </p>
          </Card>
        )}
        {section === "inscritos" && (
          <EventEntrants eventId={current.id} sport={sport} myEntryId={entry?.id ?? null} onOpenUser={onOpenUser} onExpired={onExpired} />
        )}
      </div>
      {cta && <div aria-hidden="true" className="h-16" />}
      {cta && (
        <div
          data-slot="entry-bar"
          className="absolute inset-x-0 bottom-[82px] z-[19] flex items-center gap-2 border-t border-solid border-line bg-white px-5 py-2.5 app-narrow:bottom-[calc(82px+env(safe-area-inset-bottom))]"
        >
          <Button
            className="min-w-0 flex-1 text-center"
            disabled={cta.kind === "blocked" || action.busy}
            onClick={() => (cta.kind === "teams" ? onTeams() : open(cta.kind === "enter" ? "enter" : "receipt"))}
          >
            {cta.kind === "blocked" && cta.locked && <Lock size={16} aria-hidden="true" />}
            {cta.kind === "receipt" && <Upload size={16} aria-hidden="true" />}
            {cta.label}
          </Button>
          {paid && pix && cta.kind !== "teams" && <PaymentInfoButton onClick={() => openInfo(null)} className="size-11" />}
        </div>
      )}
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "pointer-events-none absolute inset-x-5 z-[19] flex justify-center",
          cta ? "bottom-[150px] app-narrow:bottom-[calc(150px+env(safe-area-inset-bottom))]" : "bottom-[94px] app-narrow:bottom-[calc(94px+env(safe-area-inset-bottom))]",
        )}
      >
        {toast && (
          <p className="m-0 max-w-full rounded-card bg-forest px-3.5 py-2.5 text-[11.5px] leading-normal font-semibold text-white shadow-sheet motion-safe:animate-glass-in">
            {toast}
          </p>
        )}
      </div>
      {sheet === "enter" && cta?.kind === "enter" && (
        <EnterSheet
          detail={current}
          teams={cta.teams}
          pix={pix}
          busy={action.busy}
          error={action.error}
          onConfirm={(teamId) => void enter(teamId)}
          onPaymentInfo={() => openInfo("enter")}
          onClose={closeSheet}
        />
      )}
      {sheet === "info" && pix && (
        <PaymentInfoSheet
          eventName={current.name}
          priceCents={current.price_cents ?? 0}
          sport={sport}
          pix={pix}
          receiptDeadline={entry?.reserved_until}
          onClose={closeSheet}
        />
      )}
      {sheet === "receipt" && entry && (
        <ReceiptSheet entry={entry} eventName={current.name} busy={action.busy} error={action.error} onSend={(file) => void upload(file)} onClose={closeSheet} />
      )}
      {sheet === "confirm-refund" && entry && (
        <ConfirmRefundSheet entry={entry} busy={action.busy} error={action.error} onConfirm={() => void answerRefund()} onClose={closeSheet} />
      )}
      {sheet === "contest" && entry && (
        <ContestRefundSheet entry={entry} busy={action.busy} error={action.error} onContest={(reason) => void answerRefund(reason)} onClose={closeSheet} />
      )}
      {sheet === "cancel" && entry && (
        <CancelEntrySheet entry={entry} busy={action.busy} error={action.error} onConfirm={() => void giveUp()} onClose={closeSheet} />
      )}
      {sheet === "contact" && current.contact && (
        <ContactSheet name={current.organizer.display_name} contact={current.contact} onClose={closeSheet} />
      )}
    </div>
  );
}
