import { useState } from 'react'
import { ActivityIndicator, Image, Text, View } from 'react-native'
import type { Receipt } from '../../api/events'
import { fileSize, receiptImageSource } from '../../api/receipts'
import { useSessionToken } from '../../hooks/useSessionToken'
import { colors } from '../../theme'
import { Icon } from '../Icon'

/** Aviso honesto do PDF: o app não abre o arquivo (sem `expo-file-system` nem `expo-sharing`). */
export const PDF_NOTICE = 'Abra este comprovante pela web.'

export interface ReceiptImageProps {
  receipt: Pick<Receipt, 'file_url' | 'file_type' | 'size_bytes'>
  /** Texto alternativo da imagem ("Comprovante enviado por Ferrugem FC"). */
  title: string
  /** `thumb`: miniatura da lista (48×60); `full` (padrão): a imagem inteira na folha. */
  variant?: 'thumb' | 'full'
  /** Token da sessão, quando a tela já o leu; sem ele, o componente lê do SecureStore. */
  token?: string | null
}

/** Bloco do PDF: o app não o abre; manda a pessoa para a web. */
export function ReceiptPdfNotice({ receipt, variant = 'full' }: { receipt: Pick<Receipt, 'size_bytes'>; variant?: 'thumb' | 'full' }) {
  if (variant === 'thumb') {
    return <View accessible accessibilityLabel={`Comprovante em PDF. ${PDF_NOTICE}`} testID="receipt-pdf-thumb"
      style={{ width: 48, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.subtle, gap: 2 }}>
      <Icon name="file" size={20} color={colors.brand} /><Text style={{ color: colors.brand, fontSize: 9, fontWeight: '800' }}>PDF</Text>
    </View>
  }
  return <View testID="receipt-pdf-notice" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.subtle, padding: 12 }}>
    <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#ffffff' }}><Icon name="file" size={22} color={colors.brand} /></View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '700' }}>Comprovante em PDF</Text>
      <Text accessibilityRole="alert" style={{ color: colors['ink-muted'], fontSize: 10.5, lineHeight: 15 }}>{fileSize(receipt.size_bytes)} · {PDF_NOTICE}</Text>
    </View>
  </View>
}

/**
 * Comprovante: a imagem lida pela rota autorizada (`GET /receipts/{id}/file`) com o header `Authorization: Bearer`,
 * na miniatura da lista ou inteira na folha; PDFs mostram o aviso "Abra este comprovante pela web.".
 */
export function ReceiptImage({ receipt, title, variant = 'full', token: provided }: ReceiptImageProps) {
  const token = useSessionToken(provided)
  // O resultado da carga vale só para o arquivo (e a sessão) em que ocorreu: outro `file_url` recomeça em "carregando".
  const attempt = `${receipt.file_url}|${token ?? ''}`
  const [outcome, setOutcome] = useState<{ attempt: string; value: 'ready' | 'failed' } | null>(null)
  if (receipt.file_type === 'pdf') return <ReceiptPdfNotice receipt={receipt} variant={variant} />
  const source = token ? receiptImageSource(receipt, token) : null
  // Sem fonte (caminho fora da API), não há o que carregar: o comprovante aparece como indisponível.
  const state = outcome?.attempt === attempt ? outcome.value : token && !source ? 'failed' : 'loading'
  const thumb = variant === 'thumb'
  const box = thumb ? { width: 48, height: 60, borderRadius: 10 } : { minHeight: 180, width: '100%' as const, borderRadius: 12 }
  return <View testID="receipt-image" style={[{ overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.subtle }, box]}>
    {source && state !== 'failed' ? <Image key={receipt.file_url} accessibilityLabel={title} source={source} resizeMode={thumb ? 'cover' : 'contain'}
      onLoad={() => setOutcome({ attempt, value: 'ready' })} onError={() => setOutcome({ attempt, value: 'failed' })} style={thumb ? { width: '100%', height: '100%' } : { width: '100%', height: 360 }} /> : null}
    {state === 'failed' ? <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: thumb ? 9 : 12, textAlign: 'center', paddingHorizontal: 6 }}>{thumb ? 'Indisponível' : 'Não foi possível carregar o comprovante.'}</Text> : null}
    {state === 'loading' ? <View style={{ position: 'absolute' }}><ActivityIndicator accessibilityLabel="Carregando o comprovante" color={colors.brand} /></View> : null}
  </View>
}
