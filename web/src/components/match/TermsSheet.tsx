import { useId, useState } from "react";
import type { FormEvent } from "react";
import { CalendarCheck, Send } from "lucide-react";
import type { CourtOut, MatchDetail, Side, TermsInput } from "@/api/matches";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { feedbackVariants } from "@/components/ui/feedback";
import { Sheet } from "@/components/ui/sheet";
import { TimeField } from "@/components/ui/time-field";
import { nameOf, orderedSides, sideName } from "@/data/match";
import { cn } from "@/lib/utils";
import { combineDateTime, splitDateTime, toDateKey } from "@/utils/dateKey";
import { CourtPicker } from "./CourtPicker";
import { MAX_DAYS_AHEAD, STEP_MINUTES, termsError } from "./termsRules";
import { Switch } from "@/components/ui/switch";

const lbl = "m-0 text-[12px] font-bold";
const segClass =
  "min-h-10 min-w-0 flex-1 rounded-[11px] border border-solid border-line-strong bg-surface px-2 text-[11.5px] font-bold text-ink aria-pressed:border-brand aria-pressed:bg-brand aria-pressed:text-on-brand";

/**
 * Folha "Propor condições" (P2): Date Picker com os dias passados desabilitados, horário com passo de 15 min, quadra
 * (catálogo da cidade ou sugestão em revisão) e quem reserva com o local (RN08). Parte da proposta pendente ou das
 * condições combinadas, quando houver; no tênis, também o super tie-break.
 */
export function TermsSheet({
  detail,
  busy,
  error,
  onSubmit,
  onClose,
  onExpired,
}: {
  detail: MatchDetail;
  busy: boolean;
  /** Recusa do servidor às condições (`422`/`409` com conflito): as demais falhas de ação saem em toast. */
  error: string;
  onSubmit: (input: TermsInput) => void;
  onClose: () => void;
  onExpired: () => void;
}) {
  const id = useId();
  const base = detail.terms.pending ?? detail.terms.current;
  const initial = splitDateTime(base?.starts_at);
  const sides = orderedSides(detail);
  const [date, setDate] = useState(initial?.date ?? "");
  const [time, setTime] = useState(initial?.time ?? "");
  const [court, setCourt] = useState<CourtOut | null>(base && base.court.state !== "rejeitada" ? base.court : null);
  const [booking, setBooking] = useState<Side>(base?.booking_side ?? detail.my_side ?? "a");
  const [tiebreak, setTiebreak] = useState(Boolean(base?.super_tiebreak ?? detail.super_tiebreak));
  const [problem, setProblem] = useState("");
  const tennis = detail.sport === "tenis";
  const [last] = useState(() => toDateKey(new Date(Date.now() + MAX_DAYS_AHEAD * 86_400_000)));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const issue = termsError(date, time, court);
    setProblem(issue ?? "");
    const startsAt = combineDateTime(date, time);
    if (issue || !startsAt || !court) return;
    onSubmit({ starts_at: startsAt, court_id: court.id, booking_side: booking, ...(tennis ? { super_tiebreak: tiebreak } : {}) });
  }

  return (
    <Sheet title="Propor condições" description={sides.map((side) => sideName(side)).join(" × ")} onClose={onClose}>
      <form className="grid gap-3.5 pt-2" onSubmit={submit} noValidate>
        <div className="grid grid-cols-[1fr_8.5rem] gap-2 app-narrow:grid-cols-[1fr_7.5rem]">
          <div className="grid min-w-0 gap-1.5">
            <label htmlFor={`${id}-date`} className={lbl}>
              Data
            </label>
            <DatePicker id={`${id}-date`} label="Data" value={date} onChange={setDate} disablePast max={last} invalid={Boolean(problem) && !date} />
          </div>
          <div className="grid min-w-0 gap-1.5">
            <label htmlFor={`${id}-time`} className={lbl}>
              Horário
            </label>
            <TimeField id={`${id}-time`} value={time} onChange={setTime} stepMinutes={STEP_MINUTES} invalid={Boolean(problem) && !time} />
          </div>
        </div>

        <CourtPicker detail={detail} selected={court} onSelect={setCourt} canSuggest={detail.permissions.suggest_court} onExpired={onExpired} />

        <fieldset className="m-0 grid gap-1.5 border-0 p-0">
          <legend className={cn(lbl, "mb-1.5 p-0")}>Quem reserva com o local</legend>
          <div className="flex gap-1.5">
            {sides.map((side) => (
              <button key={side.side} type="button" className={segClass} aria-pressed={booking === side.side} onClick={() => setBooking(side.side)}>
                <span className="block truncate">{sideName(side)}</span>
              </button>
            ))}
          </div>
          <small className="text-[10.5px] leading-normal text-ink-muted">
            {nameOf(detail, booking)} reserva com o local e confirma aqui. O Arena só registra a situação da reserva.
          </small>
        </fieldset>

        {tennis && (
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 text-[12px]">
              <b className="block">
                Super tie-break
              </b>
              <small className="block text-[10.5px] text-ink-muted">Vale no lugar do 3º set, até 10 pontos.</small>
            </span>
            <Switch size="lg" checked={tiebreak} onCheckedChange={setTiebreak} aria-label="Super tie-break no lugar do 3º set" />
          </div>
        )}

        <p className="m-0 flex items-start gap-2 text-[10.5px] leading-normal text-ink-muted">
          <CalendarCheck size={15} className="mt-px flex-none" aria-hidden="true" />
          Quem propõe já aceita. A partida só é agendada quando o outro lado também aceitar estas condições.
        </p>

        {problem && (
          <p className={cn(feedbackVariants(), "my-0")} role="alert">
            {problem}
          </p>
        )}
        {error && !problem && (
          <p className={cn(feedbackVariants(), "my-0")} role="alert">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          <Send size={16} aria-hidden="true" />
          {busy ? "Enviando…" : "Enviar proposta"}
        </Button>
      </form>
    </Sheet>
  );
}
