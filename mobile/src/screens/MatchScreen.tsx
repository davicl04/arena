import { useCallback, useEffect, useRef, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import type { TextInput } from 'react-native'
import { ApiError } from '../api/client'
import {
  acceptTerms, cancelMatch, contestWalkover, getMatch, proposeTerms, registerWalkover, removeGuest, setBooking, updateSlots, withdrawWalkover,
} from '../api/matches'
import type { MatchDetail, MatchMessageOut, MatchSlotOut, OpenSlots, TermsInput } from '../api/matches'
import { ActionButton, LiveNotice } from '../components/arena/controls'
import GlassOverlay from '../components/GlassOverlay'
import { Icon } from '../components/Icon'
import { ConditionsCard } from '../components/match/ConditionsCard'
import { BareTop, MatchHeader } from '../components/match/MatchHeader'
import { MatchChat } from '../components/match/MatchChat'
import { ConfirmSheet, ReasonSheet, SheetText } from '../components/match/MatchSheets'
import { SlotsSheet } from '../components/match/SlotsSheet'
import { TermsSheet } from '../components/match/TermsSheet'
import { walkoverScoreText } from '../components/results/format'
import { MatchResultCard } from '../components/results/MatchResultCard'
import ReportForm from '../components/ReportForm'
import { LoadState } from '../components/review/ui'
import { nameOf, orderedSides, sideName } from '../data/match'
import { useResource } from '../hooks/useResource'
import { useSessionToken } from '../hooks/useSessionToken'
import { useSubmit } from '../hooks/useSubmit'
import type { ScreenProps } from '../navigation/screens'
import { colors } from '../theme'
import { announce } from '../utils/announce'
import { formatDeadline } from '../utils/format'

type SheetKind = 'terms' | 'cancel' | 'wo' | 'wo-withdraw' | 'wo-contest' | 'slots'
/** Quanto tempo o aviso de sucesso fica na tela. */
const NOTICE_MS = 6000

/**
 * Tela da partida (P2 + C1): cabeçalho com os brasões, o cartão de resultado (`MatchResultCard`), o cartão de
 * condições fixo e recolhível e o chat dos dois elencos. Tudo o que a pessoa pode fazer vem de `detail.permissions`; as folhas
 * (propor condições, cancelar, W.O., vagas) abrem sobre a tela e mostram os erros do servidor sem fechar. A tela relê o
 * detalhe quando chega um evento novo no chat (aceite do outro lado, cancelamento…) e relê a placa do Jogar depois de
 * ações que a mudam (aceitar, propor, cancelar, W.O.). Na partida de campeonato não há proposta nem aceite: "Agendar" e
 * "Decidir resultado" (organizador) levam às telas do campeonato.
 */
export default function MatchScreen({ user, params, navigation, onExpired, refreshPlayBoard }: ScreenProps<'match'>) {
  const { matchId } = params
  const token = useSessionToken()
  const [missing, setMissing] = useState(false)
  const load = useCallback(async () => {
    try {
      const detail = await getMatch(matchId)
      setMissing(false)
      return detail
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) setMissing(true)
      throw cause
    }
  }, [matchId])
  const match = useResource(load, onExpired, { fallback: 'Não foi possível carregar a partida.' })
  const detail = match.data
  const setDetail = match.setData
  const action = useSubmit(onExpired)
  const { setError } = action
  const [sheet, setSheet] = useState<SheetKind | null>(null)
  const [reporting, setReporting] = useState<MatchMessageOut | null>(null)
  const [notice, setNotice] = useState('')
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const composer = useRef<TextInput | null>(null)
  const latest = useRef<MatchDetail | null>(null)
  useEffect(() => { latest.current = detail }, [detail])
  useEffect(() => () => clearTimeout(noticeTimer.current), [])

  /** Guarda o detalhe novo; se a fase da partida mudou, a placa do Jogar (ponto menta, listas) também é relida. */
  const take = useCallback((next: MatchDetail) => {
    const before = latest.current
    setDetail(next)
    if (before && (before.state !== next.state || before.phase !== next.phase)) void refreshPlayBoard()
  }, [setDetail, refreshPlayBoard])

  /** Relê o detalhe sem esconder a tela (a próxima leitura corrige uma falha). */
  const refresh = useCallback(async () => {
    try {
      take(await getMatch(matchId))
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
    }
  }, [matchId, onExpired, take])

  /** "Conversar", no cartão de resultado: leva o foco ao campo de mensagem do chat. */
  const focusChat = useCallback(() => composer.current?.focus(), [])

  function say(message: string) {
    clearTimeout(noticeTimer.current)
    setNotice(message)
    announce(message)
    noticeTimer.current = setTimeout(() => setNotice(''), NOTICE_MS)
  }
  function open(kind: SheetKind) {
    setError('')
    setSheet(kind)
  }
  function close() {
    setError('')
    setSheet(null)
  }
  /** Executa uma ação que devolve o detalhe novo; a folha só fecha se der certo. `board` relê a placa do Jogar. */
  async function apply(run: () => Promise<MatchDetail>, success: string | ((next: MatchDetail) => string), fallback: string, board = true) {
    const next = await action.run(run, fallback)
    if (!next) return false
    setDetail(next)
    setSheet(null)
    say(typeof success === 'function' ? success(next) : success)
    if (board) void refreshPlayBoard()
    return true
  }
  /** Ação sem corpo na resposta (`204`): lê o detalhe de novo. */
  async function applyThenReload(run: () => Promise<void>, success: string, fallback: string, board = true) {
    const done = await action.run(async () => {
      await run()
      return await getMatch(matchId)
    }, fallback)
    if (!done) return false
    setDetail(done)
    setSheet(null)
    say(success)
    if (board) void refreshPlayBoard()
    return true
  }

  if (match.loading) {
    return <View style={{ flex: 1 }}>
      <BareTop onBack={navigation.back} />
      <View style={{ paddingHorizontal: 20 }}><LoadState loading error={null} onRetry={match.reload} loadingText="Carregando partida…" /></View>
    </View>
  }
  if (!detail) {
    return <View style={{ flex: 1 }}>
      <BareTop onBack={navigation.back} />
      {missing
        ? <View testID="match-missing" style={{ alignItems: 'center', gap: 6, padding: 28 }}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Icon name="shield-question" size={30} color={colors['ink-muted']} /></View>
          <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 15, fontWeight: '700', textAlign: 'center' }}>Partida não encontrada</Text>
          <Text style={{ color: colors['ink-muted'], fontSize: 12.5, lineHeight: 18, textAlign: 'center' }}>Ela não existe ou você não participa dela.</Text>
          <View style={{ marginTop: 10, alignSelf: 'stretch' }}><ActionButton block tone="outline" title="Voltar" onPress={navigation.back} /></View>
        </View>
        : <View style={{ paddingHorizontal: 20 }}><LoadState loading={false} error={match.error} onRetry={match.reload} loadingText="Carregando partida…" /></View>}
    </View>
  }

  const current: MatchDetail = detail
  const sides = orderedSides(current)
  const opponent = sides.find(side => side.side !== current.my_side) ?? sides[1]
  const arranging = ['combinando', 'agendada', 'realizada', 'encerrada', 'sem_resultado', 'cancelada'].includes(current.state)
  const wo = current.walkover
  const eventId = current.event?.id
  const versus = sides.map(side => sideName(side)).join(' × ')

  return <View testID="match-screen" style={{ flex: 1 }}>
    <MatchHeader detail={current} onBack={navigation.back} token={token} />
    {!arranging
      ? <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View accessibilityRole="summary" style={{ flexDirection: 'row', gap: 10, borderRadius: 16, backgroundColor: '#ffffff', padding: 14 }}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ marginTop: 1 }}><Icon name="hourglass" size={20} color={colors.brand} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '800' }}>
              {current.state === 'proposta' ? 'Proposta aguardando resposta' : current.state === 'recusada' ? 'Proposta recusada' : 'Proposta expirada'}
            </Text>
            <Text style={{ marginTop: 2, color: colors.ink, fontSize: 12, lineHeight: 18 }}>
              {current.state === 'proposta'
                ? 'O chat e as condições abrem quando os dois lados aceitam. Responda pela placa do Jogar.'
                : 'Esta partida não aconteceu. Os times podem buscar de novo pela placa do Jogar.'}
            </Text>
          </View>
        </View>
      </ScrollView>
      : <>
        <ScrollView testID="match-pinned" nestedScrollEnabled keyboardShouldPersistTaps="handled"
          style={{ flexGrow: 0, flexShrink: 1, maxHeight: current.result ? '62%' : '55%', borderBottomWidth: 1, borderBottomColor: colors.line }} contentContainerStyle={{ paddingBottom: 8 }}>
          {current.result ? <View style={{ marginHorizontal: 12, marginTop: 10 }}>
            <MatchResultCard match={current} viewerId={user.id} onChanged={next => (next ? take(next) : void refresh())} onOpenChat={focusChat} onExpired={onExpired} />
          </View> : null}
          {/* Nova proposta ou mudança de estado: o cartão volta ao aberto/fechado padrão para o que mudou ser notado. */}
          <ConditionsCard key={`${current.state}-${current.terms.pending?.id ?? 0}`} detail={current} busy={action.busy} error={sheet === null ? action.error : ''}
            onPropose={() => open('terms')}
            onSchedule={eventId !== undefined ? () => navigation.go('event-matches', { eventId, matchId: current.id }) : undefined}
            onDecide={current.origin === 'campeonato' ? () => navigation.go('result-decision', { matchId: current.id }) : undefined}
            onAccept={terms => void apply(() => acceptTerms(current.id, terms.id),
              next => (next.state === 'agendada' && current.state !== 'agendada' ? 'Partida agendada. As condições estão valendo.' : 'Condições aceitas.'),
              'Não foi possível aceitar as condições.')}
            onBooking={confirmed => void apply(() => setBooking(current.id, confirmed), confirmed ? 'Reserva confirmada.' : 'Reserva marcada como a confirmar.', 'Não foi possível atualizar a reserva.', false)}
            onSlots={() => open('slots')} onCancel={() => open('cancel')} onRegisterWalkover={() => open('wo')}
            onWithdrawWalkover={() => open('wo-withdraw')} onContestWalkover={() => open('wo-contest')} />
        </ScrollView>
        <MatchChat detail={current} onExpired={onExpired} onReport={setReporting} onPropose={() => open('terms')} onEvent={() => void refresh()} composerRef={composer} token={token} />
      </>}

    {/* O aviso de sucesso é uma região viva sobre o fim do chat: o leitor de tela o anuncia e ele some sozinho. */}
    <View pointerEvents="none" style={{ position: 'absolute', left: 12, right: 12, bottom: 96 }}><LiveNotice text={notice} /></View>

    {sheet === 'terms' ? <TermsSheet detail={current} busy={action.busy} error={action.error} onClose={close} onExpired={onExpired}
      onSubmit={(input: TermsInput) => void apply(() => proposeTerms(current.id, input), `Proposta enviada. ${nameOf(current, opponent?.side)} precisa aceitar.`, 'Não foi possível enviar a proposta.')} /> : null}
    {sheet === 'cancel' ? <ReasonSheet title="Cancelar partida" description={versus}
      intro={`${current.state === 'agendada'
        ? 'Os dois elencos e os avulsos escalados são avisados. A partida não pontua e os times podem voltar a buscar.'
        : 'A partida combinada é encerrada e os dois lados são avisados. Os times podem voltar a buscar.'}${current.cancel_until && current.state === 'agendada' ? ` Dá para cancelar até ${formatDeadline(current.cancel_until)}.` : ''}`}
      label="Motivo (opcional)" placeholder="Ex.: a quadra não está disponível nesse horário." min={0} max={300} confirmLabel="Confirmar cancelamento" busyLabel="Cancelando…"
      busy={action.busy} error={action.error} onClose={close}
      onSubmit={reason => void apply(() => cancelMatch(current.id, reason), 'Partida cancelada. Os dois lados foram avisados.', 'Não foi possível cancelar a partida.')} /> : null}
    {sheet === 'wo' ? <ConfirmSheet title="Registrar W.O." description={versus} confirmLabel="Registrar W.O." busyLabel="Registrando…" busy={action.busy} error={action.error} onClose={close}
      onConfirm={() => void apply(() => registerWalkover(current.id), 'W.O. registrado. O outro lado pode contestar até o fim do prazo.', 'Não foi possível registrar o W.O.')}>
      <SheetText>{`Registre só se ${sideName(opponent)} não compareceu. A vitória vale ${walkoverScoreText(current.sport)} para o seu lado.`}</SheetText>
      <SheetText muted>{`${sideName(opponent)} pode contestar até ${formatDeadline(current.result_deadline)}; se contestar, a administração decide e a partida fica sem resultado até lá.`}</SheetText>
    </ConfirmSheet> : null}
    {sheet === 'wo-withdraw' ? <ConfirmSheet title="Retirar W.O." description={versus} confirmLabel="Retirar W.O." busyLabel="Retirando…" busy={action.busy} error={action.error} onClose={close}
      onConfirm={() => void applyThenReload(() => withdrawWalkover(current.id), 'W.O. retirado. A partida volta a aguardar o placar.', 'Não foi possível retirar o W.O.')}>
      <SheetText>O W.O. deixa de valer e a partida volta a aguardar o placar dos dois lados.</SheetText>
    </ConfirmSheet> : null}
    {sheet === 'wo-contest' && wo ? <ReasonSheet title="Contestar W.O." description={versus}
      intro={`${wo.registered_by?.name ?? nameOf(current, wo.absent_side === 'a' ? 'b' : 'a')} registrou que o seu lado não compareceu. Conte o que aconteceu: a contestação vai para a administração, que decide.`}
      label="O que aconteceu?" placeholder="Ex.: estávamos na quadra no horário combinado." min={5} max={500} shortMessage="Conte o que aconteceu." confirmLabel="Contestar W.O." busyLabel="Enviando…"
      busy={action.busy} error={action.error} onClose={close}
      onSubmit={reason => void apply(() => contestWalkover(current.id, reason), 'Contestação enviada à administração.', 'Não foi possível contestar o W.O.')} /> : null}
    {sheet === 'slots' ? <SlotsSheet detail={current} busy={action.busy} error={action.error} onClose={close} token={token}
      onSave={(slots: OpenSlots) => void apply(() => updateSlots(current.id, slots), 'Vagas para avulsos atualizadas.', 'Não foi possível atualizar as vagas.', false)}
      onRemove={(slot: MatchSlotOut) => {
        const guest = slot.guest
        if (guest) void applyThenReload(() => removeGuest(current.id, guest.id), `${guest.name} saiu da partida.`, 'Não foi possível remover o avulso.', false)
      }} /> : null}
    {reporting ? <GlassOverlay variant="screen" title="Denunciar mensagem" onClose={() => setReporting(null)}>
      <View style={{ marginBottom: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 10, paddingVertical: 9 }}>
        <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '800' }}>{reporting.author?.name ?? 'Participante'}</Text>
        <Text style={{ color: '#ffffff', fontSize: 12, lineHeight: 18 }}>{reporting.body}</Text>
      </View>
      <Text style={{ marginBottom: 10, color: colors['glass-muted'], fontSize: 12 }}>A administração vê a mensagem, a partida e o autor.</Text>
      <ReportForm target="match_message" targetId={reporting.id} title="Por que você quer denunciar esta mensagem?" onExpired={onExpired}
        onDone={() => { setReporting(null); say('Denúncia enviada para análise.') }} />
    </GlassOverlay> : null}
  </View>
}
