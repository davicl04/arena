import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Ban, Copy, ExternalLink, FileSearch, FileX, Info, ShieldAlert, TimerOff, Undo2 } from "lucide-react";
import { receiptFileHref } from "@/api/receipts";
import type { EventDetail, MyEntry } from "@/api/entries";
import { useClipboard } from "@/hooks/useClipboard";
import { formatDeadline, formatPrice, parseIso } from "@/utils/format";
import { ManualCopyField } from "./PixBlock";
import { StatusCard, StatusCardButton } from "./StatusCard";
import { refusalText } from "./eventText";
import { notifyCopy } from "./pix";
import type { PixInfo } from "./pix";

/** Limiares (em horas) em que o fim do prazo é anunciado a leitores de tela, sem repetir a cada minuto. */
const THRESHOLDS = [1, 3, 6, 12, 24];

/**
 * Aviso discreto do prazo: só anuncia quando o tempo restante cruza um limiar (24, 12, 6, 3 e 1 h) ou acaba,
 * enquanto a tela está aberta. O anel continua com o texto completo para quem lê o cartão.
 */
function useDeadlineAlert(deadline: string | null | undefined, ended: string) {
  const [text, setText] = useState("");
  useEffect(() => {
    const end = parseIso(deadline)?.getTime();
    if (!end) return;
    const bucket = () => {
      const hours = (end - Date.now()) / 3_600_000;
      return hours <= 0 ? 0 : (THRESHOLDS.find((limit) => hours <= limit) ?? Infinity);
    };
    let last = bucket();
    const id = window.setInterval(() => {
      const next = bucket();
      if (next === last) return;
      last = next;
      setText(next === 0 ? ended : `Falta menos de ${next} ${next === 1 ? "hora" : "horas"} para o fim do prazo.`);
    }, 60_000);
    return () => window.clearInterval(id);
  }, [deadline, ended]);
  return text;
}

/** Link com o visual do botão secundário do cartão S1 (abre o arquivo do comprovante em outra aba). */
function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded-field border border-solid border-white/25 px-[11px] text-[11px] font-bold whitespace-nowrap text-white no-underline hover:bg-white/8 [&_svg]:size-4"
    >
      {children}
    </a>
  );
}

export interface EntryStatusProps {
  entry: MyEntry;
  detail: EventDetail;
  /** Pix do evento (copiar a chave no cartão da vaga reservada). */
  pix: PixInfo | null;
  busy?: boolean;
  /** Abre a folha "Pagamento e informações". */
  onPayment: () => void;
  onConfirmRefund: () => void;
  onContestRefund: () => void;
}

/**
 * Cartão S1 da inscrição de quem vê (contrato 0002, seção 6.5): vaga reservada com o anel das horas, comprovante
 * em análise, recusado com o motivo, confirmada, reserva expirada e as etapas da devolução (evento cancelado).
 * O envio do comprovante ("Enviar comprovante" ou "Enviar outro") fica no botão fixo da tela.
 * Quem é só membro do time vê o estado, sem as ações do representante.
 */
