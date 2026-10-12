import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, View } from 'react-native'
import { ApiError } from '../api/client'
import { cancelInvite, decideJoinRequest, joinRequests, myInvites, myTeams, removeMember, sentInvites, teamMembers } from '../api/teams'
import type { JoinRequest, TeamCard, TeamInviteReceived, TeamInviteSent, TeamMember } from '../api/teams'
import { InviteSheet } from '../components/teams/InviteSheet'
import { InviteStrip } from '../components/teams/InviteStrip'
import { MemberSheet } from '../components/teams/MemberSheet'
import { RosterGrid } from '../components/teams/RosterGrid'
import { TeamCardCarousel } from '../components/teams/TeamCardCarousel'
import { ActionSheet } from '../components/arena/ActionSheet'
import { DarkTopBar, TeamsPlate } from '../components/arena/TeamsPlate'
import { JoinRequestsList, SentInvitesList } from '../components/teams/TeamRequestLists'
import { ActionButton, ConfirmBox, ErrorText, LiveNotice, TextAction } from '../components/arena/controls'
import { TeamTokenContext } from '../components/teams/ui'
import { useSessionToken } from '../hooks/useSessionToken'
import { useSubmit } from '../hooks/useSubmit'
import { openUser } from '../navigation/openUser'
import type { ScreenProps } from '../navigation/screens'
import { colors } from '../theme'
import { Icon } from '../components/Icon'

// A câmera (expo-camera) só é carregada quando a pessoa toca em "Entrar com QR".
const QrScanner = lazy(() => import('../components/teams/QrScanner').then(module => ({ default: module.QrScanner })))

type SheetState = { kind: 'member'; member: TeamMember } | { kind: 'invites' } | { kind: 'leave'; team: TeamCard } | null
interface RosterState { teamId: number; items: TeamMember[]; error: string }
interface RepresentativeLists { teamId: number; requests: JoinRequest[]; invites: TeamInviteSent[] }

/** Quanto tempo o aviso de sucesso fica na tela. */
export const NOTICE_MS = 5000

const messageOf = (cause: unknown, fallback: string) => cause instanceof Error && cause.message ? cause.message : fallback

/**
 * Meus times (M3 + C5 + E1 + R2): placa escura com a faixa de convites e o carrossel de carteirinhas; abaixo, o elenco
 * do cartão centralizado e, para representantes, os pedidos para entrar e os convites enviados. Só dados reais: sem
 * time, o estado vazio leva a Criar time. "Entrar com QR" lê o código do link de um time com a câmera.
 */
