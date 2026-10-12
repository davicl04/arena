import { Pressable, Text, View } from 'react-native'
import { useNow } from '../../hooks/useNow'
import { colors } from '../../theme'
import { formatElapsed, spokenDuration } from '../../utils/clock'
import { parseIso } from '../../utils/format'
import { ArenaMark } from '../arena/ArenaMark'

const SIZE = 184
const RING = 6

/**
 * Botão redondo da placa (J1/H1): muralha do Coliseu em menta, verbo em caixa alta e complemento, num círculo escuro com
 * anel menta. Desabilitado, continua legível e o motivo fica na nota sob ele (`hint`, lida como dica de acessibilidade).
 *
 * Durante a busca (`searchedSince` = `started_at`), o anel e o contorno ficam mais fortes (sem animação: o estado é fixo
 * para quem reduz movimento) e o tempo decorrido ocupa o lugar do complemento. Para o leitor de tela, o tempo vai como
 * valor falado em minutos ("há 2 minutos"), que só muda a cada minuto: ninguém ouve a contagem de cada segundo.
 */
export function PlayButton({ verb, caption, label, hint, disabled = false, onPress, searchedSince }: {
  verb: string
  caption: string
  /** Nome acessível ("Encontrar partida", "Preparar perfil de Futebol"…). */
  label: string
  hint?: string
  disabled?: boolean
  onPress?: () => void
  /** Início da busca em andamento (ISO): liga o cronômetro. */
  searchedSince?: string | null
}) {
  const started = parseIso(searchedSince)?.getTime() ?? null
  const searching = started !== null
  const now = useNow(1000, searching)
  const elapsed = started === null ? 0 : Math.max(0, now - started)
  const off = disabled || !onPress
  return <View style={{ marginVertical: 4, padding: RING, borderRadius: (SIZE + RING * 2) / 2, backgroundColor: searching ? 'rgba(143,224,180,0.25)' : off ? 'rgba(143,224,180,0.05)' : 'rgba(143,224,180,0.12)' }}>
    <Pressable testID="play-button" accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint}
      accessibilityValue={searching ? { text: `há ${spokenDuration(elapsed)}` } : undefined}
      accessibilityState={{ disabled: off }} disabled={off} onPress={onPress}
      style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d2b1e', borderWidth: searching ? 2 : 1, borderColor: off ? 'rgba(143,224,180,0.35)' : colors.mint }}>
      <View style={{ alignItems: 'center', gap: 8, opacity: off && !searching ? 0.65 : 1 }}>
        <ArenaMark width={46} height={46} color={colors.mint} compact />
        <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '800', letterSpacing: 1.1 }}>{verb}</Text>
        {searching
          ? <Text testID="play-elapsed" accessibilityElementsHidden importantForAccessibility="no" style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10, fontVariant: ['tabular-nums'] }}>{formatElapsed(elapsed)}</Text>
          : <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10 }}>{caption}</Text>}
      </View>
    </Pressable>
  </View>
}
