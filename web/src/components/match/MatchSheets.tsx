import { useId, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { feedbackVariants } from "@/components/ui/feedback";
import { Sheet, SheetActions } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/*
 * Folhas de confirmação da partida: cancelar (motivo opcional), registrar ou retirar o W.O. e contestar o W.O.
 * (motivo de 5 a 500 caracteres). A folha fica aberta para tentar de novo: a recusa do formulário pelo servidor (`error`) aparece
 * dentro dela e as demais falhas de ação saem em toast. A validação local do motivo (`shortMessage`) fica junto ao campo.
 */

function SheetError({ message }: { message: string }) {
  return message ? (
    <p className={cn(feedbackVariants(), "mb-0")} role="alert">
      {message}
    </p>
  ) : null;
}

/** Confirmação simples: texto explicando o efeito, "Voltar" e a ação. */
export function ConfirmSheet({
  title,
  description,
  children,
  confirmLabel,
  busyLabel,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  confirmLabel: string;
  busyLabel: string;
  busy: boolean;
  error: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet title={title} description={description} onClose={onClose}>
      <div className="grid gap-2 pt-1 text-[12px] leading-normal text-ink">{children}</div>
      <SheetError message={error} />
      <SheetActions>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Voltar
        </Button>
        <Button onClick={onConfirm} disabled={busy}>
          {busy ? busyLabel : confirmLabel}
        </Button>
      </SheetActions>
    </Sheet>
  );
}

/** Folha com um motivo digitado: opcional (cancelamento, até 300) ou obrigatório (contestação, 5 a 500). */
export function ReasonSheet({
  title,
  description,
  intro,
  label,
  placeholder,
  min,
  max,
  shortMessage,
  confirmLabel,
  busyLabel,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  title: string;
  description?: string;
  intro: ReactNode;
  label: string;
  placeholder: string;
  /** Mínimo de caracteres do motivo aparado; 0 quando é opcional. */
  min: number;
  max: number;
  shortMessage?: string;
  confirmLabel: string;
  busyLabel: string;
  busy: boolean;
  error: string;
  onSubmit: (reason: string) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const text = reason.trim();
  const short = text.length < min;
  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!short && !busy) onSubmit(text);
  }
  return (
    <Sheet title={title} description={description} onClose={onClose}>
      <form className="grid gap-2 pt-1" onSubmit={submit} noValidate>
        <div className="text-[12px] leading-normal text-ink">{intro}</div>
        <label htmlFor={`${id}-reason`} className="m-0 mt-1 text-[12px] font-bold">
          {label}
        </label>
        <textarea
          id={`${id}-reason`}
          data-autofocus
          rows={3}
          maxLength={max}
          value={reason}
          aria-invalid={touched && short ? true : undefined}
          aria-describedby={`${id}-help`}
          onChange={(event) => setReason(event.target.value)}
          className="w-full resize-none rounded-field border border-solid border-field-border bg-white p-2.5 text-[12px] leading-normal text-ink aria-invalid:border-error"
          placeholder={placeholder}
        />
        <small id={`${id}-help`} className="flex justify-between gap-2 px-0.5 text-[10.5px] text-ink-muted">
          <span>{min > 0 ? `De ${min} a ${max} caracteres.` : "Opcional."}</span>
          <span aria-hidden="true">
            {reason.length}/{max}
          </span>
        </small>
        {touched && short && shortMessage && (
          <p className={cn(feedbackVariants(), "my-0")} role="alert">
            {shortMessage}
          </p>
        )}
        <SheetError message={error} />
        <SheetActions>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Voltar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? busyLabel : confirmLabel}
          </Button>
        </SheetActions>
      </form>
    </Sheet>
  );
}
