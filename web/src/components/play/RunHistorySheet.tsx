import { useState } from 'react'
import { deleteRun, runsPath } from '@/api/runs'
import type { Run, RunFilter } from '@/api/runs'
import { ConfirmBox } from '@/components/teams/ConfirmBox'
import { teamButton } from '@/components/teams/styles'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { runDistances } from '@/data/arena'
import { usePagedList } from '@/hooks/usePagedList'
import { useSubmit } from '@/hooks/useSubmit'
import { formatKm, formatPace, formatRunDate, originLabel } from './runView'
import { formatDuration } from './tierLines'

/**
 * Histórico de uma distância (K4), em folha: as marcas do titular da mais recente para a mais antiga, paginadas por
 * cursor (`GET /me/runs?distance=`). "Remover" pede confirmação na própria linha, apaga a marca e avisa quem chamou
 * (`onChanged`), que relê os cartões e a placa. `outra` lista as marcas fora das cinco distâncias, que ficam só aqui.
 */
export function RunHistorySheet({ filter, onClose, onAdd, onChanged, onExpired }: {
  filter: RunFilter
  onClose: () => void
  /** Registrar nesta distância (histórico vazio). */
  onAdd?: () => void
  onChanged: () => void
  onExpired: () => void
}) {
  const list = usePagedList<Run>(runsPath(filter), onExpired)
  const remove = useSubmit(onExpired)
  const [confirming, setConfirming] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  const other = filter === 'outra'
  const label = other ? '' : runDistances.find(item => `${item.value}` === filter)?.label ?? `${filter} km`

  async function confirmRemove(run: Run) {
    const done = await remove.run(async () => { await deleteRun(run.id); return true }, 'Não foi possível remover a marca.')
    if (!done) return
    list.setItems(items => items.filter(item => item.id !== run.id))
    setConfirming(null)
    setNotice('Marca removida.')
    onChanged()
  }

  return <Sheet eyebrow="Suas marcas" title={other ? 'Outras distâncias' : `Histórico dos ${label}`} onClose={onClose}
    description={other ? 'Marcas fora de 3, 5, 10, 21 e 42 km (com 2% de tolerância). Ficam só aqui, sem ranking.' : 'Da mais recente para a mais antiga.'}>
    <div className="mt-2" data-slot="run-history">
      <p role="status" className="m-0 text-[11.5px] leading-normal text-brand empty:hidden">{notice}</p>
      {list.loading && <p role="status" className="m-0 py-6 text-center text-[12px] text-ink-muted">Carregando o histórico…</p>}
      {list.error && <div role="alert" className="my-3 rounded-field bg-error-bg p-3 text-[12px] leading-[1.6] text-error">
        {list.error.message} <Button variant="text" className="inline min-h-0 py-0" onClick={list.reload}>Tentar novamente</Button>
      </div>}
      {!list.loading && !list.error && !list.items.length && <div className="py-6 text-center">
        <p className="m-0 text-[12.5px] font-bold">{other ? 'Nenhuma marca fora das cinco distâncias.' : `Nenhuma marca nos ${label}.`}</p>
        <p className="mx-auto mt-1.5 mb-0 max-w-[280px] text-[11.5px] leading-[1.6] text-ink-muted">
          {other ? 'Registre uma corrida com outra distância e ela aparece aqui.' : 'Registre um treino ou uma prova para entrar no ranking.'}
        </p>
        {!other && onAdd && <button type="button" className={`${teamButton({ tone: 'brand', size: 'md' })} mt-3`} onClick={onAdd}>Registrar {label}</button>}
      </div>}
      {list.items.length > 0 && <ul className="m-0 list-none p-0">
        {list.items.map(run => {
          const time = formatDuration(run.duration_s)
          const day = formatRunDate(run.date)
          return <li key={run.id} className="border-b border-solid border-line last:border-b-0">
            <div className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="m-0 flex flex-wrap items-baseline gap-x-2">
                  <b className="font-display text-[17px] font-extrabold tabular-nums">{time}</b>
                  <small className="text-[10.5px] text-ink-muted">{formatPace(run.pace_s_per_km)}</small>
                </p>
                <small className="mt-0.5 block text-[10.5px] leading-[1.45] text-ink-muted">
                  {day} · {originLabel(run.origin)} · {formatKm(run.distance_m)}
                  {run.standard_distance_km && !run.counts_for_ranking && ' · fora das 52 semanas'}
                </small>
              </div>
              <button type="button" aria-label={`Remover a marca de ${time} em ${day}`} disabled={remove.busy}
                className="min-h-9 flex-none border-0 bg-transparent px-1 text-[11px] font-bold text-danger-ink"
                onClick={() => { remove.setError(''); setNotice(''); setConfirming(run.id) }}>
                Remover
              </button>
            </div>
            {confirming === run.id && <div className="pb-3">
              <ConfirmBox confirmLabel="Remover marca" busy={remove.busy} onConfirm={() => void confirmRemove(run)} onCancel={() => setConfirming(null)}>
                <b>Remover esta marca?</b>
                <span className="mt-1 block">
                  {run.counts_for_ranking ? 'Ela sai do histórico e o ranking da distância é recalculado.' : 'Ela sai do histórico. Não conta para o ranking.'}
                </span>
                {remove.error && <span role="alert" className="mt-1.5 block text-danger-ink">{remove.error}</span>}
              </ConfirmBox>
            </div>}
          </li>
        })}
      </ul>}
      <div aria-live="polite">
        {list.moreError && <p role="alert" className="m-0 mt-2 text-[11.5px] text-error">{list.moreError}</p>}
      </div>
      {list.hasMore && <Button variant="secondary" className="mt-3 w-full" disabled={list.busy} onClick={() => void list.loadMore()}>
        {list.busy ? 'Carregando…' : 'Carregar mais'}
      </Button>}
    </div>
  </Sheet>
}
