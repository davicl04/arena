import { useId, useState } from 'react'
import { Swords } from 'lucide-react'
import { ApiError } from '@/api/client'
import { createSearch } from '@/api/matchmaking'
import type { SearchCreated } from '@/api/matchmaking'
import type { OpenSlots } from '@/api/matches'
import { Sheet } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import type { FootballFormat } from '@/data/arena'
import { cn } from '@/lib/utils'
import { formatChips } from './formatChips'
import { PlateChips } from './PlateChips'
import { SlotSteppers } from './SlotSteppers'
import { darkMint } from './styles'
import { slotTotal } from '@/data/match'
import { emptySlots } from './slots'

interface Problems { general: string; format: string; open_slots: string }
const none: Problems = { general: '', format: '', open_slots: '' }

/**
 * Preparar busca (V2): a folha `forest` que o botão "Encontrar partida" abre no "Com meu time". Escolhe o formato e
 * diz se o time está completo; se não está, abre vagas por posição para avulsos (no máximo um goleiro e o formato
 * menos um). A busca dura 24 h. Os erros do servidor (`422 { detail, fields }`) aparecem no campo que nomeiam.
 * Só o representante chega aqui; o servidor confere de novo.
 */
export function PrepareSearchSheet({ team, eyebrow, format, onFormat, hint, onCreated, onClose, onExpired }: {
  team: { id: number; name: string }
  /** "Ferrugem FC · Prata": o time e o elo no formato. */
  eyebrow: string
  format: FootballFormat
  onFormat: (format: FootballFormat) => void
  /** "Times de Brasília Bronze, Prata ou Ouro": quem a busca encontra. */
  hint: string
  onCreated: (created: SearchCreated) => void
  onClose: () => void
  onExpired: () => void
}) {
  const ids = useId()
  const [complete, setComplete] = useState(true)
  const [slots, setSlots] = useState<OpenSlots>(emptySlots)
  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState<Problems>(none)
  const total = slotTotal(slots)
  const open = !complete
  const blocked = open && total === 0

  async function submit() {
    setBusy(true)
    setProblems(none)
    try {
      onCreated(await createSearch({
        sport: 'futebol', team_id: team.id, format, team_complete: complete, open_slots: complete ? null : slots,
      }))
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      const next = { ...none }
      const fields = cause instanceof ApiError ? cause.fields : []
      for (const field of fields) {
        if (field.field === 'open_slots') next.open_slots = field.message
        else if (field.field === 'format') next.format = field.message
      }
      if (!next.open_slots && !next.format)
        next.general = cause instanceof Error && cause.message ? cause.message : 'Não foi possível iniciar a busca.'
      setProblems(next)
    } finally {
      setBusy(false)
    }
  }

  return <Sheet title="Preparar busca" eyebrow={eyebrow} tone="dark" onClose={onClose}>
    <div className="grid gap-2 border-t border-solid border-white/8 py-3">
      <span id={`${ids}-format`} className="text-[10px] font-bold tracking-[0.08em] text-white/60 uppercase">Formato da partida</span>
      <PlateChips variant="segmented" label="Formato da partida" options={formatChips} value={format} onChange={onFormat} disabled={busy}
        itemClassName="h-auto min-h-10 flex-col gap-0 leading-[1.2]" />
      {problems.format && <p role="alert" className="m-0 text-[11.5px] leading-normal text-danger-soft">{problems.format}</p>}
    </div>
    <div className="flex items-center gap-3 border-t border-solid border-white/8 py-3">
      <span className="min-w-0 flex-1">
        <b id={`${ids}-complete`} className="block text-[12.5px]">O time está completo?</b>
        <small id={`${ids}-complete-hint`} className="mt-0.5 text-[10.5px] leading-normal text-white/65">Desligue para abrir vagas para atletas avulsos</small>
      </span>
      <Switch size="lg" checked={complete} onCheckedChange={setComplete} disabled={busy}
        aria-labelledby={`${ids}-complete`} aria-describedby={`${ids}-complete-hint`} />
    </div>
    {open && <div className="grid gap-2 border-t border-solid border-white/8 py-3">
      <SlotSteppers format={format} value={slots} onChange={setSlots} disabled={busy} error={problems.open_slots} />
    </div>}
    <p className="m-0 mt-1 mb-3.5 text-[10.5px] leading-[1.55] text-white/65">
      {hint}. A busca dura 24 h.{open ? ' As vagas abrem para avulsos assim que a partida for agendada.' : ''}
    </p>
    {problems.general && <p role="alert" className="m-0 mb-3 text-[11.5px] leading-normal text-danger-soft">{problems.general}</p>}
    <button type="button" className={cn(darkMint, 'w-full flex-none disabled:opacity-45')} disabled={busy || blocked} aria-describedby={blocked ? `${ids}-blocked` : undefined}
      onClick={() => void submit()}>
      <Swords size={17} aria-hidden="true" />{busy ? 'Buscando…' : `Buscar adversário${open && total ? ` · ${total} ${total === 1 ? 'vaga' : 'vagas'}` : ''}`}
    </button>
    {blocked && <p id={`${ids}-blocked`} className="m-0 mt-2 text-center text-[10.5px] text-white/65">Abra ao menos uma vaga ou marque o time como completo.</p>}
  </Sheet>
}
