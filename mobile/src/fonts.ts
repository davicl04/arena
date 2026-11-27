/**
 * Fontes da web no Expo: Inter no texto e Sora nos títulos (`h1`–`h3` da web), na marca e nos números de destaque.
 * Cada peso é um arquivo carregado com nome próprio (`Inter_700Bold`), porque o Android não escolhe o peso de uma
 * família carregada em tempo de execução pelo `fontWeight`: o `Text` do app (components/Text) troca o peso pela família.
 * Só os pesos que a web carrega entram no pacote (Inter 400–700, Sora 600–800); pesos fora da lista vão para o mais próximo.
 */
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular'
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium'
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold'
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold'
import { Sora_600SemiBold } from '@expo-google-fonts/sora/600SemiBold'
import { Sora_700Bold } from '@expo-google-fonts/sora/700Bold'
import { Sora_800ExtraBold } from '@expo-google-fonts/sora/800ExtraBold'

/** Arquivos para o `useFonts` do `App`; as chaves são os nomes usados em `fontFamily`. */
export const fontFiles = {
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
  Sora_600SemiBold, Sora_700Bold, Sora_800ExtraBold,
}

/** `sans` é o texto corrido (Inter); `display`, os títulos, a marca e os números (Sora). */
export type FontRole = 'sans' | 'display'

const families: Record<FontRole, [number, string][]> = {
  sans: [[400, 'Inter_400Regular'], [500, 'Inter_500Medium'], [600, 'Inter_600SemiBold'], [700, 'Inter_700Bold']],
  display: [[600, 'Sora_600SemiBold'], [700, 'Sora_700Bold'], [800, 'Sora_800ExtraBold']],
}

/** Peso numérico de um `fontWeight` do React Native (`'bold'` = 700, `'normal'` e ausente = 400). */
export function weightOf(value: unknown): number {
  if (value === 'bold') return 700
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 400
}

/** Família carregada mais próxima do peso pedido (no empate, a mais pesada, como o navegador faz acima de 500). */
export function fontFamilyFor(role: FontRole, weight: number): string {
  let best = families[role][0]
  for (const entry of families[role]) {
    if (Math.abs(entry[0] - weight) <= Math.abs(best[0] - weight)) best = entry
  }
  return best[1]
}

/** Família do Sora nas classes (`font-display`, `--font-display` em global.css) e nos estilos. */
export const DISPLAY_FAMILY = 'Sora'
