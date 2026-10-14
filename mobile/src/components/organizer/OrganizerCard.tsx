import { useState } from 'react'
import { Text, View } from 'react-native'
import { ApiError } from '../../api/client'
import type { OrganizerEventCard } from '../../api/events'
import { cancelOrganizerRequest, getOrganizerStatus, refusalText, sentence } from '../../api/organizer'
import type { OrganizerState, OrganizerStatus } from '../../api/organizer'
import { isStale, useSubmit } from '../../hooks/useSubmit'
import { useThemeColors } from '../../hooks/useTheme'
import { colors } from '../../theme'
import { plural } from '../../utils/format'
import { shortDate } from '../../utils/relativeTime'
import { EventPoster } from '../arena/EventPoster'
import { ActionButton, MenuRow, Situation } from '../arena/controls'
import { LoadError } from '../arena/LoadError'
import { toast } from '../toast/toastStore'
import { alertCount, posterProps } from './eventView'
import { Icon } from '../Icon'

type Stage = 'done' | 'current' | 'bad' | 'todo'
const stageNames = ['Pedir', 'Análise', 'Organizar'] as const
const stagesFor: Record<Exclude<OrganizerState, 'aprovado'>, Stage[]> = {
  sem_pedido: ['current', 'todo', 'todo'],
  em_analise: ['done', 'current', 'todo'],
  recusado: ['done', 'bad', 'todo'],
  revogado: ['done', 'done', 'bad'],
}
const stageText: Record<Stage, string> = { done: 'concluída', current: 'etapa atual', bad: 'não concluída', todo: 'a seguir' }

