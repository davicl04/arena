import { useRef, useState } from 'react'
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { request } from '../api/client'
import type { Post } from '../api/client'
import { CAPTION_MAX } from '../api/social'
import { reportActionError } from '../hooks/useSubmit'
import { Screen } from './Screen'
import { ToastViewport } from './toast/ToastViewport'
import { cx } from '../styles'
import { colors } from '../theme'
import { Icon } from './Icon'

export const POST_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export type PhotoAsset = ImagePicker.ImagePickerAsset

/**
 * Passo 1 da nova publicação: o editor nativo do seletor recorta a foto em 1:1.
 * Devolve `null` se a pessoa cancelar; lança erro se a imagem passar do limite do servidor.
 */
export async function pickSquarePhoto(): Promise<PhotoAsset | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, allowsEditing: true, aspect: [1, 1], quality: 0.9 })
  const asset = result.canceled ? null : result.assets[0]
  if (!asset) return null
  if (asset.fileSize && asset.fileSize > POST_IMAGE_MAX_BYTES) throw new Error('A imagem deve ter até 5 MiB.')
  return asset
}

const formatCount = (value: number) => value.toLocaleString('pt-BR')

/** Passo 2: tela cheia escura com a foto recortada, a legenda e "Publicar". */
export default function PostComposer({ initial, onClose, onPublished, onExpired }: {
  initial: PhotoAsset; onClose: () => void; onPublished: (post: Post) => void; onExpired: () => void
}) {
  const [asset, setAsset] = useState(initial)
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  // Validação local da foto (limite de 5 MiB) e recusa de validação do servidor (legenda, imagem); os outros erros viram toast.
  const [error, setError] = useState('')
  const picking = useRef(false)

  async function changePhoto() {
    if (busy || picking.current) return
    picking.current = true
    setError('')
    try { const next = await pickSquarePhoto(); if (next) setAsset(next) }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível abrir as fotos.') }
    finally { picking.current = false }
  }

  async function publish() {
    if (busy) return
    setBusy(true); setError('')
    const form = new FormData()
    form.append('file', { uri: asset.uri, name: asset.fileName ?? 'publicacao.jpg', type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob)
    form.append('caption', caption)
    try {
      const created = await request<Post>('/posts', 'POST', form)
      setBusy(false)
      onPublished(created)
    } catch (err) {
      const report = reportActionError(err, 'Não foi possível publicar a foto.', onExpired)
      if (report.kind === 'form') setError(report.message)
      setBusy(false)
    }
  }

  return <Modal visible animationType="slide" onRequestClose={() => { if (!busy) onClose() }}>
    <Screen className="grow basis-0 bg-forest"><KeyboardAvoidingView className="grow basis-0" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View className="flex-row items-center gap-2 px-2 py-1.5">
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar nova publicação" accessibilityState={{ disabled: busy }} disabled={busy} onPress={onClose} className="min-h-11 min-w-11 items-center justify-center">
          <Icon name="x" size={22} color="#ffffff" />
        </Pressable>
        <View accessibilityLabel="Etapas da publicação" className="grow basis-0 flex-row items-center justify-center gap-2 pr-13">
          <Pressable accessibilityRole="button" accessibilityLabel="Passo 1, Recorte concluído. Trocar foto" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void changePhoto()} className="min-h-11 flex-row items-center gap-1.5">
            <Text className="text-[13px] font-semibold text-glass-muted">Recorte</Text>
            <View className="h-5 w-5 items-center justify-center rounded-full bg-glass-accent"><Icon name="check" size={12} strokeWidth={3} color={colors.forest} /></View>
          </Pressable>
          <Text className="text-glass-muted">·</Text>
          <View accessible accessibilityLabel="Passo 2 de 2, Legenda" className="flex-row items-center gap-1.5">
            <View className="h-5 w-5 items-center justify-center rounded-full border border-glass-accent"><Text className="text-[11px] font-bold text-glass-accent">2</Text></View>
            <Text className="text-[13px] font-bold text-white">Legenda</Text>
          </View>
        </View>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="pb-8">
        <Image source={{ uri: asset.uri }} accessibilityLabel="Prévia da foto recortada" resizeMode="cover" className="aspect-square w-full bg-glass-ink" />
        <View className="gap-3 p-4">
          <TextInput value={caption} onChangeText={setCaption} maxLength={CAPTION_MAX} multiline editable={!busy}
            accessibilityLabel="Legenda" placeholder="Conte um pouco sobre esse momento" placeholderTextColor={colors['glass-muted']}
            className="min-h-24 rounded-lg border border-forest-line bg-forest-field p-3 text-[15px] text-white" textAlignVertical="top" />
          <Text accessibilityLabel={`${caption.length} de ${CAPTION_MAX} caracteres`} className="self-end text-[12px] text-glass-muted">{formatCount(caption.length)}/{formatCount(CAPTION_MAX)}</Text>
          {error ? <Text accessibilityRole="alert" className="text-[14px] leading-[21px] text-glass-danger">{error}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={busy ? 'Publicando…' : 'Publicar'} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => void publish()}
            className={cx('min-h-12 items-center justify-center rounded-control bg-glass-accent px-4', busy && 'opacity-60')}>
            <Text className="text-[15px] font-bold text-forest">{busy ? 'Publicando…' : 'Publicar'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView></Screen>
    <ToastViewport />
  </Modal>
}
