import { useEffect } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { Icon } from '../Icon'
import { ArenaMark } from '../arena/ArenaMark'
import { useTheme } from '../../hooks/useTheme'
import type { ThemePreference } from '../../hooks/useTheme'
import { appearanceTitle } from './appearance'

const OPTIONS: { value: ThemePreference; label: string; icon: 'sun' | 'moon' | 'monitor' }[] = [
  { value: 'light', label: 'Dia', icon: 'sun' },
  { value: 'dark', label: 'Noite', icon: 'moon' },
  { value: 'system', label: 'Automático', icon: 'monitor' },
]
const HEIGHT = 196
const PITCH = 46
const FOREST = '#0b2218'
const LEGEND = '#F4DE9A'

/** Faixas do gramado (22 pt cada, alternando dois verdes). */
function Pitch() {
  return <View className="absolute inset-x-0 bottom-0 flex-row overflow-hidden" style={{ height: PITCH }}>
    {Array.from({ length: 24 }, (_, index) => <View key={index} style={{ width: 22, backgroundColor: index % 2 ? '#237f4b' : '#1f7a46' }} />)}
  </View>
}

/*
 * Cartão "Luzes do estádio" no Menu do Perfil (seção Aparência; docs/plano-tema.md), o mesmo desenho da web: céu,
 * sol, refletores com o feixe, o Coliseu e o gramado. Na Noite (tema resolvido escuro) o céu escurece, o sol se põe e
 * os refletores acendem, com transição de 0,6 s pelo reanimated, sem animação quando a redução de movimento está ligada.
 * As opções Dia, Noite e Automático são botões de alternância (`checked`) num grupo "Tema"; a troca vale na hora.
 */
export function AppearanceCard() {
  const { preference, resolved, setPreference } = useTheme()
  const lit = resolved === 'dark'
  const reduced = useReducedMotion()
  const night = useSharedValue(lit ? 1 : 0)
  useEffect(() => { night.value = reduced ? (lit ? 1 : 0) : withTiming(lit ? 1 : 0, { duration: 600 }) }, [lit, reduced, night])
  const nightStyle = useAnimatedStyle(() => ({ opacity: night.value }))
  const sunStyle = useAnimatedStyle(() => ({ opacity: 1 - night.value, transform: [{ translateY: night.value * 30 }] }))
  return <View className="overflow-hidden rounded-[18px] border border-surface-edge" style={{ height: HEIGHT }}>
    <View className="absolute inset-0" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <Svg width="100%" height="100%" style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id="stadium-day" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#8fd0f2" /><Stop offset="0.6" stopColor="#cfeefd" /><Stop offset="1" stopColor="#e9f7ff" /></LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#stadium-day)" />
      </Svg>
      <Animated.View style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }, nightStyle]}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="stadium-night" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#02060a" /><Stop offset="0.7" stopColor="#07130d" /><Stop offset="1" stopColor={FOREST} /></LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#stadium-night)" />
        </Svg>
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', top: 16, right: 56, width: 30, height: 30, borderRadius: 15, backgroundColor: '#ffd66b', borderWidth: 6, borderColor: '#ffe7a6' }, sunStyle]} />
      {/* Refletores: o poste, a luminária (acesa na Noite) e o feixe. */}
      {(['left', 'right'] as const).map(side => <View key={side} style={{ position: 'absolute', bottom: PITCH, [side]: 22, width: 4, height: 82, backgroundColor: '#2b3a33' }}>
        <View style={{ position: 'absolute', top: -8, left: -10, width: 24, height: 12, borderRadius: 3, backgroundColor: '#3d4a43' }} />
        <Animated.View style={[{ position: 'absolute', top: -8, left: -10, width: 24, height: 12, borderRadius: 3, backgroundColor: '#fff8dd', shadowColor: '#fff8dd', shadowOpacity: 0.8, shadowRadius: 12, elevation: 6 }, nightStyle]} />
      </View>)}
      <Animated.View style={[{ position: 'absolute', top: 66, left: 16, right: 16, height: 150 }, nightStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 320 150" preserveAspectRatio="none">
          <Path d="M0 0 L120 150 L40 150 Z" fill="#fff8dd" opacity={0.14} />
          <Path d="M320 0 L200 150 L280 150 Z" fill="#fff8dd" opacity={0.14} />
        </Svg>
      </Animated.View>
      <View className="absolute inset-x-0 items-center" style={{ bottom: 40, opacity: 0.9 }}>
        <ArenaMark width={230} height={96} color={lit ? '#000000' : FOREST} />
      </View>
      <Pitch />
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, height: PITCH, backgroundColor: '#000000', opacity: 0.45 }, nightStyle]} />
    </View>
    <View className="absolute left-4 top-3.5 gap-0.5">
      <Text className="text-[10px] font-bold tracking-[1px]" style={{ color: lit ? '#f4de9acc' : '#0b2218b3' }}>TEMA</Text>
      <Text accessibilityRole="header" className="text-[16px] font-bold" style={{ color: lit ? '#ffffff' : FOREST }}>{appearanceTitle(preference, resolved)}</Text>
    </View>
    <View role="group" aria-label="Tema" className="absolute inset-x-3 bottom-2.5 flex-row gap-1 rounded-[12px] p-1" style={{ backgroundColor: '#040806bf' }}>
      {OPTIONS.map(({ value, label, icon }) => {
        const on = preference === value
        const ink = on ? (lit ? '#1a1404' : FOREST) : '#ffffffcc'
        return <Pressable key={value} accessibilityRole="togglebutton" accessibilityState={{ checked: on }} accessibilityLabel={label} onPress={() => setPreference(value)}
          className="min-h-11 grow basis-0 flex-row items-center justify-center gap-1.5 rounded-[9px] px-1" style={{ backgroundColor: on ? (lit ? LEGEND : '#ffffff') : 'transparent' }}>
          <Icon name={icon} size={13} color={ink} />
          <Text numberOfLines={1} className="text-[11px] font-bold" style={{ color: ink }}>{label}</Text>
        </Pressable>
      })}
    </View>
  </View>
}
