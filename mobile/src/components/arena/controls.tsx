import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import type { TextInputProps } from 'react-native'
import { sports } from '../../api/client'
import type { City, Sport } from '../../api/client'
import { colors } from '../../theme'
import type { ThemeColors } from '../../theme'
import { useResolvedTheme, useThemeColors } from '../../hooks/useTheme'
import { announce } from '../../utils/announce'
import { fold } from '../../utils/format'
import Sheet from '../Sheet'
import { Icon } from '../Icon'
import { SportIcon } from './SportIcon'
import type { IconName } from '../Icon'

/*
 * Peças compartilhadas pelas telas de times, organizador e eventos: botões, avisos, confirmação, campo com rótulo,
 * escolhas em pílulas e a escolha da cidade. Cada uma tem a variante `light` (telas claras) e `dark` (placa e telas
 * `forest`), com áreas de toque de 44 pt ou mais, rótulos e papéis de acessibilidade.
 */
export type Surface = 'light' | 'dark'

/* ===== Botões ===== */

export type ActionTone = 'mint' | 'line' | 'brand' | 'outline' | 'danger' | 'danger-fixed'
const toneLook = (c: ThemeColors): Record<ActionTone, { bg: string; fg: string; border: string }> => ({
  mint: { bg: colors.mint, fg: colors.night, border: 'transparent' },
  line: { bg: 'transparent', fg: '#ffffff', border: 'rgba(255,255,255,0.25)' },
  brand: { bg: c.brand, fg: c['on-brand'], border: 'transparent' },
  outline: { bg: c.surface, fg: c.brand, border: c['line-strong'] },
  danger: { bg: c.danger, fg: c['on-brand'], border: 'transparent' },
  /** Vermelho igual nos dois temas, para folhas escuras por design (a busca do Jogar). */
  'danger-fixed': { bg: colors.danger, fg: '#ffffff', border: 'transparent' },
})

export type ActionSize = 'sm' | 'md'
const sizeLook = { sm: { radius: 11, pad: 11, font: 11.5 }, md: { radius: 8, pad: 14, font: 13 } } as const

export interface ActionButtonProps {
  title: string
  onPress: () => void
  tone?: ActionTone
  icon?: IconName
  disabled?: boolean
  /** Ação em curso: o botão fica desabilitado e anuncia "ocupado". */
  busy?: boolean
  /** Compacto (cantos de 11 e texto de 11,5), como os botões dentro de cartões e da placa. */
  size?: ActionSize
  /** Ocupa a linha inteira (sem isso, divide a linha com os vizinhos). */
  block?: boolean
  /** Só a largura do texto, sem crescer para dividir a linha (botões dentro de linhas de lista). */
  fit?: boolean
  /** Divide a linha em partes iguais com os vizinhos (base zero), mesmo com rótulos de tamanhos diferentes. */
  grow?: boolean
  /** Só o ícone (quadrado de 44 pt): `title` vira o rótulo falado. */
  iconOnly?: boolean
  accessibilityLabel?: string
  accessibilityHint?: string
  testID?: string
}

/**
 * Botão do app (mínimo de 44 pt; o `block` tem 48): `mint`, `line` e `danger-fixed` são para a placa e as telas escuras, `brand`,
 * `outline` e `danger` para as claras. Uma só peça para times, organizador e eventos.
 */
export function ActionButton({ title, onPress, tone = 'brand', icon, disabled = false, busy = false, size = 'md', block = false, fit = false, grow = false, iconOnly = false, accessibilityLabel, accessibilityHint, testID }: ActionButtonProps) {
  const look = toneLook(useThemeColors())[tone]
  const measure = sizeLook[size]
  const off = disabled || busy
  const layout = block ? { alignSelf: 'stretch' as const } : iconOnly ? { width: 44, flexGrow: 0 } : grow ? { flexGrow: 1, flexBasis: 0, flexShrink: 1 } : fit ? null : { flexGrow: 1 }
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityHint={accessibilityHint}
    accessibilityState={{ disabled: off, busy }} disabled={off} onPress={onPress} testID={testID}
    style={{ minHeight: block ? 48 : 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: measure.radius, borderWidth: 1, paddingHorizontal: iconOnly ? 0 : block ? 16 : measure.pad, backgroundColor: look.bg, borderColor: look.border, opacity: off ? 0.5 : 1, ...layout }}>
    {icon ? <Icon name={icon} size={17} color={look.fg} /> : null}
    {iconOnly ? null : <Text style={{ color: look.fg, fontSize: block ? 13.5 : measure.font, fontWeight: '700', flexShrink: 1, textAlign: 'center' }}>{title}</Text>}
  </Pressable>
}

