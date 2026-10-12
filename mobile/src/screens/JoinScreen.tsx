import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { ApiError } from '../api/client'
import { cancelJoinRequest, joinPreview, requestJoin } from '../api/teams'
import type { JoinPreview } from '../api/teams'
import { TeamIdCard } from '../components/teams/TeamIdCard'
import { DarkTopBar, TeamsPlate } from '../components/arena/TeamsPlate'
import { athletes } from '../components/teams/teamView'
import { ActionButton, ErrorText, LiveNotice } from '../components/arena/controls'
import { TeamTokenContext } from '../components/teams/ui'
import { useSessionToken } from '../hooks/useSessionToken'
import { useSubmit } from '../hooks/useSubmit'
import type { ScreenProps } from '../navigation/screens'
import { colors } from '../theme'
import { showTeams } from './teamsNavigation'
import { Icon } from '../components/Icon'

/**
 * Entrar no time pelo link (`arena://entrar/{token}`, o endereço compartilhado ou o QR lido pela câmera): a carteirinha
 * do time e "Pedir para entrar"; depois, "Pedido enviado · aguardando um representante", com "Cancelar pedido". Link
 * trocado ou de time encerrado: "Este link não vale mais". Quem já é do elenco vai direto para Meus times; quem tem
 * convite do time responde por lá.
 */
export default function JoinScreen({ navigation, onExpired, params }: ScreenProps<'join'>) {
  const { token } = params
  const session = useSessionToken()
  const [preview, setPreview] = useState<JoinPreview | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const action = useSubmit(onExpired)

  useEffect(() => {
    let alive = true
    joinPreview(token).then(value => { if (alive) { setPreview(value); setInvalid(false); setLoadError('') } }).catch((cause: unknown) => {
      if (!alive) return
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      if (cause instanceof ApiError && cause.status === 404) setInvalid(true)
      else setLoadError(cause instanceof Error && cause.message ? cause.message : 'Não foi possível abrir o link do time.')
    })
    return () => { alive = false }
  }, [token, attempt, onExpired])

  // Quem já está no elenco não tem o que pedir: segue para Meus times, com o time no carrossel.
  const member = preview?.my_status === 'membro'
  const memberTeamId = preview?.team.id
  useEffect(() => {
    if (member && memberTeamId !== undefined) showTeams(navigation, memberTeamId)
  }, [member, memberTeamId, navigation])

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

  if (invalid) {
    return <ScrollView testID="join-invalid" contentContainerStyle={{ paddingBottom: 32 }}>
      <TeamsPlate bottom={20}><DarkTopBar eyebrow="Convite por link" title="Link sem validade" icon="close" onBack={navigation.back} /></TeamsPlate>
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <View style={{ alignItems: 'center', borderRadius: 16, backgroundColor: '#ffffff', padding: 24 }}>
          <Icon name="link-off" size={34} color={colors['ink-muted']} />
          <Text accessibilityRole="header" style={{ marginTop: 10, color: colors.ink, fontSize: 17, fontWeight: '800', textAlign: 'center' }}>Este link não vale mais</Text>
          <Text style={{ marginTop: 6, color: colors['ink-muted'], fontSize: 13, lineHeight: 20, textAlign: 'center' }}>Um representante gerou outro link ou o time foi encerrado. Peça o link novo a um representante do time.</Text>
        </View>
      </View>
    </ScrollView>
  }
  if (!preview || !team) {
    return <ScrollView testID="join-loading" contentContainerStyle={{ paddingBottom: 32 }}>
      <TeamsPlate bottom={20}><DarkTopBar eyebrow="Convite por link" title="Entrar no time" icon="close" onBack={navigation.back} /></TeamsPlate>
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        {loadError
          ? <View><ErrorText>{loadError}</ErrorText><ActionButton tone="brand" title="Tentar novamente" onPress={() => setAttempt(n => n + 1)} fit /></View>
          : <View accessibilityLabel="Abrindo o link do time" accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <ActivityIndicator color={colors.brand} />
            <Text style={{ color: colors['ink-muted'], fontSize: 12.5 }}>Abrindo o link do time…</Text>
          </View>}
      </View>
    </ScrollView>
  }

  const actions = status === 'pedido_pendente'
    ? <View style={{ flex: 1, gap: 2 }}>
      <View accessible accessibilityLabel="Pedido enviado, aguardando um representante" style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 11, backgroundColor: 'rgba(143,224,180,0.15)', paddingHorizontal: 12 }}>
        <Icon name="clock" size={16} color={colors.mint} />
        <Text style={{ flexShrink: 1, color: colors.mint, fontSize: 11, fontWeight: '700' }}>Pedido enviado · aguardando um representante</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Cancelar pedido" accessibilityState={{ disabled: action.busy }} disabled={action.busy} onPress={() => void cancel()}
        style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: action.busy ? 0.5 : 1 }}>
        <Text style={{ color: 'rgba(255,255,255,0.66)', fontSize: 11.5, fontWeight: '700', textDecorationLine: 'underline' }}>{action.busy ? 'Cancelando…' : 'Cancelar pedido'}</Text>
      </Pressable>
    </View>
    : status === 'disponivel'
      ? <View style={{ flex: 1 }}><ActionButton tone="mint" icon="send-horizontal" title={action.busy ? 'Enviando…' : 'Pedir para entrar'} accessibilityLabel={action.busy ? 'Enviando pedido' : 'Pedir para entrar'} disabled={action.busy} onPress={() => void ask()} fit /></View>
      : status === 'convite_pendente'
        ? <View style={{ flex: 1 }}><ActionButton tone="mint" title="Ver o convite em Meus times" onPress={() => showTeams(navigation, team.id, true)} fit /></View>
        : null

  return <TeamTokenContext.Provider value={session}>
    <ScrollView testID="join-screen" contentContainerStyle={{ paddingBottom: 32 }}>
      <TeamsPlate bottom={16}>
        <DarkTopBar eyebrow="Convite por link" title="Entrar no time" icon="close" onBack={navigation.back} />
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <TeamIdCard team={{ ...team, my_role: null }} highlight badge="Link do time" line={`${team.city.name} · ${athletes(team.member_count)}`} actions={actions} />
        </View>
      </TeamsPlate>
      <View style={{ paddingHorizontal: 16 }}>
        {/* O pedido enviado já aparece na carteirinha; o aviso falado repete para leitores de tela. */}
        <LiveNotice text={status === 'pedido_pendente' ? 'Pedido enviado · aguardando um representante.'
          : status === 'membro' ? `Você já está no elenco do ${team.name}. Abrindo Meus times…`
          : status === 'convite_pendente' ? `Você já tem um convite do ${team.name}. Responda em Meus times.` : ''} />
        {action.error ? <ErrorText>{action.error}</ErrorText> : null}
        {status === 'disponivel' || status === 'pedido_pendente' ? <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 14, backgroundColor: 'rgba(143,224,180,0.18)', padding: 12 }}>
          <View style={{ marginTop: 1 }}><Icon name="info" size={16} color={colors.brand} /></View>
          <Text style={{ flex: 1, color: colors.ink, fontSize: 11.5, lineHeight: 17 }}>Um representante do {team.name} aprova seu pedido, e a resposta chega nas notificações. Se aprovado, você entra no elenco como membro, e sua posição preferida do futebol aparece no elenco.</Text>
        </View> : null}
      </View>
    </ScrollView>
  </TeamTokenContext.Provider>
}
