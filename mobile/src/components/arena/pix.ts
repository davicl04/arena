import type { PixKeyType } from '../../data/arena'

/** Dados de pagamento que o organizador cadastra no evento (visíveis só para quem está logado). */
export interface PixInfo {
  /** Favorecido (quem recebe). */
  holder: string
  keyType: PixKeyType
  /** Chave Pix. */
  key: string
  /** Código Pix Copia e Cola (opcional), com valor e favorecido. */
  copyPaste?: string | null
  /** Instruções do organizador. */
  instructions?: string | null
  /** Contato para dúvidas. */
  contact?: string | null
}

/** Itens que o Compartilhar do aparelho envia: a chave ou o código Copia e Cola. */
export type PixShareItem = 'chave' | 'codigo'
export type ShareStatus = 'idle' | 'shared' | 'failed'

/** Texto enviado ao Compartilhar: só a chave, ou só o código (nada de rótulos, para colar direto no app do banco). */
export const pixShareMessage = (pix: Pick<PixInfo, 'key' | 'copyPaste'>, item: PixShareItem): string =>
  item === 'chave' ? pix.key : (pix.copyPaste ?? '')

const messages: Record<PixShareItem, Record<Exclude<ShareStatus, 'idle'>, string>> = {
  chave: {
    shared: 'Chave Pix enviada ao Compartilhar do aparelho.',
    failed: 'Não foi possível compartilhar. Mantenha o dedo sobre a chave para selecionar e copiar.',
  },
  codigo: {
    shared: 'Código Pix Copia e Cola enviado ao Compartilhar do aparelho.',
    failed: 'Não foi possível compartilhar. Mantenha o dedo sobre o código para selecionar e copiar.',
  },
}

/** Retorno anunciado para o último item compartilhado (vazio quando não há nada a dizer). */
export const shareFeedback = (status: ShareStatus, item: PixShareItem | null): string =>
  status === 'idle' || !item ? '' : messages[item][status]
