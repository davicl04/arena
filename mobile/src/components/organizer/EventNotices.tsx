import { useState } from 'react'
import { Text, View } from 'react-native'
import { EVENT_LIMITS, eventMessagesPath, postEventMessage } from '../../api/events'
import type { EventMessage } from '../../api/events'
import { usePagedList } from '../../hooks/usePagedList'
import { useSubmit } from '../../hooks/useSubmit'
import { colors } from '../../theme'
import { relativeTime } from '../../utils/relativeTime'
import { ActionButton, FormField, Notice, TextAction } from '../arena/controls'
import { LoadError } from '../arena/LoadError'
import { toast } from '../toast/toastStore'
import { Icon } from '../Icon'

/** Um aviso: o automático do cancelamento em destaque (vermelho, com o selo "Evento cancelado"). */
function NoticeItem({ message }: { message: EventMessage }) {
  const cancelled = message.kind === 'evento_cancelado'
  const author = message.author?.name ?? (cancelled ? 'Aviso automático' : 'Organizador')
  return <View testID={`notice-${message.kind}`} accessibilityLabel={`${cancelled ? 'Evento cancelado. ' : ''}${author}, ${relativeTime(message.created_at)}. ${message.body}`} accessible
    style={{ borderRadius: 16, padding: 12, backgroundColor: cancelled ? '#fff0f2' : '#ffffff', borderWidth: cancelled ? 1 : 0, borderColor: 'rgba(185,55,73,0.2)' }}>
    <View style={{ marginBottom: 4, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      {cancelled ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, backgroundColor: colors.danger, paddingHorizontal: 8, paddingVertical: 2 }}>
        <Icon name="circle-x" size={12} color="#ffffff" /><Text style={{ color: '#ffffff', fontSize: 9.5, fontWeight: '800' }}>Evento cancelado</Text>
      </View> : null}
      <Text style={{ color: colors.ink, fontSize: 10.5, fontWeight: '700' }}>{author}</Text>
      <Text style={{ color: colors['ink-muted'], fontSize: 10.5 }}>{relativeTime(message.created_at)}</Text>
    </View>
    <Text selectable style={{ color: colors.ink, fontSize: 12, lineHeight: 19 }}>{message.body}</Text>
  </View>
}

/**
 * Canal de avisos do evento (`GET`/`POST /events/{id}/messages`): o organizador escreve, os inscritos leem e recebem a
 * notificação. Do mais recente ao mais antigo; o aviso automático do cancelamento aparece em destaque.
 */
export function EventNotices({ eventId, canWrite, onExpired }: {
  eventId: number
  /** Publicado ou depois, sem a decisão pendente da administração. */
  canWrite: boolean
  onExpired: () => void
}) {
  const list = usePagedList<EventMessage>(eventMessagesPath(eventId), onExpired)
  const [body, setBody] = useState('')
  const { busy, error, setError, run } = useSubmit(onExpired)
  const text = body.trim()
  const max = EVENT_LIMITS.messageMax

  async function send() {
    if (!text) { setError(`Escreva o aviso (até ${max} caracteres).`); return }
    const sent = await run(() => postEventMessage(eventId, text), 'Não foi possível publicar o aviso.')
    if (!sent) return
    list.setItems(old => [sent, ...old.filter(item => item.id !== sent.id)])
    setBody('')
    toast.success('Aviso publicado.', { description: 'Os inscritos recebem uma notificação.' })
  }

  return <View accessibilityLabel="Avisos do evento" style={{ marginTop: 24 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Icon name="megaphone" size={18} color={colors.brand} />
      <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>Avisos do evento</Text>
    </View>
    <Text style={{ marginTop: 4, color: colors['ink-muted'], fontSize: 11, lineHeight: 17 }}>Só você escreve. Os inscritos (atletas ou elencos dos times) leem aqui e recebem a notificação.</Text>
    {canWrite ? <View style={{ marginTop: 12, borderRadius: 16, backgroundColor: '#ffffff', padding: 12 }}>
      <FormField label="Novo aviso" value={body} onChangeText={value => { setBody(value); setError('') }} multiline maxLength={max}
        placeholder="Ex.: mudamos o horário da primeira rodada para 9h." hint={`${body.length}/${max}`} />
      <View style={{ marginTop: 10 }}><ActionButton block icon="send" title={busy ? 'Publicando…' : 'Publicar aviso'} accessibilityLabel="Publicar aviso" disabled={!text} busy={busy} onPress={() => void send()} /></View>
      {error ? <Notice>{error}</Notice> : null}
    </View> : null}
    {list.loading ? <Text accessibilityLiveRegion="polite" style={{ marginTop: 12, color: colors['ink-muted'], fontSize: 11.5 }}>Carregando os avisos…</Text> : null}
    {list.error ? <LoadError size="section" title="Não foi possível carregar os avisos" text={list.error.message} cause={list.error} onRetry={list.reload} /> : null}
    {!list.loading && !list.error ? (list.items.length
      ? <View accessibilityLabel="Avisos publicados" style={{ marginTop: 12, gap: 8 }}>{list.items.map(message => <NoticeItem key={message.id} message={message} />)}</View>
      : <Text style={{ marginTop: 12, color: colors['ink-muted'], fontSize: 11.5 }}>Nenhum aviso ainda.</Text>) : null}
    {list.moreError ? <Notice>{list.moreError}</Notice> : null}
    {list.hasMore ? <TextAction title={list.busy ? 'Carregando…' : 'Carregar avisos anteriores'} disabled={list.busy} onPress={() => void list.loadMore()} /> : null}
  </View>
}
