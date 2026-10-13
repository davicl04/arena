import { useCallback, useEffect, useRef, useState } from 'react'
import { QrCode, Shield, UserPlus, Users } from 'lucide-react'
import { ApiError } from '@/api/client'
import {
  cancelInvite, decideJoinRequest, joinRequests, myInvites, myTeams, removeMember, sentInvites, teamMembers,
} from '@/api/teams'
import type { JoinRequest, TeamCard, TeamInviteReceived, TeamInviteSent, TeamMember } from '@/api/teams'
import { ConfirmBox } from '@/components/teams/ConfirmBox'
import { InviteSheet } from '@/components/teams/InviteSheet'
import { InviteStrip } from '@/components/teams/InviteStrip'
import { MemberSheet } from '@/components/teams/MemberSheet'
import { RosterGrid } from '@/components/teams/RosterGrid'
import { teamButton } from '@/components/teams/styles'
import { TeamCardCarousel } from '@/components/teams/TeamCardCarousel'
import { JoinRequestsList, SentInvitesList } from '@/components/teams/TeamRequestLists'
import { DarkTopBar, TeamsPlate } from '@/components/teams/TeamsPlate'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadError } from '@/components/ui/load-error'
import { Sheet } from '@/components/ui/sheet'
import { toast } from '@/components/ui/toast'
import { isStale, reportActionError, useSubmit } from '@/hooks/useSubmit'
import { cn } from '@/lib/utils'

type SheetState = { kind: 'member'; member: TeamMember } | { kind: 'invites' } | { kind: 'leave'; team: TeamCard } | null
interface RosterState { teamId: number; items: TeamMember[]; error: string; cause: unknown }
interface RepresentativeLists { teamId: number; requests: JoinRequest[]; invites: TeamInviteSent[] }
/** Falha de carregamento (nunca de ação): a mensagem e o erro lançado, para o `LoadError` reconhecer a falta de conexão. */
interface LoadFailure { message: string; cause: unknown }
interface ListsFailure extends LoadFailure { teamId: number }

const messageOf = (cause: unknown, fallback: string) => cause instanceof Error && cause.message ? cause.message : fallback

/**
 * Meus times (M3 + C5 + E1 + R2): placa escura com a faixa de convites e o carrossel de carteirinhas; abaixo, o elenco
 * do cartão centralizado e, para representantes, os pedidos para entrar e os convites enviados. Só dados reais: sem
 * time, o estado vazio leva a Criar time.
 */
