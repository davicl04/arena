import { useRef } from "react";
import type { ReactNode, RefObject } from "react";
import type { LucideIcon } from "lucide-react";
import { Building2, KeyRound, Phone, QrCode, ShieldCheck, Ticket, Timer } from "lucide-react";
import type { Sport } from "@/api/client";
import { Sheet } from "@/components/ui/sheet";
import { eventNoun, pixKeyType } from "@/data/arena";
import { selectText, useClipboard } from "@/hooks/useClipboard";
import { formatDeadline, formatPrice } from "@/utils/format";
import { CopyIconButton, ManualCopyField } from "./PixBlock";
import { notifyCopy } from "./pix";
import type { PixCopyItem, PixInfo } from "./pix";

export interface PaymentInfoSheetProps {
  /** Nome do evento, abaixo do título da folha. */
  eventName: string;
  /** Valor da inscrição em centavos. */
  priceCents: number;
  /** Modalidade: no futebol, o valor é "por time". */
  sport?: Sport;
  pix: PixInfo;
  /** Fim da reserva (ISO): prazo do comprovante. Sem reserva, a folha explica a regra. */
  receiptDeadline?: string | null;
  onClose: () => void;
}

const steps = [
  "Reserve a vaga no Arena.",
  "Pague pelo app do seu banco, colando a chave ou o código.",
  "Volte aqui e envie o comprovante (imagem ou PDF).",
  "O organizador confere e confirma a inscrição.",
];

/** Linha da folha (`.term`): ícone, texto e, opcionalmente, o botão de copiar. */
function Row({ Icon, children, action }: { Icon: LucideIcon; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center gap-2.5 text-[11.5px]">
      <Icon size={17} className="flex-none text-brand" aria-hidden="true" />
      <span className="min-w-0 flex-1 wrap-anywhere [&_b]:font-bold [&_small]:inline [&_small]:text-[10px] [&_small]:text-ink-muted">
        {children}
      </span>
      {action}
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="font-sans text-[10px] font-bold tracking-[0.08em] text-ink-muted uppercase">{children}</h3>;
}

/**
 * Folha "Pagamento e informações" (ⓘ do Jogar): valor, favorecido, chave e Copia e Cola com copiar, prazo do
 * comprovante, "Como funciona" em 4 passos, instruções e contato do organizador e o aviso de que o Arena não
 * recebe pagamentos. Sem área de transferência, o item fica selecionado para copiar à mão.
 */
export function PaymentInfoSheet({
  eventName,
  priceCents,
  sport,
  pix,
  receiptDeadline,
  onClose,
}: PaymentInfoSheetProps) {
  const { status, key: copiedKey, copy } = useClipboard();
  const keyRef = useRef<HTMLElement>(null);
  const contactRef = useRef<HTMLElement>(null);
  const failed = status === "failed";
  const kind = pixKeyType[pix.keyType];
  const deadline = formatDeadline(receiptDeadline);
  const copied = (item: PixCopyItem) => status === "copied" && copiedKey === item;

  /** Copia; se falhar, seleciona o texto visível (o código aparece num campo próprio, já selecionado). */
  async function copyItem(item: PixCopyItem, text: string, target?: RefObject<HTMLElement | null>) {
    const copied = await copy(item, text);
    notifyCopy(copied, item);
    if (!copied && target) selectText(target.current);
  }

  return (
    <Sheet title="Pagamento e informações" description={eventName} onClose={onClose}>
      <section aria-label="Dados do pagamento" className="grid gap-1 border-t border-line pt-3">
        <Row Icon={Ticket}>
          Valor <small>·</small> <b>{formatPrice(priceCents)}</b>
          {sport === "futebol" && <small> por {eventNoun.futebol.entrant}</small>}
        </Row>
        <Row Icon={Building2}>
          Favorecido <small>· {pix.holder}</small>
        </Row>
        <Row
          Icon={KeyRound}
          action={
            <CopyIconButton
              label="Copiar chave Pix"
              copied={copied("chave")}
              onCopy={() => void copyItem("chave", pix.key, keyRef)}
            />
          }
        >
          Chave Pix ({kind?.inline ?? pix.keyType}) <small>· </small>
          <small ref={keyRef} className="font-mono select-all">
            {pix.key}
          </small>
        </Row>
        {pix.copyPaste && (
          <Row
            Icon={QrCode}
            action={
              <CopyIconButton
                label="Copiar Pix Copia e Cola"
                copied={copied("codigo")}
                onCopy={() => void copyItem("codigo", pix.copyPaste ?? "")}
              />
            }
          >
            Pix Copia e Cola <small>· código com valor e favorecido</small>
          </Row>
        )}
        {failed && copiedKey === "codigo" && pix.copyPaste && (
          <ManualCopyField label="Código Pix Copia e Cola" value={pix.copyPaste} />
        )}
        <Row Icon={Timer}>
          {deadline ? (
            <>
              Comprovante até <b>{deadline}</b>
              <small> · 48 h após reservar ou 12 h antes do evento</small>
            </>
          ) : (
            <>
              Comprovante em até <b>48 h</b> após reservar
              <small> · ou até 12 h antes do evento, o que vier primeiro</small>
            </>
          )}
        </Row>
      </section>
      <section aria-label="Como funciona" className="grid gap-2 border-t border-line py-3">
        <SectionLabel>Como funciona</SectionLabel>
        <ol className="m-0 grid list-decimal gap-1.5 pl-[18px] text-[11.5px] leading-[1.45] text-ink">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
      {(pix.instructions || pix.contact) && (
        <section aria-label="Instruções do organizador" className="grid gap-2 border-t border-line py-3">
          <SectionLabel>Instruções do organizador</SectionLabel>
          {pix.instructions && (
            <p className="m-0 text-[11.5px] leading-normal whitespace-pre-line wrap-anywhere text-ink-muted">
              {pix.instructions}
            </p>
          )}
          {pix.contact && (
            <Row
              Icon={Phone}
              action={
                <CopyIconButton
                  label="Copiar contato"
                  copied={copied("contato")}
                  onCopy={() => void copyItem("contato", pix.contact ?? "", contactRef)}
                />
              }
            >
              Contato <small>· </small>
              <small ref={contactRef} className="select-all">
                {pix.contact}
              </small>
            </Row>
          )}
        </section>
      )}
      <p className="m-0 flex items-start gap-2 px-0.5 pt-1 text-[10.5px] leading-normal text-ink-muted">
        <ShieldCheck size={15} className="mt-px flex-none text-brand" aria-hidden="true" />
        O Arena não recebe nem guarda pagamentos. Sem comprovante no prazo, a vaga é liberada.
      </p>
    </Sheet>
  );
}
