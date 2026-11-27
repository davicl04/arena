import type { RefObject } from 'react'
import type { HostInstance } from 'react-native'
import { captureRef } from 'react-native-view-shot'
import * as MediaLibrary from 'expo-media-library/legacy'
import * as Sharing from 'expo-sharing'
import { STORY_EXPORT } from './ResultSticker'

/*
 * Captura do quadro do Story, gravação na galeria e menu de compartilhar do sistema, no aparelho (sem envio ao servidor). A permissão é só de gravação
 * (`writeOnly`), pedida no momento do toque; o texto do pedido no iOS está no `app.json` (plugin do expo-media-library).
 * O `saveToLibraryAsync` da API legada é o que funciona com a permissão só de gravação e no Expo Go.
 */

/** PNG com fundo transparente (adesivo) ou JPEG (Story montado, com a foto). */
export type CaptureFormat = 'png' | 'jpg'
export type SaveOutcome = 'saved' | 'denied'
export type ShareOutcome = 'opened' | 'unavailable'

/** Captura `view` em 1080×1920 e devolve o arquivo temporário. */
export function captureStory(view: RefObject<HostInstance | null>, format: CaptureFormat): Promise<string> {
  return captureRef(view, { format, quality: format === 'jpg' ? 0.92 : 1, width: STORY_EXPORT.width, height: STORY_EXPORT.height, result: 'tmpfile' })
}

/**
 * Pede a permissão só de gravação, captura e grava na galeria. `denied` quando a pessoa nega; as demais falhas
 * (captura ou gravação) sobem como erro.
 */
export async function saveStoryToGallery(view: RefObject<HostInstance | null>, format: CaptureFormat): Promise<SaveOutcome> {
  const permission = await MediaLibrary.requestPermissionsAsync(true)
  if (!permission.granted) return 'denied'
  const uri = await captureStory(view, format)
  await MediaLibrary.saveToLibraryAsync(uri)
  return 'saved'
}

/**
 * Captura o Story montado (JPEG 1080×1920) e abre o menu de compartilhar do sistema (`expo-sharing`), onde a pessoa escolhe
 * o Instagram ou outro app. A promessa termina quando o menu fecha, com ou sem envio: cancelar não é erro. `unavailable`
 * quando o aparelho não oferece o menu (não captura); falhas de captura ou do menu sobem como erro.
 */
export async function shareStoryImage(view: RefObject<HostInstance | null>): Promise<ShareOutcome> {
  if (!(await Sharing.isAvailableAsync())) return 'unavailable'
  const uri = await captureStory(view, 'jpg')
  await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', UTI: 'public.jpeg', dialogTitle: 'Compartilhar nos Stories' })
  return 'opened'
}
