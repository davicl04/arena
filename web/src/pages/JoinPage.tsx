import { useEffect, useState } from 'react'
import { Clock, Info, Link2Off, SendHorizontal } from 'lucide-react'
import { ApiError } from '@/api/client'
import { cancelJoinRequest, joinPreview, requestJoin } from '@/api/teams'
import type { JoinPreview, TeamCard } from '@/api/teams'
import { teamButton } from '@/components/teams/styles'
import { TeamIdCard } from '@/components/teams/TeamIdCard'
import { DarkTopBar, TeamsPlate } from '@/components/teams/TeamsPlate'
import { athletes } from '@/components/teams/teamView'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { feedbackVariants } from '@/components/ui/feedback'
import { useSubmit } from '@/hooks/useSubmit'
import { cn } from '@/lib/utils'

const tip = 'mt-4 flex items-start gap-2.5 rounded-[14px] bg-mint/12 p-3 text-[11px] leading-[1.5] text-ink'

/**
 * Entrar no time pelo link (`/entrar/{token}`): a carteirinha do time e "Pedir para entrar"; depois, "Pedido enviado ·
 * aguardando um representante". Link trocado ou de time encerrado: "Este link não vale mais". Quem já é membro vê o
 * aviso e segue para Meus times; quem tem convite do time responde por lá.
 */
export default function JoinPage({ token, onClose, onOpenTeams, onExpired }: {
  token: string
  onClose: () => void
  /** Meus times, com o time no carrossel (ou a folha de convites). */
  onOpenTeams: (team: TeamCard, invites?: boolean) => void
  onExpired: () => void
}) {
  const [preview, setPreview] = useState<JoinPreview | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const action = useSubmit(onExpired)

  useEffect(() => {
    let alive = true
    joinPreview(token).then(value => { if (alive) { setPreview(value); setLoadError('') } }).catch((cause: unknown) => {
      if (!alive) return
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      if (cause instanceof ApiError && cause.status === 404) setInvalid(true)
      else setLoadError(cause instanceof Error ? cause.message : 'Não foi possível abrir o link do time.')
    })
    return () => { alive = false }
  }, [token, attempt, onExpired])

  async function ask() {
    let stale = false
    const created = await action.run(async () => {
      try { return await requestJoin(token) } catch (cause) {
        // Já no elenco, convite pendente ou link trocado: a tela confere de novo o estado atual.
        stale = cause instanceof ApiError && (cause.status === 409 || cause.status === 404)
        throw cause
      }
    }, 'Não foi possível enviar o pedido.')
    if (created && preview) setPreview({ ...preview, my_status: 'pedido_pendente', request_id: created.id })
    else if (stale) setAttempt(n => n + 1)
  }
  async function cancel() {
    if (!preview?.request_id) return
    const requestId = preview.request_id
    let stale = false
    const done = await action.run(async () => {
      try { await cancelJoinRequest(requestId); return true } catch (cause) {
        // Pedido já decidido por um representante (ou cancelado em outro lugar): confere o estado atual do link.
        stale = cause instanceof ApiError && (cause.status === 404 || cause.status === 409)
        throw cause
      }
    }, 'Não foi possível cancelar o pedido.')
    if (done) setPreview({ ...preview, my_status: 'disponivel', request_id: null })
    else if (stale) setAttempt(n => n + 1)
  }

  const team = preview?.team
  const status = preview?.my_status
  const top = <DarkTopBar eyebrow="Convite por link" title={invalid ? 'Link sem validade' : 'Entrar no time'} icon="close" onBack={onClose} />

  if (invalid) {
    return <section aria-label="Entrar no time" className="min-h-full">
      <TeamsPlate className="pb-5">{top}</TeamsPlate>
      <div className="px-4 pt-4">
        <div className="rounded-panel bg-white">
          <EmptyState Icon={Link2Off} title="Este link não vale mais"
            text="Um representante gerou outro link ou o time foi encerrado. Peça o link novo a um representante do time." />
        </div>
      </div>
    </section>
  }
  if (!preview || !team) {
    return <section aria-label="Entrar no time" className="min-h-full">
      <TeamsPlate className="pb-5">{top}</TeamsPlate>
      <div className="px-4 pt-4">
        {loadError
          ? <div className={feedbackVariants()} role="alert">{loadError} <Button variant="text" onClick={() => setAttempt(n => n + 1)}>Tentar novamente</Button></div>
          : <p role="status" className="text-[12px] text-ink-muted">Abrindo o link do time…</p>}
      </div>
    </section>
  }

  const actions = status === 'pedido_pendente'
    ? <div className="grid w-full gap-1.5">
      <span className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-[11px] bg-mint/15 px-3 text-[11px] font-bold text-mint [&_svg]:size-4">
        <Clock aria-hidden="true" />Pedido enviado · aguardando um representante
      </span>
      <button type="button" className="min-h-8 border-0 bg-transparent text-[11px] font-bold text-white/66 underline" disabled={action.busy} onClick={() => void cancel()}>Cancelar pedido</button>
    </div>
    : status === 'disponivel'
      ? <button type="button" className={cn(teamButton({ size: 'md' }), 'w-full')} disabled={action.busy} onClick={() => void ask()}>
        <SendHorizontal aria-hidden="true" />{action.busy ? 'Enviando…' : 'Pedir para entrar'}
      </button>
      : <button type="button" className={cn(teamButton({ size: 'md' }), 'w-full')} onClick={() => onOpenTeams(team, status === 'convite_pendente')}>
        {status === 'membro' ? 'Abrir Meus times' : 'Ver o convite em Meus times'}
      </button>

  return <section aria-label="Entrar no time" className="min-h-full">
    <TeamsPlate className="pb-4">
      {top}
      <div className="px-4 pt-3">
        <TeamIdCard team={{ ...team, my_role: null }} highlight badge="Link do time" line={`${team.city.name} · ${athletes(team.member_count)}`} actions={actions} />
      </div>
    </TeamsPlate>
    <div className="px-4">
      {/* O pedido enviado já aparece na carteirinha; o aviso falado repete para leitores de tela. */}
      <p role="status" aria-live="polite" className={cn(status === 'membro' || status === 'convite_pendente' ? feedbackVariants({ tone: 'success' }) : 'sr-only')}>
        {status === 'pedido_pendente' ? 'Pedido enviado · aguardando um representante.'
          : status === 'membro' ? `Você já está no elenco do ${team.name}.`
          : status === 'convite_pendente' ? `Você já tem um convite do ${team.name}. Responda em Meus times.` : ''}
      </p>
      {action.error && <p className={feedbackVariants()} role="alert">{action.error}</p>}
      {(status === 'disponivel' || status === 'pedido_pendente') && <p className={tip}>
        <Info size={16} className="mt-px flex-none text-brand" aria-hidden="true" />
        <span>Um representante do {team.name} aprova seu pedido, e a resposta chega nas notificações. Se aprovado, você entra no elenco como membro, e sua posição preferida do futebol aparece no elenco.</span>
      </p>}
    </div>
  </section>
}
