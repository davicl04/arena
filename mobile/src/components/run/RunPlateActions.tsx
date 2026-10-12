import { Text, View } from 'react-native'
import { ActionButton, LiveNotice } from '../arena/controls'
import { RunSavedCard } from './RunSavedCard'
import { useRunEntry } from './useRunEntry'
import type { RunPartProps } from './useRunEntry'

/**
 * A corrida dentro da placa `forest` do Jogar (`RunArea part="plate"`), no lugar do botão redondo: "Registrar corrida",
 * que abre o K2 (tela cheia) na distância escolhida nos chips, a nota de como a marca vale e o cartão da última marca salva
 * por aqui. Os números vêm do servidor; nada de marca inventada.
 */
export function RunPlateActions(props: RunPartProps) {
  const run = useRunEntry(props)
  return <View style={{ alignSelf: 'stretch', alignItems: 'center', gap: 12 }}>
    <View style={{ alignSelf: 'stretch' }}>
      <ActionButton block tone="mint" icon="timer" title="Registrar corrida" accessibilityHint="Abre o registro de treino ou prova" onPress={() => run.open(props.distance)} />
    </View>
    <Text style={{ maxWidth: 300, textAlign: 'center', color: 'rgba(255,255,255,0.8)', fontSize: 11.5, lineHeight: 18 }}>
      Treino ou prova do Arena: o melhor tempo das últimas 52 semanas de cada distância vale no ranking.
    </Text>
    <View style={{ alignSelf: 'stretch' }}><LiveNotice text={run.notice} /></View>
    {run.saved ? <View style={{ alignSelf: 'stretch' }}><RunSavedCard created={run.saved} onDismiss={run.dismiss} /></View> : null}
    {run.sheet}
  </View>
}
