import { useEffect, useMemo } from 'react'
import { PanResponder, Pressable, Text, View } from 'react-native'
import Animated, { Easing, cancelAnimation, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { Circle, Defs, LinearGradient, Rect, Stop, Svg } from 'react-native-svg'
import { colors } from '../../theme'
import { announce } from '../../utils/announce'
import { ArenaMark } from '../arena/ArenaMark'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'
import { TOAST_EXIT_MS, toastStore } from './toastStore'
import type { ToastItem, ToastTone } from './toastStore'

/*
 * Cartão "Anel" do toast ("Vidro do Coliseu"; no Expo o vidro é sólido, sem desfoque): glifo do tom dentro de um anel que
 * esvazia durante o tempo de exibição (cheio e parado no erro), título, descrição, ação em pílula na cor do tom e o X
 * sempre visível. A linha fina do tom fica no topo e o Coliseu, na cor do tom a 9%, no canto. `level` é a posição no
 * baralho (0 = da frente): os de trás sobem 10 pt, encolhem 5% por nível e escondem o conteúdo. Entrada de baixo para
 * cima, saída no sentido inverso e arrastar para baixo dispensa; com "reduzir movimento", só opacidade. Tocar no cartão
 * pausa o tempo (a loja soma a pausa do app em segundo plano). Cada toast novo é anunciado: `announce` no iOS e a região
 * viva no Android (erro "assertive", os demais "polite").
 */
const toneColor: Record<ToastTone, string> = { success: colors.mint, error: colors['danger-soft'], warning: colors['warning-soft'], info: colors['info-soft'] }
const glyph: Record<ToastTone, IconName> = { success: 'check', error: 'x', warning: 'bang', info: 'info' }

const RING_RADIUS = 16
const RING_LENGTH = 2 * Math.PI * RING_RADIUS
const AnimatedCircle = Animated.createAnimatedComponent(Circle)
const ENTER_MS = 380
const STACK_SHIFT = 10
const STACK_SCALE = 0.05
const DRAG_DISMISS = 48

/** Acrescenta transparência (0 a 1) a uma cor `#rrggbb` do tema. */
const withAlpha = (hex: string, alpha: number) => `${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`

export function ToastCard({ item, level }: { item: ToastItem; level: number }) {
  const { tone, ending } = item
  const color = toneColor[tone]
  const behind = level > 0
  const reduced = useReducedMotion()
  const enter = useSharedValue(0)
  const leave = useSharedValue(0)
  const stack = useSharedValue(level)
  const drag = useSharedValue(0)
  const progress = useSharedValue(1)

  useEffect(() => { announce(item.description ? `${item.title}. ${item.description}` : item.title) }, [item.id, item.updateKey, item.title, item.description])
  useEffect(() => { enter.set(withTiming(1, { duration: reduced ? 160 : ENTER_MS, easing: Easing.out(Easing.cubic) })) }, [enter, reduced])
  useEffect(() => { stack.set(reduced ? level : withTiming(level, { duration: 260, easing: Easing.out(Easing.cubic) })) }, [stack, level, reduced])
  useEffect(() => { if (ending) leave.set(withTiming(1, { duration: TOAST_EXIT_MS - 20, easing: Easing.in(Easing.quad) })) }, [leave, ending])
  // O anel acompanha a loja: esvazia do ponto atual até zero no tempo que falta; pausado, para onde está.
  useEffect(() => {
    if (item.duration === 0) { progress.set(1); return }
    if (item.runningSince === null) { cancelAnimation(progress); return }
    progress.set(item.remaining / item.duration)
    progress.set(withTiming(0, { duration: item.remaining, easing: Easing.linear }))
  }, [progress, item.duration, item.remaining, item.runningSince, item.updateKey])

  const { id } = item
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => !behind && gesture.dy > 6 && gesture.dy > Math.abs(gesture.dx),
    onPanResponderGrant: () => toastStore.setPaused('touch', true),
    onPanResponderMove: (_event, gesture) => { drag.set(Math.max(0, gesture.dy)) },
    onPanResponderRelease: (_event, gesture) => {
      toastStore.setPaused('touch', false)
      if (gesture.dy > DRAG_DISMISS || gesture.vy > 0.8) toastStore.dismiss(id)
      else drag.set(withTiming(0, { duration: 180 }))
    },
    onPanResponderTerminate: () => { toastStore.setPaused('touch', false); drag.set(withTiming(0, { duration: 180 })) },
  }), [drag, id, behind])

  const cardStyle = useAnimatedStyle(() => {
    const shown = enter.value * (1 - leave.value)
    if (reduced) return { opacity: shown, transform: [{ translateY: drag.value - stack.value * STACK_SHIFT }, { scale: 1 - stack.value * STACK_SCALE }] }
    const travel = (1 - enter.value) * 28 + leave.value * 28
    return { opacity: shown, transform: [{ translateY: travel + drag.value - stack.value * STACK_SHIFT }, { scale: (0.96 + 0.04 * enter.value) * (1 - stack.value * STACK_SCALE) }] }
  })
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: RING_LENGTH * (1 - progress.value) }))
  const floating = behind || ending
  return <Animated.View testID={`toast-${tone}`} pointerEvents={floating ? 'none' : 'auto'} {...pan.panHandlers}
    accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'}
    onTouchStart={() => toastStore.setPaused('touch', true)} onTouchEnd={() => toastStore.setPaused('touch', false)} onTouchCancel={() => toastStore.setPaused('touch', false)}
    style={[{ position: floating ? 'absolute' : 'relative', left: 0, right: 0, bottom: 0, ...(behind ? { top: 0 } : null), borderRadius: 18, backgroundColor: colors.toast, shadowColor: '#000000', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 18 }, elevation: 8 }, cardStyle]}>
    <View style={{ overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderColor: colors['toast-line'], backgroundColor: colors.toast, ...(behind ? { flexGrow: 1 } : null) }}>
      <Svg testID="toast-line" width="100%" height={1} style={{ position: 'absolute', top: 0, left: 16, right: 16 }}>
        <Defs>
          <LinearGradient id={`toast-line-${tone}`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={color} stopOpacity={0} />
            <Stop offset="0.5" stopColor={color} stopOpacity={1} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height={1} fill={`url(#toast-line-${tone})`} />
      </Svg>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={{ position: 'absolute', right: -16, bottom: -16, opacity: 0.09 }}>
        <ArenaMark width={150} height={84} color={color} />
      </View>
      <View accessibilityElementsHidden={behind} importantForAccessibility={behind ? 'no-hide-descendants' : 'auto'}
        style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingLeft: 12, paddingRight: 8, opacity: behind ? 0 : 1 }}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={36} height={36} viewBox="0 0 36 36" style={{ position: 'absolute' }}>
            <Circle cx={18} cy={18} r={RING_RADIUS} stroke={withAlpha(color, 0.18)} strokeWidth={2.4} fill="none" />
            <AnimatedCircle cx={18} cy={18} r={RING_RADIUS} stroke={color} strokeWidth={2.4} strokeLinecap="round" fill="none" strokeDasharray={RING_LENGTH} rotation={-90} origin="18, 18" animatedProps={ringProps} />
          </Svg>
          <Icon name={glyph[tone]} size={15} color={color} strokeWidth={2.6} />
        </View>
        <View style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
          <Text style={{ color: '#ffffff', fontSize: 13.5, lineHeight: 18, fontWeight: '600' }}>{item.title}</Text>
          {item.description ? <Text style={{ marginTop: 2, color: colors['glass-muted'], fontSize: 12, lineHeight: 17.4 }}>{item.description}</Text> : null}
          {item.action ? <Pressable accessibilityRole="button" accessibilityLabel={item.action.label} hitSlop={8} onPress={item.action.onClick}
            style={{ alignSelf: 'flex-start', marginTop: 8, minHeight: 28, justifyContent: 'center', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: color }}>
            <Text style={{ color: colors.night, fontSize: 11.5, lineHeight: 14, fontWeight: '700' }}>{item.action.label}</Text>
          </Pressable> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar aviso" hitSlop={8} onPress={() => toastStore.dismiss(item.id)}
          style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="x" size={15} color={colors['glass-muted']} strokeWidth={2.4} />
        </Pressable>
      </View>
    </View>
  </Animated.View>
}