/** Ação de texto (verde no claro, menta no escuro), com área de toque de 44 pt. */
export function TextAction({ title, onPress, surface = 'light', disabled = false, accessibilityLabel }: { title: string; onPress: () => void; surface?: Surface; disabled?: boolean; accessibilityLabel?: string }) {
  const theme = useThemeColors()
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}>
    <Text style={{ color: surface === 'dark' ? colors.mint : theme.brand, fontSize: 12, fontWeight: '700' }}>{title}</Text>
  </Pressable>
}

/* ===== Avisos e confirmação ===== */

export type NoticeTone = 'error' | 'success' | 'info'
const noticeLook = (c: ThemeColors, night: boolean): Record<Surface, Record<NoticeTone, { bg: string; fg: string }>> => ({
  light: {
    error: { bg: night ? '#ff8a8020' : '#fff0f2', fg: c.error },
    success: { bg: c['success-bg'], fg: c.brand },
    info: { bg: c['warning-bg'], fg: c.warning },
  },
  dark: {
    error: { bg: 'rgba(185,55,73,0.25)', fg: '#ffd0d7' },
    success: { bg: 'rgba(143,224,180,0.12)', fg: '#c9f2db' },
    info: { bg: 'rgba(246,194,107,0.15)', fg: colors.amber },
  },
})

/** Mensagem de erro (lida como alerta), sucesso ou informação (região ao vivo educada). */
export function Notice({ tone = 'error', surface = 'light', children }: { tone?: NoticeTone; surface?: Surface; children: ReactNode }) {
  const look = noticeLook(useThemeColors(), useResolvedTheme() === 'dark')[surface][tone]
  return <View accessibilityRole={tone === 'error' ? 'alert' : undefined} accessibilityLiveRegion="polite"
    style={{ marginTop: 12, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, backgroundColor: look.bg }}>
    <Text style={{ color: look.fg, fontSize: 12, lineHeight: 18 }}>{children}</Text>
  </View>
}

/**
 * Aviso de sucesso das telas claras em região viva. Fica montado, vazio, para o leitor de tela anunciar a mudança do
 * texto; só ocupa espaço quando há aviso.
 */
export function LiveNotice({ text }: { text: string }) {
  const c = useThemeColors()
  return <Text accessibilityLiveRegion="polite" style={text ? { marginTop: 12, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, overflow: 'hidden', fontSize: 13, lineHeight: 19, fontWeight: '600', color: c.brand, backgroundColor: c['success-bg'] } : { height: 0 }}>{text}</Text>
}

/** Erro de envio ou de validação sobre fundo claro (anunciado como alerta e em região viva). */
export function ErrorText({ children }: { children: ReactNode }) {
  const c = useThemeColors()
  return <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ marginTop: 10, color: c.error, fontSize: 12.5, lineHeight: 18 }}>{children}</Text>
}

/** Estado do envio ("Enviando comprovante…"), lido por leitores de tela; vazio, não ocupa espaço. */
export function BusyStatus({ text }: { text: string }) {
  const c = useThemeColors()
  useEffect(() => { announce(text) }, [text])
  return <Text accessibilityLiveRegion="polite" style={{ height: text ? undefined : 0, color: c.brand, fontSize: 11 }}>{text}</Text>
}

/**
 * Confirmação de ação destrutiva dentro de uma folha ou cartão: a pergunta (`title`, lida ao aparecer, antes dos botões),
 * a explicação e [ação | desistir]. Sem `title`, o próprio quadro é o alerta.
 */
export function ConfirmBox({ title, children, confirmLabel, cancelLabel = 'Cancelar', busy, onConfirm, onCancel }: {
  title?: string
  children: ReactNode
  confirmLabel: string
  /** Rótulo do botão que desiste ("Voltar" quando a ação já é um cancelamento). */
  cancelLabel?: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const c = useThemeColors()
  const night = useResolvedTheme() === 'dark'
  return <View accessibilityRole={title ? undefined : 'alert'} accessibilityLabel="Confirmação" style={{ marginTop: 14, borderRadius: 14, backgroundColor: night ? '#ff8a8020' : '#fff0f2', padding: 13 }}>
    {title ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: c.ink, fontSize: 13, lineHeight: 19, fontWeight: '700' }}>{title}</Text> : null}
    <Text style={{ marginTop: title ? 2 : 0, color: c.ink, fontSize: 12.5, lineHeight: 19 }}>{children}</Text>
    <View style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
      <ActionButton tone="danger" title={busy ? 'Aguarde…' : confirmLabel} accessibilityLabel={confirmLabel} busy={busy} onPress={onConfirm} />
      <ActionButton tone="outline" title={cancelLabel} disabled={busy} onPress={onCancel} />
    </View>
  </View>
}

