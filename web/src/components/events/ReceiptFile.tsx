import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ExternalLink, FileText, ImageOff } from "lucide-react";
import { ApiError } from "@/api/client";
import { fetchReceiptFile, fileSize, receiptFileHref } from "@/api/receipts";
import type { Receipt } from "@/api/events";
import { cn } from "@/lib/utils";

type ReceiptFileInfo = Pick<Receipt, "file_url" | "file_type">;

/**
 * Imagem do comprovante lida pela rota autorizada (`GET /receipts/{id}/file`, com a sessão) e exibida por um
 * endereço `blob:` local, revogado ao desmontar. PDFs não são lidos aqui: abrem numa nova aba pela mesma rota.
 */
function useReceiptImage(receipt: ReceiptFileInfo | null, onExpired?: () => void) {
  const url = receipt?.file_type === "imagem" ? receipt.file_url : null;
  const [state, setState] = useState<{ url: string; src: string | null } | null>(null);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    fetchReceiptFile({ file_url: url }, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url, src: objectUrl });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiError && cause.status === 401) onExpired?.();
        setState({ url, src: null });
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, onExpired]);
  const current = state?.url === url ? state : null;
  return { src: current?.src ?? null, loading: Boolean(url) && !current, failed: Boolean(current && !current.src) };
}

/** Link para o arquivo numa nova aba, pela rota autorizada (a sessão vai junto na navegação). */
export function ReceiptLink({
  receipt,
  label,
  children,
  className,
}: {
  receipt: Pick<Receipt, "file_url">;
  /** Rótulo acessível completo, como "Abrir PDF do comprovante de Ferrugem FC (nova aba)". */
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={receiptFileHref(receipt)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 text-[11.5px] font-bold text-brand [&_svg]:size-4 [&_svg]:flex-none",
        className,
      )}
    >
      {children}
    </a>
  );
}

/** Miniatura da lista (A2, devoluções): a imagem recortada ou o ícone do PDF. */
export function ReceiptThumb({
  receipt,
  name,
  onExpired,
  className,
}: {
  receipt: ReceiptFileInfo;
  /** Quem enviou ou de quem é a inscrição, para o texto alternativo. */
  name: string;
  onExpired?: () => void;
  className?: string;
}) {
  const image = useReceiptImage(receipt, onExpired);
  const box = cn(
    "grid h-[60px] w-12 flex-none place-items-center overflow-hidden rounded-[10px] border border-solid border-line bg-subtle text-ink-muted",
    className,
  );
  if (receipt.file_type === "pdf")
    return (
      <span data-slot="receipt-thumb" data-type="pdf" className={box}>
        <span className="grid justify-items-center gap-0.5 text-[9px] font-extrabold text-brand">
          <FileText size={20} aria-hidden="true" />
          PDF
        </span>
      </span>
    );
  return (
    <span data-slot="receipt-thumb" data-type="imagem" className={box}>
      {image.src ? (
        <img src={image.src} alt={`Miniatura do comprovante de ${name}`} className="size-full object-cover" />
      ) : image.failed ? (
        <ImageOff size={18} aria-label="Miniatura indisponível" />
      ) : (
        <span className="sr-only">Carregando a miniatura</span>
      )}
    </span>
  );
}

/**
 * Comprovante na folha: a imagem inteira (com "Abrir em nova aba" para ampliar) ou o bloco do PDF com "Abrir PDF".
 * `title` é o texto alternativo da imagem ("Comprovante enviado por Ferrugem FC").
 */
export function ReceiptPreview({
  receipt,
  title,
  onExpired,
  className,
}: {
  receipt: Pick<Receipt, "file_url" | "file_type" | "size_bytes">;
  title: string;
  onExpired?: () => void;
  className?: string;
}) {
  const image = useReceiptImage(receipt, onExpired);
  if (receipt.file_type === "pdf")
    return (
      <div
        data-slot="receipt-preview"
        data-type="pdf"
        className={cn("mt-2 flex items-center gap-3 rounded-xl border border-solid border-line bg-subtle p-3", className)}
      >
        <span className="grid size-11 flex-none place-items-center rounded-[10px] bg-white text-brand">
          <FileText size={22} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block text-[12.5px]">Comprovante em PDF</b>
          <small className="text-[10.5px] text-ink-muted">{fileSize(receipt.size_bytes)} · abre numa nova aba</small>
        </span>
        <ReceiptLink receipt={receipt} label={`Abrir PDF: ${title} (nova aba)`} className="rounded-[10px] bg-white px-3">
          <ExternalLink aria-hidden="true" />
          Abrir PDF
        </ReceiptLink>
      </div>
    );
  return (
    <figure data-slot="receipt-preview" data-type="imagem" className={cn("mt-2 grid gap-1", className)}>
      <div className="grid min-h-[180px] place-items-center overflow-hidden rounded-xl border border-solid border-line bg-subtle">
        {image.src ? (
          <img src={image.src} alt={title} className="max-h-[360px] w-full object-contain" />
        ) : image.failed ? (
          <p role="alert" className="px-4 text-center text-[12px] text-error">
            Não foi possível carregar o comprovante.
          </p>
        ) : (
          <p role="status" className="text-[12px] text-ink-muted">
            Carregando o comprovante…
          </p>
        )}
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-ink-muted">
        <span>Imagem · {fileSize(receipt.size_bytes)}</span>
        <ReceiptLink receipt={receipt} label={`Abrir a imagem em tamanho real: ${title} (nova aba)`}>
          <ExternalLink aria-hidden="true" />
          Abrir em nova aba
        </ReceiptLink>
      </figcaption>
    </figure>
  );
}
