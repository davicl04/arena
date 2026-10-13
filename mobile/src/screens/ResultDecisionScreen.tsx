import { useCallback } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { ApiError } from '../api/client'
import { decideResult } from '../api/brackets'
import type { ResultDecisionInput } from '../api/brackets'
import { getMatch, getMessages } from '../api/matches'
import type { MatchDetail, MatchMessageOut } from '../api/matches'
import { ErrorText, Notice, TextAction } from '../components/arena/controls'
import { DarkTopBar, TeamsPlate } from '../components/arena/TeamsPlate'
import { Icon } from '../components/Icon'
import type { IconName } from '../components/Icon'
import { TeamMark } from '../components/match/TeamMark'
import { DecisionForm } from '../components/organizer/DecisionForm'
import { scoreText, walkoverScoreText } from '../components/results/format'
import { headerNames, orderedSides, sideName, sideOf, whenText } from '../data/match'
import { useResource } from '../hooks/useResource'
import { useSubmit } from '../hooks/useSubmit'
import type { ScreenProps } from '../navigation/screens'
import { colors } from '../theme'
import { formatClock, parseIso } from '../utils/format'

interface TimelineEvent { icon: IconName; title: string; detail: string; bad?: boolean }

/** A linha do tempo da partida: o jogo, os dois envios (quem e quando) e o que falta decidir. */
export function timelineOf(match: MatchDetail, now = Date.now()): TimelineEvent[] {
  const events: TimelineEvent[] = []
  const result = match.result
  events.push({ icon: 'flag', title: match.state === 'agendada' && !result ? 'Partida agendada' : 'Partida jogada', detail: [whenText(match.starts_at), match.court?.name].filter(Boolean).join(' · ') || 'Sem data' })
  const informed = (['a', 'b'] as const).map(key => result?.reports[key] ?? null).filter(report => report !== null)
    .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at))
  for (const report of informed) {
    const name = sideName(sideOf(match, report.side))
    events.push({
      icon: 'upload',
      title: report.score ? `${name} informou ${scoreText(match.sport, report.score, 'a')}` : `${name} informou o placar`,
      detail: [report.reported_by?.name, whenText(report.updated_at)].filter(Boolean).join(' · '),
    })
  }
  for (const key of ['a', 'b'] as const) {
    if (result && !result.reports[key] && match.state === 'agendada') events.push({ icon: 'hourglass', title: `${sideName(sideOf(match, key))} não informou o placar`, detail: 'Ainda sem envio' })
  }
  if (result?.state === 'divergente') events.push({ icon: 'git-compare-arrows', title: 'Placares diferentes', detail: 'A partida aguarda a sua decisão', bad: true })
  else if (match.state === 'agendada' && result && now >= Date.parse(result.deadline)) events.push({ icon: 'hourglass', title: 'Prazo de 48 h vencido', detail: 'Sem placar confirmado: a partida aguarda a sua decisão', bad: true })
  return events
}

/** Resumo do que foi decidido (partida já encerrada pelo organizador). */
function DecidedCard({ match }: { match: MatchDetail }) {
  const result = match.result
  const score = result?.final ? scoreText(match.sport, result.final, 'a') : null
  const wo = match.walkover?.absent_side
  return <View testID="decided" accessibilityLabel="Resultado registrado" style={{ gap: 6, borderRadius: 16, backgroundColor: colors['success-bg'], padding: 14 }}>
    <Text accessibilityRole="header" style={{ color: colors.brand, fontSize: 13, fontWeight: '700' }}>{`Resultado registrado${score ? `: ${score}` : ''}`}</Text>
    {wo ? <Text style={{ color: colors.ink, fontSize: 12, lineHeight: 18 }}>{`W.O. de ${sideName(sideOf(match, wo))}: o lado presente venceu por ${walkoverScoreText(match.sport)}.`}</Text> : null}
    {result?.decision_reason ? <Text style={{ color: colors.ink, fontSize: 12, lineHeight: 18 }}><Text style={{ fontWeight: '700' }}>Justificativa: </Text>{result.decision_reason}</Text> : null}
    <Text style={{ color: colors['ink-muted'], fontSize: 10.5, lineHeight: 16 }}>A tabela e o ranking foram atualizados e os dois elencos foram avisados.</Text>
  </View>
}

