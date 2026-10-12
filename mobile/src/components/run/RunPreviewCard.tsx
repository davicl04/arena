import { View, Text } from 'react-native'
import { colors } from '../../theme'
import { Icon } from '../Icon'
import { TierEmblem } from '../arena/TierEmblem'
import type { ImpactView } from '../play/runView'

/**
 * Prévia do que a marca faz com o ranking da distância (K2): "Novo melhor tempo · −0:24", "Sobe para Ouro nos 5 km",
 * "Primeira marca nos 5 km" ou "Fica só no histórico". Mora numa região ao vivo educada: só fala quando o texto muda.
 * `stale`: os campos mudaram e a prévia nova ainda não chegou (o cartão esmaece).
 */
export function RunPreviewCard({ view, stale = false }: { view: ImpactView; stale?: boolean }) {
  const best = view.tone === 'best'
  return <View testID="run-preview" accessible accessibilityLiveRegion="polite" accessibilityLabel={[view.title, view.detail].filter(Boolean).join('. ')}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 12, opacity: stale ? 0.6 : 1, backgroundColor: best ? 'rgba(143,224,180,0.1)' : 'rgba(255,255,255,0.06)', borderWidth: best ? 1 : 0, borderColor: 'rgba(143,224,180,0.33)' }}>
    {view.tier
      ? <TierEmblem tier={view.tier} size="lg" decorative />
      : <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name={best ? 'trophy' : 'history'} size={22} color="rgba(255,255,255,0.6)" /></View>}
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexShrink: 1 }}>
      <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '800' }}>{view.title}</Text>
      {view.detail ? <Text style={{ marginTop: 2, color: 'rgba(255,255,255,0.65)', fontSize: 10.5, lineHeight: 15 }}>{view.detail}</Text> : null}
    </View>
  </View>
}

/** Texto discreto quando ainda não há prévia (falta o tempo, a distância ou a prova). */
export function PreviewHint({ children }: { children: string }) {
  return <Text style={{ color: colors['glass-muted'], fontSize: 11, lineHeight: 16 }}>{children}</Text>
}
