import { useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { FileCheck2, Lock, Phone, Shield, Ticket, Timer, Upload } from "lucide-react";
import { CONTEST_LIMITS } from "@/api/entries";
import { RECEIPT_ACCEPT, fileSize, receiptFileError } from "@/api/receipts";
import type { EventDetail, MyEntry, TeamEligibility } from "@/api/entries";
import { TeamCrest } from "@/components/arena/TeamCrest";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldLabel, FieldLegend, FieldSet, FieldTitle } from "@/components/ui/field";
import { feedbackVariants } from "@/components/ui/feedback";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetActions } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatDeadline, formatPrice } from "@/utils/format";
import { selectText, useClipboard } from "@/hooks/useClipboard";
import { CopyIconButton, PixBlock } from "./PixBlock";
import { Term } from "./EventFacts";
import { refusalText, reservationDeadline } from "./eventText";
import { notifyCopy } from "./pix";
import type { PixInfo } from "./pix";

/** Erro de formulário dentro da folha (campos recusados pelo servidor); as demais falhas de envio saem como toast. */
function SheetError({ message }: { message: string }) {
  return message ? (
    <p className={cn(feedbackVariants(), "mb-0")} role="alert">
      {message}
    </p>
  ) : null;
}

export interface EnterSheetProps {
  detail: EventDetail;
  /** Futebol: times representados, elegíveis e ainda sem inscrição. */
  teams: TeamEligibility[];
  pix: PixInfo | null;
  busy: boolean;
  error: string;
  onConfirm: (teamId: number | null) => void;
  onPaymentInfo: () => void;
  onClose: () => void;
}

/**
 * Inscrição (RN20, RN21): na gratuita, "Confirmar inscrição" (confirmada na hora); na paga, "Reservar vaga", com o
 * valor, o prazo do comprovante e o bloco "Pix do organizador" em destaque. No futebol, escolhe o time quando quem
 * se inscreve representa mais de um time elegível.
 */
export function EnterSheet({ detail, teams, pix, busy, error, onConfirm, onPaymentInfo, onClose }: EnterSheetProps) {
  const id = useId();
  const football = detail.sport === "futebol";
  const paid = (detail.price_cents ?? 0) > 0;
  const [teamId, setTeamId] = useState<number | null>(teams[0]?.team.id ?? null);
  const team = teams.find((item) => item.team.id === teamId)?.team ?? null;
  const deadline = formatDeadline(reservationDeadline(detail.starts_at));
  const title = paid ? "Reservar vaga" : football && team ? `Inscrever ${team.name}` : "Confirmar inscrição";
  return (
    <Sheet title={title} description={detail.name} onClose={onClose}>
      <div className="grid gap-1 border-t border-line pt-2.5">
        {football && teams.length > 1 ? (
          <FieldSet className="mb-1 gap-1.5">
            <FieldLegend variant="label" className="mb-0 px-0.5 text-[12px] font-bold">
              Time que vai se inscrever
            </FieldLegend>
            <RadioGroup className="gap-1.5" name={`${id}-team`} value={String(teamId ?? "")} onValueChange={(value) => setTeamId(Number(value))}>
              {teams.map((item) => (
                <FieldLabel key={item.team.id} htmlFor={`${id}-${item.team.id}`} className="*:data-[slot=field]:px-2.5 *:data-[slot=field]:py-2">
                  <Field orientation="horizontal" className="items-center">
                    <TeamCrest name={item.team.name} initials={item.team.initials} path={item.team.crest_url} size="sm" decorative />
                    <FieldContent>
                      <FieldTitle className="text-xs font-bold">{item.team.name}</FieldTitle>
                    </FieldContent>
                    <RadioGroupItem value={String(item.team.id)} id={`${id}-${item.team.id}`} />
                  </Field>
                </FieldLabel>
              ))}
            </RadioGroup>
          </FieldSet>
        ) : (
          football && team && <Term Icon={Shield}>Inscreve o <b>{team.name}</b><small> · você representa o time</small></Term>
        )}
        <Term Icon={Ticket}>
          {paid ? (
            <>
              Valor <small>·</small> <b>{formatPrice(detail.price_cents)}</b>
              <small>{football ? " por time" : ""} · pago direto ao organizador</small>
            </>
          ) : (
            <>Inscrição <b>gratuita</b><small> · confirmada na hora</small></>
          )}
        </Term>
        {paid && deadline && (
          <Term Icon={Timer}>
            Comprovante até <b>{deadline}</b>
            <small> · 48 h após reservar ou 12 h antes do evento</small>
          </Term>
        )}
      </div>
      {paid &&
        (pix ? (
          <PixBlock pix={pix} priceCents={detail.price_cents ?? 0} onInfo={onPaymentInfo} className="mt-2" />
        ) : (
          <p className="m-0 mt-2 text-[11px] text-ink-muted">O organizador ainda não informou o Pix deste evento.</p>
        ))}
      <SheetError message={error} />
      <Button className="mt-3 w-full" disabled={busy || (football && !team)} onClick={() => onConfirm(football ? teamId : null)}>
        {busy ? (paid ? "Reservando…" : "Confirmando…") : paid ? "Reservar vaga" : "Confirmar inscrição"}
      </Button>
      {paid && (
        <p className="m-0 mt-1 px-0.5 text-[10.5px] leading-normal text-ink-muted">
          A vaga fica guardada até o prazo. Pague pelo Pix e volte para enviar o comprovante.
        </p>
      )}
    </Sheet>
  );
}