function ChatLine({ message, match }: { message: MatchMessageOut; match: MatchDetail }) {
  const side = sideOf(match, message.side)
  const time = parseIso(message.created_at)
  const author = message.author?.name ?? 'Participante'
  const organizer = message.author_role === 'organizador'
  return <View accessible accessibilityLabel={`${author}${organizer ? ', organizador' : ''}${time ? `, ${formatClock(time)}` : ''}: ${message.body}`} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
    {side ? <TeamMark side={side} /> : <View style={{ width: 29, height: 29, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.forest }}>
      <Text style={{ color: colors.mint, fontSize: 8, fontWeight: '800' }}>ORG</Text>
    </View>}
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ color: colors.ink, fontSize: 11.5, fontWeight: '700' }}>
        {author}{organizer ? ' · Organizador' : ''}<Text style={{ color: colors['ink-muted'], fontWeight: '400' }}>{time ? `  ${formatClock(time)}` : ''}</Text>
      </Text>
      <Text style={{ color: colors.ink, fontSize: 11.5, lineHeight: 17 }}>{message.body}</Text>
    </View>
  </View>
}

/**
 * Placar divergente (D3), do lado do organizador: a linha do tempo da partida (o jogo, os dois envios e a divergência), o
 * trecho do chat com "Abrir chat" e a decisão (um dos placares, outro placar ou W.O.) com a justificativa obrigatória. O
 * servidor valida (na eliminação não há empate); ao registrar, a tela volta e quem a abriu relê os dados. Num `409` (a
 * decisão já não cabe), a partida é relida e o estado atual toma o lugar do formulário, com a mensagem do servidor.
 */