export default function TeamsScreen({ user, navigation, onExpired, params }: ScreenProps<'teams'>) {
  const selectedTeamId = params?.teamId
  const openInvites = Boolean(params?.invites)
  const showRequests = Boolean(params?.requests)
  const token = useSessionToken()
  const [teams, setTeams] = useState<TeamCard[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [invites, setInvites] = useState<TeamInviteReceived[]>([])
  const [invitesError, setInvitesError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [roster, setRoster] = useState<RosterState | null>(null)
  const [rosterAttempt, setRosterAttempt] = useState(0)
  const [lists, setLists] = useState<RepresentativeLists | null>(null)
  const [sheet, setSheet] = useState<SheetState>(openInvites ? { kind: 'invites' } : null)
  const [scanning, setScanning] = useState(false)
  const [notice, setNotice] = useState('')
  const [listError, setListError] = useState('')
  const [busyItem, setBusyItem] = useState<number | null>(null)
  const [bodyY, setBodyY] = useState(0)
  const [requestsY, setRequestsY] = useState<number | null>(null)
  const leave = useSubmit(onExpired)
  const scroller = useRef<ScrollView>(null)

  const fail = useCallback((cause: unknown) => {
    if (cause instanceof ApiError && cause.status === 401) onExpired()
  }, [onExpired])
  // O pedido de abrir a folha de convites (notificação) vale uma vez: voltar a esta tela não a reabre.
  useEffect(() => {
    if (openInvites) navigation.setParams('teams', { invites: false })
  }, [openInvites, navigation])

  // Times e convites recebidos; recarregados depois de cada mudança de elenco.
  useEffect(() => {
    let alive = true
    myTeams().then(items => { if (alive) { setTeams(items); setLoadError('') } })
      .catch((cause: unknown) => { if (alive) { fail(cause); setLoadError(messageOf(cause, 'Não foi possível carregar seus times.')) } })
    myInvites().then(items => { if (alive) { setInvites(items); setInvitesError('') } })
      .catch((cause: unknown) => { if (alive) { fail(cause); setInvitesError(messageOf(cause, 'Não foi possível carregar os convites recebidos.')) } })
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
    teamMembers(selectedId).then(items => { if (alive) setRoster({ teamId: selectedId, items, error: '' }) })
      .catch((cause: unknown) => { if (alive) { fail(cause); setRoster({ teamId: selectedId, items: [], error: messageOf(cause, 'Não foi possível carregar o elenco.') }) } })
    return () => { alive = false }
  }, [selectedId, attempt, rosterAttempt, fail])

  // Pedidos para entrar e convites enviados, só para representantes (contadores zerados dispensam a consulta).
  const wantsRequests = representative && selected?.pending_join_requests !== 0
  const wantsInvites = representative && selected?.pending_invites !== 0
  useEffect(() => {
    if (selectedId === undefined || (!wantsRequests && !wantsInvites)) return
    let alive = true
    Promise.all([wantsRequests ? joinRequests(selectedId) : [], wantsInvites ? sentInvites(selectedId) : []])
      .then(([requests, sent]) => { if (alive) setLists({ teamId: selectedId, requests, invites: sent }) })
      .catch((cause: unknown) => { if (alive) { fail(cause); setListError(messageOf(cause, 'Não foi possível carregar pedidos e convites.')) } })
    return () => { alive = false }
  }, [selectedId, wantsRequests, wantsInvites, attempt, fail])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  // Ao recarregar o mesmo time, o elenco anterior continua na tela até a resposta chegar.
  const currentRoster = roster && roster.teamId === selectedId ? roster : null
  const members = currentRoster?.items ?? []
  const currentLists = (wantsRequests || wantsInvites) && lists && lists.teamId === selectedId ? lists : null

  // Notificação de pedido: depois de carregar as listas, leva a "Pedidos para entrar" (sem pedidos, só consome).
  const requestsReady = Boolean(teams) && (!wantsRequests || currentLists !== null)
  const hasRequests = Boolean(currentLists?.requests.length)
  useEffect(() => {
    if (!showRequests || !requestsReady) return
    if (hasRequests) {
      // Espera o layout da seção (a posição chega depois da montagem).
      if (requestsY === null) return
      scroller.current?.scrollTo({ y: Math.max(0, bodyY + requestsY - 8), animated: true })
    }
    navigation.setParams('teams', { requests: false })
  }, [showRequests, requestsReady, hasRequests, requestsY, bodyY, navigation])

  function announce(message: string) { setListError(''); setNotice(message) }
  const selectTeam = (teamId: number) => navigation.setParams('teams', { teamId })
  async function decide(request: JoinRequest, decision: 'aprovar' | 'recusar') {
    setBusyItem(request.id); setListError('')
    try {
      await decideJoinRequest(request.id, decision)
      setLists(old => old && { ...old, requests: old.requests.filter(item => item.id !== request.id) })
      announce(decision === 'aprovar' ? `${request.requester.name} entrou no elenco.` : `Pedido de ${request.requester.name} recusado.`)
      if (decision === 'aprovar') reload()
    } catch (cause) {
      fail(cause); setListError(messageOf(cause, 'Não foi possível responder ao pedido.'))
      if (cause instanceof ApiError && cause.status === 409) reload()
    } finally { setBusyItem(null) }
  }
  async function cancel(invite: TeamInviteSent) {
    setBusyItem(invite.id); setListError('')
    try {
      await cancelInvite(invite.id)
      setLists(old => old && { ...old, invites: old.invites.filter(item => item.id !== invite.id) })
      announce(`Convite para ${invite.invitee.name} cancelado.`)
    } catch (cause) {
      fail(cause); setListError(messageOf(cause, 'Não foi possível cancelar o convite.'))
      if (cause instanceof ApiError && cause.status === 409) reload()
    } finally { setBusyItem(null) }
  }
  async function leaveTeam(team: TeamCard) {
    const done = await leave.run(async () => { await removeMember(team.id, user.id); return true }, 'Não foi possível sair do time.')
    if (done) { setSheet(null); announce(`Você saiu do ${team.name}.`); reload() }
  }

  const create = () => navigation.go('team-form')
  const invite = (team: TeamCard) => navigation.go('team-invite', { teamId: team.id })
  const link = (team: TeamCard) => navigation.go('team-invite', { teamId: team.id, link: true })
  const scanButton = <ActionButton size="sm" tone="line" icon="qr-code" title="Entrar com QR" accessibilityHint="Abre a câmera para ler o QR do link de um time" onPress={() => setScanning(true)} fit />
  const topRow = <DarkTopBar eyebrow="Jogar" title="Meus times" onBack={navigation.back} trailing={scanButton} />
  const scanner = scanning ? <Suspense fallback={null}><QrScanner onClose={() => setScanning(false)} onToken={code => { setScanning(false); navigation.go('join', { token: code }) }} /></Suspense> : null

  if (!teams) {
    return <TeamTokenContext.Provider value={token}>
      <ScrollView testID="teams-loading" contentContainerStyle={{ paddingBottom: 32 }}>
        <TeamsPlate bottom={24}>{topRow}</TeamsPlate>
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          {loadError
            ? <View><ErrorText>{loadError}</ErrorText><ActionButton tone="brand" title="Tentar novamente" onPress={reload} fit /></View>
            : <View accessibilityLabel="Carregando seus times" accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <ActivityIndicator color={colors.brand} />
              <Text style={{ color: colors['ink-muted'], fontSize: 12.5 }}>Carregando seus times…</Text>
            </View>}
        </View>
      </ScrollView>
      {scanner}
    </TeamTokenContext.Provider>
  }

  return <TeamTokenContext.Provider value={token}>
    <ScrollView ref={scroller} testID="teams-scroll" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>
      <TeamsPlate>
        {topRow}
        <InviteStrip invites={invites} onOpen={() => setSheet({ kind: 'invites' })} />
        <TeamCardCarousel teams={teams} selectedId={selected?.id ?? null} onSelect={selectTeam} onCreate={create}
          onInvite={invite} onLink={link} onEdit={team => navigation.go('team-form', { teamId: team.id })} onLeave={team => setSheet({ kind: 'leave', team })} />
      </TeamsPlate>

      <View style={{ paddingHorizontal: 16 }} onLayout={event => setBodyY(event.nativeEvent.layout.y)}>
        <LiveNotice text={notice} />
        {invitesError ? <View><ErrorText>{invitesError}</ErrorText><TextAction title="Tentar novamente" onPress={reload} /></View> : null}
        {listError ? <ErrorText>{listError}</ErrorText> : null}
        {!selected
          ? <View style={{ marginTop: 18, alignItems: 'center', borderRadius: 16, backgroundColor: '#ffffff', padding: 22 }}>
            <Icon name="shield" size={36} color={colors.brand} />
            <Text accessibilityRole="header" style={{ marginTop: 10, color: colors.ink, fontSize: 17, fontWeight: '800', textAlign: 'center' }}>Você ainda não tem time</Text>
            <Text style={{ marginTop: 6, color: colors['ink-muted'], fontSize: 13, lineHeight: 20, textAlign: 'center' }}>
              Crie um time e convide o elenco, ou aceite o convite de um representante. Um atleta pode estar em vários times.
            </Text>
            <View style={{ marginTop: 14, alignSelf: 'stretch', gap: 8 }}>
              <ActionButton tone="brand" block icon="shield-plus" title="Criar time" onPress={create} />
              <ActionButton tone="outline" block icon="qr-code" title="Entrar com QR" onPress={() => setScanning(true)} />
            </View>
          </View>
          : <>
            <RosterGrid key={selected.id} members={members} loading={!currentRoster} error={currentRoster?.error ?? ''}
              onRetry={() => setRosterAttempt(n => n + 1)} onOpen={member => setSheet({ kind: 'member', member })}
              action={representative ? <TextAction title="Convidar" accessibilityLabel="Convidar atletas" onPress={() => invite(selected)} /> : undefined} />
            {representative && selected.member_count <= 1
              ? <View style={{ marginTop: 12, flexDirection: 'row', gap: 12, borderRadius: 16, backgroundColor: '#ffffff', padding: 14, borderWidth: 1.5, borderColor: colors.mint }}>
                <View style={{ marginTop: 1 }}><Icon name="users" size={22} color={colors.brand} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '800' }}>Seu time só tem você</Text>
                  <Text style={{ marginTop: 2, marginBottom: 10, color: colors['ink-muted'], fontSize: 11.5, lineHeight: 17 }}>Convide o elenco por nome ou mande o link do time no grupo.</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <ActionButton grow tone="brand" icon="user-plus" title="Convidar" accessibilityLabel={`Convidar para o ${selected.name}`} onPress={() => invite(selected)} />
                    <ActionButton grow tone="outline" icon="qr-code" title="Link e QR" accessibilityLabel={`Link e QR do ${selected.name}`} onPress={() => link(selected)} />
                  </View>
                </View>
              </View> : null}
            {currentLists ? <View onLayout={event => setRequestsY(event.nativeEvent.layout.y)}>
              <JoinRequestsList requests={currentLists.requests} busyId={busyItem} onDecide={(request, decision) => void decide(request, decision)} onOpenLink={() => link(selected)} />
              <SentInvitesList invites={currentLists.invites} busyId={busyItem} onCancel={sent => void cancel(sent)} onInvite={() => invite(selected)} />
            </View> : null}
          </>}
      </View>
    </ScrollView>

    {sheet?.kind === 'member' && selected ? <MemberSheet team={selected} member={sheet.member} viewerIsRepresentative={representative}
      onClose={() => setSheet(null)} onStale={reload} onExpired={onExpired}
      onOpenProfile={userId => { setSheet(null); openUser(navigation, user.id, userId) }}
      onChanged={(member, message) => {
        setRoster(old => old && { ...old, items: old.items.map(item => item.user_id === member.user_id ? member : item) })
        setSheet(null); announce(message); reload()
      }}
      onRemoved={(member, message) => {
        setRoster(old => old && { ...old, items: old.items.filter(item => item.user_id !== member.user_id) })
        setSheet(null); announce(message); reload()
      }} /> : null}
    {sheet?.kind === 'invites' ? <InviteSheet invites={invites} loadError={invitesError} onRetry={reload} onClose={() => setSheet(null)} onExpired={onExpired}
      onAccepted={(accepted, team) => {
        setInvites(old => old.filter(item => item.id !== accepted.id))
        if (invites.length <= 1) setSheet(null)
        announce(`Você entrou no ${accepted.team.name}.`)
        if (team) selectTeam(team.id)
        reload()
      }}
      onDeclined={declined => {
        setInvites(old => old.filter(item => item.id !== declined.id))
        if (invites.length <= 1) setSheet(null)
        announce(`Convite do ${declined.team.name} recusado.`)
      }}
      onStale={reload} /> : null}
    {sheet?.kind === 'leave' ? <ActionSheet title={`Sair do ${sheet.team.name}`} locked={leave.busy} onClose={() => setSheet(null)}>
      <ConfirmBox title={`Sair do ${sheet.team.name}?`} confirmLabel="Sair do time" busy={leave.busy} onConfirm={() => void leaveTeam(sheet.team)} onCancel={() => setSheet(null)}>
        Seu histórico com o time continua registrado. Para voltar, é preciso um novo convite ou pedido pelo link.
      </ConfirmBox>
      {leave.error ? <ErrorText>{leave.error}</ErrorText> : null}
    </ActionSheet> : null}
    {scanner}
  </TeamTokenContext.Provider>
}
