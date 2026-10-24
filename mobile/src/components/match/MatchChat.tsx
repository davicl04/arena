import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import { MESSAGE_MAX } from '../../api/matches'
import type { MatchDetail, MatchMessageOut } from '../../api/matches'
import { eventWhen, shortName, sideOf } from '../../data/match'
import { useMatchChat } from '../../hooks/useMatchChat'
import { useResolvedTheme, useThemeColors } from '../../hooks/useTheme'
import { formatClock, parseIso } from '../../utils/format'
import { Armband } from '../arena/Armband'
import { ActionButton } from '../arena/controls'
import { LoadError } from '../arena/LoadError'
import { TeamCrest } from '../arena/TeamCrest'
import { Icon } from '../Icon'
import { Avatar } from '../media'
import { chatRows } from './chatRows'

/*
 * Chat da partida (C1): o meu time à direita (eu em verde-escuro, colegas em verde-claro) e o adversário à esquerda, em
 * branco; mensagens seguidas da mesma pessoa se agrupam, com nome, time, hora e a braçadeira "C" dos representantes (e a
 * etiqueta "Organizador" no campeonato); os eventos da partida são faixas com o brasão. Leitura a cada 4 s com a tela visível
 * e o app em primeiro plano (pausa em segundo plano), envio pelo botão (até 1000 caracteres) e denúncia de mensagem pelo
 * formulário de denúncias (`ReportForm`, `match_message`).
 */

/** A contagem de caracteres aparece quando o texto chega perto do limite. */
export const COUNTER_FROM = 800
const clock = (iso: string) => {
  const date = parseIso(iso)
  return date ? formatClock(date) : ''
}

function EventStrip({ detail, message, token }: { detail: MatchDetail; message: MatchMessageOut; token?: string | null }) {
  const colors = useThemeColors()
  const dark = useResolvedTheme() === 'dark'
  const team = sideOf(detail, message.side)?.team ?? null
  const when = eventWhen(message.payload)
  return <View testID="chat-event" accessibilityLabel={`${when ? `${when}. ` : ''}${message.body ?? ''}`} accessible
    style={{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, backgroundColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.65)', paddingHorizontal: 12, paddingVertical: 8 }}>
    {team ? <TeamCrest name={team.name} initials={team.initials} path={team.crest_url} size="xs" decorative token={token} />
      : <Icon name="info" size={15} color={colors.brand} />}
    <Text style={{ flex: 1, minWidth: 0, color: colors.ink, fontSize: 11.5, lineHeight: 16 }}>
      {when ? <Text style={{ fontWeight: '800' }}>{`${when} · `}</Text> : null}{message.body}
    </Text>
    <Text style={{ color: colors['ink-muted'], fontSize: 9.5, fontVariant: ['tabular-nums'] }}>{clock(message.created_at)}</Text>
  </View>
}

function Bubble({ message, own, onReport }: { message: MatchMessageOut; own: boolean; onReport?: () => void }) {
  const colors = useThemeColors()
  const dark = useResolvedTheme() === 'dark'
  if (message.removed) {
    return <View testID="chat-removed" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 16, backgroundColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)', paddingHorizontal: 12, paddingVertical: 8 }}>
      <Icon name="eye-off" size={14} color={colors['ink-muted']} />
      <Text style={{ color: colors['ink-muted'], fontSize: 12, fontStyle: 'italic' }}>Mensagem removida</Text>
    </View>
  }
  const mine = message.is_mine
  return <View style={{ maxWidth: '100%', flexDirection: own ? 'row-reverse' : 'row', alignItems: 'center', gap: 2 }}>
    <View testID="chat-bubble" style={{ flexShrink: 1, borderRadius: 16, borderBottomRightRadius: mine ? 6 : 16, borderBottomLeftRadius: !own ? 6 : 16, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: mine ? colors.brand : own ? (dark ? '#16301f' : '#d5e9dc') : colors.surface }}>
      <Text selectable style={{ color: mine ? colors['on-brand'] : colors.ink, fontSize: 13, lineHeight: 19 }}>{message.body}</Text>
    </View>
    {!mine && onReport ? <Pressable accessibilityRole="button" accessibilityLabel={`Denunciar mensagem de ${message.author?.name ?? 'participante'}`} onPress={onReport} hitSlop={{ left: 2, right: 2 }}
      style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="flag" size={14} color={colors['ink-muted']} />
    </Pressable> : null}
  </View>
}