export default function ResultDecisionScreen({ params, navigation, onExpired }: ScreenProps<'result-decision'>) {
  const matchId = params.matchId
  const loadMatch = useCallback(() => getMatch(matchId), [matchId])
  const loadChat = useCallback(() => getMessages(matchId, { limit: 20 }), [matchId])
  const match = useResource(loadMatch, onExpired, { fallback: 'Não foi possível carregar a partida.' })
  const detail = match.data
  const chat = useResource(loadChat, onExpired, { enabled: detail?.permissions.read_chat === true, fallback: 'Não foi possível carregar o chat.' })
  const action = useSubmit(onExpired)

  /** Relê a partida sem esconder a tela: o que o servidor disse (`409`) vale mais que o que a tela mostrava. */
  async function reread() {
    try {
      match.setData(await getMatch(matchId))
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
    }
  }
  async function decide(input: ResultDecisionInput) {
    const done = await action.run(async () => {
      try {
        return await decideResult<MatchDetail>(matchId, input)
      } catch (cause) {
        // 409: a decisão já não cabe (os times acertaram, outra pessoa decidiu, o prazo mudou). O estado atual substitui o
        // formulário e a mensagem do servidor continua visível.
        if (cause instanceof ApiError && cause.status === 409) await reread()
        throw cause
      }
    }, 'Não foi possível registrar a decisão.')
    if (done) navigation.back()
  }

  if (!detail) {
    return <View style={{ flex: 1 }}>
      <TeamsPlate bottom={16}><DarkTopBar eyebrow="Organizador" title="Decidir resultado" onBack={navigation.back} /></TeamsPlate>
      <View style={{ padding: 20 }}>
        {match.loading ? <Text accessibilityLiveRegion="polite" style={{ color: colors['ink-muted'], fontSize: 12 }}>Carregando a partida…</Text> : null}
        {match.error ? <View><Notice>{match.error}</Notice><TextAction title="Tentar novamente" onPress={match.reload} /></View> : null}
      </View>
    </View>
  }

  const sides = orderedSides(detail)
  const names = headerNames(sides)
  const divergent = detail.result?.state === 'divergente'
  const decided = detail.state === 'encerrada' && detail.result?.source === 'organizador'
  const canDecide = detail.permissions.decide_result === true
  const recent: MatchMessageOut[] = (chat.data?.items ?? []).filter(item => item.kind === 'texto' && !item.removed && item.body).sort((a, b) => a.id - b.id).slice(-3)
  const title = decided ? 'Resultado decidido' : divergent ? 'Placar divergente' : 'Decidir resultado'
  const timeline = timelineOf(detail)

  return <View style={{ flex: 1 }}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 48 }}>
      <TeamsPlate bottom={16}><DarkTopBar eyebrow={detail.event?.name ?? 'Organizador'} title={title} onBack={navigation.back} /></TeamsPlate>

      <View style={{ padding: 16, gap: 14 }}>
        <View testID="decision-vs" accessible accessibilityRole="header" accessibilityLabel={sides.map(side => sideName(side)).join(' contra ')}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 16, backgroundColor: '#ffffff', paddingHorizontal: 12, paddingVertical: 10 }}>
          {sides[0] ? <TeamMark side={sides[0]} /> : null}
          <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.ink, fontSize: 13, fontWeight: '700' }}>{names[0]}</Text>
          <Text style={{ color: colors.brand, fontSize: 14, fontWeight: '800' }}>×</Text>
          <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.ink, fontSize: 13, fontWeight: '700' }}>{names[1]}</Text>
          {sides[1] ? <TeamMark side={sides[1]} /> : null}
        </View>

        <View accessibilityLabel="Linha do tempo da partida" style={{ borderRadius: 16, backgroundColor: '#ffffff', padding: 14 }}>
          {timeline.map((item, index) => <View key={`${item.title}-${index}`} accessible accessibilityLabel={`${item.title}. ${item.detail}`}
            style={{ flexDirection: 'row', gap: 12, paddingBottom: index < timeline.length - 1 ? 14 : 0 }}>
            <View style={{ width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: item.bad ? '#fff0f2' : 'rgba(0,90,54,0.07)' }}>
              <Icon name={item.icon} size={14} color={item.bad ? colors.danger : colors.brand} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: item.bad ? colors.danger : colors.ink, fontSize: 12, fontWeight: '700', lineHeight: 16 }}>{item.title}</Text>
              <Text style={{ color: colors['ink-muted'], fontSize: 10.5, lineHeight: 15 }}>{item.detail}</Text>
            </View>
          </View>)}
        </View>

        {detail.permissions.read_chat ? <View accessibilityLabel="No chat da partida" style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
              <Icon name="messages-square" size={16} color={colors.brand} />
              <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 14, fontWeight: '700' }}>No chat da partida</Text>
            </View>
            <TextAction title="Abrir chat" onPress={() => navigation.go('match', { matchId })} />
          </View>
          {chat.loading ? <Text accessibilityLiveRegion="polite" style={{ color: colors['ink-muted'], fontSize: 11 }}>Carregando o chat…</Text> : null}
          {chat.error ? <Text accessibilityLiveRegion="polite" style={{ color: colors['ink-muted'], fontSize: 11 }}>{chat.error}</Text> : null}
          {!chat.loading && !chat.error && recent.length === 0
            ? <Text style={{ borderRadius: 16, backgroundColor: '#ffffff', overflow: 'hidden', padding: 12, color: colors['ink-muted'], fontSize: 11.5 }}>Ainda não há mensagens no chat desta partida.</Text> : null}
          {recent.length > 0 ? <View testID="chat-excerpt" style={{ gap: 10, borderRadius: 16, backgroundColor: '#ffffff', padding: 12 }}>
            {recent.map(item => <ChatLine key={item.id} message={item} match={detail} />)}
          </View> : null}
        </View> : null}

        {decided ? <DecidedCard match={detail} /> : null}

        {canDecide ? <DecisionForm key={detail.id} match={detail} busy={action.busy} error={action.error} onSubmit={input => void decide(input)} /> : null}
        {!canDecide && action.error ? <ErrorText>{action.error}</ErrorText> : null}

        {!canDecide && !decided
          ? <Text accessibilityRole="text" style={{ borderRadius: 16, backgroundColor: '#ffffff', overflow: 'hidden', padding: 14, color: colors['ink-muted'], fontSize: 12, lineHeight: 18 }}>
            {detail.state === 'cancelada' ? 'Esta partida foi cancelada.' : detail.state === 'agendada' ? 'A partida ainda não começou: a decisão fica disponível depois do horário.' : 'Não há resultado para decidir nesta partida agora.'}
          </Text> : null}
      </View>
    </ScrollView>
  </View>
}
