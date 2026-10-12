import { ChevronRight, History, Plus, Timer } from 'lucide-react'
import type { RunBest, RunFilter } from '@/api/runs'
import { ArenaMark } from '@/components/Brand'
import { TierEmblem } from '@/components/arena/TierEmblem'
import { Button } from '@/components/ui/button'
import { SectionTitle } from '@/components/ui/section-title'
import { runDistances, shownTier, tiers } from '@/data/arena'
import type { RunDistance } from '@/data/arena'
import { cn } from '@/lib/utils'
import { RunSpark } from './RunSpark'
import { formatRunDate, originLabel } from './runView'
import { formatDuration } from './tierLines'

/*
 * "Suas marcas" (K4), abaixo da placa na aba Corrida: um cartão por distância com o melhor tempo das últimas 52 semanas,
 * o elo e a origem ("Treino" ou o nome da prova), o minigráfico de evolução e o "+" que abre o registro já nessa
 * distância. Tocar no cartão abre o histórico. A última linha abre o histórico das distâncias fora das cinco. "Ver ranking"
 * (no título) abre o Ranking da corrida na distância escolhida.
 */

function Card({ card, selected, onAdd, onOpen }: {
  card: RunBest
  selected: boolean
  onAdd: (distance: RunDistance) => void
  onOpen: (filter: RunFilter) => void
}) {
  const label = runDistances.find(item => item.value === card.distance_km)?.label ?? `${card.distance_km} km`
  const tier = shownTier(card.tier, card.marks, 1)
  const best = card.best
  return <article data-slot="run-mark" data-distance={card.distance_km} aria-current={selected ? 'true' : undefined}
    className={cn('relative min-w-0 rounded-[16px] bg-white shadow-[0_3px_12px_#0000000d]', selected && 'shadow-[inset_0_0_0_2px_var(--color-brand)]')}>
    <button type="button" aria-haspopup="dialog" aria-label={`Histórico dos ${label}`} onClick={() => onOpen(`${card.distance_km}`)}
      className="grid w-full min-w-0 gap-2 rounded-[16px] border-0 bg-transparent p-3 text-left text-inherit hover:bg-subtle/60">
      <span className="flex min-w-0 items-center gap-2 pr-[34px]">
        {tier
          ? <TierEmblem tier={tier} size="md" decorative />
          : <span aria-hidden="true" className="grid size-8 flex-none place-items-center rounded-full border-2 border-dashed border-ink-muted/40"><ArenaMark className="h-3.5 w-[18px] text-ink-muted" /></span>}
        <span className="min-w-0 flex-1">
          <b className="block font-display text-[13px]">{label}</b>
          <small className="block truncate text-[9.5px] text-ink-muted">{tier ? tiers[tier].name : 'Sem marca'}</small>
        </span>
      </span>
      {best
        ? <>
          <span className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
            <span className="font-display text-[20px] leading-none font-extrabold tabular-nums text-ink">{formatDuration(best.duration_s)}</span>
            <RunSpark series={card.series} />
          </span>
          <small className="grid text-[9.5px] leading-[1.4] text-ink-muted">
            <span className="truncate font-semibold text-ink">{originLabel(best.origin)} · {formatRunDate(best.date)}</span>
            <span>Melhor nas últimas 52 semanas</span>
          </small>
        </>
        : <small className="text-[9.5px] leading-[1.4] text-ink-muted">Registre um treino ou prova para entrar no ranking dos {label}.</small>}
    </button>
    <button type="button" aria-label={`Registrar ${label}`} onClick={() => onAdd(card.distance_km)}
      className="absolute top-2.5 right-2.5 grid size-[30px] place-items-center rounded-full border-[1.5px] border-solid border-line-strong bg-white text-brand hover:bg-subtle">
      <Plus size={17} aria-hidden="true" />
    </button>
  </article>
}

export function RunMarks({ items, loading, error, selected, onAdd, onOpen, onRetry, onOpenRanking }: {
  items: RunBest[]
  loading: boolean
  error: string
  /** Distância escolhida nos chips da placa: o cartão ganha o contorno verde. */
  selected: RunDistance
  onAdd: (distance: RunDistance) => void
  onOpen: (filter: RunFilter) => void
  onRetry: () => void
  /** "Ver ranking": abre o Ranking da corrida na distância escolhida (a do contorno verde). */
  onOpenRanking: (distance: RunDistance) => void
}) {
  return <section aria-label="Suas marcas" data-slot="run-marks" className="px-5">
    <SectionTitle title="Suas marcas" action={<Button variant="link" onClick={() => onOpenRanking(selected)}>Ver ranking</Button>} />
    {loading && !items.length && <p role="status" className="m-0 text-[12px] text-ink-muted">Carregando suas marcas…</p>}
    {error && !items.length && <p role="alert" className="m-0 text-[12px] leading-[1.6] text-error">
      {error} <Button variant="text" className="inline min-h-0 py-0" onClick={onRetry}>Tentar novamente</Button>
    </p>}
    {/* Duas colunas a partir de 360 px; em telas mais estreitas, um cartão por linha, para o nome e o elo não se espremerem. */}
    {items.length > 0 && <div className="grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-2">
      {items.map(card => <Card key={card.distance_km} card={card} selected={card.distance_km === selected} onAdd={onAdd} onOpen={onOpen} />)}
      <button type="button" aria-haspopup="dialog" onClick={() => onOpen('outra')}
        className="min-[360px]:col-span-2 flex min-h-[54px] min-w-0 items-center gap-3 rounded-[16px] border border-dashed border-line-strong bg-transparent px-3.5 py-2.5 text-left text-inherit hover:bg-white/60">
        <span className="grid size-[34px] flex-none place-items-center rounded-[10px] bg-[#005a3612] text-brand"><History size={17} aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <b className="block text-[12px]">Outras distâncias</b>
          <small className="block text-[10px] leading-[1.45] text-ink-muted">Fora de 3, 5, 10, 21 e 42 km, a marca fica só no histórico.</small>
        </span>
        <ChevronRight size={16} aria-hidden="true" className="text-ink-muted" />
      </button>
      <p className="min-[360px]:col-span-2 m-0 flex items-start gap-1.5 text-[10px] leading-[1.5] text-ink-muted">
        <Timer size={13} aria-hidden="true" className="mt-px flex-none" />
        O ranking usa o melhor tempo das últimas 52 semanas de cada distância.
      </p>
    </div>}
  </section>
}