function Group({ detail, messages, onReport, token }: { detail: MatchDetail; messages: MatchMessageOut[]; onReport: (message: MatchMessageOut) => void; token?: string | null }) {
  const colors = useThemeColors()
  const first = messages[0]
  const last = messages[messages.length - 1]
  const side = sideOf(detail, first.side)
  // O meu time (eu e os colegas) fala à direita; o adversário, à esquerda. O organizador (sem lado) fala à direita só para ele.
  const own = first.is_mine || (detail.my_side !== null && first.side === detail.my_side)
  const organizer = first.author_role === 'organizador'
  const name = first.is_mine ? 'Você' : (first.author?.name ?? 'Participante')
  return <View testID="chat-group" style={{ maxWidth: '88%', flexDirection: own ? 'row-reverse' : 'row', alignSelf: own ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 8 }}>
    <View style={{ width: 30, height: 30 }}>
      <Avatar path={first.author?.avatar_url ?? null} name={first.author?.name ?? 'Participante'} token={token ?? null} size={30} />
      {side?.team ? <View style={{ position: 'absolute', right: -4, bottom: -3 }}>
        <TeamCrest name={side.team.name} initials={side.team.initials} path={side.team.crest_url} size="xs" decorative token={token} />
      </View> : null}
    </View>
    <View style={{ flexShrink: 1, gap: 3, alignItems: own ? 'flex-end' : 'flex-start' }}>
      <View style={{ flexDirection: own ? 'row-reverse' : 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
        <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.ink, fontSize: 10.5, fontWeight: '800' }}>{name}</Text>
        {first.author_role === 'representante' ? <Armband variant="inline" /> : null}
        {organizer
          ? <Text testID="organizer-tag" style={{ borderRadius: 6, overflow: 'hidden', backgroundColor: colors.forest, color: colors.mint, paddingHorizontal: 6, paddingVertical: 1, fontSize: 9, fontWeight: '800' }}>Organizador</Text>
          : side ? <Text numberOfLines={1} style={{ flexShrink: 1, color: colors['ink-muted'], fontSize: 10.5 }}>{shortName(side)}</Text> : null}
        <Text style={{ color: colors['ink-muted'], fontSize: 9.5, fontVariant: ['tabular-nums'] }}>{clock(last.created_at)}</Text>
      </View>
      {messages.map(message => <Bubble key={message.id} message={message} own={own} onReport={message.kind === 'texto' && !message.removed ? () => onReport(message) : undefined} />)}
    </View>
  </View>
}

