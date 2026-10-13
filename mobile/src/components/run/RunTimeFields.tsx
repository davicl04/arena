import { Pressable, Text, TextInput, View } from 'react-native'
import type { AccessibilityActionEvent } from 'react-native'
import { colors } from '../../theme'
import { Icon } from '../Icon'
import { MAX_DURATION_S, fromSeconds, toSeconds } from '../play/runView'
import type { HmsParts } from '../play/runView'
import { stepperActions } from '../results/Stepper'

/*
 * Tempo da corrida em h : min : s (K2). Cada campo é um `TextInput` numérico ajustável para leitores de tela
 * (`accessibilityRole="adjustable"`, com as ações "Aumentar" e "Diminuir" do deslizar para cima e para baixo): os botões
 * de seta atendem o toque (área de 44 pt) e somam ou tiram uma unidade ao tempo todo, com "vai um" entre segundos,
 * minutos e horas, nunca abaixo de 0:00:00 nem acima de 24 h. Digitar troca os dois últimos dígitos (o campo vem
 * selecionado), como na web.
 */

type Key = keyof HmsParts

const fields = [
  { key: 'h', label: 'Horas', unit: 'h', one: 'hora', many: 'horas', max: 24, unitSeconds: 3600 },
  { key: 'm', label: 'Minutos', unit: 'min', one: 'minuto', many: 'minutos', max: 59, unitSeconds: 60 },
  { key: 's', label: 'Segundos', unit: 's', one: 'segundo', many: 'segundos', max: 59, unitSeconds: 1 },
] as const

const pad = (value: number) => String(value).padStart(2, '0')

function Arrow({ field, direction, onPress }: { field: (typeof fields)[number]; direction: 1 | -1; onPress: () => void }) {
  // O leitor de tela usa as ações do campo; a seta é só para o toque.
  return <Pressable testID={`time-${field.key}-${direction > 0 ? 'plus' : 'minus'}`} accessible={false} importantForAccessibility="no" onPress={onPress}
    style={{ width: 52, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)' }}>
    <Icon name={direction > 0 ? 'chevron-up' : 'chevron-down'} size={22} color={colors.mint} />
  </Pressable>
}

export function RunTimeFields({ value, onChange, invalid = false }: { value: HmsParts; onChange: (next: HmsParts) => void; invalid?: boolean }) {
  /** Soma `delta` segundos ao tempo todo (com "vai um"), entre 0 e 24 h. */
  const shift = (delta: number) => onChange(fromSeconds(toSeconds(value) + delta))
  function type(key: Key, max: number, text: string) {
    const digits = text.replace(/\D/g, '').slice(-2)
    const next = { ...value, [key]: Math.min(max, Number(digits || 0)) }
    onChange(toSeconds(next) > MAX_DURATION_S ? fromSeconds(MAX_DURATION_S) : next)
  }
  return <View accessibilityLabel="Tempo da corrida" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
    {fields.map((field, index) => {
      const current = value[field.key]
      const onAction = (event: AccessibilityActionEvent) => {
        if (event.nativeEvent.actionName === 'increment') shift(field.unitSeconds)
        else if (event.nativeEvent.actionName === 'decrement') shift(-field.unitSeconds)
      }
      return <View key={field.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {index > 0 ? <Text accessibilityElementsHidden importantForAccessibility="no" style={{ marginTop: -4, color: 'rgba(255,255,255,0.4)', fontSize: 40, fontWeight: '800' }}>:</Text> : null}
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Arrow field={field} direction={1} onPress={() => shift(field.unitSeconds)} />
          <TextInput accessibilityLabel={field.label} accessibilityRole="adjustable"
            accessibilityValue={{ min: 0, max: field.max, now: current, text: `${current} ${current === 1 ? field.one : field.many}` }}
            accessibilityActions={stepperActions.map(action => ({ ...action }))} onAccessibilityAction={onAction}
            keyboardType="number-pad" inputMode="numeric" selectTextOnFocus autoComplete="off" value={pad(current)} onChangeText={text => type(field.key, field.max, text)}
            style={{ minHeight: 64, width: 76, borderRadius: 12, borderWidth: 1, borderColor: invalid ? colors['danger-soft'] : 'transparent', paddingHorizontal: 0, paddingVertical: 2, textAlign: 'center', color: '#ffffff', fontSize: 52, lineHeight: 60, fontWeight: '800', fontVariant: ['tabular-nums'] }} />
          <Arrow field={field} direction={-1} onPress={() => shift(-field.unitSeconds)} />
          <Text accessibilityElementsHidden importantForAccessibility="no" style={{ color: 'rgba(255,255,255,0.62)', fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>{field.unit}</Text>
        </View>
      </View>
    })}
  </View>
}
