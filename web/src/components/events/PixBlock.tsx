import { useCallback, useRef } from "react";
import { Check, Copy, Info, Landmark, QrCode } from "lucide-react";
import { pixKeyType } from "@/data/arena";
import { selectText, useClipboard } from "@/hooks/useClipboard";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/utils/format";
import { notifyCopy } from "./pix";
import type { PixInfo } from "./pix";

/** Botão de copiar só com ícone (`.mini.lt`): troca para ✓ depois de copiar. */
export function CopyIconButton({
  label,
  copied,
  onCopy,
  className,
}: {
  /** Rótulo acessível, como "Copiar chave Pix". */
  label: string;
  copied: boolean;
  onCopy: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onCopy}
      className={cn(
        "grid size-9 flex-none place-items-center rounded-[10px] border border-solid border-line-strong bg-surface p-0 text-brand hover:bg-subtle",
        className,
      )}
    >
      {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
    </button>
  );
}

/**
 * Texto para copiar à mão quando a área de transferência falha (ex.: o código Copia e Cola, que não aparece
 * na tela): somente leitura, focado e todo selecionado ao aparecer.
 */
export function ManualCopyField({ label, value }: { label: string; value: string }) {
  // O campo só aparece depois de um toque em "Copiar": ao entrar na tela, recebe o foco com o texto selecionado.
  const selectOnMount = useCallback((node: HTMLTextAreaElement | null) => {
    node?.focus();
    node?.select();
  }, []);
  return (
    <textarea
      readOnly
      ref={selectOnMount}
      rows={3}
      aria-label={label}
      value={value}
      onFocus={(event) => event.currentTarget.select()}
      className="w-full resize-none rounded-field border border-solid border-line-strong bg-field p-2.5 font-mono text-[11px] wrap-anywhere text-ink"
    />
  );
}

export interface PixBlockProps {
  pix: PixInfo;
  /** Valor da inscrição em centavos, mostrado no botão do Copia e Cola. */
  priceCents?: number;
  /** Abre a folha "Pagamento e informações" (ícone ⓘ). */
  onInfo?: () => void;
  title?: string;
  className?: string;
}

/**
 * Bloco "Pix do organizador" da folha de inscrição: favorecido, chave em fonte monoespaçada com o botão de
 * copiar só com ícone e "Copiar Pix Copia e Cola". Sem área de transferência, a chave fica selecionada e o
 * código aparece num campo selecionável. O retorno da cópia sai como toast (aviso se falhou).
 */
export function PixBlock({ pix, priceCents, onInfo, title = "Pix do organizador", className }: PixBlockProps) {
  const { status, key: copiedKey, copy } = useClipboard();
  const keyRef = useRef<HTMLElement>(null);
  const failed = status === "failed";
  const showCode = failed && copiedKey === "codigo" && Boolean(pix.copyPaste);
  const kind = pixKeyType[pix.keyType];

  async function copyKey() {
    const copied = await copy("chave", pix.key);
    notifyCopy(copied, "chave");
    if (!copied) selectText(keyRef.current);
  }
  async function copyCode() {
    notifyCopy(await copy("codigo", pix.copyPaste ?? ""), "codigo");
  }

  return (
    <div
      data-slot="pix-block"
      className={cn(
        "grid min-w-0 gap-2 rounded-card bg-success-bg p-3.5 shadow-[inset_0_0_0_1px_#005a3633] noite:shadow-[inset_0_0_0_1px_#8fe0b433]",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Landmark size={18} className="text-brand" aria-hidden="true" />
        <b className="flex-1 font-display text-[13px] font-bold">{title}</b>
        {onInfo && (
          <button
            type="button"
            aria-label="Informações de pagamento"
            title="Informações de pagamento"
            onClick={onInfo}
            className="grid size-8 flex-none place-items-center rounded-full bg-transparent p-0 text-brand hover:bg-icon-tile"
          >
            <Info size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      <small className="text-[10.5px] leading-[1.45] text-ink-muted">
        {pix.holder} · chave por {kind?.inline ?? pix.keyType}
      </small>
      <div className="flex min-w-0 items-center gap-2 rounded-xl border border-dashed border-line-strong bg-field py-2 pr-2 pl-3">
        <code
          ref={keyRef}
          className="min-w-0 flex-1 font-mono text-[12.5px] font-semibold wrap-anywhere text-ink select-all"
        >
          {pix.key}
        </code>
        <CopyIconButton
          label="Copiar chave Pix"
          copied={status === "copied" && copiedKey === "chave"}
          onCopy={() => void copyKey()}
        />
      </div>
      {pix.copyPaste && (
        <>
          <button
            type="button"
            onClick={() => void copyCode()}
            className="inline-flex min-h-[34px] w-full items-center justify-center gap-1.5 rounded-field border border-solid border-line-strong bg-surface px-[11px] text-[11px] font-bold text-brand hover:bg-subtle"
          >
            {status === "copied" && copiedKey === "codigo" ? (
              <Check size={17} aria-hidden="true" />
            ) : (
              <QrCode size={17} aria-hidden="true" />
            )}
            Copiar Pix Copia e Cola
            {priceCents ? ` · ${formatPrice(priceCents, { compact: true })}` : ""}
          </button>
          {showCode && <ManualCopyField label="Código Pix Copia e Cola" value={pix.copyPaste} />}
          <small className="text-[10.5px] leading-[1.45] text-ink-muted">
            Cole no app do seu banco. O valor e o favorecido aparecem para conferir antes de pagar.
          </small>
        </>
      )}
    </div>
  );
}
