import { useEffect } from 'react'
import { Pressable, View } from 'react-native'
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated'
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg'
import { Text } from '../Text'
import { useNow } from '../../hooks/useNow'
import { colors } from '../../theme'
import { formatElapsed, spokenDuration } from '../../utils/clock'
import { parseIso } from '../../utils/format'
import { ArenaMark } from '../arena/ArenaMark'

const SIZE = 184
const RING = 6
const OUTER = SIZE + RING * 2

/** Onda menta da busca (`ripple` da web): cresce 22% e some em 1,8 s, sem parar. `delay` desencontra a segunda onda. */
function Ripple({ delay = 0 }: { delay?: number }) {
  const wave = useSharedValue(0)
  useEffect(() => {
    wave.set(withDelay(delay, withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1)))
    return () => cancelAnimation(wave)
  }, [wave, delay])
  // Parada (antes do atraso), a onda não aparece: só o anel fixo.
  const style = useAnimatedStyle(() => ({ opacity: wave.value === 0 ? 0 : 0.7 * (1 - wave.value), transform: [{ scale: 1 + 0.22 * wave.value }] }))
  return <Animated.View testID="play-ripple" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: OUTER / 2, borderWidth: 2, borderColor: colors.mint }, style]} />
}

/**
 * Botão redondo da placa (J1/H1): muralha do Coliseu em menta, verbo em caixa alta e complemento, num círculo escuro com
 * o clarão verde da web e anel menta. Desabilitado, continua legível e o motivo fica na nota sob ele (`hint`, lida como
 * dica de acessibilidade).
 *
 * Durante a busca (`searchedSince` = `started_at`), o anel e o contorno ficam mais fortes, duas ondas menta pulsam (só com
 * movimento permitido; com "reduzir movimento", vale o contorno forte) e o tempo decorrido ocupa o lugar do complemento.
 * Para o leitor de tela, o tempo vai como valor falado em minutos ("há 2 minutos"), que só muda a cada minuto: ninguém
 * ouve a contagem de cada segundo.
 */
export function PlayButton({ verb, caption, label, hint, disabled = false, onPress, searchedSince }: {
  verb: string
  caption: string
  /** Nome acessível ("Encontrar partida", "Preparar perfil de Futebol"…). */
  label: string
  hint?: string
  disabled?: boolean
  onPress?: () => void
  /** Início da busca em andamento (ISO): liga o pulso e o cronômetro. */
  searchedSince?: string | null
}) {
  const started = parseIso(searchedSince)?.getTime() ?? null
  const searching = started !== null
  const now = useNow(1000, searching)
  const reduced = useReducedMotion()
  const elapsed = started === null ? 0 : Math.max(0, now - started)
  const off = disabled || !onPress
  return <View style={{ marginVertical: 4, padding: RING, borderRadius: OUTER / 2, backgroundColor: searching ? 'rgba(143,224,180,0.25)' : off ? 'rgba(143,224,180,0.05)' : 'rgba(143,224,180,0.12)', boxShadow: '0 18px 40px rgba(0,0,0,0.44)' }}>
    {searching && !reduced ? <><Ripple /><Ripple delay={900} /></> : null}
    <Pressable testID="play-button" accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint}
      accessibilityValue={searching ? { text: `há ${spokenDuration(elapsed)}` } : undefined}
      accessibilityState={{ disabled: off }} disabled={off} onPress={onPress}
      style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.forest, borderWidth: searching ? 2 : 1, borderColor: off ? 'rgba(143,224,180,0.35)' : colors.mint }}>
      {/* `radial-gradient(circle at 50% 38%, #0f3a28 0%, forest 72%)` da web. */}
      <Svg pointerEvents="none" width={SIZE} height={SIZE} style={{ position: 'absolute' }}>
        <Defs>
          <RadialGradient id="play-button-glow" gradientUnits="userSpaceOnUse" cx={SIZE / 2} cy={SIZE * 0.38} r={147}>
            <Stop offset="0" stopColor="#0f3a28" />
            <Stop offset="0.72" stopColor={colors.forest} />
          </RadialGradient>
        </Defs>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2} fill="url(#play-button-glow)" />
      </Svg>
      <View style={{ alignItems: 'center', gap: 8, opacity: off && !searching ? 0.65 : 1 }}>
        <ArenaMark width={46} height={46} color={colors.mint} compact />
        <Text display style={{ color: '#ffffff', fontSize: 14, fontWeight: '800', letterSpacing: 1.1 }}>{verb}</Text>
        {searching
          ? <Text testID="play-elapsed" accessibilityElementsHidden importantForAccessibility="no" style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10, fontVariant: ['tabular-nums'] }}>{formatElapsed(elapsed)}</Text>
          : <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10 }}>{caption}</Text>}
      </View>
    </Pressable>
  </View>
}
