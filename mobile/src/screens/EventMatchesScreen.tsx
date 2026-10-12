import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { listEventMatches, scheduleConflict, scheduleMatch } from '../api/brackets'
import type { EventMatchList, EventMatchRow, ScheduleConflict, ScheduleInput } from '../api/brackets'
import { ApiError } from '../api/client'
import { getOrganizerEvent } from '../api/events'
import { ErrorText, LiveNotice, Notice, TextAction } from '../components/arena/controls'
import { StateBadge } from '../components/arena/StateBadge'
import { DarkTopBar, TeamsPlate } from '../components/arena/TeamsPlate'
import { Icon } from '../components/Icon'
import { TeamMark } from '../components/match/TeamMark'
import { ScheduleSheet } from '../components/organizer/ScheduleSheet'
import { rowBadge, rowNames, rowSubtitle } from '../components/organizer/scheduleRows'
import { whenText } from '../data/match'
import { useResource } from '../hooks/useResource'
import { useSubmit } from '../hooks/useSubmit'
import type { ScreenProps } from '../navigation/screens'
import { colors } from '../theme'
import { announce } from '../utils/announce'
import { plural } from '../utils/format'

/** Os contadores do alto da lista, na ordem do que o organizador faz primeiro. */
export function counters(counts: EventMatchList['counts']): { label: string; value: number; hot?: boolean }[] {
  return [
    { label: 'para agendar', value: counts.to_schedule, hot: true },
    { label: 'para decidir', value: counts.to_decide, hot: true },
    { label: 'agendadas', value: counts.scheduled },
    { label: 'esperando jogo anterior', value: counts.waiting },
    { label: 'encerradas', value: counts.finished },
  ].filter(item => item.value > 0)
}

/** Duas marcas lado a lado: o brasão (ou a foto) de quem joga, ou o escudo tracejado enquanto o lado espera o vencedor. */
function RowMarks({ row }: { row: EventMatchRow }) {
  const [a, b] = (['a', 'b'] as const).map(key => row.card.sides.find(side => side.side === key))
  const ghost = <View style={{ width: 29, height: 29, borderRadius: 15, borderWidth: 1, borderStyle: 'dashed', borderColor: colors['ink-muted'], alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: colors['ink-muted'], fontSize: 11, fontWeight: '800' }}>?</Text>
  </View>
  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
    {a ? <TeamMark side={a} /> : ghost}
    {b ? <TeamMark side={b} /> : ghost}
  </View>
}

function MatchRow({ item, onPress }: { item: EventMatchRow; onPress: () => void }) {
  const [first, second] = rowNames(item)
  const badge = rowBadge(item)
  const interactive = item.awaiting_decision || item.can_schedule || item.card.sides.length === 2
  const subtitle = rowSubtitle(item)
  const content = <>
    <View style={{ minWidth: 32, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: colors.forest, paddingHorizontal: 6 }}>
      <Text style={{ color: colors.mint, fontSize: 9, fontWeight: '800' }}>{item.label}</Text>
    </View>
    <RowMarks row={item} />
    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
      <Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '700', lineHeight: 17 }}>{`${first} × ${second}`}</Text>
      <Text style={{ color: colors['ink-muted'], fontSize: 10.5, lineHeight: 15 }}>{subtitle}</Text>
      <StateBadge tone={badge.tone}>{badge.label}</StateBadge>
    </View>
    {interactive ? <Icon name="chevron" size={16} color={colors['ink-muted']} /> : null}
  </>
  const frame = { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, backgroundColor: '#ffffff', paddingHorizontal: 12, paddingVertical: 10 } as const
  const label = `${item.label}, ${first} contra ${second}. ${subtitle}. ${badge.label}.`
  return interactive
    ? <Pressable testID={`match-${item.card.id}`} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={frame}>{content}</Pressable>
    : <View testID={`match-${item.card.id}`} accessible accessibilityLabel={label} style={[frame, { opacity: 0.8 }]}>{content}</View>
}

