import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { sports } from '../../api/client'
import type { Sport } from '../../api/client'
import { colors } from '../../theme'
import { SportIcon } from '../arena/SportIcon'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'
import type { FormatChip } from './formatChips'

export interface PlateOption<T extends string> {
  value: T
  label: string
  /** Letra menor depois do rótulo (o "7×7" do formato). */
  detail?: string
  /** Nome acessível, quando o texto visível é abreviado ("Society 7 contra 7"). */
  accessibilityLabel?: string
  icon?: IconName
}

/** Opções de formato (Futsal 5×5, Society 7×7, Campo 11×11) a partir dos chips de dados. */
export const formatOptions = (chips: readonly FormatChip[]): PlateOption<FormatChip['value']>[] =>
  chips.map(chip => ({ value: chip.value, label: chip.label, detail: chip.size, accessibilityLabel: chip.accessibilityLabel }))

/**
 * Escolha única sobre a placa `forest` (grupo de rádio, alvos de 44 pt). `segmented` é a chave "Com meu time | Avulso"
 * (fundo de vidro, escolhida em menta); `pill` são as pílulas com contorno (posições, distâncias e formatos), a escolhida
 * com contorno e texto menta. Tocar na escolhida não a desfaz.
 */
export function PlateChips<T extends string>({ label, options, value, onChange, variant = 'pill', disabled = false }: {
  /** Nome do grupo para leitores de tela ("Formato", "Jogar como"). */
  label: string
  options: readonly PlateOption<T>[]
  value: T
  onChange: (value: T) => void
  variant?: 'segmented' | 'pill'
  disabled?: boolean
}) {
  const segmented = variant === 'segmented'
  return <View accessibilityRole="radiogroup" accessibilityLabel={label}
    style={segmented
      ? { alignSelf: 'stretch', flexDirection: 'row', gap: 3, borderRadius: 13, padding: 3, backgroundColor: 'rgba(255,255,255,0.08)' }
      : { alignSelf: 'stretch', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
    {options.map(option => {
      const selected = option.value === value
      const ink = selected ? (segmented ? colors.night : colors.mint) : 'rgba(255,255,255,0.7)'
      return <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.accessibilityLabel ?? option.label}
        accessibilityState={{ checked: selected, selected, disabled }} disabled={disabled}
        onPress={() => { if (!selected) onChange(option.value) }}
        style={segmented
          ? { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 8, backgroundColor: selected ? colors.mint : 'transparent', opacity: disabled ? 0.5 : 1 }
          : { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 22, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 6, borderColor: selected ? colors.mint : 'rgba(255,255,255,0.15)', backgroundColor: selected ? 'rgba(143,224,180,0.08)' : 'transparent', opacity: disabled ? 0.5 : 1 }}>
        {option.icon ? <Icon name={option.icon} size={15} color={ink} /> : null}
        <Text numberOfLines={1} style={{ color: ink, fontSize: segmented ? 12 : 11.5, fontWeight: selected ? '800' : '700', flexShrink: 1 }}>{option.label}</Text>
        {option.detail ? <Text style={{ color: ink, opacity: 0.7, fontSize: 10.5, fontWeight: '600' }}>{option.detail}</Text> : null}
      </Pressable>
    })}
  </View>
}

/** Abas Futebol | Tênis | Corrida do topo da placa, com o ícone provisório da modalidade e o traço menta na escolhida. */
export function SportTabs({ value, onChange }: { value: Sport; onChange: (sport: Sport) => void }) {
  return <View accessibilityRole="tablist" accessibilityLabel="Modalidade"
    style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' }}>
    {sports.map(sport => {
      const selected = sport.value === value
      return <Pressable key={sport.value} accessibilityRole="tab" accessibilityLabel={sport.label} accessibilityState={{ selected }} onPress={() => { if (!selected) onChange(sport.value) }}
        style={{ flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderBottomWidth: 2, borderBottomColor: selected ? colors.mint : 'transparent' }}>
        <View style={{ opacity: selected ? 1 : 0.6 }}><SportIcon sport={sport.value} size={18} inverted /></View>
        <Text style={{ color: selected ? '#ffffff' : 'rgba(255,255,255,0.6)', fontSize: 12.5, fontWeight: selected ? '800' : '600' }}>{sport.label}</Text>
      </Pressable>
    })}
  </View>
}

/** Rodapé de texto pequeno sobre a placa (notas e avisos), centralizado. */
export function PlateNote({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'strong' }) {
  return <Text style={{ maxWidth: 300, textAlign: 'center', color: tone === 'strong' ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.65)', fontSize: 11, lineHeight: 17 }}>{children}</Text>
}