/** Etapas Pedir → Análise → Organizar do cartão P3. */
function Stages({ stages }: { stages: Stage[] }) {
  return <View accessibilityLabel="Etapas do pedido" style={{ marginVertical: 14, flexDirection: 'row', gap: 6 }}>
    {stageNames.map((name, index) => {
      const stage = stages[index]
      const circle = stage === 'done' ? { backgroundColor: colors.mint } : stage === 'bad' ? { backgroundColor: colors['danger-soft'] }
        : stage === 'current' ? { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 2, borderColor: colors.mint } : { backgroundColor: 'rgba(255,255,255,0.08)' }
      return <View key={name} testID={`stage-${stage}`} accessible accessibilityLabel={`${name}: ${stageText[stage]}`} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
        <View style={[{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, circle]}>
          {stage === 'done' ? <Icon name="check" size={14} color={colors.night} />
            : stage === 'bad' ? <Icon name="x" size={14} color={colors.night} />
            : <Text style={{ color: stage === 'current' ? colors.mint : 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '800' }}>{index + 1}</Text>}
        </View>
        <Text style={{ color: stage === 'todo' ? 'rgba(255,255,255,0.6)' : '#ffffff', fontSize: 10.5, fontWeight: '700' }}>{name}</Text>
      </View>
    })}
  </View>
}

const cardText = { color: 'rgba(255,255,255,0.7)', fontSize: 11, lineHeight: 17 } as const

/**
 * Cartão escuro "Organizar no Arena" (P3) do Menu, com as etapas e o estado do pedido: sem pedido ("Quero organizar"),
 * em análise ("Cancelar pedido", com confirmação), recusado ou revogado (motivo e "Enviar novo pedido"). Com a permissão
 * aprovada, o Menu mostra `OrganizerEvents` no lugar dele.
 */
export function OrganizerCard({ status, onRequest, onChange, onExpired }: {
  status: OrganizerStatus
  /** Abre a tela "Seja organizador" (P5). */
  onRequest: () => void
  /** Novo estado depois de cancelar o pedido. */
  onChange: (status: OrganizerStatus) => void
  onExpired: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const { busy, run } = useSubmit(onExpired)
  if (status.state === 'aprovado' || !(status.state in stagesFor)) return null
  const state = status.state

  async function cancel() {
    const done = await run(async () => { await cancelOrganizerRequest(); return true }, 'Não foi possível cancelar o pedido.', cause => {
      // Pedido já decidido (ou cancelado em outro lugar; o toast de aviso mostra a mensagem): o cartão confere o estado atual em vez de manter o antigo.
      if (!isStale(cause)) return
      setConfirming(false)
      getOrganizerStatus().then(onChange).catch((failure: unknown) => { if (failure instanceof ApiError && failure.status === 401) onExpired() })
    })
    if (!done) return
    setConfirming(false)
    toast.success('Pedido cancelado.', { description: 'Você pode enviar um novo quando quiser.' })
    onChange({ state: 'sem_pedido', request: null, organizer: null, revocation: null })
  }
  const sent = status.request?.created_at ? shortDate(status.request.created_at) : ''
  return <View testID="organizer-card" accessibilityLabel="Organizar no Arena" style={{ marginTop: 8, borderRadius: 20, backgroundColor: colors.forest, padding: 14 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Icon name="trophy" size={24} color={colors.mint} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text accessibilityRole="header" style={{ color: '#ffffff', fontSize: 14, fontWeight: '800' }}>Organizar no Arena</Text>
        <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10.5 }}>Campeonatos de futebol e tênis e provas de corrida</Text>
      </View>
    </View>
    <Stages stages={stagesFor[state]} />
    {state === 'sem_pedido' ? <>
      <Text style={[cardText, { marginBottom: 12 }]}>Peça a permissão de organizador. A administração do Arena analisa o pedido e responde nas notificações.</Text>
      <ActionButton block tone="mint" title="Quero organizar" onPress={onRequest} />
    </> : null}
    {state === 'em_analise' ? <>
      <Situation surface="dark" tone="wait" icon="hourglass" title="Pedido em análise">{`${sent ? `Enviado em ${sent}. ` : ''}Você recebe a resposta nas notificações.`}</Situation>
      <View style={{ marginTop: 10 }}>
        {confirming
          ? <View accessibilityRole="alert" style={{ borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', padding: 14 }}>
            <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>Cancelar o pedido em análise?</Text>
            <Text style={[cardText, { marginTop: 4, marginBottom: 12 }]}>A administração deixa de analisá-lo. Você pode enviar outro depois.</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <ActionButton tone="line" title="Manter pedido" disabled={busy} onPress={() => setConfirming(false)} />
              <ActionButton tone="danger" title={busy ? 'Cancelando…' : 'Cancelar pedido'} accessibilityLabel="Cancelar pedido" busy={busy} onPress={() => void cancel()} />
            </View>
          </View>
          : <ActionButton block tone="line" title="Cancelar pedido" onPress={() => setConfirming(true)} />}
      </View>
    </> : null}
    {state === 'recusado' ? <>
      <Situation surface="dark" tone="bad" icon="circle-x" title="Pedido recusado">{`Motivo: ${sentence(refusalText(status.request?.reason_code, status.request?.reason_detail))} Você pode enviar um novo pedido.`}</Situation>
      <View style={{ marginTop: 10 }}><ActionButton block tone="mint" icon="rotate-ccw" title="Enviar novo pedido" onPress={onRequest} /></View>
    </> : null}
    {state === 'revogado' ? <>
      <Situation surface="dark" tone="bad" icon="circle-x" title="Permissão revogada">{`Motivo: ${sentence(status.revocation?.reason || 'não informado')} Você pode enviar um novo pedido.`}</Situation>
      <View style={{ marginTop: 10 }}><ActionButton block tone="mint" icon="rotate-ccw" title="Enviar novo pedido" onPress={onRequest} /></View>
    </> : null}
  </View>
}

/**
 * Seção "Organizador · Meus eventos" do Menu: com a permissão (ou com eventos mantidos), a prévia dos eventos em aberto em
 * cartazes compactos (os dois primeiros, por data) e o acesso à área do organizador (O3). Sem eventos, o estado vazio leva
 * a criar o primeiro.
 */
export function OrganizerEvents({ status, events, loading, error, errorCause, onReload, onOpenList, onOpenEvent, onCreate }: {
  status: OrganizerStatus | null
  /** Eventos em aberto (`GET /organizer/events?scope=abertos`). */
  events: OrganizerEventCard[]
  loading: boolean
  error: string
  /** A causa da falha (para o `LoadError` reconhecer a falta de conexão). */
  errorCause?: unknown
  onReload: () => void
  /** Abre a área do organizador (O3). */
  onOpenList: () => void
  /** Abre a gestão de um evento (G3). */
  onOpenEvent: (eventId: number) => void
  /** Abre o Criar evento (V4); só com a permissão ativa. */
  onCreate: () => void
}) {
  const themed = useThemeColors()
  const approved = status?.state === 'aprovado'
  const preview = events.slice(0, 2)
  const pending = events.reduce((total, event) => total + alertCount(event), 0)
  const summary = loading ? 'Carregando…' : events.length
    ? `${events.length === 1 ? '1 evento em aberto' : `${events.length} eventos em aberto`}${pending ? ` · ${plural(pending, 'pendência', 'pendências')}` : ''}`
    : 'Nenhum evento em aberto.'
  return <View accessibilityLabel="Organizador">
    {loading ? <Text accessibilityLiveRegion="polite" style={{ marginBottom: 8, color: themed['ink-muted'], fontSize: 11 }}>Carregando os seus eventos…</Text> : null}
    {error ? <LoadError size="section" title="Não foi possível carregar os seus eventos" text={error} cause={errorCause} onRetry={onReload} /> : null}
    {preview.length ? <View accessibilityLabel="Próximos eventos" style={{ marginBottom: 10, flexDirection: 'row', gap: 10 }}>
      {preview.map(event => <View key={event.id} style={{ flex: 1, minWidth: 0 }}>
        <EventPoster {...posterProps(event)} pendingCount={alertCount(event)} showSport onPress={() => onOpenEvent(event.id)} />
      </View>)}
      {preview.length === 1 ? <View style={{ flex: 1 }} /> : null}
    </View> : null}
    <MenuRow icon="calendar-range" title="Meus eventos" subtitle={`${approved && status?.organizer ? `${status.organizer.display_name} · ` : ''}${summary}`} hot={pending > 0} onPress={onOpenList} />
    {approved && !loading && !events.length ? <MenuRow icon="plus" title="Criar evento" onPress={onCreate} /> : null}
  </View>
}
