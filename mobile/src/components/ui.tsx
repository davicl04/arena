import { Pressable, Text, TextInput, View } from 'react-native'
import type { TextInputProps } from 'react-native'
import { cx, tw } from '../styles'
import { colors } from '../theme'

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View><Text className={tw.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor={colors.placeholder} className={tw.input} {...props} /></View>
}

const buttonTone = {
  primary: { box: 'bg-brand', text: 'text-white' },
  secondary: { box: 'bg-brand-soft', text: 'text-brand' },
} as const

export function Button({ title, onPress, disabled, secondary }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  const tone = buttonTone[secondary ? 'secondary' : 'primary']
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    className={cx('mt-3.5 min-h-12 items-center justify-center rounded-control p-3.5', tone.box, disabled && 'opacity-50')}>
    <Text className={cx('text-[14px] font-semibold', tone.text)}>{title}</Text>
  </Pressable>
}
