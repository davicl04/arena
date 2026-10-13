import { Pressable, Text, View } from 'react-native'
import type { RunRace } from '../../api/runs'
import { colors } from '../../theme'
import { Icon } from '../Icon'
import { TextAction } from '../arena/controls'
import { LoadError } from '../arena/LoadError'
import { distanceLabel, formatRunDate } from '../play/runView'

/**
 * "Prova do Arena" (K2): as provas de corrida em que o titular tem inscrição confirmada, com a largada já passada, dentro
 * das últimas 52 semanas e sem marca (`GET /me/run-races`). A escolha é manual, mesmo com uma só prova. Sem prova, o
 * texto diz por quê, sem inventar nenhuma, e "Ver provas" leva à lista de provas.
 */
export function RunRaces({ races, loading, error, errorCause, selected, onSelect, onRetry, onFind }: {
  races: RunRace[]
  loading: boolean
  error: string
  /** O erro lançado pelo carregamento (para o `LoadError` reconhecer a falta de conexão). */
  errorCause?: unknown
  selected: number | null
  onSelect: (race: RunRace) => void
  onRetry: () => void
  /** Abre a lista de provas abertas para inscrição. */
  onFind?: () => void
}) {
  if (loading) return <Text accessibilityLiveRegion="polite" style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11.5 }}>Carregando suas provas…</Text>
  if (error) return <LoadError size="section" tone="dark" title="Não foi possível carregar as provas" text={error} cause={errorCause} onRetry={onRetry} />
  if (!races.length) return <View testID="run-races-empty" style={{ gap: 4, borderRadius: 14, padding: 12, backgroundColor: 'rgba(255,255,255,0.06)' }}>
    <Text accessibilityRole="header" style={{ color: '#ffffff', fontSize: 12.5, fontWeight: '800' }}>Nenhuma prova para registrar</Text>
    <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10.5, lineHeight: 16 }}>
      A marca da prova entra depois da largada, para quem tem inscrição confirmada em uma prova de corrida das últimas 52 semanas e ainda não registrou o tempo dela.
    </Text>
    {onFind ? <TextAction title="Ver provas" surface="dark" onPress={onFind} /> : null}
  </View>
  return <View accessibilityRole="radiogroup" accessibilityLabel="Prova do Arena" style={{ gap: 6 }}>
    {races.map(race => {
      const on = selected === race.entry_id
      const detail = `${distanceLabel(race.distance_km)} · ${formatRunDate(race.date)}`
      return <Pressable key={race.entry_id} accessibilityRole="radio" accessibilityLabel={`${race.event_name}, ${detail}`} accessibilityState={{ selected: on, checked: on }}
        onPress={() => { if (!on) onSelect(race) }}
        style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderColor: on ? colors.mint : 'rgba(255,255,255,0.15)', backgroundColor: on ? 'rgba(143,224,180,0.1)' : 'transparent' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: '#ffffff', fontSize: 12.5, fontWeight: '800' }}>{race.event_name}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10.5 }}>{detail}</Text>
        </View>
        {on ? <Icon name="check" size={16} color={colors.mint} /> : null}
      </Pressable>
    })}
  </View>
}
