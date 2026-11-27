import { Children, createContext, isValidElement, useContext } from 'react'
import type { Ref } from 'react'
import { Text as NativeText, TextInput as NativeTextInput } from 'react-native'
import type { StyleProp, TextInputProps, TextProps, TextStyle } from 'react-native'
import { styled } from 'nativewind'
import { DISPLAY_FAMILY, fontFamilyFor, weightOf } from '../fonts'
import type { FontRole } from '../fonts'

/**
 * `Text` e `TextInput` do app: aplicam as fontes da web (src/fonts.ts). Use-os no lugar dos do `react-native`
 * (a regra de lint `no-restricted-imports` cobra isso).
 *
 * - Peso: o `fontWeight` vira a família carregada daquele peso (`Inter_700Bold`); o peso sai do estilo final, para o
 *   Android não engrossar a fonte por cima.
 * - Papel: títulos (`accessibilityRole="header"`, como `h1`–`h3` da web), `display` e `font-display` (ou
 *   `fontFamily: 'Sora'`) usam Sora; o resto usa Inter. Outra `fontFamily` explícita (ex.: `monospace`) é mantida.
 * - Herança: um `Text` dentro de outro herda o papel e o peso do pai, como um `<span>` herda do parágrafo.
 * - Sem as fontes (falha ao carregar, `setFontsAvailable(false)`), o estilo segue intacto, na fonte do sistema.
 */

type Inherited = { role: FontRole; weight: number }
const Inheritance = createContext<Inherited | null>(null)

let fontsAvailable = false
/** Chamado pelo `App` depois do `useFonts`: liga o mapeamento só quando as famílias existem no aparelho. */
export function setFontsAvailable(value: boolean) { fontsAvailable = value }

/** Junta um estilo em camadas (arrays aninhados, valores falsos ignorados) num único objeto, como o `StyleSheet.flatten`. */
function flatten(style: StyleProp<TextStyle>, into: TextStyle = {}): TextStyle {
  if (Array.isArray(style)) for (const item of style) flatten(item as StyleProp<TextStyle>, into)
  else if (style && typeof style === 'object') Object.assign(into, style)
  return into
}

/**
 * Estilo final com a família do peso e do papel e o que os `Text` aninhados herdam. `null` quando há outra família
 * explícita; `style: null` quando as fontes não estão disponíveis (o estilo original segue como está).
 */
export function resolveFont(style: StyleProp<TextStyle>, options: { header?: boolean; display?: boolean; inherited?: Inherited | null } = {}):
  { style: TextStyle | null; inherit: Inherited } | null {
  const flat = flatten(style)
  const explicit = typeof flat.fontFamily === 'string' ? flat.fontFamily : undefined
  if (explicit && !explicit.startsWith(DISPLAY_FAMILY)) return null
  const role: FontRole = explicit || options.display || options.header ? 'display'
    : options.inherited?.role ?? 'sans'
  // Título sem peso explícito: 700, como `h1`–`h3` na web.
  const fallbackWeight = options.header || options.display ? 700 : options.inherited?.weight ?? 400
  const weight = flat.fontWeight === undefined ? fallbackWeight : weightOf(flat.fontWeight)
  const inherit = { role, weight }
  if (!fontsAvailable) return { style: null, inherit }
  delete flat.fontWeight
  flat.fontFamily = fontFamilyFor(role, weight)
  return { style: flat, inherit }
}

function AppText({ style, display, children, ...props }: TextProps & { display?: boolean; ref?: Ref<NativeText> }) {
  const inherited = useContext(Inheritance)
  const resolved = resolveFont(style, { header: props.accessibilityRole === 'header', display, inherited })
  if (!resolved) return <NativeText style={style} {...props}>{children}</NativeText>
  const text = <NativeText style={resolved.style ?? style} {...props}>{children}</NativeText>
  // Só há o que herdar quando há `Text` aninhado. O provedor fica por fora, para os filhos do texto nativo não mudarem.
  return Children.toArray(children).some(isValidElement) ? <Inheritance.Provider value={resolved.inherit}>{text}</Inheritance.Provider> : text
}

function AppTextInput({ style, ...props }: TextInputProps & { ref?: Ref<NativeTextInput> }) {
  const resolved = resolveFont(style)
  return <NativeTextInput style={resolved?.style ?? style} {...props} />
}

/** `className` vira `style` antes do componente, para o peso das classes (`font-bold`) chegar ao mapeamento. */
export const Text = styled(AppText, { className: 'style' })
export const TextInput = styled(AppTextInput, { className: 'style' })
/** Tipos das instâncias, para `useRef<TextRef>` e `useRef<TextInputRef>`. */
export type TextRef = NativeText
export type TextInputRef = NativeTextInput