export interface ReceiptSheetProps {
  entry: MyEntry;
  eventName: string;
  busy: boolean;
  error: string;
  onSend: (file: File) => void;
  onClose: () => void;
}

/**
 * "Enviar comprovante": imagem (JPEG, PNG ou WebP) ou PDF de até 5 MiB, conferidos no cliente com as mesmas regras e
 * mensagens do servidor, e envio `multipart` para análise do organizador. Numa recusa, mostra o motivo anterior.
 */
export function ReceiptSheet({ entry, eventName, busy, error, onSend, onClose }: ReceiptSheetProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [invalid, setInvalid] = useState("");
  const team = entry.subject.team;
  function choose(next: File | undefined) {
    if (!next) return;
    const problem = receiptFileError(next);
    setInvalid(problem ?? "");
    setFile(problem ? null : next);
    if (input.current) input.current.value = "";
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (file && !busy) onSend(file);
  }
  return (
    <Sheet title="Enviar comprovante" description={`${eventName} · ${formatPrice(entry.price_cents, { compact: true })}`} onClose={onClose}>
      <form className="grid gap-2 pt-1" onSubmit={submit} aria-describedby={`${id}-hint`}>
        {entry.state === "rejeitada" && (
          <p className="m-0 rounded-field bg-error-bg px-3 py-2 text-[11px] leading-normal text-error">
            Recusado: {refusalText(entry.latest_payment)}. Envie outro até {formatDeadline(entry.reserved_until)}.
          </p>
        )}
        <input
          ref={input}
          id={`${id}-file`}
          type="file"
          accept={RECEIPT_ACCEPT}
          className="peer sr-only"
          aria-describedby={`${id}-rules`}
          onChange={(event) => choose(event.target.files?.[0])}
        />
        <label
          htmlFor={`${id}-file`}
          className="grid w-full cursor-pointer justify-items-center gap-1 rounded-[14px] border-[1.5px] border-dashed border-line-strong bg-subtle p-[22px] text-center text-ink peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus peer-focus-visible:outline-solid hover:bg-[#eceef1]"
        >
          {file ? <FileCheck2 size={24} className="text-brand" aria-hidden="true" /> : <Upload size={24} className="text-brand" aria-hidden="true" />}
          <b className="text-[13px] wrap-anywhere">{file ? file.name : "Escolher arquivo"}</b>
          <small id={`${id}-rules`} className="text-[10.5px] text-ink-muted">
            {file ? `${fileSize(file.size)} · toque para trocar` : "Imagem ou PDF, até 5 MiB"}
          </small>
        </label>
        {invalid && (
          <p className={cn(feedbackVariants(), "my-0")} role="alert">
            {invalid}
          </p>
        )}
        <p id={`${id}-hint`} className="m-0 flex items-start gap-2 px-0.5 text-[10.5px] leading-normal text-ink-muted">
          <Lock size={15} className="mt-px flex-none" aria-hidden="true" />
          {team ? "Só os representantes do time, o organizador e a administração veem o comprovante." : "Só você, o organizador e a administração veem o comprovante."}
          {entry.reserved_until ? ` Prazo: ${formatDeadline(entry.reserved_until)}.` : ""}
        </p>
        <SheetError message={error} />
        <p className="sr-only" role="status" aria-live="polite">
          {busy ? "Enviando comprovante…" : ""}
        </p>
        <Button type="submit" className="mt-1 w-full" disabled={!file || busy}>
          {busy ? "Enviando…" : "Enviar para análise"}
        </Button>
      </form>
    </Sheet>
  );
}