/* ===== Campos ===== */

const fieldLook = (c: ThemeColors) => ({
  light: { label: c.ink, input: c.ink, bg: c.field, border: c['line-strong'], hint: c['ink-muted'], error: c.error, placeholder: c.placeholder },
  dark: { label: 'rgba(255,255,255,0.62)', input: '#ffffff', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.18)', hint: 'rgba(255,255,255,0.62)', error: colors['danger-soft'], placeholder: 'rgba(255,255,255,0.4)' },
}) as const

/** Rótulo de campo: negrito no claro; caixa alta pequena e esmaecida no escuro. */
export function FieldLabel({ children, surface = 'light' }: { children: string; surface?: Surface }) {
  const dark = surface === 'dark'
  const look = fieldLook(useThemeColors())[surface]
  return <Text style={{ marginTop: dark ? 16 : 14, marginBottom: 6, color: look.label, fontSize: dark ? 10 : 13, fontWeight: dark ? '800' : '600', letterSpacing: dark ? 0.8 : 0, textTransform: dark ? 'uppercase' : 'none' }}>{children}</Text>
}

/** Dica sob o campo. */
export function Hint({ children, surface = 'light' }: { children: ReactNode; surface?: Surface }) {
  const look = fieldLook(useThemeColors())[surface]
  return <Text style={{ marginTop: 6, color: look.hint, fontSize: 10.5, lineHeight: 16 }}>{children}</Text>
}

/** Mensagem de erro do campo (lida como alerta). */
export function FieldError({ error, surface = 'light' }: { error?: string; surface?: Surface }) {
  const look = fieldLook(useThemeColors())[surface]
  if (!error) return null
  return <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ marginTop: 6, color: look.error, fontSize: 11.5, lineHeight: 16, fontWeight: '600' }}>{error}</Text>
}

export type FormFieldProps = TextInputProps & {
  label: string
  hint?: string
  error?: string
  surface?: Surface
}

/**
 * Campo de texto com rótulo, dica e erro. O nome acessível é o rótulo; a dica ou o erro (o erro, se houver) vai como
 * `accessibilityHint`. Aceita as props do `TextInput` (teclado, `multiline`, `maxLength`…).
 */
export function FormField({ label, hint, error, surface = 'light', multiline, style, ...input }: FormFieldProps) {
  const c = useThemeColors()
  const look = fieldLook(c)[surface]
  return <View>
    <FieldLabel surface={surface}>{label}</FieldLabel>
    <TextInput accessibilityLabel={label} accessibilityHint={error || hint} placeholderTextColor={look.placeholder} multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      style={[{ minHeight: multiline ? 92 : 48, borderRadius: 8, borderWidth: 1, borderColor: error ? (surface === 'dark' ? colors['danger-soft'] : c.error) : look.border, backgroundColor: look.bg, color: look.input, fontSize: 15, paddingHorizontal: 12, paddingVertical: multiline ? 10 : 0 }, style]}
      {...input} />
    {hint && !error ? <Hint surface={surface}>{hint}</Hint> : null}
    <FieldError error={error} surface={surface} />
  </View>
}

/* ===== Escolhas em pílulas ===== */

const pillLook = (c: ThemeColors) => ({
  light: {
    idle: { bg: c.surface, border: c['line-strong'], fg: c.ink },
    on: { bg: colors.forest, border: colors.forest, fg: '#ffffff' },
  },
  dark: {
    idle: { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.18)', fg: '#ffffff' },
    on: { bg: colors.mint, border: colors.mint, fg: colors.night },
  },
}) as const

/** Modalidades como escolhas em pílulas, com o ícone da modalidade (invertido na pílula marcada, conforme o fundo). */
export const sportChoices = (tone: Surface): ChoiceOption<Sport>[] => sports.map(sport => ({
  value: sport.value, label: sport.label, leading: selected => <SportIcon sport={sport.value} size={22} inverted={tone === 'dark' ? !selected : selected} color={tone === 'dark' && selected ? colors.night : undefined} />,
}))

