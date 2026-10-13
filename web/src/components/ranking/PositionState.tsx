import type { MyRankingLine } from '@/api/results'
import { PlacementMeter } from '@/components/arena/PlacementMeter'
import { Button } from '@/components/ui/button'

/** Qual estado a placa mostra no lugar da posição. */
export type PositionStateKind = 'placement' | 'no-mark' | 'no-team'

/**
 * Placa da posição de quem ainda não tem elo (`forest`): o medidor "n de 3 partidas" (classificação ou sem jogos), "Sem
 * marca nos 5 km" com "Registrar uma corrida" ou "Sem time ativo" com "Meus times". Nunca mostra um elo.
 */
export function PositionState({ kind, line, distance, onPlay, onTeams }: {
  kind: PositionStateKind
  line: MyRankingLine | null
  distance: number
  onPlay: () => void
  onTeams: () => void
}) {
  return (
    <section data-slot="position-state" aria-label="Sua posição" className="relative grid gap-2.5 overflow-hidden rounded-card bg-forest p-3.5 text-white">
      <span aria-hidden="true" className="pointer-events-none absolute -top-2.5 -right-[60px] h-[150px] w-[260px] bg-white opacity-[0.06] mask-[url(/images/brand/coliseum.svg)] mask-contain mask-center mask-no-repeat" />
      <p className="relative m-0 text-[10px] font-bold tracking-[0.1em] text-mint">SUA POSIÇÃO</p>
      {kind === 'placement' && line && (
        <div className="relative grid gap-1.5">
          {line.team && <small className="text-[10.5px] text-white/65">{line.team.name}</small>}
          <PlacementMeter played={line.played} required={line.required} title="Em classificação" />
        </div>
      )}
      {kind === 'no-mark' && (
        <div className="relative grid justify-items-start gap-1">
          <b className="font-display text-[16px]">Sem marca nos {distance} km</b>
          <p className="m-0 text-[11.5px] leading-normal text-white/65">A primeira marca já classifica e dá um elo.</p>
          <Button variant="glass" className="mt-2.5" onClick={onPlay}>Registrar uma corrida</Button>
        </div>
      )}
      {kind === 'no-team' && (
        <div className="relative grid justify-items-start gap-1">
          <b className="font-display text-[16px]">Sem time ativo</b>
          <p className="m-0 text-[11.5px] leading-normal text-white/65">O ranking de times conta as partidas do seu time.</p>
          <Button variant="glass" className="mt-2.5" onClick={onTeams}>Meus times</Button>
        </div>
      )}
    </section>
  )
}
