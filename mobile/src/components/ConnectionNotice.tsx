import { useEffect } from 'react'
import { AppState, Pressable, Text, View } from 'react-native'
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import { connection, useConnection } from '../api/connection'
import type { ConnectionState } from '../api/connection'
import { useNow } from '../hooks/useNow'
import { colors } from '../theme'
import { announce } from '../utils/announce'
import { ActionSheet } from './arena/ActionSheet'
import { ArenaMark } from './arena/ArenaMark'
import { ActionButton, TextAction } from './arena/controls'

/*
 * Aviso de conexão do app inteiro (porta de `ConnectionNotice` da web; plano de toasts, C2): a faixa presa acima da
 * navegação inferior enquanto a ARENA não responde, e a folha escura "Sem conexão" quando a pessoa tenta uma ação
 * (`connection.attempted`, chamado por `reportActionError`). A folha só abre uma vez: "Continuar sem conexão" a dispensa e,
 * daí em diante, uma nova tentativa só faz a faixa tremer. Quando a conexão volta, a faixa vira "Conexão restabelecida"
 * por alguns segundos. Monte ao lado do `ToastViewport placement="nav"` no `ArenaShell` (a faixa é absoluta na raiz): o
 * viewport sobe 52 pt enquanto a faixa está na tela. Não aparece na tela de entrada, que tem o próprio "Tentar conexão
 * novamente". Ao voltar ao primeiro plano com o aviso ligado, consulta o servidor na hora (o Expo não tem NetInfo).
 */
const STRIP_HEIGHT = 52
const NAV_HEIGHT = 82

/** Ponto do aviso: âmbar e pulsante sem conexão, menta e parado quando a conexão voltou. */
function Dot({ restored = false }: { restored?: boolean }) {
  const reduced = useReducedMotion()
  const fade = useSharedValue(1)
  useEffect(() => {
    if (restored || reduced) { fade.set(1); return }
    fade.set(withRepeat(withSequence(withTiming(0.3, { duration: 700 }), withTiming(1, { duration: 700 })), -1))
    return () => cancelAnimation(fade)
  }, [fade, restored, reduced])
  const style = useAnimatedStyle(() => ({ opacity: fade.value }))
  return <Animated.View testID="connection-dot" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[{ width: 10, height: 10, borderRadius: 5, backgroundColor: restored ? colors.mint : colors['warning-soft'] }, style]} />
}

/** "Nova tentativa em N s." (ou "Tentando agora…"), acompanhando o relógio. */
function useRetryText({ nextRetryAt, checking, status }: ConnectionState): string {
  const now = useNow(1000, status === 'offline' && nextRetryAt !== null)
  if (checking) return 'Tentando agora…'
  const seconds = nextRetryAt === null ? 0 : Math.max(0, Math.ceil((nextRetryAt - now) / 1000))
  return `Nova tentativa em ${seconds} s.`
}

function Strip({ state }: { state: ConnectionState }) {
  const offline = state.status === 'offline'
  const retry = useRetryText(state)
  const reduced = useReducedMotion()
  const shake = useSharedValue(0)
  useEffect(() => { announce(offline ? 'Sem conexão com a ARENA' : 'Conexão restabelecida') }, [offline])
  // Ação tentada com a folha dispensada: a faixa treme (sem movimento com "reduzir movimento").
  useEffect(() => {
    if (state.nudge === 0 || reduced) return
    shake.set(withSequence(withTiming(-7, { duration: 70 }), withTiming(6, { duration: 80 }), withTiming(-4, { duration: 80 }), withTiming(3, { duration: 80 }), withTiming(0, { duration: 80 })))
  }, [state.nudge, reduced, shake])
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }))
  return <Animated.View testID="connection-strip" accessibilityRole={offline ? 'alert' : undefined} style={[{
    position: 'absolute', left: 0, right: 0, bottom: NAV_HEIGHT, height: STRIP_HEIGHT, zIndex: 40, elevation: 12, flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderTopWidth: 1, borderTopColor: `${offline ? colors['warning-soft'] : colors.mint}55`, backgroundColor: colors.toast,
  }, style]}>
    <Dot restored={!offline} />
    {offline ? <>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text accessibilityLiveRegion="polite" numberOfLines={1} style={{ color: '#ffffff', fontSize: 12.5, fontWeight: '600' }}>Sem conexão com a ARENA</Text>
        <Text numberOfLines={1} style={{ color: colors['glass-muted'], fontSize: 10.5 }}>{retry}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Tentar agora" accessibilityState={{ disabled: state.checking }} disabled={state.checking} hitSlop={6} onPress={() => connection.retryNow()}
        style={{ minHeight: 32, justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: colors['glass-line'], paddingHorizontal: 12, opacity: state.checking ? 0.5 : 1 }}>
        <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '700' }}>Tentar agora</Text>
      </Pressable>
    </> : <Text accessibilityLiveRegion="polite" style={{ color: '#ffffff', fontSize: 12.5, fontWeight: '600' }}>Conexão restabelecida</Text>}
  </Animated.View>
}

function OfflineSheet({ state }: { state: ConnectionState }) {
  const retry = useRetryText(state)
  return <ActionSheet dark title="Sem conexão com a ARENA" onClose={() => connection.dismissSheet()}>
    <View style={{ overflow: 'hidden', paddingBottom: 4 }}>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', right: -20, bottom: -8, opacity: 0.08 }}>
        <ArenaMark width={214} height={120} color={colors['warning-soft']} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Dot />
        <Text style={{ color: colors['warning-soft'], fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>OFFLINE</Text>
      </View>
      <Text style={{ marginTop: 8, color: colors['glass-muted'], fontSize: 13, lineHeight: 19 }}>{`Suas ações não chegam ao servidor agora. ${retry}`}</Text>
      <View style={{ marginTop: 16, gap: 4 }}>
        <ActionButton block tone="mint" title="Tentar agora" disabled={state.checking} onPress={() => connection.retryNow()} />
        <TextAction surface="dark" title="Continuar sem conexão" onPress={() => connection.dismissSheet()} />
      </View>
    </View>
  </ActionSheet>
}

export function ConnectionNotice() {
  const state = useConnection()
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => { if (next === 'active') connection.retryNow() })
    return () => subscription.remove()
  }, [])
  return <>
    {state.status !== 'online' && <Strip state={state} />}
    {state.sheetOpen && state.status === 'offline' && <OfflineSheet state={state} />}
  </>
}
