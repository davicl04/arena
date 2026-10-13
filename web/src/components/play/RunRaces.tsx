import { Check } from 'lucide-react'
import type { RunRace } from '@/api/runs'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { distanceLabel, formatRunDate } from './runView'

/**
 * "Prova do Arena" (K2): as provas de corrida em que o titular tem inscrição confirmada, com a largada já passada, dentro
 * das últimas 52 semanas e sem marca (`GET /me/run-races`). Sem prova, o texto diz por quê, sem inventar nenhuma.
 */
export function RunRaces({ races, loading, error, selected, onSelect, onRetry, onFind, describedBy }: {
  races: RunRace[]
  loading: boolean
  error: string
  selected: number | null
  onSelect: (race: RunRace | null) => void
  onRetry: () => void
  /** Abre a lista de provas abertas para inscrição. */
  onFind?: () => void
  describedBy?: string
}) {
  if (loading) return <p role="status" className="m-0 text-[11.5px] text-white/65">Carregando suas provas…</p>
  if (error) return <p role="alert" className="m-0 text-[11.5px] leading-normal text-danger-soft">
    {error} <Button variant="glass-link" className="inline min-h-0 p-0 align-baseline" onClick={onRetry}>Tentar novamente</Button>
  </p>
  if (!races.length) return <div data-slot="run-races-empty" className="grid gap-1 rounded-[14px] bg-white/6 p-3">
    <b className="font-display text-[12.5px] text-white">Nenhuma prova para registrar</b>
    <small className="text-[10.5px] leading-[1.5] text-white/65">
      A marca da prova entra depois da largada, para quem tem inscrição confirmada em uma prova de corrida das últimas 52 semanas e ainda não registrou o tempo dela.
    </small>
    {onFind && <Button variant="glass-link" className="min-h-9" onClick={onFind}>Ver provas</Button>}
  </div>
  return <ToggleGroup aria-label="Prova do Arena" aria-describedby={describedBy} orientation="vertical" spacing={1.5}
    value={selected === null ? [] : [String(selected)]} className="grid w-full gap-1.5"
    onValueChange={next => { const id = next[0]; onSelect(races.find(race => String(race.entry_id) === id) ?? null) }}>
    {races.map(race => <ToggleGroupItem key={race.entry_id} value={String(race.entry_id)}
      className="h-auto min-h-12 w-full justify-between gap-2 rounded-[12px] border border-solid border-white/15 bg-transparent px-3 py-2 text-left text-white hover:bg-white/8 hover:text-white focus-visible:ring-mint/70 data-pressed:border-mint data-pressed:bg-mint/10 data-pressed:text-white data-pressed:hover:bg-mint/12">
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[12.5px]">{race.event_name}</b>
        <small className="block text-[10.5px] font-normal text-white/65">{distanceLabel(race.distance_km)} · {formatRunDate(race.date)}</small>
      </span>
      {selected === race.entry_id && <Check size={16} aria-hidden="true" className="flex-none text-mint" />}
    </ToggleGroupItem>)}
  </ToggleGroup>
}