export interface ChoiceOption<T extends string | number> {
  value: T
  label: string
  /** Conteúdo antes do rótulo (ícone da modalidade, brasão do elo); recebe se a pílula está escolhida. */
  leading?: (selected: boolean) => ReactNode
  /** Nome acessível, quando o rótulo visível é abreviado. */
  accessibilityLabel?: string
}

/** Cor da pílula marcada nas escolhas de decisão: vermelho (motivos de recusa) ou verde da marca. */
export type PillAccent = 'danger' | 'brand'
const accentColor = (c: ThemeColors): Record<PillAccent, string> => ({ danger: c.danger, brand: c.brand })

function Pill<T extends string | number>({ option, selected, role, tone, accent, disabled, onPress }: { option: ChoiceOption<T>; selected: boolean; role: 'radio' | 'checkbox'; tone: Surface; accent?: PillAccent; disabled?: boolean; onPress: () => void }) {
  const c = useThemeColors()
  const base = pillLook(c)[tone][selected ? 'on' : 'idle']
  const look = accent && selected ? { bg: accentColor(c)[accent], border: accentColor(c)[accent], fg: c['on-brand'] } : base
  return <Pressable accessibilityRole={role} accessibilityLabel={option.accessibilityLabel ?? option.label} accessibilityState={{ checked: selected, selected, disabled }} disabled={disabled} onPress={onPress}
    style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: look.bg, borderColor: look.border, opacity: disabled ? 0.5 : 1 }}>
    {option.leading ? option.leading(selected) : null}
    <Text style={{ color: look.fg, fontSize: 12.5, fontWeight: '700', flexShrink: 1 }}>{option.label}</Text>
  </Pressable>
}

/** Escolha única em pílulas (grupo de rádio): tocar numa escolhida não a desfaz. */
export function ChoicePills<T extends string | number>({ label, options, value, onChange, tone = 'light', accent, disabled = false, error }: {
  /** Nome do grupo para leitores de tela ("Modalidade"). */
  label: string
  options: readonly ChoiceOption<T>[]
  value: T | null
  onChange: (value: T) => void
  tone?: Surface
  /** Cor da pílula marcada, no lugar da padrão (decisões da análise). */
  accent?: PillAccent
  disabled?: boolean
  error?: string
}) {
  return <View>
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map(option => <Pill key={String(option.value)} option={option} role="radio" tone={tone} accent={accent} disabled={disabled} selected={option.value === value} onPress={() => { if (option.value !== value) onChange(option.value) }} />)}
    </View>
    <FieldError error={error} surface={tone} />
  </View>
}

/** Escolha múltipla em pílulas (caixas de seleção). */
export function MultiPills<T extends string | number>({ label, options, values, onChange, tone = 'light', error }: {
  label: string
  options: readonly ChoiceOption<T>[]
  values: readonly T[]
  onChange: (values: T[]) => void
  tone?: Surface
  error?: string
}) {
  return <View>
    <View accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map(option => {
        const selected = values.includes(option.value)
        return <Pill key={String(option.value)} option={option} role="checkbox" tone={tone} selected={selected}
          onPress={() => onChange(options.map(item => item.value).filter(item => (item === option.value ? !selected : values.includes(item))))} />
      })}
    </View>
    <FieldError error={error} surface={tone} />
  </View>
}

/** Caixa de seleção com texto (aceite dos termos). */
export function CheckRow({ checked, onChange, label, error, children }: { checked: boolean; onChange: (checked: boolean) => void; label: string; error?: string; children: ReactNode }) {
  const c = useThemeColors()
  return <View>
    <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked }} onPress={() => onChange(!checked)}
      style={{ marginTop: 14, minHeight: 44, flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: error ? c.error : c.line, backgroundColor: c.surface, padding: 12 }}>
      <View style={{ marginTop: 1, width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, borderColor: checked ? c.brand : c['line-strong'], backgroundColor: checked ? c.brand : c.surface, alignItems: 'center', justifyContent: 'center' }}>
        {checked ? <Icon name="check" size={14} color={c['on-brand']} strokeWidth={3} /> : null}
      </View>
      <Text style={{ flex: 1, color: c.ink, fontSize: 11.5, lineHeight: 17 }}>{children}</Text>
    </Pressable>
    <FieldError error={error} />
  </View>
}

