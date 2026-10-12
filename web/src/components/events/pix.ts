import type { PixKeyType } from "@/data/arena";
import type { CopyStatus } from "@/hooks/useClipboard";

/** Dados de pagamento que o organizador cadastra no evento (visíveis só para quem está logado). */
export interface PixInfo {
  /** Favorecido (quem recebe). */
  holder: string;
  keyType: PixKeyType;
  /** Chave Pix. */
  key: string;
  /** Código Pix Copia e Cola (opcional), com valor e favorecido. */
  copyPaste?: string | null;
  /** Instruções do organizador. */
  instructions?: string | null;
  /** Contato para dúvidas. */
  contact?: string | null;
}

/** Itens copiáveis do Pix: a chave, o código Copia e Cola e o contato do organizador. */
export type PixCopyItem = "chave" | "codigo" | "contato";

const copyMessages: Record<PixCopyItem, Record<Exclude<CopyStatus, "idle">, string>> = {
  chave: {
    copied: "Chave Pix copiada.",
    failed: "Não foi possível copiar. Selecione a chave e copie manualmente.",
  },
  codigo: {
    copied: "Pix Copia e Cola copiado. Cole no app do seu banco.",
    failed: "Não foi possível copiar. Selecione o código e copie manualmente.",
  },
  contato: {
    copied: "Contato copiado.",
    failed: "Não foi possível copiar. Selecione o contato e copie manualmente.",
  },
};

/** Retorno anunciado em `aria-live` para o último item copiado (vazio quando não há nada a dizer). */
export function copyFeedback(status: CopyStatus, item: string | null): string {
  if (status === "idle" || !item || !(item in copyMessages)) return "";
  return copyMessages[item as PixCopyItem][status];
}
