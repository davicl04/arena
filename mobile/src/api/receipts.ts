import { apiUrl, fileForm, request } from './client'
import type { UploadFile } from './client'
import { receiptRefusalReason } from '../data/arena'
import type { ReceiptRefusalReason } from '../data/arena'
import { getOrganizerEvent } from './events'
import type { EntrySubject, EventPoster, OrganizerEntry, OrganizerEventDetail, Receipt, ReceiptReview } from './events'

/*
 * Rotas e regras de comprovantes (A2) e devoluções do organizador. Contrato: docs/decisoes/0003-times-campeonatos.md,
 * seções 13 (formas comuns), 14 (inscrições e comprovantes do evento) e 16 (devolução por Pix). Os tipos (cartaz, Pix,
 * inscrição, comprovante, pendências) têm uma só definição, em `api/events.ts`; as filas da administração
 * (`api/admin.ts`) os importam de lá.
 */

/**
 * Parte da gestão do evento (`GET /organizer/events/{id}`, `OrganizerEventDetail`) que o A2 usa: cartaz, pendências,
 * Pix esperado e cancelamento.
 */
export type ReceiptsEvent = Pick<OrganizerEventDetail, keyof EventPoster | 'pending' | 'pix' | 'cancelled_at' | 'cancel_reason' | 'revocation_decision'>

export type ReceiptTab = 'para_analisar' | 'decididos'
/** O A2 lê a mesma gestão do evento (G3): uma só rota. */
export const getReceiptsEvent: (eventId: number) => Promise<ReceiptsEvent> = getOrganizerEvent
/** Caminho paginado da aba do A2 (para `usePagedList`). */
export const eventReceiptsPath = (eventId: number, tab: ReceiptTab) => `/organizer/events/${eventId}/receipts?tab=${tab}`

export type ReceiptDecisionInput =
  | { decision: 'aprovar' }
  | { decision: 'recusar'; reason_code: ReceiptRefusalReason; reason_detail?: string }

/** Só o dono do evento decide (a administração recebe 403). */
export const decideReceipt = (receiptId: number, input: ReceiptDecisionInput) =>
  request<ReceiptReview>(`/receipts/${receiptId}/decision`, 'POST', input)

/** Organizador anexa a devolução de uma inscrição em "Devolução pendente" (multipart `file`). */
export const sendRefundReceipt = (entryId: number, file: UploadFile) =>
  request<OrganizerEntry>(`/entries/${entryId}/refund-receipt`, 'PUT', fileForm({ ...file, name: file.name || 'devolucao' }))

/** Todos os envios da inscrição (pagamentos e devoluções), para o histórico. */
export const getEntryReceipts = (entryId: number) => request<{ items: Receipt[] }>(`/entries/${entryId}/receipts`)

/** Limites validados pelo servidor: detalhe da recusa (5 a 300 em "Outro") e arquivo (imagem ou PDF até 5 MiB). */
export const RECEIPT_LIMITS = { detailMin: 5, detailMax: 300, fileMaxBytes: 5 * 1024 * 1024 } as const
export const RECEIPT_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const
/** Tipos aceitos pelo seletor de documentos (`type` do `expo-document-picker`). */
export const RECEIPT_ACCEPT: string[] = [...RECEIPT_FILE_TYPES]

const RECEIPT_EXTENSION = /\.(jpe?g|png|webp|pdf)$/i

/**
 * Validação no cliente, na ordem e com as mensagens do servidor (`media.prepare_receipt`): tamanho, arquivo vazio e
 * tipo. Sem tipo informado pelo seletor, vale a extensão; o conteúdo (PDF íntegro, imagem estática) é conferido lá.
 * Tamanho desconhecido (`size` ausente) deixa essa conferência para o servidor.
 */
export function receiptFileError(file: { size?: number | null; type?: string | null; name?: string | null }): string | null {
  const type = file.type ?? ''
  if (typeof file.size === 'number' && file.size > RECEIPT_LIMITS.fileMaxBytes) return 'O arquivo excede o limite de 5 MiB.'
  if (file.size === 0) return 'O arquivo enviado está vazio.'
  const known = (RECEIPT_FILE_TYPES as readonly string[]).includes(type)
  if (!known && !(type === '' && RECEIPT_EXTENSION.test(file.name ?? ''))) return 'Envie o comprovante como imagem (JPEG, PNG ou WebP) ou PDF.'
  return null
}

/** Recusa do comprovante: motivo obrigatório; em "Outro", o detalhe de 5 a 300 caracteres. */
export function receiptRefusalError(code: ReceiptRefusalReason | null, detail: string): string | null {
  const text = detail.trim()
  if (!code) return 'Escolha o motivo da recusa.'
  if (text.length > RECEIPT_LIMITS.detailMax) return `Use até ${RECEIPT_LIMITS.detailMax} caracteres no detalhe.`
  if (code === 'outro' && text.length < RECEIPT_LIMITS.detailMin) return 'Descreva o motivo da recusa.'
  return null
}

/** Corpo da recusa: o detalhe vazio é omitido. */
export function receiptRefusalInput(code: ReceiptRefusalReason, detail: string): ReceiptDecisionInput {
  const text = detail.trim()
  return text ? { decision: 'recusar', reason_code: code, reason_detail: text } : { decision: 'recusar', reason_code: code }
}

/** "Valor diferente · detalhe"; em "Outro", só o detalhe. */
export function receiptRefusalText(code: ReceiptRefusalReason | null, detail?: string | null): string {
  const label = code ? receiptRefusalReason[code]?.label : undefined
  const extra = detail?.trim()
  if (code === 'outro' && extra) return extra
  if (label && extra) return `${label} · ${extra}`
  return label ?? extra ?? 'Motivo não informado'
}

/**
 * Motivo para dentro de uma frase ("Valor diferente: faltaram R$ 40"; em "Outro", só o detalhe), sem a pontuação final
 * do detalhe: o texto segue com ". Envie outro até…". É o texto do atleta e das notificações.
 */
export function receiptRefusalSentence(code: string | null | undefined, detail?: string | null): string {
  const label = code && code in receiptRefusalReason ? receiptRefusalReason[code as ReceiptRefusalReason].label : ''
  const extra = detail?.trim().replace(/[.!;]+$/, '') ?? ''
  if (label && extra) return label === 'Outro' ? extra : `${label}: ${extra}`
  return label || extra || 'motivo não informado'
}

/** Nome de quem está inscrito: o time (futebol) ou o atleta. */
export function subjectName(subject: EntrySubject): string {
  return subject.team?.name ?? subject.athlete?.name ?? (subject.kind === 'time' ? 'Time' : 'Atleta')
}

/** "182 KB" ou "1,2 MB". */
export function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}

/** Endereço absoluto do arquivo na API (o `file_url` já traz `/api/v1`). */
export const receiptFileHref = (receipt: Pick<Receipt, 'file_url'>) => apiUrl(receipt.file_url)

/**
 * Fonte da imagem do comprovante para o `Image` do React Native: a rota autorizada, com o Bearer da sessão no header.
 * PDFs não abrem no aparelho (sem `expo-file-system` nem `expo-sharing`): o app avisa para abri-los pela web.
 */
export const receiptImageSource = (receipt: Pick<Receipt, 'file_url'>, token: string) =>
  ({ uri: receiptFileHref(receipt), headers: { Authorization: `Bearer ${token}` } })
