import { useCallback, useEffect, useRef } from 'react'
import type { ComponentProps, Ref } from 'react'
// Só o `TextInput.State` (qual campo está em foco): nenhum campo é desenhado aqui, então a restrição de fonte não se aplica.
// eslint-disable-next-line no-restricted-imports
import { Keyboard, ScrollView, TextInput } from 'react-native'
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollViewInstance } from 'react-native'

type Props = ComponentProps<typeof ScrollView> & { ref?: Ref<ScrollViewInstance> }

/** Folga entre o campo em foco e as bordas da área visível da rolagem. */
const MARGIN = 16

/**
 * `ScrollView` das telas, folhas e modais com campos de texto. O `KeyboardAvoidingView` encolhe a tela ou a folha quando o
 * teclado abre, mas a rolagem fica onde estava, e o campo em foco pode ficar atrás do teclado. Quando o teclado termina de
 * abrir, esta rolagem leva o campo até a área visível, medindo-o em relação ao próprio conteúdo. Um campo fora dela (outra
 * folha, outra tela) faz a medida falhar, e nada acontece. Só rola quando o campo não está inteiro à vista; um campo mais
 * alto que a área mostra o topo. Aceita as mesmas props e o mesmo `ref` do `ScrollView`; `onLayout` e `onScroll` de quem usa
 * continuam sendo chamados.
 */
export function KeyboardScrollView({ ref, onLayout, onScroll, scrollEventThrottle, ...props }: Props) {
  const scrollRef = useRef<ScrollViewInstance>(null)
  const frameRef = useRef({ height: 0, offset: 0 })
  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      const input = TextInput.State?.currentlyFocusedInput?.()
      const base = scrollRef.current?.getInnerViewRef?.()
      if (!input || !base || typeof input.measureLayout !== 'function') return
      input.measureLayout(base, (_x, y, _width, height) => {
        const { height: visible, offset } = frameRef.current
        const top = y - MARGIN
        const bottom = y + height + MARGIN
        if (top >= offset && bottom <= offset + visible) return
        const target = bottom > offset + visible ? Math.min(top, bottom - visible) : top
        scrollRef.current?.scrollTo({ y: Math.max(0, target), animated: true })
      }, () => undefined)
    })
    return () => subscription.remove()
  }, [])
  const attach = useCallback((node: ScrollViewInstance | null) => {
    scrollRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) ref.current = node
  }, [ref])
  const layout = useCallback((event: LayoutChangeEvent) => {
    frameRef.current.height = event.nativeEvent.layout.height
    onLayout?.(event)
  }, [onLayout])
  const scrolled = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    frameRef.current.offset = event.nativeEvent.contentOffset.y
    onScroll?.(event)
  }, [onScroll])
  return <ScrollView ref={attach} onLayout={layout} onScroll={scrolled} scrollEventThrottle={scrollEventThrottle ?? 32} {...props} />
}
