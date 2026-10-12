import { Text, View } from 'react-native'
import type { OpenSlots } from '../../api/matches'
import { positionOptions } from '../../data/arena'
import type { FootballFormat } from '../../data/arena'
import { maxSlots, slotTotal } from '../../data/match'
import { colors } from '../../theme'
import { FieldError } from '../arena/controls'
import { Stepper } from '../results/Stepper'
import { MAX_GOALKEEPER_SLOTS } from './slots'

/**
 * Contadores de vagas por posição (V2): GOL, DEF, MEI e ATA com −/+ (o `Stepper` do app: ajustável por leitor de tela,
 * botões de 44 pt). Os limites são os do servidor: no máximo um goleiro e, somando as posições, o tamanho do formato
 * menos um. `error` mostra a resposta do servidor sob o campo.
 */
export function SlotSteppers({ format, value, onChange, error, disabled = false }: {
  format: FootballFormat
  value: OpenSlots
  onChange: (next: OpenSlots) => void
  /** Mensagem do servidor para o campo `open_slots`. */
  error?: string
  disabled?: boolean
}) {
  const limit = maxSlots(format)
  const total = slotTotal(value)
  const cap = (position: keyof OpenSlots) => {
    const room = value[position] + Math.max(0, limit - total)
    return position === 'goleiro' ? Math.min(MAX_GOALKEEPER_SLOTS, room) : room
  }
  return <View testID="slot-steppers" accessibilityLabel="Vagas para avulsos por posição">
    {positionOptions.map(option => <View key={option.value} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ minWidth: 38, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.1)' }}>
        <Text style={{ color: colors.mint, fontSize: 10, fontWeight: '800' }}>{option.short}</Text>
      </View>
      <Text numberOfLines={1} style={{ flex: 1, color: 'rgba(255,255,255,0.8)', fontSize: 12.5 }}>{option.label}</Text>
      <Stepper tone="dark" label={`Vagas de ${option.label.toLocaleLowerCase('pt-BR')}`} value={value[option.value]} min={0} max={cap(option.value)} disabled={disabled}
        onChange={next => onChange({ ...value, [option.value]: next })} />
    </View>)}
    <Text accessibilityLiveRegion="polite" style={{ marginTop: 4, color: 'rgba(255,255,255,0.65)', fontSize: 10.5 }}>
      {total} de {limit} vagas · no máximo {MAX_GOALKEEPER_SLOTS} de goleiro
    </Text>
    <FieldError error={error} surface="dark" />
  </View>
}