/** Confirmação do recebimento da devolução: só quando o valor já voltou para a conta. */
export function ConfirmRefundSheet({ entry, busy, error, onConfirm, onClose }: {
  entry: MyEntry;
  busy: boolean;
  error: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet title="Confirmar recebimento" description={entry.event.name} onClose={onClose}>
      <p className="m-0 pt-1 text-[12px] leading-normal text-ink">
        Confirme só se <b>{formatPrice(entry.price_cents, { compact: true })}</b> já voltou para a sua conta. Depois de
        confirmar, a devolução fica registrada como recebida.
      </p>
      <SheetError message={error} />
      <SheetActions>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Voltar
        </Button>
        <Button onClick={onConfirm} disabled={busy}>
          {busy ? "Confirmando…" : "Confirmar recebimento"}
        </Button>
      </SheetActions>
    </Sheet>
  );
}

/** Contestação da devolução (5 a 500 caracteres), que vai à administração. */
export function ContestRefundSheet({ entry, busy, error, onContest, onClose }: {
  entry: MyEntry;
  busy: boolean;
  error: string;
  onContest: (reason: string) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const text = reason.trim();
  const short = text.length < CONTEST_LIMITS.min;
  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!short && !busy) onContest(text);
  }
  return (
    <Sheet title="Contestar devolução" description={entry.event.name} onClose={onClose}>
      <form className="grid gap-2 pt-1" onSubmit={submit} noValidate>
        <label htmlFor={`${id}-reason`} className="text-[12px] font-bold">
          O que aconteceu com a devolução?
        </label>
        <textarea
          id={`${id}-reason`}
          data-autofocus
          rows={4}
          maxLength={CONTEST_LIMITS.max}
          value={reason}
          aria-invalid={touched && short ? true : undefined}
          aria-describedby={`${id}-help`}
          onChange={(event) => setReason(event.target.value)}
          className="w-full resize-none rounded-field border border-solid border-field-border bg-field p-2.5 text-[12px] leading-normal text-ink"
          placeholder="Ex.: o valor que voltou é menor que o pago."
        />
        <small id={`${id}-help`} className="flex justify-between gap-2 px-0.5 text-[10.5px] text-ink-muted">
          <span>A administração analisa o comprovante e decide.</span>
          <span aria-hidden="true">{reason.length}/{CONTEST_LIMITS.max}</span>
        </small>
        {touched && short && (
          <p className={cn(feedbackVariants(), "my-0")} role="alert">
            Conte o que aconteceu com a devolução.
          </p>
        )}
        <SheetError message={error} />
        <Button type="submit" className="mt-1 w-full" disabled={busy}>
          {busy ? "Enviando…" : "Contestar devolução"}
        </Button>
      </form>
    </Sheet>
  );
}

/** Desistir da inscrição (gratuita antes do início; paga só enquanto reservada ou recusada). */
export function CancelEntrySheet({ entry, busy, error, onConfirm, onClose }: {
  entry: MyEntry;
  busy: boolean;
  error: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const paid = entry.price_cents > 0;
  return (
    <Sheet title="Desistir da inscrição" description={entry.event.name} onClose={onClose}>
      <p className="m-0 pt-1 text-[12px] leading-normal text-ink">
        {paid
          ? "A reserva é cancelada e a vaga fica livre. Se você já pagou, combine a devolução com o organizador."
          : "A inscrição é cancelada e a vaga fica livre para outra pessoa."}
      </p>
      <SheetError message={error} />
      <SheetActions>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Voltar
        </Button>
        <Button onClick={onConfirm} disabled={busy}>
          {busy ? "Cancelando…" : "Desistir"}
        </Button>
      </SheetActions>
    </Sheet>
  );
}

/** Contato do organizador (telefone, e-mail ou perfil), com o botão de copiar. */
export function ContactSheet({ name, contact, onClose }: { name: string; contact: string; onClose: () => void }) {
  const { status, copy } = useClipboard();
  const text = useRef<HTMLElement>(null);
  async function copyContact() {
    const copied = await copy("contato", contact);
    notifyCopy(copied, "contato");
    if (!copied) selectText(text.current);
  }
  return (
    <Sheet title="Contato do organizador" description={name} onClose={onClose}>
      <div className="mt-1 flex min-w-0 items-center gap-2 rounded-xl border border-dashed border-line-strong bg-field py-2 pr-2 pl-3">
        <Phone size={17} className="flex-none text-brand" aria-hidden="true" />
        <span ref={text} className="min-w-0 flex-1 text-[12.5px] font-semibold wrap-anywhere text-ink select-all">
          {contact}
        </span>
        <CopyIconButton label="Copiar contato" copied={status === "copied"} onCopy={() => void copyContact()} />
      </div>
      <p className="m-0 mt-1 px-0.5 text-[10.5px] leading-normal text-ink-muted">
        Dúvidas sobre o evento, o pagamento ou a devolução são combinadas com o organizador, fora do Arena.
      </p>
    </Sheet>
  );
}