export function EntryStatus({ entry, detail, pix, busy = false, onPayment, onConfirmRefund, onContestRefund }: EntryStatusProps) {
  const { status, key: copiedKey, copy } = useClipboard();
  const acting = entry.my_role === "atleta" || entry.my_role === "representante";
  const team = entry.subject.team;
  const price = formatPrice(entry.price_cents, { compact: true });
  const reserved = formatDeadline(entry.reserved_until);
  const refund = entry.refund;
  const waitingRefund = entry.state === "devolucao_pendente" && refund && !refund.participant_response && refund.auto_confirm_at;
  const alert = useDeadlineAlert(
    entry.state === "reservada" || entry.state === "rejeitada" ? entry.reserved_until : waitingRefund ? refund?.auto_confirm_at : null,
    entry.state === "reservada" || entry.state === "rejeitada" ? "O prazo da reserva acabou." : "O prazo para responder à devolução acabou.",
  );
  async function copyKey(key: string) {
    notifyCopy(await copy("chave", key), "chave");
  }
  const repText = team ? `O representante do ${team.name}` : "O inscrito";

  let card: ReactNode;
  switch (entry.state) {
    case "reservada":
      card = (
        <StatusCard
          tone="aguardando"
          title="Vaga reservada"
          deadline={entry.reserved_until}
          windowStart={entry.created_at}
          actions={
            acting && pix ? (
              <>
                <StatusCardButton onClick={() => void copyKey(pix.key)}>
                  <Copy aria-hidden="true" />
                  Copiar chave Pix
                </StatusCardButton>
                <StatusCardButton variant="secondary" onClick={onPayment}>
                  <Info aria-hidden="true" />
                  Pagamento
                </StatusCardButton>
              </>
            ) : undefined
          }
        >
          {acting ? (
            <>Pague <b>{price}</b> direto ao organizador e envie o comprovante até <b>{reserved}</b>. Sem comprovante, a vaga é liberada.</>
          ) : (
            <>{repText} paga <b>{price}</b> ao organizador e envia o comprovante até <b>{reserved}</b>.</>
          )}
        </StatusCard>
      );
      break;
    case "em_analise":
      card = (
        <StatusCard
          tone="aguardando"
          icon={FileSearch}
          title="Comprovante em análise"
          actions={
            entry.latest_payment ? (
              <CardLink href={receiptFileHref(entry.latest_payment)}>
                <ExternalLink aria-hidden="true" />
                Ver comprovante
              </CardLink>
            ) : undefined
          }
        >
          {entry.latest_payment ? <>Enviado {formatDeadline(entry.latest_payment.created_at)}. </> : null}
          {detail.organizer.display_name} confirma o pagamento; você recebe um aviso.
        </StatusCard>
      );
      break;
    case "rejeitada":
      card = (
        <StatusCard
          tone="divergente"
          icon={FileX}
          title="Comprovante recusado"
        >
          Motivo: <b>{refusalText(entry.latest_payment)}</b>.{" "}
          {acting ? <>Envie outro até <b>{reserved}</b>.</> : <>{repText} pode enviar outro até <b>{reserved}</b>.</>}
        </StatusCard>
      );
      break;
    case "confirmada":
      card = (
        <StatusCard tone="confirmado" title="Inscrição confirmada" pill={team ? team.name : "Você"}>
          {entry.price_cents > 0 ? "Pagamento aprovado pelo organizador. " : ""}
          {detail.sport === "corrida"
            ? "Seu nome está na lista de inscritos da prova."
            : detail.state === "em_andamento" || detail.state === "encerrado"
              ? "A tabela e os resultados estão na aba Tabela."
              : "A tabela sai quando o organizador confirmar o chaveamento."}
        </StatusCard>
      );
      break;
    case "expirada":
      card = (
        <StatusCard tone="neutro" icon={TimerOff} title="A vaga foi liberada">
          A reserva expirou sem comprovante aprovado no prazo.
          {detail.registration_open && detail.spots_left > 0 ? " Se quiser, inscreva-se de novo enquanto houver vaga." : ""}
        </StatusCard>
      );
      break;
    case "devolucao_pendente":
      card = waitingRefund && refund ? (
        <StatusCard
          tone="aguardando"
          title="Devolução enviada pelo organizador"
          deadline={refund.auto_confirm_at}
          windowStart={refund.created_at}
          windowHours={168}
          actions={
            <>
              <CardLink href={receiptFileHref(refund)}>
                <ExternalLink aria-hidden="true" />
                Ver comprovante
              </CardLink>
              {entry.can_respond_refund && (
                <>
                  <StatusCardButton onClick={onConfirmRefund} disabled={busy}>
                    Confirmar recebimento
                  </StatusCardButton>
                  <StatusCardButton variant="secondary" onClick={onContestRefund} disabled={busy}>
                    Contestar
                  </StatusCardButton>
                </>
              )}
            </>
          }
        >
          Confira se <b>{price}</b> voltou para a conta e responda até <b>{formatDeadline(refund.auto_confirm_at)}</b>. Sem
          resposta em 7 dias, a devolução conta como recebida.
        </StatusCard>
      ) : (
        <StatusCard tone="neutro" icon={Undo2} title="Evento cancelado · devolução por Pix">
          O organizador vai devolver <b>{price}</b> por Pix.{" "}
          {refund?.resolution === "pendente"
            ? "A administração pediu a ele outro comprovante da devolução."
            : "Quando ele anexar o comprovante, você confirma o recebimento aqui."}
        </StatusCard>
      );
      break;
    case "devolucao_contestada":
      card = (
        <StatusCard tone="divergente" icon={ShieldAlert} title="Contestação em análise pela administração">
          {refund?.contest_reason ? <>Motivo: <b>“{refund.contest_reason}”</b> </> : null}
          A administração confere o comprovante da devolução e decide.
        </StatusCard>
      );
      break;
    case "devolvida":
      card = (
        <StatusCard tone="confirmado" title="Devolução recebida">
          {refund?.participant_response === "automatica"
            ? "Sem resposta em 7 dias, a devolução foi considerada recebida."
            : refund?.resolution === "devolvida"
              ? "A administração considerou a devolução feita."
              : "O recebimento da devolução foi confirmado."}
        </StatusCard>
      );
      break;
    default:
      card = (
        <StatusCard tone="neutro" icon={Ban} title="Inscrição cancelada">
          Esta inscrição não ocupa mais vaga no evento.
        </StatusCard>
      );
  }

  const failed = status === "failed" && copiedKey === "chave";
  return (
    <section aria-label="Sua inscrição" data-state={entry.state} className="grid gap-2">
      {card}
      {failed && pix && <ManualCopyField label="Chave Pix" value={pix.key} />}
      <span className="sr-only" aria-live="polite">{alert}</span>
    </section>
  );
}
