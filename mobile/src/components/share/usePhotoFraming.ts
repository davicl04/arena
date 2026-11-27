import { useCallback, useMemo, useState } from 'react'
import type { AccessibilityActionEvent } from 'react-native'
import { Gesture } from 'react-native-gesture-handler'
import { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { clampFraming, coverSize, initialFraming, nudgeFraming } from './framing'
import type { Framing, FramingAction, Size } from './framing'

/** Foto escolhida na galeria (só no aparelho; nunca vai ao servidor), com o tamanho original em pixels. */
export interface StoryPhoto { uri: string; width: number; height: number }

/**
 * Enquadramento da foto no quadro do Story: arrastar move e pinçar amplia (react-native-gesture-handler com o Reanimated,
 * na thread de UI), sempre limitado para a foto cobrir o quadro (`clampFraming`). `framing` é o último enquadramento
 * confirmado (fim do gesto ou ação de acessibilidade), usado no valor falado; o estilo animado segue o gesto ao vivo. Os
 * valores compartilhados usam `get`/`set` (compatíveis com o React Compiler).
 */
export function usePhotoFraming(photo: StoryPhoto | null, frameWidth: number, frameHeight: number) {
  const photoWidth = photo?.width
  const photoHeight = photo?.height
  const frame = useMemo<Size>(() => ({ width: frameWidth, height: frameHeight }), [frameWidth, frameHeight])
  const cover = useMemo<Size>(() => (photoWidth && photoHeight ? coverSize({ width: photoWidth, height: photoHeight }, frame) : frame), [photoWidth, photoHeight, frame])
  const zoom = useSharedValue(initialFraming.zoom)
  const x = useSharedValue(initialFraming.x)
  const y = useSharedValue(initialFraming.y)
  const [framing, setFraming] = useState<Framing>(initialFraming)
  const enabled = photo !== null

  const apply = useCallback((next: Framing) => {
    zoom.set(next.zoom)
    x.set(next.x)
    y.set(next.y)
    setFraming(next)
  }, [zoom, x, y])

  /** Nova foto: volta à cobertura centralizada, sem ampliação. */
  const reset = useCallback(() => apply(initialFraming), [apply])

  const gesture = useMemo(() => {
    const pan = Gesture.Pan().enabled(enabled)
      .onChange(event => {
        const next = clampFraming({ zoom: zoom.get(), x: x.get() + event.changeX, y: y.get() + event.changeY }, cover, frame)
        x.set(next.x)
        y.set(next.y)
      })
      .onEnd(() => { scheduleOnRN(setFraming, { zoom: zoom.get(), x: x.get(), y: y.get() }) })
    const pinch = Gesture.Pinch().enabled(enabled)
      .onChange(event => {
        const next = clampFraming({ zoom: zoom.get() * event.scaleChange, x: x.get(), y: y.get() }, cover, frame)
        zoom.set(next.zoom)
        x.set(next.x)
        y.set(next.y)
      })
      .onEnd(() => { scheduleOnRN(setFraming, { zoom: zoom.get(), x: x.get(), y: y.get() }) })
    return Gesture.Simultaneous(pan, pinch)
  }, [enabled, cover, frame, zoom, x, y])

  const photoStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: zoom.get() }] }))

  const onAccessibilityAction = useCallback((event: AccessibilityActionEvent) => {
    apply(nudgeFraming({ zoom: zoom.get(), x: x.get(), y: y.get() }, event.nativeEvent.actionName as FramingAction, cover, frame))
  }, [apply, cover, frame, zoom, x, y])

  return { cover, framing, gesture, photoStyle, reset, onAccessibilityAction }
}
