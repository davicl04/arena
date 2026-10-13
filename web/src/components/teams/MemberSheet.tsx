import { useState } from 'react'
import { LogOut, ShieldCheck, ShieldOff, User, UserMinus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ApiError } from '@/api/client'
import { removeMember, updateMember } from '@/api/teams'
import type { TeamCard, TeamMember } from '@/api/teams'
import { Sheet } from '@/components/ui/sheet'
import { useSubmit } from '@/hooks/useSubmit'
import { cn } from '@/lib/utils'
import { monthYear } from '@/utils/relativeTime'
import { ConfirmBox as Confirm } from './ConfirmBox'
import { MemberFace } from './MemberFace'
import { positionLabel } from './teamView'

function SheetAction({ Icon, label, hint, danger = false, disabled = false, onClick }: {
  Icon: LucideIcon
  label: string
  hint?: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return <button type="button" disabled={disabled} onClick={onClick}
    className={cn('flex min-h-[52px] w-full items-center gap-3 border-0 border-b border-solid border-line bg-transparent px-0.5 py-2 text-left text-[13px] font-semibold disabled:opacity-50',
      danger ? 'text-danger' : 'text-ink')}>
    <Icon size={19} aria-hidden="true" className={danger ? 'text-danger' : 'text-brand'} />
    <span className="min-w-0 flex-1">{label}{hint && <small className="mt-px text-[10.5px] font-medium text-ink-muted">{hint}</small>}</span>
  </button>
}

/**
 * Folha do atleta (E1): ver perfil; para representantes, tornar representante ou tirar a braçadeira e remover do time
 * (com confirmação); para o próprio atleta, sair do time. O time precisa de pelo menos um representante: a folha já
 * avisa quando a braçadeira é a última, e o servidor tem a palavra final (o erro dele aparece num toast).
 */
export function MemberSheet({ team, member, viewerIsRepresentative, onClose, onOpenProfile, onChanged, onRemoved, onStale, onExpired }: {
  team: TeamCard
  member: TeamMember
  viewerIsRepresentative: boolean
  onClose: () => void
  onOpenProfile: (userId: number) => void
  /** Papel alterado: devolve o atleta atualizado e a mensagem para o aviso da página. */
  onChanged: (member: TeamMember, message: string) => void
  /** Atleta removido (ou o próprio titular saiu). */
  onRemoved: (member: TeamMember, message: string) => void
  /** O servidor recusou por estado desatualizado (409/404): a página recarrega o time, e a mensagem do servidor aparece num aviso. */
  onStale?: () => void
  onExpired: () => void
}) {
  const [confirm, setConfirm] = useState<'remove' | 'leave' | null>(null)
  const { busy, run } = useSubmit(onExpired)
  const representative = member.role === 'representante'
  const lastRepresentative = representative && team.representative_count <= 1
  const firstName = member.is_me ? 'Você' : member.first_name

  /** Executa a ação; um 409/404 indica que o elenco mudou desde a leitura, e a página recarrega. */
  async function attempt<T>(action: () => Promise<T>, fallback: string) {
    let stale = false
    const result = await run(async () => {
      try { return await action() } catch (cause) {
        stale = cause instanceof ApiError && (cause.status === 409 || cause.status === 404)
        throw cause
      }
    }, fallback)
    if (result === undefined && stale) onStale?.()
    return result
  }
  async function toggleRole() {
    const role = representative ? 'membro' : 'representante'
    const updated = await attempt(() => updateMember(team.id, member.user_id, { role }), 'Não foi possível mudar a braçadeira.')
    if (updated) onChanged(updated, representative
      ? `${member.is_me ? 'Você deixou de ser representante' : `${member.first_name} deixou de ser representante`}.`
      : `${member.first_name} agora é representante do ${team.name}.`)
  }
  async function remove() {
    const done = await attempt(async () => { await removeMember(team.id, member.user_id); return true }, member.is_me ? 'Não foi possível sair do time.' : 'Não foi possível remover o atleta.')
    if (done) onRemoved(member, member.is_me ? `Você saiu do ${team.name}.` : `${member.name} foi removido do ${team.name}.`)
  }

  return <Sheet title={member.name} onClose={() => { if (!busy) onClose() }}>
    <div className="mt-1 flex items-center gap-3">
      <MemberFace name={member.name} avatarUrl={member.avatar_url} representative={representative} size="sheet" />
      <div className="min-w-0">
        <small className="text-[11px] text-ink-muted">@{member.username}</small>
        <small className="mt-0.5 text-[11px] text-ink-muted">{positionLabel(member.position)} · no time desde {monthYear(member.joined_at)}</small>
        <small className="mt-0.5 text-[11px] font-semibold text-ink">{representative ? 'Representante' : 'Membro'}</small>
      </div>
    </div>
    <div className="mt-3.5 grid border-t border-solid border-line">
      {!member.is_me && <SheetAction Icon={User} label="Ver perfil" onClick={() => onOpenProfile(member.user_id)} />}
      {viewerIsRepresentative && (representative
        ? <SheetAction Icon={ShieldOff} label="Tirar a braçadeira de representante" disabled={busy || lastRepresentative}
          hint={lastRepresentative ? 'O time precisa de pelo menos um representante.' : 'Continua no elenco como membro.'} onClick={() => void toggleRole()} />
        : <SheetAction Icon={ShieldCheck} label="Tornar representante" disabled={busy}
          hint="Convida atletas, aprova pedidos e gere o elenco." onClick={() => void toggleRole()} />)}
      {viewerIsRepresentative && !member.is_me && <SheetAction Icon={UserMinus} label="Remover do time" danger disabled={busy} onClick={() => setConfirm('remove')} />}
      {member.is_me && <SheetAction Icon={LogOut} label="Sair do time" danger disabled={busy || lastRepresentative}
        hint={lastRepresentative ? 'Passe a braçadeira a outro atleta antes de sair, ou encerre o time em Editar time.' : undefined} onClick={() => setConfirm('leave')} />}
    </div>
    {confirm === 'remove' && <Confirm confirmLabel="Remover" busy={busy} onConfirm={() => void remove()} onCancel={() => setConfirm(null)}>
      <b>Remover {member.name} do {team.name}?</b><br />O histórico de partidas com o time continua registrado. Para voltar, {firstName} precisa de um novo convite.
    </Confirm>}
    {confirm === 'leave' && <Confirm confirmLabel="Sair do time" busy={busy} onConfirm={() => void remove()} onCancel={() => setConfirm(null)}>
      <b>Sair do {team.name}?</b><br />Seu histórico com o time continua registrado. Para voltar, é preciso um novo convite ou pedido.
    </Confirm>}
  </Sheet>
}
