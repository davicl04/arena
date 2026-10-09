import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { TextInputProps } from 'react-native'

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#e2e4e9' }, content: { padding: 24, paddingBottom: 48 },
  brand: { fontSize: 34, fontWeight: '800', color: '#005a36', letterSpacing: -2, marginBottom: 30 },
  eyebrow: { fontSize: 11, letterSpacing: 2, fontWeight: '700', color: '#005a36', marginBottom: 12 },
  title: { fontSize: 34, fontWeight: '700', color: '#343d39', letterSpacing: -1, marginBottom: 14 },
  heading: { fontSize: 23, fontWeight: '700', color: '#343d39', marginBottom: 10 },
  body: { fontSize: 14, lineHeight: 22, color: '#606965', marginBottom: 16 },
  card: { backgroundColor: '#fff', padding: 22, borderRadius: 16, marginBottom: 18 },
  label: { fontSize: 13, fontWeight: '600', color: '#343d39', marginBottom: 8, marginTop: 12 },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#cdd4d0', borderRadius: 8, padding: 12, color: '#343d39', fontSize: 16, backgroundColor: '#fafbfa' },
  button: { minHeight: 48, backgroundColor: '#005a36', padding: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  buttonSecondary: { backgroundColor: '#edf3ef' }, buttonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  secondaryText: { color: '#005a36' }, disabled: { opacity: 0.5 },
  error: { color: '#94351e', fontSize: 14, lineHeight: 22, marginVertical: 14 }, success: { color: '#005a36', fontSize: 14, marginVertical: 14 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderColor: '#cdd4d0', borderRadius: 8, padding: 12, minHeight: 44, justifyContent: 'center', marginVertical: 4 },
  selected: { backgroundColor: '#005a36', borderColor: '#005a36' }, chipText: { color: '#343d39', fontSize: 13 },
})
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor="#727b76" style={styles.input} {...props} /></View>
}
export function Button({ title, onPress, disabled, secondary }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.buttonSecondary, disabled && styles.disabled]}><Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text></Pressable>
}