export default function TeamsPage({ viewerId, selectedTeamId, openInvites = false, onInvitesOpened, showRequests = false, onRequestsShown, onSelectTeam, onBack, onCreate, onEdit, onInvite, onLink, onOpenUser, onExpired }: {
  viewerId: number
  /** Time do cartão centralizado (guardado na pilha de navegação para voltar ao mesmo cartão). */
  selectedTeamId?: number
  /** Abre já a folha de convites (notificação de convite). */
  openInvites?: boolean
  /** Consome o pedido de abrir a folha, para ela não reabrir ao voltar. */
  onInvitesOpened?: () => void
  /** Rola até "Pedidos para entrar" do time selecionado (notificação de pedido). */
  showRequests?: boolean
  /** Consome o pedido de rolagem, para ela não se repetir ao voltar. */
  onRequestsShown?: () => void
  onSelectTeam: (teamId: number) => void
  onBack: () => void
  onCreate: () => void
  onEdit: (team: TeamCard) => void
  onInvite: (team: TeamCard) => void
  onLink: (team: TeamCard) => void
  onOpenUser: (userId: number) => void
  onExpired: () => void
}) {
  const [teams, setTeams] = useState<TeamCard[] | null>(null)
  const [loadFailure, setLoadFailure] = useState<LoadFailure | null>(null)
  const [invites, setInvites] = useState<TeamInviteReceived[]>([])
  const [invitesFailure, setInvitesFailure] = useState<LoadFailure | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [roster, setRoster] = useState<RosterState | null>(null)
  const [rosterAttempt, setRosterAttempt] = useState(0)
  const [lists, setLists] = useState<RepresentativeLists | null>(null)
  const [sheet, setSheet] = useState<SheetState>(openInvites ? { kind: 'invites' } : null)
  const [listsFailure, setListsFailure] = useState<ListsFailure | null>(null)
  const [busyItem, setBusyItem] = useState<number | null>(null)
  const leave = useSubmit(onExpired)
  const requestsRef = useRef<HTMLDivElement>(null)

  const fail = useCallback((cause: unknown) => {
    if (cause instanceof ApiError && cause.status === 401) onExpired()
  }, [onExpired])
  useEffect(() => {
    if (openInvites) onInvitesOpened?.()
  }, [openInvites, onInvitesOpened])

  // Times e convites recebidos; recarregados depois de cada mudança de elenco.
  useEffect(() => {
    let alive = true
    myTeams().then(items => { if (alive) { setTeams(items); setLoadFailure(null) } })
      .catch((cause: unknown) => { if (alive) { fail(cause); setLoadFailure({ message: messageOf(cause, 'Não foi possível carregar seus times.'), cause }) } })
    myInvites().then(items => { if (alive) { setInvites(items); setInvitesFailure(null) } })
      .catch((cause: unknown) => { if (alive) { fail(cause); setInvitesFailure({ message: messageOf(cause, 'Não foi possível carregar os convites recebidos.'), cause }) } })
    return () => { alive = false }
  }, [attempt, fail])
  const reload = () => setAttempt(n => n + 1)

  const selected = teams?.find(team => team.id === selectedTeamId) ?? teams?.[0] ?? null
  const representative = selected?.my_role === 'representante'

  // Elenco completo do time selecionado (a carteirinha só traz a prévia de 11).
  const selectedId = selected?.id
  useEffect(() => {
    if (selectedId === undefined) return
    let alive = true
    teamMembers(selectedId).then(items => { if (alive) setRoster({ teamId: selectedId, items, error: '', cause: null }) })
      .catch((cause: unknown) => { if (alive) { fail(cause); setRoster({ teamId: selectedId, items: [], error: messageOf(cause, 'Não foi possível carregar o elenco.'), cause }) } })
    return () => { alive = false }
  }, [selectedId, attempt, rosterAttempt, fail])

  // Pedidos para entrar e convites enviados, só para representantes (contadores zerados dispensam a consulta).
  const wantsRequests = representative && selected?.pending_join_requests !== 0
  const wantsInvites = representative && selected?.pending_invites !== 0
  useEffect(() => {
    if (selectedId === undefined || (!wantsRequests && !wantsInvites)) return
    let alive = true
    Promise.all([wantsRequests ? joinRequests(selectedId) : [], wantsInvites ? sentInvites(selectedId) : []])
      .then(([requests, invites]) => { if (alive) { setLists({ teamId: selectedId, requests, invites }); setListsFailure(null) } })
      .catch((cause: unknown) => { if (alive) { fail(cause); setListsFailure({ teamId: selectedId, message: messageOf(cause, 'Não foi possível carregar pedidos e convites.'), cause }) } })
    return () => { alive = false }
  }, [selectedId, wantsRequests, wantsInvites, attempt, fail])

  // Ao recarregar o mesmo time, o elenco anterior continua na tela até a resposta chegar.
  const currentRoster = roster && roster.teamId === selectedId ? roster : null
  const members = currentRoster?.items ?? []
  const currentListsFailure = listsFailure && listsFailure.teamId === selectedId ? listsFailure : null
  const currentLists = (wantsRequests || wantsInvites) && lists && lists.teamId === selectedId ? lists : null

  // Notificação de pedido: depois de carregar as listas, leva a "Pedidos para entrar" (sem pedidos, só consome).
  const requestsReady = Boolean(teams) && (!wantsRequests || currentLists !== null)
  useEffect(() => {
    if (!showRequests || !requestsReady) return
    if (currentLists?.requests.length) requestsRef.current?.scrollIntoView?.({ block: 'start' })
    onRequestsShown?.()
  }, [showRequests, requestsReady, currentLists, onRequestsShown])

  async function decide(request: JoinRequest, decision: 'aprovar' | 'recusar') {
    setBusyItem(request.id)
    try {
      await decideJoinRequest(request.id, decision)
      setLists(old => old && { ...old, requests: old.requests.filter(item => item.id !== request.id) })
      toast.success(decision === 'aprovar' ? `${request.requester.name} entrou no elenco.` : `Pedido de ${request.requester.name} recusado.`)
      if (decision === 'aprovar') reload()
    } catch (cause) {
      reportActionError(cause, 'Não foi possível responder ao pedido.', onExpired)
      if (isStale(cause)) reload()
    } finally { setBusyItem(null) }
  }
  async function cancel(invite: TeamInviteSent) {
    setBusyItem(invite.id)
    try {
      await cancelInvite(invite.id)
      setLists(old => old && { ...old, invites: old.invites.filter(item => item.id !== invite.id) })
      toast.success(`Convite para ${invite.invitee.name} cancelado.`)
    } catch (cause) {
      reportActionError(cause, 'Não foi possível cancelar o convite.', onExpired)
      if (isStale(cause)) reload()
    } finally { setBusyItem(null) }
  }
  async function leaveTeam(team: TeamCard) {
    const done = await leave.run(async () => { await removeMember(team.id, viewerId); return true }, 'Não foi possível sair do time.')
    if (done) { setSheet(null); toast.success(`Você saiu do ${team.name}.`); reload() }
  }

  if (!teams) {
    return <section aria-label="Meus times" className="min-h-full">
      <TeamsPlate className="pb-6"><DarkTopBar eyebrow="Jogar" title="Meus times" onBack={onBack} /></TeamsPlate>
      <div className="px-4 pt-4">
        {loadFailure
          ? <LoadError size="screen" title="Não foi possível carregar seus times" text={loadFailure.message} cause={loadFailure.cause} onRetry={reload} />
          : <p role="status" className="text-[12px] text-ink-muted">Carregando seus times…</p>}
      </div>
    </section>
  }

  return <section aria-label="Meus times" className="min-h-full">
    {/* Sem time, o carrossel teria só o quadro "Criar time", repetindo o estado vazio abaixo: a placa fica só com o título. */}
    <TeamsPlate className={cn(!teams.length && 'pb-6')}>
      <DarkTopBar eyebrow="Jogar" title="Meus times" onBack={onBack} />
      <InviteStrip invites={invites} onOpen={() => setSheet({ kind: 'invites' })} />
      {teams.length > 0 && <TeamCardCarousel teams={teams} selectedId={selected?.id ?? null} onSelect={onSelectTeam} onCreate={onCreate}
        onInvite={onInvite} onLink={onLink} onEdit={onEdit} onLeave={team => setSheet({ kind: 'leave', team })} />}
    </TeamsPlate>

    <div className="px-4">
      {invitesFailure && <LoadError size="section" title="Não foi possível carregar os convites" text={invitesFailure.message} cause={invitesFailure.cause} onRetry={reload} />}
      {currentListsFailure && <LoadError size="section" title="Não foi possível carregar pedidos e convites" text={currentListsFailure.message} cause={currentListsFailure.cause} onRetry={reload} />}
      {!selected
        ? <EmptyState Icon={Shield} title="Você ainda não tem time"
          text="Crie um time e convide o elenco, ou aceite o convite de um representante. Um atleta pode estar em vários times."
          action={<Button className="mt-4" onClick={onCreate}>Criar time</Button>} />
        : <>
          <RosterGrid key={selected.id} members={members} loading={!currentRoster} error={currentRoster?.error ?? ''} errorCause={currentRoster?.cause}
            onRetry={() => setRosterAttempt(n => n + 1)} onOpen={member => setSheet({ kind: 'member', member })}
            action={representative ? <Button variant="link" className="text-[11px]" onClick={() => onInvite(selected)}>Convidar</Button> : undefined} />
          {representative && selected.member_count <= 1 && <div className="mt-3 flex gap-3 surface rounded-card p-3.5 shadow-[inset_0_0_0_1.5px_var(--color-mint),0_3px_12px_#0000000d] noite:shadow-[inset_0_0_0_1.5px_var(--color-mint)]">
            <Users size={22} className="flex-none text-brand" aria-hidden="true" />
            <div className="min-w-0 flex-1 text-[12.5px] text-ink">
              <b className="block">Seu time só tem você</b>
              <small className="mt-0.5 mb-2.5 text-[11px] leading-[1.45] text-ink-muted">Convide o elenco por nome ou mande o link do time no grupo.</small>
              <div className="flex gap-2 *:flex-1">
                <button type="button" className={teamButton({ tone: 'brand' })} onClick={() => onInvite(selected)}><UserPlus aria-hidden="true" />Convidar</button>
                <button type="button" className={teamButton({ tone: 'outline' })} onClick={() => onLink(selected)}><QrCode aria-hidden="true" />Link e QR</button>
              </div>
            </div>
          </div>}
          {currentLists && <div ref={requestsRef} className="scroll-mt-3">
            <JoinRequestsList requests={currentLists.requests} busyId={busyItem} onDecide={(request, decision) => void decide(request, decision)} onOpenLink={() => onLink(selected)} />
            <SentInvitesList invites={currentLists.invites} busyId={busyItem} onCancel={invite => void cancel(invite)} onInvite={() => onInvite(selected)} />
          </div>}
        </>}
    </div>

    {sheet?.kind === 'member' && selected && <MemberSheet team={selected} member={sheet.member} viewerIsRepresentative={representative}
      onClose={() => setSheet(null)} onStale={reload} onOpenProfile={userId => { setSheet(null); onOpenUser(userId) }} onExpired={onExpired}
      onChanged={(member, message) => {
        setRoster(old => old && { ...old, items: old.items.map(item => item.user_id === member.user_id ? member : item) })
        setSheet(null); toast.success(message); reload()
      }}
      onRemoved={(member, message) => {
        setRoster(old => old && { ...old, items: old.items.filter(item => item.user_id !== member.user_id) })
        setSheet(null); toast.success(message); reload()
      }} />}
    {sheet?.kind === 'invites' && <InviteSheet invites={invites} loadError={invitesFailure?.message ?? ''} loadCause={invitesFailure?.cause} onRetry={reload} onClose={() => setSheet(null)} onExpired={onExpired}
      onAccepted={(invite, team) => {
        setInvites(old => old.filter(item => item.id !== invite.id))
        if (invites.length <= 1) setSheet(null)
        toast.success(`Você entrou no ${invite.team.name}.`)
        if (team) onSelectTeam(team.id)
        reload()
      }}
      onDeclined={invite => {
        setInvites(old => old.filter(item => item.id !== invite.id))
        if (invites.length <= 1) setSheet(null)
        toast.success(`Convite do ${invite.team.name} recusado.`)
      }}
      onStale={reload} />}
    {sheet?.kind === 'leave' && <Sheet title={`Sair do ${sheet.team.name}`} onClose={() => { if (!leave.busy) setSheet(null) }}>
      <ConfirmBox confirmLabel="Sair do time" busy={leave.busy} onConfirm={() => void leaveTeam(sheet.team)} onCancel={() => setSheet(null)}>
        <b>Sair do {sheet.team.name}?</b><br />Seu histórico com o time continua registrado. Para voltar, é preciso um novo convite ou pedido pelo link.
      </ConfirmBox>
    </Sheet>}
  </section>
}
