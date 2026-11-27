import type { RefObject } from 'react'
import type { View } from 'react-native'
import { captureRef } from 'react-native-view-shot'
import * as MediaLibrary from 'expo-media-library/legacy'
import { STORY_EXPORT } from './ResultSticker'

/*
 * Captura do quadro do Story e gravação na galeria, no aparelho (sem envio ao servidor). A permissão é só de gravação
 * (`writeOnly`), pedida no momento do toque; o texto do pedido no iOS está no `app.json` (plugin do expo-media-library).
 * O `saveToLibraryAsync` da API legada é o que funciona com a permissão só de gravação e no Expo Go.
 */

/** PNG com fundo transparente (adesivo) ou JPEG (Story montado, ticket da foto). */
export type CaptureFormat = 'png' | 'jpg'
export type SaveOutcome = 'saved' | 'denied'

/** Captura `view` em 1080×1920 e devolve o arquivo temporário. */
export function captureStory(view: RefObject<View | null>, format: CaptureFormat): Promise<string> {
  return captureRef(view, { format, quality: format === 'jpg' ? 0.92 : 1, width: STORY_EXPORT.width, height: STORY_EXPORT.height, result: 'tmpfile' })
}

/**
 * Pede a permissão só de gravação, captura e grava na galeria. `denied` quando a pessoa nega; as demais falhas
 * (captura ou gravação) sobem como erro.
 */
export async function saveStoryToGallery(view: RefObject<View | null>, format: CaptureFormat): Promise<SaveOutcome> {
  const permission = await MediaLibrary.requestPermissionsAsync(true)
  if (!permission.granted) return 'denied'
  const uri = await captureStory(view, format)
  await MediaLibrary.saveToLibraryAsync(uri)
  return 'saved'
}
