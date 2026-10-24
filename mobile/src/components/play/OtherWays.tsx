import { Pressable, Text, View } from 'react-native'
import type { Sport } from '../../api/client'
import { useResolvedTheme, useThemeColors } from '../../hooks/useTheme'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'

function Row({ icon, title, text, divider = false, onPress }: { icon: IconName; title: string; text: string; divider?: boolean; onPress: () => void }) {
  const c = useThemeColors()
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${text}`} onPress={onPress}
    style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, borderTopWidth: divider ? 1 : 0, borderTopColor: c.line }}>
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: c.tile }}>
      <Icon name={icon} size={19} color={c.brand} />
    </View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ color: c.ink, fontSize: 12.5, fontWeight: '700' }}>{title}</Text>
      <Text style={{ marginTop: 2, color: c['ink-muted'], fontSize: 10.5, lineHeight: 16 }}>{text}</Text>
    </View>
    <Icon name="chevron" size={18} color={c['ink-muted']} />
  </Pressable>
}

/**
 * "Outras formas de jogar" abaixo da placa: Meu time (futebol) e Campeonatos ou Provas, que abre a lista de eventos
 * publicados da modalidade da aba (E2).
 */
export function OtherWays({ sport, onTeams, onEvents }: { sport: Sport; onTeams: () => void; onEvents: () => void }) {
  const c = useThemeColors()
  const night = useResolvedTheme() === 'dark'
  const run = sport === 'corrida'
  return <View style={{ paddingHorizontal: 20 }}>
    <Text accessibilityRole="header" style={{ marginTop: 22, marginBottom: 10, color: night ? c.eyebrow : c.brand, fontSize: 11, fontWeight: '700', letterSpacing: 2 }}>{run ? 'PROVAS' : 'OUTRAS FORMAS DE JOGAR'}</Text>
    <View style={{ borderRadius: 16, paddingHorizontal: 14, paddingVertical: 4, backgroundColor: c.surface }}>
      {sport === 'futebol' ? <Row icon="shield" title="Meu time" text="Elenco, convites e pedidos para entrar" onPress={onTeams} /> : null}
      <Row icon={run ? 'flag' : 'trophy'} title={run ? 'Provas' : 'Campeonatos'} divider={sport === 'futebol'} onPress={onEvents}
        text={run ? 'Provas de corrida abertas, com inscrição pelo Arena' : `Campeonatos de ${sport === 'tenis' ? 'tênis' : 'futebol'} abertos, com inscrição pelo Arena`} />
    </View>
  </View>
}
