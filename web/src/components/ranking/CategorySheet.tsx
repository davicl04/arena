import type { ReactNode } from 'react'
import type { Position, Profile } from '@/api/client'
import { sports } from '@/api/client'
import SportIcon from '@/components/SportIcon'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Sheet } from '@/components/ui/sheet'
import { footballFormats, positionOptions, runDistances } from '@/data/arena'
import type { FootballFormat, RunDistance } from '@/data/arena'
import { cn } from '@/lib/utils'
import { activeSports } from './category'
import type { RankingCategory, RankingKind } from './category'

const kinds: readonly { value: RankingKind; label: string }[] = [
  { value: 'time', label: 'Times' },
  { value: 'individual', label: 'Individual' },
]

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="mt-3.5 grid gap-[7px]">
      <span aria-hidden="true" className="text-[10.5px] font-bold tracking-[0.08em] text-ink-muted uppercase">{label}</span>
      {children}
    </div>
  )
}

/**
 * Folha "Categoria do ranking": a modalidade em blocos com ícone (só as de perfil ativo; com uma só, o bloco some e a
 * folha diz que ela é a única), Times | Individual, o formato e a posição (futebol) ou a distância (corrida). A escolha
 * vale na hora; "Ver ranking" fecha a folha.
 */
export function CategorySheet({ profiles, category, onChange, onClose }: {
  profiles: readonly Profile[]
  category: RankingCategory
  onChange: (change: Partial<RankingCategory>) => void
  onClose: () => void
}) {
  const active = activeSports(profiles)
  const only = active.length === 1 ? sports.find(item => item.value === active[0]) : undefined
  return (
    <Sheet title="Categoria do ranking" onClose={onClose}>
      {active.length > 1 && (
        <Group label="Modalidade">
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${active.length}, minmax(0, 1fr))` }}>
            {active.map(sport => {
              const item = sports.find(candidate => candidate.value === sport)
              const selected = category.sport === sport
              return (
                <button key={sport} type="button" aria-pressed={selected} onClick={() => onChange({ sport })}
                  className={cn('grid min-w-0 justify-items-center gap-1.5 rounded-card border border-solid px-1.5 pt-3 pb-2.5 text-[12px] font-semibold',
                    selected ? 'border-brand bg-success-bg text-forest shadow-[inset_0_0_0_1px_var(--color-brand)]' : 'border-line bg-white text-ink')}>
                  <SportIcon sport={sport} size={34} />
                  <span className="max-w-full truncate">{item?.label}</span>
                </button>
              )
            })}
          </div>
        </Group>
      )}
      {only && (
        <p className="mt-3 mb-0 flex items-center gap-2 text-[12px] leading-normal text-ink-muted">
          <SportIcon sport={only.value} size={22} />
          <span>{only.label} é a sua única modalidade ativa</span>
        </p>
      )}
      {category.sport === 'futebol' && (
        <>
          <Group label="Tipo de ranking">
            <div className="grid grid-cols-2 gap-[3px] rounded-[12px] bg-[#49505714] p-[3px]">
              {kinds.map(item => (
                <button key={item.value} type="button" aria-pressed={category.kind === item.value} onClick={() => onChange({ kind: item.value })}
                  className={cn('min-h-9 rounded-[9px] border-0 text-[12px] font-semibold', category.kind === item.value ? 'bg-white text-forest shadow-soft' : 'bg-transparent text-ink-muted')}>
                  {item.label}
                </button>
              ))}
            </div>
          </Group>
          <Group label="Formato">
            <div className="flex flex-wrap gap-[7px]">
              {footballFormats.map(item => (
                <Chip key={item.value} aria-pressed={category.format === item.value} onClick={() => onChange({ format: item.value as FootballFormat })}>
                  {item.label} {item.size}
                </Chip>
              ))}
            </div>
          </Group>
          {category.kind === 'individual' && (
            <Group label="Posição">
              <div className="flex flex-wrap gap-[7px]">
                {positionOptions.map(item => (
                  <Chip key={item.value} aria-pressed={category.position === item.value} onClick={() => onChange({ position: item.value as Position })}>
                    {item.label}
                  </Chip>
                ))}
              </div>
            </Group>
          )}
        </>
      )}
      {category.sport === 'corrida' && (
        <Group label="Distância">
          <div className="flex flex-wrap gap-[7px]">
            {runDistances.map(item => (
              <Chip key={item.value} aria-pressed={category.distance === item.value} onClick={() => onChange({ distance: item.value as RunDistance })}>
                {item.label}
              </Chip>
            ))}
          </div>
        </Group>
      )}
      <Button type="button" className="mt-5 w-full" onClick={onClose}>Ver ranking</Button>
    </Sheet>
  )
}
