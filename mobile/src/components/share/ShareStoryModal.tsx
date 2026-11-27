import { useCallback, useRef, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, Text, useWindowDimensions, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ApiError } from '../../api/client'
import { getShareSubject } from '../../api/share'
import type { ShareTarget } from '../../api/share'
import { useResource } from '../../hooks/useResource'
import { colors } from '../../theme'
import { ActionButton } from '../arena/controls'
import { Icon } from '../Icon'
import { toast } from '../toast/toastStore'
import { ToastViewport } from '../toast/ToastViewport'
import { Checkerboard, StoryCanvas } from './ResultSticker'
import { saveStoryToGallery } from './saveImage'
import { stickerDescription, stickerModel } from './stickerView'

/** Topo (fechar e título) e base (ações) da tela, em pontos, descontados da altura da prévia. */
const CHROME = 190
const SIDE = 16
const muted = '#cfdad3'

/** Largura da prévia 9:16 que cabe na tela, entre as margens e o topo/base. */
export function previewWidth(window: { width: number; height: number }, insets: { top: number; bottom: number }): number {
  const byHeight = (window.height - insets.top - insets.bottom - CHROME) * 9 / 16
  return Math.max(120, Math.floor(Math.min(window.width - SIDE * 2, byHeight)))
}

function StateBlock({ title, text, action }: { title: string; text?: string; action?: { title: string; onPress: () => void } }) {
  return <View accessibilityRole="alert" style={{ alignItems: 'center', gap: 10, paddingHorizontal: 28 }}>
    <Text accessibilityRole="header" style={{ color: '#ffffff', fontSize: 16, fontWeight: '800', textAlign: 'center' }}>{title}</Text>
    {text ? <Text style={{ color: muted, fontSize: 13, lineHeight: 19, textAlign: 'center' }}>{text}</Text> : null}
    {action ? <View style={{ marginTop: 6, flexDirection: 'row' }}><ActionButton tone="line" title={action.title} onPress={action.onPress} /></View> : null}
  </View>
}

/**
 * Tela imersiva do compartilhamento nos Stories ("Prévia do Story"), em tela cheia sobre o perfil: fundo `night` nos
 * dois temas (escura por design), a prévia 9:16 com o adesivo real sobre o xadrez do fundo transparente e "Salvar só o
 * adesivo" (PNG 1080×1920 transparente na galeria). Uma leitura da API por abertura; 401 sai da sessão pelo fluxo
 * existente (`onExpired`), 404 explica que a atividade não pode ser compartilhada e as demais falhas oferecem
 * "Tentar de novo". A foto, o enquadramento, as posições e o Story montado entram depois (ticket 06).
 */
export function ShareStoryModal({ target, onClose, onExpired }: { target: ShareTarget; onClose: () => void; onExpired: () => void }) {
  const window = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const { kind, id } = target
  const load = useCallback(() => getShareSubject({ kind, id }), [kind, id])
  const resource = useResource(load, onExpired, { fallback: 'Não foi possível carregar o adesivo.' })
  const canvas = useRef<View>(null)
  const [saving, setSaving] = useState(false)
  const width = previewWidth(window, insets)
  const model = resource.data ? stickerModel(resource.data) : null
  const cause = resource.errorCause
  const notFound = cause instanceof ApiError && cause.status === 404
  const expired = cause instanceof ApiError && cause.status === 401

  async function saveSticker() {
    if (saving || !model) return
    setSaving(true)
    try {
      const outcome = await saveStoryToGallery(canvas, 'png')
      if (outcome === 'saved') toast.success('Imagem salva', { description: 'O adesivo está na galeria, com fundo transparente.' })
      else toast.warning('Sem permissão para salvar', { description: 'Para salvar o adesivo, permita que o Arena adicione fotos à galeria nas configurações do aparelho.' })
    } catch {
      toast.error('Não foi possível salvar a imagem.', { description: 'Tente de novo.' })
    } finally { setSaving(false) }
  }

  let preview
  if (resource.loading) {
    preview = <View accessibilityLiveRegion="polite" accessibilityLabel="Carregando o adesivo" style={{ alignItems: 'center', gap: 12 }}>
      <ActivityIndicator color={colors.mint} />
      <Text style={{ color: muted, fontSize: 13 }}>Carregando o adesivo…</Text>
    </View>
  } else if (notFound) {
    preview = <StateBlock title="Atividade não encontrada" text="Esta atividade não pode ser compartilhada. Volte à linha do tempo e escolha outra." action={{ title: 'Voltar', onPress: onClose }} />
  } else if (expired) {
    preview = <StateBlock title="Sua sessão expirou" text="Entre de novo para compartilhar seus resultados." />
  } else if (!model) {
    preview = <StateBlock title="Não foi possível carregar o adesivo" text={resource.error} action={{ title: 'Tentar de novo', onPress: resource.reload }} />
  } else {
    preview = <View testID="story-preview" style={{ width, borderRadius: 20, overflow: 'hidden' }}>
      <Checkerboard width={width} />
      <StoryCanvas ref={canvas} model={model} width={width} accessibilityLabel={stickerDescription(model)} />
    </View>
  }

  return <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <StatusBar style="light" />
    <View testID="share-story" style={{ flex: 1, backgroundColor: colors.night, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SIDE, paddingTop: 6, paddingBottom: 10 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose}
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' }}>
          <Icon name="x" size={18} color="#ffffff" />
        </Pressable>
        <Text accessibilityRole="header" style={{ color: muted, fontSize: 14, fontWeight: '600' }}>Prévia do Story</Text>
        <View style={{ width: 44 }} />
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>{preview}</View>
      <View style={{ paddingHorizontal: SIDE, paddingTop: 12, paddingBottom: 18, gap: 10 }}>
        <ActionButton tone="mint" block icon="download" title={saving ? 'Salvando…' : 'Salvar só o adesivo'} busy={saving} disabled={!model}
          accessibilityHint="Grava o adesivo na galeria, em PNG com fundo transparente" onPress={() => void saveSticker()} />
        <Text style={{ color: muted, fontSize: 11.5, lineHeight: 16, textAlign: 'center' }}>PNG com fundo transparente, para montar o Story no Instagram.</Text>
      </View>
    </View>
    <ToastViewport />
  </Modal>
}