function Composer({ detail, sending, error, onSend, onPropose, inputRef }: {
  detail: MatchDetail
  sending: boolean
  error: string
  onSend: (body: string) => Promise<boolean>
  onPropose?: () => void
  inputRef?: RefObject<TextInput | null>
}) {
  const colors = useThemeColors()
  const dark = useResolvedTheme() === 'dark'
  const [text, setText] = useState('')
  const { write_chat: canWrite, read_chat: canRead, propose_terms: canPropose } = detail.permissions
  const body = text.trim()
  const canSend = Boolean(body) && !sending

  async function submit() {
    if (!body || sending) return
    if (await onSend(body)) setText('')
  }

  if (!canWrite) {
    const admin = detail.my_role === 'administracao'
    return <View testID="chat-closed" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 12 }}>
      <Icon name="info" size={15} color={colors['ink-muted']} />
      <Text style={{ flex: 1, color: colors['ink-muted'], fontSize: 11.5, lineHeight: 16 }}>
        {detail.my_role === 'historico' ? 'O acesso pelo histórico não inclui o chat.' : !canRead ? 'O chat abre quando os dois lados aceitam a proposta.' : admin ? 'A administração só lê o chat.' : 'O chat desta partida está fechado.'}
      </Text>
    </View>
  }
  const status = sending ? 'Enviando mensagem…' : error
  const counter = text.length >= COUNTER_FROM ? `${text.length}/${MESSAGE_MAX}` : ''
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View testID="chat-composer" style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface, padding: 8 }}>
      {canPropose && onPropose ? <Pressable accessibilityRole="button" accessibilityLabel="Propor dia, horário e quadra" onPress={onPropose}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="calendar-plus" size={20} color={colors.brand} />
      </Pressable> : null}
      <TextInput ref={inputRef} accessibilityLabel="Mensagem" accessibilityHint={counter || undefined} multiline maxLength={MESSAGE_MAX} value={text}
        onChangeText={value => setText(value.slice(0, MESSAGE_MAX))} placeholder={detail.sport === 'tenis' ? 'Mensagem para a partida' : 'Mensagem para os dois times'} placeholderTextColor={colors.placeholder}
        textAlignVertical="center" style={{ flex: 1, minWidth: 0, minHeight: 44, maxHeight: 112, borderRadius: 22, borderWidth: 1, borderColor: colors['line-strong'], backgroundColor: colors.subtle, color: colors.ink, fontSize: 14, lineHeight: 19, paddingHorizontal: 14, paddingVertical: 10 }} />
      <Pressable accessibilityRole="button" accessibilityLabel="Enviar mensagem" accessibilityState={{ disabled: !canSend, busy: sending }} disabled={!canSend} onPress={() => void submit()}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: canSend ? 1 : 0.4 }}>
        <Icon name="send-horizontal" size={20} color={colors.brand} />
      </Pressable>
    </View>
    {counter ? <Text testID="chat-counter" style={{ backgroundColor: colors.surface, paddingHorizontal: 16, paddingBottom: 4, textAlign: 'right', color: text.length >= MESSAGE_MAX ? colors.error : colors['ink-muted'], fontSize: 10.5 }}>{`${counter} caracteres`}</Text> : null}
    <Text accessibilityLiveRegion="polite" accessibilityRole={error && !sending ? 'alert' : undefined}
      style={status ? { backgroundColor: error && !sending ? (dark ? '#ff8a8022' : '#fff0f2') : colors.surface, paddingHorizontal: 16, paddingVertical: 6, color: error && !sending ? colors.error : colors['ink-muted'], fontSize: 11.5 } : { height: 0 }}>{status}</Text>
  </KeyboardAvoidingView>
}

/** Estados em que a partida acabou: o chat é só leitura e nada mais chega. */
const FINISHED: MatchDetail['state'][] = ['encerrada', 'sem_resultado', 'cancelada']

