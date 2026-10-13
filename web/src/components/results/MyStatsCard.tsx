import { useId, useState } from 'react'
import { UserRound } from 'lucide-react'
import type { Position } from '@/api/client'
import { positions } from '@/api/client'
import { putMyStats } from '@/api/results'
import type { Lineup, MyStatsResult, ResultMatch } from '@/api/results'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { feedbackVariants } from '@/components/ui/feedback'
import { useSubmit } from '@/hooks/useSubmit'
import { cn } from '@/lib/utils'
import { formatNumber, localPreview, positionAbbreviation, positionStat, statFieldLabel } from './format'
import type { Outcome } from './format'
import { Segmented, Stepper } from './Stepper'

/*
 * "Suas estatísticas" (R4): a posição em que a pessoa jogou, gols, assistências e a estatística da posição (RN13), com a
 * prévia de pontos (RN12) que se atualiza ao mexer nos contadores. Enviar marca a presença; o representante do próprio
 * lado revisa e o adversário pode contestar antes de pontuar. Campo zerado vai vazio: não soma nem tira pontos.
 */
const positionItems = positions.map(item => ({ value: item.value, label: positionAbbreviation[item.value], title: item.label }))
const resultName: Record<number, string> = { 3: 'vitória', 1: 'empate', 0: 'derrota' }
const badgeText = { enviada: 'Enviadas', revisada: 'Revisadas', contestada: 'Contestadas' } as const

export function MyStatsCard({ match, lineup, outcome, onSaved, onExpired }: {
  match: ResultMatch
  /** A atuação de quem vê (null se ainda não tem registro). */
  lineup: Lineup | null
  /** Resultado conhecido para a prévia: o placar confirmado, senão o do meu lado. */
  outcome: Outcome | null
  onSaved: (result: MyStatsResult) => void
  onExpired: () => void
}) {
  const headingId = useId()
  const stat = lineup?.stat ?? null
  // Depois da contestação, a revisão do representante é final e o servidor recusa edições, mesmo com `send_stats`.
  const finalReview = stat?.state === 'revisada' && stat.contested_at != null
  const editable = match.permissions.send_stats && !finalReview
  const [position, setPosition] = useState<Position | null>(lineup?.position ?? null)
  const [goals, setGoals] = useState(stat?.goals ?? 0)
  const [assists, setAssists] = useState(stat?.assists ?? 0)
  const [extra, setExtra] = useState(stat?.position_stat ?? 0)
  const { busy, error, run } = useSubmit(onExpired)
  const dirty = position !== (lineup?.position ?? null) || goals !== (stat?.goals ?? 0)
    || assists !== (stat?.assists ?? 0) || extra !== (stat?.position_stat ?? 0)
  const extraName = position ? positionStat[position].label : 'Estatística da posição'
  const server = !dirty ? lineup?.points ?? null : null
  const preview = server
    ? { presence: server.presence, result: server.result, goals: server.goals, assists: server.assists, positionStat: server.position_stat, total: server.total }
    : localPreview(outcome, goals, assists, extra)

  async function send() {
    if (!position) return
    const result = await run(() => putMyStats(match.id, {
      position, goals: goals || null, assists: assists || null, position_stat: extra || null,
    }), 'Não foi possível enviar as estatísticas.')
    if (result) onSaved(result)
  }

  const parts = [
    `${formatNumber(preview.presence)} presença`,
    preview.result !== null ? `${formatNumber(preview.result)} ${resultName[preview.result] ?? 'resultado'}` : null,
    goals ? `${preview.goals} ${preview.goals === 1 ? 'gol' : 'gols'}` : null,
    assists ? `${preview.assists} ${preview.assists === 1 ? 'assistência' : 'assistências'}` : null,
    extra ? `${formatNumber(preview.positionStat)} (${extraName.toLowerCase()}, até 4)` : null,
  ].filter(Boolean)

  const caption = !stat ? 'Vale após a confirmação do placar e a revisão do representante.'
    : stat.state === 'contestada' ? 'O representante do seu time revisa de novo. Enquanto isso, o item contestado não pontua.'
      : finalReview ? 'Revisão final do representante do seu time, depois da contestação.'
      : stat.state === 'revisada' ? 'Revisadas pelo representante. Se você editar, voltam para a revisão.'
        : 'O representante do seu time revisa; o adversário pode contestar antes de pontuar.'
  const counted = server?.counted.map(field => statFieldLabel(field, position).toLowerCase()) ?? []

  return (
    <section aria-labelledby={headingId} data-slot="my-stats" className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-card bg-white p-3.5 shadow-card">
      <div className="flex items-center gap-2">
        <UserRound size={16} className="flex-none text-brand" aria-hidden="true" />
        <h3 id={headingId} className="text-[13px]">Suas estatísticas</h3>
        <Badge className="ml-auto">{stat ? badgeText[stat.state] : 'Opcional'}</Badge>
      </div>

      {lineup?.present === false && (
        <p className={cn(feedbackVariants(), 'my-0')} role="status">O representante marcou que você não jogou. Fale com ele.</p>
      )}
      {stat?.state === 'contestada' && (
        <p className="m-0 rounded-field bg-warning-bg p-2 text-[10.5px] leading-normal text-warning">
          {stat.contested_by?.name ?? 'O adversário'} contestou{stat.contest_reason ? <>: “{stat.contest_reason}”</> : '.'}
        </p>
      )}

      <div className="grid gap-1.5">
        <span className="text-[10px] font-bold tracking-[0.06em] text-ink-muted uppercase">Posição em que você jogou</span>
        <Segmented label="Posição em que você jogou" items={positionItems} value={position} disabled={!editable || busy} onChange={setPosition} />
      </div>

      <div className="grid gap-1.5">
        {([['Gols', goals, setGoals], ['Assistências', assists, setAssists], [extraName, extra, setExtra]] as const).map(([title, value, set]) => (
          <div key={title} className="flex items-center justify-between gap-3">
            <span className="min-w-0 text-[12px] font-semibold">{title}</span>
            <Stepper label={title} value={value} max={50} disabled={!editable || busy} onChange={set} />
          </div>
        ))}
      </div>

      <div data-slot="points-preview" className="grid grid-cols-[auto_1fr] items-baseline gap-x-2.5 gap-y-0.5 rounded-xl bg-subtle px-3 py-2.5">
        <span className="text-[10px] font-bold tracking-[0.06em] text-ink-muted uppercase">Prévia</span>
        <b className="text-right font-display text-[16px] font-extrabold text-brand tabular-nums">{formatNumber(preview.total)} pts</b>
        <small className="col-span-2 text-[10px] leading-normal text-ink-muted">
          {parts.join(' + ')}.{preview.result === null && ' O resultado soma quando o placar for confirmado.'} {caption}
          {counted.length > 0 && ` Já pontuam: ${counted.join(', ')}.`}{server?.final && ' Pontuação final.'}
        </small>
      </div>

      <div aria-live="polite">{error && <p className={cn(feedbackVariants(), 'my-0')} role="alert">{error}</p>}</div>
      {editable && (
        <Button type="button" disabled={busy || !position || (Boolean(stat) && !dirty)} onClick={() => void send()}>
          {busy ? 'Enviando…' : stat ? 'Atualizar estatísticas' : 'Enviar estatísticas'}
        </Button>
      )}
    </section>
  )
}
