import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Image, Modal, Pressable, Text, useWindowDimensions, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ApiError } from '../../api/client'
import { getShareSubject } from '../../api/share'
import type { ShareTarget } from '../../api/share'
import { useResource } from '../../hooks/useResource'
import { colors } from '../../theme'
import { ActionButton, ChoicePills } from '../arena/controls'
import type { ChoiceOption } from '../arena/controls'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'
import { toast } from '../toast/toastStore'
import { ToastViewport } from '../toast/ToastViewport'
import { framingActions } from './framing'
import { Checkerboard, STORY_DESIGN, StoryCanvas, storyHeight } from './ResultSticker'
import type { PlatePosition } from './ResultSticker'
import { saveStoryToGallery, shareStoryImage } from './saveImage'
import { stickerDescription, stickerModel } from './stickerView'
import { usePhotoFraming } from './usePhotoFraming'
import type { StoryPhoto } from './usePhotoFraming'

/** Topo (fechar e título) e base (posição da placa e ações) da tela, em pontos, descontados da altura da prévia. */
const CHROME = 270
const SIDE = 16
const muted = '#cfdad3'

const platePositions: ChoiceOption<PlatePosition>[] = [
  { value: 'topo', label: 'Topo' },
  { value: 'centro', label: 'Centro' },
  { value: 'base', label: 'Base' },
]

/** Exportação em curso: o Story no menu do sistema, o Story na galeria ou só o adesivo. */
type Busy = 'story' | 'image' | 'sticker' | null

/** Largura da prévia 9:16 que cabe na tela, entre as margens e o topo/base. */
export function previewWidth(window: { width: number; height: number }, insets: { top: number; bottom: number }): number {
  const byHeight = (window.height - insets.top - insets.bottom - CHROME) * 9 / 16
  return Math.max(120, Math.floor(Math.min(window.width - SIDE * 2, byHeight)))
}

/** O próximo quadro desenhado depois de uma atualização da árvore (a captura precisa da árvore já montada). */
const nextFrame = () => new Promise<void>(done => {
  const raf = (globalThis as { requestAnimationFrame?: (callback: () => void) => unknown }).requestAnimationFrame
  if (raf) raf(() => done())
  else setTimeout(done, 0)
})

function StateBlock({ title, text, action }: { title: string; text?: string; action?: { title: string; onPress: () => void } }) {
  return <View accessibilityRole="alert" style={{ alignItems: 'center', gap: 10, paddingHorizontal: 28 }}>
    <Text accessibilityRole="header" style={{ color: '#ffffff', fontSize: 16, fontWeight: '800', textAlign: 'center' }}>{title}</Text>
    {text ? <Text style={{ color: muted, fontSize: 13, lineHeight: 19, textAlign: 'center' }}>{text}</Text> : null}
    {action ? <View style={{ marginTop: 6, flexDirection: 'row' }}><ActionButton tone="line" title={action.title} onPress={action.onPress} /></View> : null}
  </View>
}

/** Ação secundária da tela escura (ícone sobre o rótulo, sem fundo), com área de toque de 44 pt e estado ocupado. */
function SmallAction({ icon, title, busyTitle, busy = false, disabled = false, hint, onPress }: {
  icon: IconName; title: string; busyTitle?: string; busy?: boolean; disabled?: boolean; hint?: string; onPress: () => void
}) {
  const off = disabled || busy
  const label = busy && busyTitle ? busyTitle : title
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} accessibilityState={{ disabled: off, busy }} disabled={off} onPress={onPress}
    style={{ flex: 1, minHeight: 52, minWidth: 44, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 4, opacity: off && !busy ? 0.45 : 1 }}>
    {busy ? <ActivityIndicator size="small" color={muted} /> : <Icon name={icon} size={20} color={muted} />}
    <Text numberOfLines={2} style={{ color: muted, fontSize: 11.5, lineHeight: 14, fontWeight: '600', textAlign: 'center' }}>{label}</Text>
  </Pressable>
}