/**
 * Partidas do campeonato (S1), do lado do organizador: a lista dos jogos, com os que estão sem data primeiro, e a folha de
 * agendamento (data, horário livre, quadra). Tocar num jogo sem data (ou agendado, antes do início) abre a folha; um jogo
 * com placar para decidir abre a decisão (D3); os demais abrem a partida. Os jogos que esperam o vencedor de uma fase
 * anterior aparecem como "Vencedor J1" e não podem ser agendados. `matchId` nos parâmetros abre a folha daquele jogo. Um
 * `409` que não é conflito de agenda ("resultado já definido", "já começou") relê a lista, e a mensagem do servidor fica visível.
 */
export default function EventMatchesScreen({ params, navigation, onExpired }: ScreenProps<'event-matches'>) {
  const eventId = params.eventId
  const loadEvent = useCallback(() => getOrganizerEvent(eventId), [eventId])
  const loadMatches = useCallback(() => listEventMatches(eventId), [eventId])
  const event = useResource(loadEvent, onExpired, { fallback: 'Não foi possível carregar o evento.' })
  const matches = useResource(loadMatches, onExpired, { fallback: 'Não foi possível carregar as partidas.' })
  const action = useSubmit(onExpired)
  const [selected, setSelected] = useState<number | null>(params.matchId ?? null)
  const [conflict, setConflict] = useState<ScheduleConflict | null>(null)
  const [status, setStatus] = useState('')
  const consumed = useRef(false)
  const { setData } = matches

  // O pedido de abrir a folha de uma partida vale uma vez: consome o parâmetro para voltar a esta tela sem reabrir.
  useEffect(() => {
    if (params.matchId === undefined || consumed.current) return
    consumed.current = true
    navigation.setParams('event-matches', { matchId: undefined })
  }, [params.matchId, navigation])

  const list = matches.data
  const row = selected !== null ? list?.items.find(item => item.card.id === selected && item.can_schedule) ?? null : null

  function open(item: EventMatchRow) {
    if (item.awaiting_decision) return navigation.go('result-decision', { matchId: item.card.id })
    if (item.can_schedule) { action.setError(''); setConflict(null); setSelected(item.card.id); return }
    if (item.card.sides.length === 2) navigation.go('match', { matchId: item.card.id })
  }
  function close() { action.setError(''); setConflict(null); setSelected(null) }

  async function save(input: ScheduleInput) {
    if (!row) return
    setConflict(null)
    let found: ScheduleConflict | null = null
    let stale = false
    const saved = await action.run(async () => {
      try {
        return await scheduleMatch(row.card.id, input)
      } catch (cause) {
        found = scheduleConflict(cause)
        // 409 que não é conflito de agenda ("resultado já definido", "já começou"): a lista estava velha.
        stale = cause instanceof ApiError && cause.status === 409 && found === null
        throw cause
      }
    }, 'Não foi possível agendar a partida.')
    if (!saved) {
      setConflict(found)
      if (stale) await reload()
      return
    }
    setSelected(null)
    const message = `${saved.label} ${row.card.starts_at ? 'reagendado' : 'agendado'} para ${whenText(saved.card.starts_at)}${saved.card.court ? ` em ${saved.card.court.name}` : ''}. Os dois elencos foram avisados.`
    setStatus(message)
    announce(message)
    if (!await reload()) setData(old => old ? { ...old, items: old.items.map(item => item.card.id === saved.card.id ? saved : item) } : old)
  }
  /** Relê a lista sem esconder a tela; devolve se deu certo (a falha mantém a lista que já estava na tela). */
  async function reload(): Promise<boolean> {
    try {
      setData(await listEventMatches(eventId))
      return true
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      return false
    }
  }

  const header = <TeamsPlate bottom={16}>
    <DarkTopBar eyebrow={event.data?.name ?? 'Organizador'} title="Partidas" onBack={navigation.back} />
    {list && list.counts.total > 0 ? <Text testID="schedule-progress" style={{ paddingHorizontal: 20, paddingTop: 4, color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
      {`${list.counts.total - list.counts.to_schedule - list.counts.waiting} de ${plural(list.counts.total, 'jogo', 'jogos')} com data`}
    </Text> : null}
  </TeamsPlate>

  if (!list) {
    return <View style={{ flex: 1 }}>
      {header}
      <View style={{ padding: 20 }}>
        {matches.loading ? <Text accessibilityLiveRegion="polite" style={{ color: colors['ink-muted'], fontSize: 12 }}>Carregando as partidas…</Text> : null}
        {matches.error ? <View><Notice>{matches.error}</Notice><TextAction title="Tentar novamente" onPress={matches.reload} /></View> : null}
      </View>
    </View>
  }

  const chips = counters(list.counts)
  const allSet = list.counts.to_schedule === 0 && list.counts.to_decide === 0 && list.counts.waiting === 0 && list.counts.scheduled > 0
  return <View style={{ flex: 1 }}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 48 }}>
      {header}
      <View style={{ padding: 16, gap: 12 }}>
        <LiveNotice text={status} />
        {action.error && !row ? <ErrorText>{action.error}</ErrorText> : null}

        {list.items.length === 0
          ? <View style={{ alignItems: 'center', borderRadius: 16, backgroundColor: '#ffffff', padding: 20 }}>
            <Icon name="calendar-days" size={24} color={colors['ink-muted']} />
            <Text accessibilityRole="header" style={{ marginTop: 6, color: colors.ink, fontSize: 14, fontWeight: '700' }}>Nenhuma partida ainda</Text>
            <Text style={{ marginTop: 4, color: colors['ink-muted'], fontSize: 12, lineHeight: 18, textAlign: 'center' }}>As partidas aparecem quando você confirma o chaveamento do campeonato.</Text>
          </View>
          : <>
            {chips.length > 0 ? <View accessibilityRole="list" accessibilityLabel="Resumo das partidas" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {chips.map(item => <View key={item.label} accessible accessibilityLabel={`${item.value} ${item.label}`}
                style={{ minHeight: 28, justifyContent: 'center', borderRadius: 14, backgroundColor: item.hot ? colors['warning-bg'] : '#ffffff', paddingHorizontal: 10 }}>
                <Text style={{ color: item.hot ? colors.warning : colors['ink-muted'], fontSize: 10.5, fontWeight: '700' }}>
                  <Text style={{ fontSize: 11.5, fontWeight: '800' }}>{item.value}</Text>{` ${item.label}`}
                </Text>
              </View>)}
            </View> : null}
            {allSet ? <View accessible accessibilityLabel="Tudo agendado. Os dois elencos de cada jogo foram avisados nas notificações." style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 16, backgroundColor: colors['success-bg'], padding: 12 }}>
              <Icon name="circle-check" size={19} color={colors.brand} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '700' }}>Tudo agendado</Text>
                <Text style={{ color: colors.ink, fontSize: 11.5, lineHeight: 17 }}>Os dois elencos de cada jogo foram avisados nas notificações.</Text>
              </View>
            </View> : null}
            <View accessibilityRole="list" accessibilityLabel="Jogos do campeonato" style={{ gap: 8 }}>
              {list.items.map(item => <MatchRow key={item.card.id} item={item} onPress={() => open(item)} />)}
            </View>
          </>}
      </View>
    </ScrollView>

    {row ? <ScheduleSheet row={row} city={event.data?.city ?? null} busy={action.busy} error={action.error} conflict={conflict}
      onSubmit={input => void save(input)} onClose={close} onExpired={onExpired}
      onOpenMatch={row.card.sides.length === 2 ? () => navigation.go('match', { matchId: row.card.id }) : undefined} /> : null}
  </View>
}
