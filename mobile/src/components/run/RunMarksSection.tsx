import { useState } from 'react'
import { View } from 'react-native'
import type { RunFilter } from '../../api/runs'
import type { RunDistance } from '../../data/arena'
import { RunHistorySheet } from './RunHistorySheet'
import { RunMarks } from './RunMarks'
import { RunSavedCard } from './RunSavedCard'
import { useRunEntry } from './useRunEntry'
import type { RunPartProps } from './useRunEntry'

/**
 * "Suas marcas" logo abaixo da placa (`RunArea part="marks"`): os cinco cartões de `GET /me/run-bests` (K4), o histórico de
 * cada distância e "Outras distâncias". O "+" do cartão escolhe a distância na placa (`onDistance`) e abre o registro (K2)
 * nela; "Ver ranking" abre o Ranking da corrida na distância escolhida. Salvar por aqui mostra o cartão da marca salva
 * acima dos cartões; remover uma marca relê as marcas (e, com elas, a linha do elo da placa).
 */
export function RunMarksSection(props: RunPartProps) {
  const { distance, onDistance, bests, navigation } = props
  const run = useRunEntry(props)
  const [history, setHistory] = useState<RunFilter | null>(null)

  function register(next: RunDistance) {
    onDistance(next)
    run.open(next)
  }
  return <View style={{ paddingHorizontal: 20 }}>
    {run.saved ? <View style={{ marginTop: 10 }}><RunSavedCard created={run.saved} onDismiss={run.dismiss} /></View> : null}
    <RunMarks items={bests.items} loading={bests.loading && !bests.loaded} error={bests.loaded ? '' : bests.error} errorCause={bests.errorCause} selected={distance}
      onAdd={register} onOpen={setHistory} onRetry={bests.reload} onOpenRanking={next => navigation.go('ranking', { sport: 'corrida', distanceKm: next })} />
    {run.sheet}
    {history ? <RunHistorySheet filter={history} onClose={() => setHistory(null)} onExpired={props.onExpired} onChanged={run.removed}
      onAdd={history === 'outra' ? undefined : () => { const next = Number(history) as RunDistance; setHistory(null); register(next) }} /> : null}
  </View>
}
