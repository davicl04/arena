import { Text, View } from 'react-native'
import type { FormResult } from '../../api/results'
import { colors } from '../../theme'
import { formSpoken } from './metric'

const look: Record<FormResult, { bg: string; fg: string }> = {
  V: { bg: colors.mint, fg: colors.night },
  E: { bg: 'rgba(255,255,255,0.2)', fg: '#ffffff' },
  D: { bg: colors['danger-soft'], fg: '#3b0a12' },
}

/**
 * Forma recente: até 5 quadradinhos, do resultado mais antigo (esquerda) ao mais recente (direita). V em menta, E neutro e D no
 * tom de perigo suave; o tênis não tem E. Sem partidas (ou antes do primeiro recálculo) não mostra nada.
 */
export function RecentForm({ form, decorative = false }: { form: readonly FormResult[] | null | undefined; decorative?: boolean }) {
  if (!form?.length) return null
  const a11y = decorative ? { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const } : { accessible: true, accessibilityLabel: formSpoken(form), testID: 'recent-form' }
  return <View {...a11y} style={{ flexDirection: 'row', gap: 3, marginTop: 4 }}>
    {form.map((item, index) => <View key={index} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ width: 15, height: 15, alignItems: 'center', justifyContent: 'center', borderRadius: 4, backgroundColor: look[item].bg }}>
      <Text style={{ color: look[item].fg, fontSize: 8.5, fontWeight: '800' }}>{item}</Text>
    </View>)}
  </View>
}
