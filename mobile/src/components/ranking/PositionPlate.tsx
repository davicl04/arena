import { Text, View } from 'react-native'
import type { MyRankingLine } from '../../api/results'
import { colors } from '../../theme'
import { PlacementMeter } from '../arena/PlacementMeter'
import { TeamsPlate } from '../arena/TeamsPlate'
import { ActionButton } from '../arena/controls'

/**
 * Placa "Sua posição" para quem ainda não tem elo na categoria: o medidor da classificação ("2 de 3 partidas"), "Sem marca nos
 * 5 km" com "Registrar uma corrida" ou "Sem time ativo" com "Meus times". Nunca mostra elo, posição nem pontos de exemplo.
 */
export function PositionPlate({ line, noTeam, runKm, teamName, onTeams, onRun }: {
  /** Linha do titular nesta categoria; nula quando não há (sem time ativo ou sem partidas). */
  line: MyRankingLine | null
  /** Ranking de times e o titular não tem time ativo. */
  noTeam: boolean
  /** Distância do ranking de corrida, para "Sem marca nos 5 km". */
  runKm: number | null
  teamName: string | null
  onTeams: () => void
  onRun: () => void
}) {
  return <TeamsPlate round={22} testID="position-plate">
    <View accessibilityLabel="Sua posição" style={{ gap: 8, padding: 16 }}>
      <Text accessibilityRole="header" style={{ color: colors.mint, fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>{`SUA POSIÇÃO${teamName ? ` · ${teamName.toUpperCase()}` : ''}`}</Text>
      {noTeam
        ? <>
          <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700' }}>Sem time ativo</Text>
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11.5, lineHeight: 17 }}>O ranking de times conta as partidas do seu time.</Text>
          <View style={{ flexDirection: 'row', marginTop: 4 }}><ActionButton tone="line" size="sm" fit title="Meus times" onPress={onTeams} /></View>
        </>
        : line?.state === 'sem_marca' || (runKm && !line)
          ? <>
            <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700' }}>{runKm ? `Sem marca nos ${runKm} km` : 'Sem marca neste ranking'}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11.5, lineHeight: 17 }}>A primeira marca já classifica e dá um elo.</Text>
            <View style={{ flexDirection: 'row', marginTop: 4 }}><ActionButton tone="line" size="sm" fit title="Registrar uma corrida" onPress={onRun} /></View>
          </>
          : <PlacementMeter played={line?.played ?? 0} required={line?.required} title="Em classificação" />}
    </View>
  </TeamsPlate>
}
