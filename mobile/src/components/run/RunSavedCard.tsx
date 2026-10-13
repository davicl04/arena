import { Pressable, Text, View } from 'react-native'
import type { RunCreated } from '../../api/runs'
import { colors } from '../../theme'
import { Icon } from '../Icon'
import { TierEmblem } from '../arena/TierEmblem'
import { formatKm, formatPace, impactView, originInline } from '../play/runView'
import { formatDuration } from '../play/tierLines'

/** "5 km" para uma distância padrão; "7 km" (metros em km) para a que fica só no histórico. */
const labelOf = ({ run }: RunCreated) => (run.standard_distance_km ? `${run.standard_distance_km} km` : formatKm(run.distance_m))

/** A marca mexeu no ranking da distância (primeira marca ou novo melhor tempo). */
const touchesRanking = (created: RunCreated) => created.impact.kind === 'novo_melhor' || created.impact.kind === 'primeira_marca'

/**
 * Texto do toast de sucesso depois de salvar: o que a marca fez. Só diz que o ranking mudou quando
 * mudou; a palavra "autodeclarado" nunca aparece.
 */
export function savedNotice(created: RunCreated): string {
  return touchesRanking(created) ? `Marca salva. O ranking dos ${labelOf(created)} foi atualizado.` : 'Marca salva no histórico.'
}

/**
 * Confirmação depois de salvar (cartão de estado S1 do protótipo): "Novo melhor tempo · 5 km", o tempo, o ritmo e a
 * origem, mais o que mudou no ranking ("−0:24 · Sobe para Ouro nos 5 km. Antes: 24:12."). A marca que não melhora o
 * tempo ou fica só no histórico diz isso em vez de comemorar. Sobre fundo escuro próprio, serve à placa e à página.
 */
export function RunSavedCard({ created, onDismiss }: { created: RunCreated; onDismiss: () => void }) {
  const { run, impact } = created
  const label = labelOf(created)
  const view = impactView(impact, label, { saved: true })
  const best = touchesRanking(created)
  const title = impact.kind === 'novo_melhor' ? 'Novo melhor tempo' : impact.kind === 'primeira_marca' ? 'Primeira marca registrada' : 'Corrida registrada'
  const gain = impact.kind === 'novo_melhor' && impact.delta_s != null ? `−${formatDuration(Math.abs(impact.delta_s))} · ` : ''
  const summary = `${formatDuration(run.duration_s)} · ${formatPace(run.pace_s_per_km)} · ${originInline(run.origin)}`
  return <View testID="run-saved" accessible accessibilityLiveRegion="polite" accessibilityLabel={`${title} · ${label}. ${summary}. ${best ? `${gain}${view.detail}` : `${view.title}. ${view.detail}`}`}
    style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 16, paddingVertical: 12, paddingLeft: 12, paddingRight: 48, backgroundColor: colors.forest, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
    <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(143,224,180,0.15)' }}>
      <Icon name={best ? 'trophy' : 'check'} size={18} color={colors.mint} />
    </View>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexShrink: 1 }}>
      <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '800' }}>{title} · {label}</Text>
      <Text style={{ marginTop: 2, color: 'rgba(255,255,255,0.7)', fontSize: 10.5, lineHeight: 15 }}>{summary}</Text>
      {best
        ? <View style={{ marginTop: 3, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {view.tier ? <TierEmblem tier={view.tier} size="xs" decorative /> : null}
          <Text style={{ flexShrink: 1, color: colors.mint, fontSize: 10.5, lineHeight: 15 }}>{gain}{view.detail}</Text>
        </View>
        : <Text style={{ marginTop: 3, color: 'rgba(255,255,255,0.6)', fontSize: 10.5, lineHeight: 15 }}>{view.title}. {view.detail}</Text>}
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Dispensar aviso" onPress={onDismiss}
      style={{ position: 'absolute', top: 2, right: 2, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="x" size={16} color="rgba(255,255,255,0.6)" />
    </Pressable>
  </View>
}
