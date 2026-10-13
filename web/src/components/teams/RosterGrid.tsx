import { useState } from 'react'
import type { ReactNode } from 'react'
import type { TeamMember } from '@/api/teams'
import { LoadError } from '@/components/ui/load-error'
import { SectionTitle } from '@/components/ui/section-title'
import { positionShort } from '@/data/arena'
import { MemberFace } from './MemberFace'
import { positionLabel, ROSTER_LIMIT } from './teamView'

/**
 * Elenco em grade de rostos (E1): braçadeira "C" nos representantes, primeiro nome e posição. Acima de 11 atletas,
 * o "+N" mostra todos. Tocar num rosto abre a folha do atleta.
 */
export function RosterGrid({ members, loading, error, errorCause, onRetry, onOpen, action }: {
  members: TeamMember[]
  loading: boolean
  error: string
  /** O erro lançado ao carregar o elenco (para reconhecer a falta de conexão). */
  errorCause?: unknown
  onRetry: () => void
  onOpen: (member: TeamMember) => void
  /** Ação do título (Convidar, para representantes). */
  action?: ReactNode
}) {
  const [all, setAll] = useState(false)
  const shown = all ? members : members.slice(0, ROSTER_LIMIT)
  const hidden = members.length - shown.length
  return <section aria-labelledby="roster-title">
    <SectionTitle title={<span id="roster-title">Elenco{members.length ? ` · ${members.length}` : ''}</span>} action={action} className="mt-[22px] mb-2.5" />
    <div className="rounded-card bg-white shadow-card">
      {loading ? <p role="status" className="px-3.5 py-6 text-center text-[12px] text-ink-muted">Carregando elenco…</p>
        : error ? <LoadError size="section" title="Não foi possível carregar o elenco" text={error} cause={errorCause} onRetry={onRetry} />
        : <ul className="m-0 grid list-none grid-cols-4 gap-x-1.5 gap-y-3 px-2.5 py-3.5">
          {shown.map(member => {
            const representative = member.role === 'representante'
            const label = [member.name, positionLabel(member.position), representative ? 'Representante' : null, member.is_me ? 'você' : null].filter(Boolean).join(' · ')
            return <li key={member.user_id} className="min-w-0">
              <button type="button" aria-label={label} onClick={() => onOpen(member)}
                className="grid w-full min-w-0 justify-items-center gap-1 rounded-xl border-0 bg-transparent p-0 text-center text-[10.5px] font-semibold text-ink">
                <MemberFace name={member.name} avatarUrl={member.avatar_url} representative={representative} size="grid" />
                <span className="max-w-full truncate">{member.is_me ? 'Você' : member.first_name}</span>
                <span className="min-h-3 font-display text-[8.5px] font-extrabold tracking-[0.06em] text-ink-muted">{member.position ? positionShort[member.position] : ''}</span>
              </button>
            </li>
          })}
          {hidden > 0 && <li className="min-w-0">
            <button type="button" aria-label={`Ver todos os ${members.length} atletas`} onClick={() => setAll(true)}
              className="grid w-full justify-items-center gap-1 border-0 bg-transparent p-0 text-[10.5px] font-semibold text-ink">
              <span className="grid size-11 place-items-center rounded-full bg-subtle font-display text-[12px] font-extrabold">+{hidden}</span>
              Ver todos
            </button>
          </li>}
        </ul>}
    </div>
  </section>
}
