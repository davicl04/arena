import { useState } from 'react'
import { Shield } from 'lucide-react'
import { sports } from '@/api/client'
import type { Profile, ProfileInput, Sport } from '@/api/client'
import { toast } from '@/components/ui/toast'
import { SportBand } from './SportBand'
import { SportProfileSheet } from './SportProfileSheet'
import { profileSummary, savedTitle } from './profileSteps'

/**
 * Tela "Suas modalidades": sobretítulo "n de 3 ativas", título "Onde você joga?", uma faixa por modalidade (na ordem de
 * `sports`) e o aviso de privacidade. Tocar numa faixa abre a folha passo a passo; no sucesso, a folha fecha, a faixa
 * passa a ativa (o perfil salvo sobe por `onSave`) e o `toast.success` traz o título e o resumo do perfil.
 */
export function SportsProfiles({ profiles, loading, onSave, onExpired }: {
  profiles: Profile[]
  loading: boolean
  onSave: (sport: Sport, input: ProfileInput) => Promise<Profile>
  onExpired: () => void
}) {
  const [open, setOpen] = useState<Sport | null>(null)
  const active = sports.filter(sport => profiles.some(profile => profile.sport === sport.value)).length
  const editing = open ? profiles.find(profile => profile.sport === open) : undefined
  return <>
    {loading ? <p role="status">Carregando modalidades…</p> : <>
      <p className="mt-1.5 text-[10px] font-bold tracking-[0.08em] text-eyebrow uppercase">{active} de {sports.length} ativas</p>
      <h2 className="mt-1 mb-4 text-[22px]">Onde você joga?</h2>
      <div className="grid gap-3">
        {sports.map(sport => <SportBand key={sport.value} sport={sport.value} label={sport.label} description={sport.description}
          profile={profiles.find(profile => profile.sport === sport.value)} onOpen={() => setOpen(sport.value)} />)}
      </div>
    </>}
    <aside className="my-[18px] flex items-start gap-2.5 rounded-control bg-[#005a360c] p-3.5 text-brand noite:bg-brand/5">
      <Shield size={20} />
      <p className="text-[11px] leading-[1.7] text-ink-muted">
        Seus perfis começam privados. Você cuida dos dados da sua trajetória.
      </p>
    </aside>
    {open && <SportProfileSheet key={open} sport={open} profile={editing} onSave={onSave} onExpired={onExpired} onClose={() => setOpen(null)}
      onSaved={(saved, isNew) => {
        setOpen(null)
        toast.success(savedTitle(saved.sport, isNew), { description: profileSummary(saved) })
      }} />}
  </>
}