/**
 * Tela imersiva do compartilhamento nos Stories ("Prévia do Story"), em tela cheia sobre o perfil: fundo `night` nos
 * dois temas (escura por design) e a prévia 9:16, que é o mesmo quadro capturado na exportação. Sem foto, o adesivo real
 * aparece sobre o xadrez do fundo transparente, com "Escolher foto"; com foto (galeria, só no aparelho), ela cobre o quadro
 * atrás do adesivo e se enquadra com arrastar e pinçar. O seletor Topo / Centro / Base posiciona a placa. Ações:
 * "Compartilhar nos Stories" (JPEG 1080×1920 no menu do sistema; desabilitada sem foto), "Salvar imagem" (o mesmo JPEG na
 * galeria), "Trocar foto" e "Salvar só o adesivo" (PNG 1080×1920 transparente, sem a foto). Uma leitura da API por
 * abertura; 401 sai da sessão pelo fluxo existente (`onExpired`), 404 explica que a atividade não pode ser compartilhada
 * e as demais falhas oferecem "Tentar de novo".
 */
export function ShareStoryModal({ target, onClose, onExpired }: { target: ShareTarget; onClose: () => void; onExpired: () => void }) {
  const window = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const { kind, id } = target
  const load = useCallback(() => getShareSubject({ kind, id }), [kind, id])
  const resource = useResource(load, onExpired, { fallback: 'Não foi possível carregar o adesivo.' })
  const canvas = useRef<View>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [plate, setPlate] = useState<PlatePosition>('topo')
  const [photo, setPhoto] = useState<StoryPhoto | null>(null)
  const [photoReady, setPhotoReady] = useState(false)
  const [picking, setPicking] = useState(false)
  // "Salvar só o adesivo" com foto: a foto sai do quadro durante a captura, que espera a árvore sem ela ser desenhada.
  const [hidePhoto, setHidePhoto] = useState(false)
  const painted = useRef<(() => void) | null>(null)
  const width = previewWidth(window, insets)
  const height = storyHeight(width)
  const framing = usePhotoFraming(photo, width, height)
  const model = resource.data ? stickerModel(resource.data) : null
  const cause = resource.errorCause
  const notFound = cause instanceof ApiError && cause.status === 404
  const expired = cause instanceof ApiError && cause.status === 401
  const storyReady = Boolean(model && photo && photoReady)

  useEffect(() => {
    if (!hidePhoto || !painted.current) return
    const done = painted.current
    painted.current = null
    void nextFrame().then(done)
  }, [hidePhoto])

  const withoutPhoto = () => new Promise<void>(done => { painted.current = done; setHidePhoto(true) })

  async function choosePhoto() {
    if (picking || busy) return
    setPicking(true)
    try {
      // Carregado só aqui, como nas outras escolhas de foto do app.
      const ImagePicker = await import('expo-image-picker')
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, allowsEditing: false, exif: false, quality: 0.9 })
      const asset = result.canceled ? null : result.assets?.[0]
      if (!asset) return
      setPhoto({ uri: asset.uri, width: asset.width || STORY_DESIGN.width, height: asset.height || STORY_DESIGN.height })
      setPhotoReady(false)
      framing.reset()
    } catch {
      toast.error('Não foi possível abrir as fotos.', { description: 'Confira se o Arena pode acessar suas fotos nas configurações do aparelho.' })
    } finally { setPicking(false) }
  }

  function photoFailed() {
    setPhoto(null)
    setPhotoReady(false)
    toast.error('Não foi possível abrir a foto.', { description: 'Escolha outra foto.' })
  }

  async function shareStory() {
    if (busy || !storyReady) return
    setBusy('story')
    try {
      const outcome = await shareStoryImage(canvas)
      if (outcome === 'unavailable') toast.warning('Compartilhamento indisponível', { description: 'Use "Salvar imagem" para guardar o Story na galeria e postar pelo Instagram.' })
    } catch {
      toast.error('Não foi possível compartilhar a imagem.', { description: 'Tente de novo.' })
    } finally { setBusy(null) }
  }

  async function save(kindToSave: 'image' | 'sticker') {
    if (busy || !model || (kindToSave === 'image' && !storyReady)) return
    setBusy(kindToSave)
    const sticker = kindToSave === 'sticker'
    try {
      if (sticker && photo) await withoutPhoto()
      const outcome = await saveStoryToGallery(canvas, sticker ? 'png' : 'jpg')
      if (outcome === 'saved') toast.success('Imagem salva', { description: sticker ? 'O adesivo está na galeria, com fundo transparente.' : 'O Story está na galeria.' })
      else toast.warning('Sem permissão para salvar', { description: `Para salvar ${sticker ? 'o adesivo' : 'a imagem'}, permita que o Arena adicione fotos à galeria nas configurações do aparelho.` })
    } catch {
      toast.error('Não foi possível salvar a imagem.', { description: 'Tente de novo.' })
    } finally {
      setHidePhoto(false)
      setBusy(null)
    }
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
    const description = stickerDescription(model)
    const photoLayer = photo && !hidePhoto
      ? <Animated.View testID="story-photo" pointerEvents="none"
        style={[{ position: 'absolute', left: (width - framing.cover.width) / 2, top: (height - framing.cover.height) / 2, width: framing.cover.width, height: framing.cover.height }, framing.photoStyle]}>
        <Image source={{ uri: photo.uri }} accessibilityIgnoresInvertColors onLoad={() => setPhotoReady(true)} onError={photoFailed} style={{ width: '100%', height: '100%' }} />
      </Animated.View>
      : null
    // Com foto, o quadro vira o enquadramento: ajustável (ampliar e reduzir) e com ações para mover a foto.
    const adjust = photo ? {
      accessibilityRole: 'adjustable' as const,
      accessibilityLabel: `Enquadramento da foto. ${description}`,
      accessibilityHint: 'Arraste para mover a foto e pince para ampliar.',
      accessibilityValue: { text: `Ampliação de ${Math.round(framing.framing.zoom * 100)}%` },
      accessibilityActions: framingActions,
      onAccessibilityAction: framing.onAccessibilityAction,
    } : undefined
    preview = <GestureDetector gesture={framing.gesture}>
      <View testID="story-preview" style={{ width, height, borderRadius: 20, overflow: 'hidden' }}>
        <Checkerboard width={width} />
        <StoryCanvas ref={canvas} model={model} width={width} plate={plate} photo={photoLayer} accessibilityLabel={description} accessibility={adjust} />
        {photo ? null : <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, alignItems: 'center', ...(plate === 'centro' ? { top: height * 0.14 } : { top: (height - 44) / 2 }) }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Escolher foto" accessibilityHint="Abre a galeria para escolher a foto de fundo do Story"
            accessibilityState={{ disabled: picking || Boolean(busy), busy: picking }} disabled={picking || Boolean(busy)} onPress={() => void choosePhoto()}
            style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'rgba(8,20,14,0.82)', paddingHorizontal: 18 }}>
            {picking ? <ActivityIndicator size="small" color="#ffffff" /> : <Icon name="image-up" size={18} color="#ffffff" />}
            <Text style={{ color: '#ffffff', fontSize: 13.5, fontWeight: '700' }}>Escolher foto</Text>
          </Pressable>
        </View>}
      </View>
    </GestureDetector>
  }

  return <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <StatusBar style="light" />
    {/* O Modal desenha fora da raiz do app: os gestos da prévia precisam da própria raiz do gesture-handler. */}
    <GestureHandlerRootView style={{ flex: 1 }}>
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
        <View style={{ paddingHorizontal: SIDE, paddingTop: 10, paddingBottom: 14, gap: 10 }}>
          <View style={{ alignItems: 'center' }}>
            <ChoicePills label="Posição da placa" tone="dark" options={platePositions} value={plate} onChange={setPlate} disabled={!model || Boolean(busy)} />
          </View>
          <ActionButton tone="mint" block icon="stories" title={busy === 'story' ? 'Preparando…' : 'Compartilhar nos Stories'} busy={busy === 'story'} disabled={!storyReady || Boolean(busy)}
            accessibilityHint={storyReady ? 'Abre o menu de compartilhar com o Story montado, em JPEG' : 'Escolha uma foto para montar o Story'} onPress={() => void shareStory()} />
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <SmallAction icon="download" title="Salvar imagem" busyTitle="Salvando…" busy={busy === 'image'} disabled={!storyReady || Boolean(busy)}
              hint="Grava o Story montado na galeria, em JPEG" onPress={() => void save('image')} />
            <SmallAction icon="image-up" title="Trocar foto" busy={picking && photo !== null} disabled={!model || !photo || picking || Boolean(busy)}
              hint="Abre a galeria para escolher outra foto; a posição da placa continua" onPress={() => void choosePhoto()} />
            <SmallAction icon="save" title="Salvar só o adesivo" busyTitle="Salvando…" busy={busy === 'sticker'} disabled={!model || Boolean(busy)}
              hint="Grava o adesivo na galeria, em PNG com fundo transparente" onPress={() => void save('sticker')} />
          </View>
        </View>
      </View>
    </GestureHandlerRootView>
    <ToastViewport />
  </Modal>
}