export function MatchChat({ detail, onExpired, onReport, onPropose, onEvent, composerRef, token }: {
  detail: MatchDetail
  onExpired: () => void
  onReport: (message: MatchMessageOut) => void
  onPropose?: () => void
  /** Chegou um evento novo da partida (aceite, cancelamento, vagas…): a tela relê o detalhe. */
  onEvent?: () => void
  /** Campo de mensagem, para o "Conversar" do cartão de resultado levar o foco até ele. */
  composerRef?: RefObject<TextInput | null>
  token?: string | null
}) {
  const colors = useThemeColors()
  const dark = useResolvedTheme() === 'dark'
  const chat = useMatchChat(detail.id, detail.permissions.read_chat, onExpired, onEvent, !FINISHED.includes(detail.state))
  const scroller = useRef<ScrollView>(null)
  const stick = useRef(true)
  const lastSeen = useRef<number | null>(null)
  const [unseen, setUnseen] = useState(0)
  const rows = chatRows(chat.items)
  const newest = chat.items[chat.items.length - 1]?.id ?? null
  const newestMine = chat.items[chat.items.length - 1]?.is_mine ?? false

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent
    stick.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 80
    if (stick.current) setUnseen(0)
  }
  function scrollToEnd() {
    scroller.current?.scrollToEnd({ animated: false })
    stick.current = true
    setUnseen(0)
  }
  // Sem rolar para cima, o chat acompanha as mensagens novas; rolando para cima, só avisa que chegaram.
  useEffect(() => {
    if (newest === null || newest === lastSeen.current) return
    const first = lastSeen.current === null
    lastSeen.current = newest
    if (first || stick.current || newestMine) {
      scroller.current?.scrollToEnd({ animated: false })
      stick.current = true
      setUnseen(0)
    } else setUnseen(count => count + 1)
  }, [newest, newestMine])

  const readable = detail.permissions.read_chat
  const championship = detail.origin === 'campeonato'
  return <View testID="match-chat" style={{ flex: 1, minHeight: 0 }}>
    {!readable
      ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 24 }}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Icon name="messages-square" size={26} color={colors['ink-muted']} /></View>
        <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 14, fontWeight: '700', textAlign: 'center' }}>{detail.my_role === 'historico' ? 'Chat indisponível no histórico' : 'O chat ainda não abriu'}</Text>
        <Text style={{ color: colors['ink-muted'], fontSize: 12, lineHeight: 18, textAlign: 'center' }}>{detail.my_role === 'historico' ? 'O acesso pelo histórico permite consultar a partida e suas estatísticas.' : 'Ele abre quando os dois lados aceitam a proposta de partida.'}</Text>
      </View>
      : <View style={{ flex: 1, minHeight: 0 }}>
        <ScrollView ref={scroller} testID="chat-log" accessibilityLabel="Mensagens da partida" onScroll={onScroll} scrollEventThrottle={64} keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => { if (stick.current) scroller.current?.scrollToEnd({ animated: false }) }}
          contentContainerStyle={{ flexGrow: 1, gap: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
          {chat.hasOlder ? <View style={{ alignSelf: 'center' }}>
            <ActionButton tone="outline" size="sm" fit title={chat.loadingOlder ? 'Carregando…' : 'Carregar anteriores'} accessibilityLabel="Carregar anteriores" busy={chat.loadingOlder} onPress={() => void chat.loadOlder()} />
          </View> : null}
          {chat.loading ? <Text accessibilityLiveRegion="polite" style={{ paddingVertical: 16, textAlign: 'center', color: colors['ink-muted'], fontSize: 12 }}>Carregando o chat…</Text> : null}
          {chat.error && !chat.items.length ? <LoadError size="section" title="Não foi possível carregar o chat" text={chat.error} cause={chat.errorCause} onRetry={chat.reload} /> : null}
          {!chat.loading && !chat.error && rows.length === 0
            ? <Text style={{ paddingVertical: 16, textAlign: 'center', color: colors['ink-muted'], fontSize: 12, lineHeight: 18 }}>
              {championship ? 'Nenhuma mensagem ainda. Conversem por aqui.' : 'Nenhuma mensagem ainda. Combinem dia, horário e quadra por aqui.'}
            </Text> : null}
          {rows.map(row => row.kind === 'day'
            ? <Text key={row.key} testID="chat-day" style={{ alignSelf: 'center', borderRadius: 999, overflow: 'hidden', backgroundColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)', paddingHorizontal: 10, paddingVertical: 3, color: colors['ink-muted'], fontSize: 10, fontWeight: '700' }}>{row.label}</Text>
            : row.kind === 'event'
              ? <EventStrip key={row.key} detail={detail} message={row.message} token={token} />
              : <Group key={row.key} detail={detail} messages={row.messages} onReport={onReport} token={token} />)}
        </ScrollView>
        {chat.offline ? <View accessibilityLiveRegion="polite" style={{ position: 'absolute', top: 8, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, backgroundColor: colors.forest, paddingHorizontal: 12, paddingVertical: 6 }}>
          <Icon name="wifi-off" size={13} color="#ffffff" />
          <Text style={{ color: '#ffffff', fontSize: 10.5, fontWeight: '600' }}>Sem conexão. Tentando de novo…</Text>
        </View> : null}
        {unseen > 0 ? <View style={{ position: 'absolute', right: 12, bottom: 12 }}>
          <ActionButton tone="brand" size="sm" fit icon="arrow-down" title={unseen === 1 ? '1 nova mensagem' : `${unseen} novas mensagens`} onPress={scrollToEnd} />
        </View> : null}
      </View>}
    <Composer detail={detail} sending={chat.sending} error={chat.sendError} onSend={chat.send} onPropose={onPropose} inputRef={composerRef} />
  </View>
}
