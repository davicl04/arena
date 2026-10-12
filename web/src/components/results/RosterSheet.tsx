import { useState } from 'react'
import type { Position } from '@/api/client'
import { putAttendance } from '@/api/results'
import type { AttendanceItem, Lineup, ResultMatch } from '@/api/results'
import type { Side } from '@/api/matches'
import { Button } from '@/components/ui/button'
import { feedbackVariants } from '@/components/ui/feedback'
import { Sheet } from '@/components/ui/sheet'
import { Tabs } from '@/components/ui/tabs'
import { useSubmit } from '@/hooks/useSubmit'
import { cn } from '@/lib/utils'
import { footballFormat } from '@/data/arena'
import { otherSide, viewSide } from './format'
import { sideName, sideOf } from '@/data/match'
import { LineupRow } from './LineupRow'

/*
 * "Revisar elenco" (R4): a folha "Quem jogou e estatísticas". A aba do meu time deixa o representante marcar quem jogou
 * (a presença vale 1 ponto e define quem entra no ranking individual) e revisar as estatísticas enviadas; a aba do
 * adversário lista os atletas dele, com "Contestar" para o representante (RN10). Quem não age pelo lado só lê.
 */
type Draft = Record<number, { present: boolean; position: Position | null }>

export function RosterSheet({ match, lineups, onLineups, onUpdated, onChanged, onClose, onExpired, notify }: {
  match: ResultMatch
  lineups: Lineup[]
  /** Troca a lista inteira (a presença devolve todos os atletas). */
  onLineups: (items: Lineup[]) => void
  /** Troca um atleta (revisão e contestação). */
  onUpdated: (lineup: Lineup) => void
  /** Avisa a tela da partida que algo mudou (permissões e pendências dependem do elenco). */
  onChanged: () => void
  onClose: () => void
  onExpired: () => void
  notify: (text: string) => void
}) {
  const mine = viewSide(match)
  const [tab, setTab] = useState<Side>(mine)
  const own = sideOf(match, mine)
  const other = sideOf(match, otherSide(mine))
  const editing = match.permissions.attendance && tab === mine && match.my_side !== null
  const rows = lineups.filter(item => item.side === tab)
  const [draft, setDraft] = useState<Draft>(() => Object.fromEntries(
    lineups.filter(item => item.side === mine).map(item => [item.user.id, { present: item.present === true, position: item.position }])))
  const { busy, error, run } = useSubmit(onExpired)

  const baseline = (lineup: Lineup) => ({ present: lineup.present === true, position: lineup.position })
  const changed = lineups.filter(item => item.side === mine && draft[item.user.id]
    && (draft[item.user.id].present !== baseline(item).present || (draft[item.user.id].present && draft[item.user.id].position !== baseline(item).position)))
  const missingPosition = changed.some(item => draft[item.user.id].present && !draft[item.user.id].position)

  async function saveAttendance() {
    const athletes: AttendanceItem[] = changed.map(item => {
      const entry = draft[item.user.id]
      return entry.present ? { user_id: item.user.id, present: true, position: entry.position } : { user_id: item.user.id, present: false }
    })
    const result = await run(() => putAttendance(match.id, athletes), 'Não foi possível registrar a presença.')
    if (!result) return
    onLineups(result.items)
    setDraft(Object.fromEntries(result.items.filter(item => item.side === mine)
      .map(item => [item.user.id, { present: item.present === true, position: item.position }])))
    notify('Presença registrada')
    onChanged()
  }

  const sent = rows.filter(item => item.present === true && item.stat).length
  const played = rows.filter(item => item.present === true).length
  const tabs = [
    { value: mine, label: sideName(own, 'Meu time') },
    ...(other?.team ? [{ value: otherSide(mine), label: sideName(other) }] : []),
  ]
  const format = match.format ? footballFormat[match.format] : null

  return (
    <Sheet title="Quem jogou e estatísticas" description={`${sideName(own)}${format ? ` · ${format.label}` : ''}`} onClose={onClose}>
      {tabs.length > 1 && (
        <Tabs variant="track" items={tabs} value={tab} onChange={setTab} label="Elenco" idPrefix="roster-tab-" controls="roster-panel" className="my-2" />
      )}
      <div id="roster-panel" className="min-w-0" role={tabs.length > 1 ? 'tabpanel' : undefined} aria-labelledby={tabs.length > 1 ? `roster-tab-${tab}` : undefined}>
        <p className="m-0 mb-1 text-[10.5px] leading-normal text-ink-muted" aria-live="polite">
          {played ? `${sent} de ${played} que jogaram enviaram estatísticas.` : 'Ninguém marcado como presente ainda.'}
        </p>
        {rows.length === 0
          ? <p className="my-4 text-center text-[12px] text-ink-muted">Nenhum atleta neste elenco.</p>
          : (
            <ul className="m-0 grid list-none grid-cols-[minmax(0,1fr)] p-0">
              {rows.map(lineup => (
                <LineupRow
                  key={lineup.user.id} matchId={match.id} lineup={lineup} onExpired={onExpired} notify={notify}
                  attendance={editing ? (draft[lineup.user.id] ?? baseline(lineup)) : undefined}
                  onAttendance={editing ? change => setDraft(old => ({ ...old, [lineup.user.id]: change })) : undefined}
                  onUpdated={updated => { onUpdated(updated); onChanged() }}
                />
              ))}
            </ul>
          )}
        {editing && (
          <>
            <p className="mt-2 mb-0 text-[10.5px] leading-normal text-ink-muted">
              Marque quem jogou: a presença vale 1 ponto. As estatísticas vêm de cada atleta; o adversário pode contestá-las antes de pontuar.
            </p>
            <div aria-live="polite">
              {missingPosition && <p className={cn(feedbackVariants(), 'mb-0')} role="alert">Escolha a posição de quem jogou.</p>}
              {error && <p className={cn(feedbackVariants(), 'mb-0')} role="alert">{error}</p>}
            </div>
            <div className="mt-3 flex gap-2 *:flex-1">
              <Button type="button" variant="secondary" onClick={onClose}>Fechar</Button>
              <Button type="button" disabled={busy || changed.length === 0 || missingPosition} onClick={() => void saveAttendance()}>
                {busy ? 'Salvando…' : 'Salvar presença'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}
