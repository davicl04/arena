import type { UploadFile } from '../api/client'
import { RECEIPT_ACCEPT } from '../api/receipts'

/** Arquivo como o seletor de documentos ou a galeria o entregam (todos os campos podem faltar). */
export interface PickedFile { uri: string; name?: string | null; mimeType?: string | null; size?: number | null }

const typeByExtension: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf',
}

/** Tipo pela extensão do nome ("comprovante.PDF" → "application/pdf"); desconhecida → vazio. */
export function typeFromName(name: string | null | undefined): string {
  const extension = /\.([a-z0-9]+)$/i.exec(name ?? '')?.[1]?.toLowerCase()
  return (extension && typeByExtension[extension]) || ''
}

/**
 * Arquivo escolhido → `UploadFile` do envio multipart. Sem tipo informado pelo seletor, vale o da extensão (o servidor
 * confere o conteúdo); sem nome, "comprovante".
 */
export function toUploadFile(picked: PickedFile): UploadFile {
  const name = picked.name?.trim() || 'comprovante'
  return { uri: picked.uri, name, type: picked.mimeType?.trim().toLowerCase() || typeFromName(name), size: picked.size ?? null }
}

export type PickSource = 'documento' | 'galeria'

/**
 * Abre o seletor e devolve o arquivo escolhido (ou `null` se a pessoa cancelou). Os módulos nativos são carregados só
 * ao tocar no botão: o envio de comprovante e de devolução é raro, e a tela abre sem depender deles.
 */
export async function pickReceiptFile(source: PickSource): Promise<PickedFile | null> {
  if (source === 'documento') {
    const DocumentPicker = await import('expo-document-picker')
    const result = await DocumentPicker.getDocumentAsync({ type: RECEIPT_ACCEPT, copyToCacheDirectory: true, multiple: false })
    const asset = result.canceled ? null : result.assets[0]
    return asset ? { uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size } : null
  }
  // A galeria recodifica a foto (JPEG a 80%), o que mantém um print de tela dentro do limite de 5 MiB.
  const ImagePicker = await import('expo-image-picker')
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, allowsEditing: false, quality: 0.8 })
  const asset = result.canceled ? null : result.assets[0]
  return asset ? { uri: asset.uri, name: asset.fileName, mimeType: asset.mimeType, size: asset.fileSize } : null
}
