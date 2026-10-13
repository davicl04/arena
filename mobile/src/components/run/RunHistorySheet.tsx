import { useState } from 'react'
import { Text, View } from 'react-native'
import { ApiError } from '../../api/client'
import { deleteRun, runsPath } from '../../api/runs'
import type { Run, RunFilter } from '../../api/runs'
import { runDistances } from '../../data/arena'
import { usePagedList } from '../../hooks/usePagedList'
import { useSubmit } from '../../hooks/useSubmit'
import { colors } from '../../theme'
import Sheet from '../Sheet'
import { ActionButton, ConfirmBox, ErrorText, LiveNotice, Notice, TextAction } from '../arena/controls'
import { formatKm, formatPace, formatRunDate, originLabel } from '../play/runView'
import { formatDuration } from '../play/tierLines'

/**
 * Histórico de uma distância (K4), em folha: as marcas do titular da mais recente para a mais antiga, paginadas por
 * cursor (`GET /me/runs?distance=`). "Remover" pede confirmação na própria linha, apaga a marca e avisa quem chamou
 * (`onChanged`), que relê os cartões e a placa; se a marca já não existe (`404`), relê a lista e os cartões e mantém a
 * mensagem do servidor. `outra` lista as marcas fora das cinco distâncias, que ficam só aqui.
 */
export function RunHistorySheet({ filter, onClose, onAdd, onChanged, onExpired, now }: {
  filter: RunFilter
  onClose: () => void
  /** Registrar nesta distância (histórico vazio). */
  onAdd?: () => void
  /** Uma marca foi removida: o ranking da distância foi recalculado. */
  onChanged: (removed: Run) => void
  onExpired: () => void
  /** Hoje, para os testes. */
  now?: Date
}) {
  const list = usePagedList<Run>(runsPath(filter), onExpired)
  const remove = useSubmit(onExpired)
  const [confirming, setConfirming] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  const other = filter === 'outra'
  const label = other ? '' : runDistances.find(item => `${item.value}` === filter)?.label ?? `${filter} km`

  async function confirmRemove(run: Run) {
    const done = await remove.run(async () => {
      try {
        await deleteRun(run.id)
        return true
      } catch (cause) {
        // 404: a marca já não existe (removida em outro aparelho). Relê a lista e os cartões, em vez de manter a linha velha;
        // a mensagem do servidor continua visível sob o aviso.
        if (cause instanceof ApiError && cause.status === 404) { setConfirming(null); list.reload(); onChanged(run) }
        throw cause
      }
    }, 'Não foi possível remover a marca.')
    if (!done) return
    list.setItems(items => items.filter(item => item.id !== run.id))
    setConfirming(null)
    setNotice('Marca removida.')
    onChanged(run)
  }

  return <Sheet title={other ? 'Outras distâncias' : `Histórico dos ${label}`} onClose={onClose}>
    <Text style={{ color: colors['ink-muted'], fontSize: 12, lineHeight: 18 }}>
      {other ? 'Marcas fora de 3, 5, 10, 21 e 42 km (com 2% de tolerância). Ficam só aqui, sem ranking.' : 'Da mais recente para a mais antiga.'}
    </Text>
    <LiveNotice text={notice} />
    {remove.error && confirming === null ? <ErrorText>{remove.error}</ErrorText> : null}
    {list.loading ? <Text accessibilityLiveRegion="polite" style={{ paddingVertical: 24, textAlign: 'center', color: colors['ink-muted'], fontSize: 12 }}>Carregando o histórico…</Text> : null}
    {list.error ? <View>
      <Notice>{list.error.message}</Notice>
      <TextAction title="Tentar novamente" onPress={list.reload} />
    </View> : null}
    {!list.loading && !list.error && !list.items.length ? <View style={{ alignItems: 'center', paddingVertical: 24 }}>
      <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 12.5, fontWeight: '700' }}>{other ? 'Nenhuma marca fora das cinco distâncias.' : `Nenhuma marca nos ${label}.`}</Text>
      <Text style={{ marginTop: 6, maxWidth: 280, textAlign: 'center', color: colors['ink-muted'], fontSize: 11.5, lineHeight: 18 }}>
        {other ? 'Registre uma corrida com outra distância e ela aparece aqui.' : 'Registre um treino ou uma prova para entrar no ranking.'}
      </Text>
      {!other && onAdd ? <View style={{ marginTop: 12 }}><ActionButton tone="brand" title={`Registrar ${label}`} fit onPress={onAdd} /></View> : null}
    </View> : null}
    {list.items.map(run => {
      const time = formatDuration(run.duration_s)
      const day = formatRunDate(run.date, now)
      return <View key={run.id} testID={`run-history-${run.id}`} style={{ borderBottomWidth: 1, borderBottomColor: colors['brand-soft'] }}>
        <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
          <View accessible accessibilityLabel={`${time}, ritmo ${formatPace(run.pace_s_per_km)}, ${day}, ${originLabel(run.origin)}, ${formatKm(run.distance_m)}${run.standard_distance_km && !run.counts_for_ranking ? ', fora das 52 semanas' : ''}`} style={{ flex: 1, minWidth: 0 }}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 }}>
              <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{time}</Text>
              <Text style={{ color: colors['ink-muted'], fontSize: 10.5 }}>{formatPace(run.pace_s_per_km)}</Text>
            </View>
            <Text accessibilityElementsHidden importantForAccessibility="no" style={{ marginTop: 2, color: colors['ink-muted'], fontSize: 10.5, lineHeight: 15 }}>
              {day} · {originLabel(run.origin)} · {formatKm(run.distance_m)}{run.standard_distance_km && !run.counts_for_ranking ? ' · fora das 52 semanas' : ''}
            </Text>
          </View>
          <TextAction title="Remover" accessibilityLabel={`Remover a marca de ${time} em ${day}`} disabled={remove.busy}
            onPress={() => { remove.setError(''); setNotice(''); setConfirming(run.id) }} />
        </View>
        {confirming === run.id ? <View style={{ paddingBottom: 12 }}>
          <ConfirmBox title="Remover esta marca?" confirmLabel="Remover marca" busy={remove.busy} onConfirm={() => void confirmRemove(run)} onCancel={() => setConfirming(null)}>
            {run.counts_for_ranking ? 'Ela sai do histórico e o ranking da distância é recalculado.' : 'Ela sai do histórico. Não conta para o ranking.'}
          </ConfirmBox>
          {remove.error ? <ErrorText>{remove.error}</ErrorText> : null}
        </View> : null}
      </View>
    })}
    {list.moreError ? <ErrorText>{list.moreError}</ErrorText> : null}
    {list.hasMore ? <View style={{ marginTop: 12 }}><ActionButton block tone="outline" title={list.busy ? 'Carregando…' : 'Carregar mais'} busy={list.busy} onPress={() => void list.loadMore()} /></View> : null}
  </Sheet>
}