/* ===== Interruptor ===== */

const switchLook = (c: ThemeColors) => ({
  light: { label: c.ink, hint: c['ink-muted'], on: c.brand, off: c['line-strong'], knob: '#ffffff', knobOn: c['on-brand'], line: c['brand-soft'] },
  dark: { label: '#ffffff', hint: 'rgba(255,255,255,0.65)', on: colors.mint, off: 'rgba(255,255,255,0.2)', knob: '#ffffff', knobOn: colors.night, line: 'rgba(255,255,255,0.08)' },
}) as const

/**
 * Interruptor com rótulo e dica (super tie-break, reserva confirmada, "O time está completo?"): `switch` acessível, a
 * linha inteira é o alvo de toque (48 pt ou mais). `separated` põe um filete acima, para listas de ajustes.
 */
export function SwitchRow({ label, hint, checked, disabled = false, onChange, accessibilityLabel, surface = 'light', separated = false }: {
  label: string
  hint?: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
  /** Nome falado, quando difere do rótulo visível. */
  accessibilityLabel?: string
  surface?: Surface
  separated?: boolean
}) {
  const look = switchLook(useThemeColors())[surface]
  return <Pressable accessibilityRole="switch" accessibilityLabel={accessibilityLabel ?? label} accessibilityHint={hint} accessibilityState={{ checked, disabled }} disabled={disabled} onPress={() => onChange(!checked)}
    style={{ minHeight: separated ? 56 : 48, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: disabled ? 0.5 : 1, ...(separated ? { borderTopWidth: 1, borderTopColor: look.line } : {}) }}>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ color: look.label, fontSize: 12.5, fontWeight: '700' }}>{label}</Text>
      {hint ? <Text style={{ marginTop: 1, color: look.hint, fontSize: 10.5, lineHeight: 15 }}>{hint}</Text> : null}
    </View>
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: 46, height: 28, borderRadius: 14, padding: 3, backgroundColor: checked ? look.on : look.off, alignItems: checked ? 'flex-end' : 'flex-start', justifyContent: 'center' }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: checked ? look.knobOn : look.knob }} />
    </View>
  </Pressable>
}

/* ===== Cidade do catálogo ===== */

/** Folha de escolha da cidade no catálogo, com busca por nome ou UF. */
export function CitySheet({ cities, selectedId, title, description, onSelect, onClose }: { cities: City[]; selectedId: number | null; title: string; description?: string; onSelect: (city: City) => void; onClose: () => void }) {
  const c = useThemeColors()
  const [query, setQuery] = useState('')
  const term = fold(query.trim())
  const shown = term ? cities.filter(city => fold(`${city.name} ${city.state}`).includes(term)) : cities
  return <Sheet title={title} onClose={onClose}>
    {description ? <Text style={{ color: c['ink-muted'], fontSize: 12, lineHeight: 18 }}>{description}</Text> : null}
    <FormField label="Buscar cidade" value={query} onChangeText={setQuery} placeholder="Nome da cidade ou UF" autoCapitalize="none" autoCorrect={false} returnKeyType="search" />
    <View accessibilityLabel="Cidades do catálogo" style={{ marginTop: 8 }}>
      {shown.map(city => {
        const active = city.id === selectedId
        return <Pressable key={city.id} accessibilityRole="button" accessibilityLabel={`${city.name}, ${city.state}`} accessibilityState={{ selected: active }} onPress={() => onSelect(city)}
          style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: c['brand-soft'] }}>
          <Text numberOfLines={1} style={{ flex: 1, color: active ? c.brand : c.ink, fontSize: 14, fontWeight: active ? '700' : '500' }}>{city.name} · {city.state}</Text>
          {active ? <Icon name="check" size={17} color={c.brand} /> : null}
        </Pressable>
      })}
      {!shown.length ? <Text style={{ paddingVertical: 16, textAlign: 'center', color: c['ink-muted'], fontSize: 12 }}>Nenhuma cidade do catálogo com esse nome.</Text> : null}
    </View>
  </Sheet>
}

/** Campo da cidade: mostra a escolhida e abre a folha com o catálogo. */
export function CityField({ cities, value, onChange, label, title, description, surface = 'light', error, placeholder = 'Escolher a cidade' }: {
  cities: City[]
  value: number | null
  onChange: (city: City) => void
  label: string
  title: string
  description?: string
  surface?: Surface
  error?: string
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const city = cities.find(item => item.id === value) ?? null
  const c = useThemeColors()
  const look = fieldLook(c)[surface]
  return <View>
    <FieldLabel surface={surface}>{label}</FieldLabel>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${city ? `${city.name}, ${city.state}` : 'não escolhida'}`} accessibilityHint="Abre a lista de cidades" accessibilityState={{ disabled: !cities.length }}
      disabled={!cities.length} onPress={() => setOpen(true)}
      style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, backgroundColor: look.bg, borderColor: error ? (surface === 'dark' ? colors['danger-soft'] : c.error) : look.border, opacity: cities.length ? 1 : 0.5 }}>
      <Icon name="map-pin" size={17} color={surface === 'dark' ? colors.mint : c.brand} />
      <Text numberOfLines={1} style={{ flex: 1, color: city ? look.input : look.placeholder, fontSize: 14, fontWeight: city ? '600' : '400' }}>{city ? `${city.name} · ${city.state}` : placeholder}</Text>
      <Text style={{ color: surface === 'dark' ? colors.mint : c.brand, fontSize: 11.5, fontWeight: '700' }}>{city ? 'Trocar' : 'Escolher'}</Text>
    </Pressable>
    <FieldError error={error} surface={surface} />
    {open ? <CitySheet cities={cities} selectedId={value} title={title} description={description} onClose={() => setOpen(false)} onSelect={next => { onChange(next); setOpen(false) }} /> : null}
  </View>
}

/* ===== Blocos de situação ===== */

/** Bloco de situação (pedido em análise, recusado, aprovado): ícone num quadrado, título e texto. */
export function Situation({ icon, tone, title, children, surface = 'light' }: { icon: IconName; tone: 'wait' | 'bad' | 'ok'; title: string; children: ReactNode; surface?: Surface }) {
  const c = useThemeColors()
  const night = useResolvedTheme() === 'dark'
  const palette = {
    wait: { bg: surface === 'dark' ? 'rgba(246,194,107,0.13)' : c['warning-bg'], fg: surface === 'dark' ? colors.amber : c.warning },
    bad: { bg: surface === 'dark' ? 'rgba(185,55,73,0.25)' : night ? '#ff8a8020' : '#fff0f2', fg: surface === 'dark' ? colors['danger-soft'] : c.danger },
    ok: { bg: c['success-bg'], fg: c.brand },
  }[tone]
  return <View style={{ flexDirection: 'row', gap: 12, borderRadius: 16, padding: 14, backgroundColor: surface === 'dark' ? 'rgba(255,255,255,0.05)' : c.surface }}>
    <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.bg }}><Icon name={icon} size={20} color={palette.fg} /></View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text accessibilityRole="header" style={{ color: surface === 'dark' ? '#ffffff' : c.ink, fontSize: 13.5, fontWeight: '700' }}>{title}</Text>
      <Text style={{ marginTop: 2, color: surface === 'dark' ? 'rgba(255,255,255,0.65)' : c['ink-muted'], fontSize: 11, lineHeight: 17 }}>{children}</Text>
    </View>
  </View>
}

/* ===== Linhas do Menu ===== */

/** Linha do Menu com ícone, título, resumo, contador de pendências opcional e chevron (mínimo de 56 pt). */
export function MenuRow({ icon, title, subtitle, badge, onPress, hot = false }: { icon: IconName; title: string; subtitle?: string; badge?: number; onPress: () => void; hot?: boolean }) {
  const c = useThemeColors()
  const label = [title, subtitle, badge ? `${badge} ${badge === 1 ? 'pendente' : 'pendentes'}` : ''].filter(Boolean).join(', ')
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: c['brand-soft'], paddingVertical: 8 }}>
    <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c['icon-tile'] }}><Icon name={icon} size={17} color={c['icon-tile-ink']} /></View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ color: c.ink, fontSize: 13, fontWeight: '700' }}>{title}</Text>
      {subtitle ? <Text numberOfLines={2} style={{ marginTop: 1, color: hot ? c.danger : c['ink-muted'], fontSize: 11, lineHeight: 15, fontWeight: hot ? '700' : '400' }}>{subtitle}</Text> : null}
    </View>
    {badge ? <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: c.danger }}>
      <Text style={{ color: c['on-brand'], fontSize: 10.5, fontWeight: '800' }}>{badge > 99 ? '99+' : badge}</Text>
    </View> : null}
    <Icon name="chevron" size={16} color={c['ink-muted']} />
  </Pressable>
}
