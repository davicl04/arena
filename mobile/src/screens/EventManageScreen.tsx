import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import type { ScrollViewInstance } from 'react-native'
import { ApiError, sports } from '../api/client'
import { getOrganizerEvent, PUBLISHED_STATES, submitEvent, withdrawEvent } from '../api/events'
import type { OrganizerEventDetail } from '../api/events'
import { eventFormatParts, pixKeyType, tiers } from '../data/arena'
import { EventPoster } from '../components/arena/EventPoster'
import { ActionButton, Notice } from '../components/arena/controls'
import { LoadError } from '../components/arena/LoadError'
import { toast } from '../components/toast/toastStore'
import { DarkTopBar, TeamsPlate } from '../components/arena/TeamsPlate'
import { EventEntries } from '../components/organizer/EventEntries'
import { EventNotices } from '../components/organizer/EventNotices'
import { CancelEventSheet, DeleteDraftSheet, EditPublishedSheet } from '../components/organizer/EventSheets'
import { entriesTitle, entrantsUnit, posterProps } from '../components/organizer/eventView'
import { NextActionCard } from '../components/organizer/NextActionCard'
import { useResource } from '../hooks/useResource'
import { useSubmit } from '../hooks/useSubmit'
import type { ScreenProps } from '../navigation/screens'
import { useThemeColors } from '../hooks/useTheme'
import { formatDeadline, formatPrice, plural } from '../utils/format'
import { Icon } from '../components/Icon'
import type { IconName } from '../components/Icon'

type SectionKey = 'entries' | 'data' | 'pix'
type SheetKind = 'cancel' | 'delete' | 'edit' | null

/** Linha de seção (`.nl`): ícone, título em negrito e o resumo abaixo. */
function RowBody({ icon, title, value, hot, trailing }: { icon: IconName; title: string; value: string; hot?: boolean; trailing?: ReactNode }) {
  const colors = useThemeColors()
  return <>
    <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors['icon-tile'] }}><Icon name={icon} size={17} color={colors['icon-tile-ink']} /></View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }}>{title}</Text>
      <Text style={{ marginTop: 1, color: hot ? colors.danger : colors['ink-muted'], fontSize: 10.5, lineHeight: 15, fontWeight: hot ? '700' : '400' }}>{value}</Text>
    </View>
    {trailing}
  </>
}
const rowStyle = { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 } as const

/** Seção que abre na própria gestão (inscritos, dados, Pix). */
function SectionPanel({ icon, title, value, hot, open, onToggle, onLayout, children }: {
  icon: IconName
  title: string
  value: string
  hot?: boolean
  open: boolean
  onToggle: () => void
  onLayout?: (y: number) => void
  children: ReactNode
}) {
  const colors = useThemeColors()
  return <View onLayout={event => onLayout?.(event.nativeEvent.layout.y)} style={{ borderBottomWidth: 1, borderBottomColor: colors.line }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${value}`} accessibilityState={{ expanded: open }} onPress={onToggle} style={rowStyle}>
      <RowBody icon={icon} title={title} value={value} hot={hot} trailing={<View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}><Icon name="chevron-down" size={17} color={colors['ink-muted']} /></View>} />
    </Pressable>
    {open ? <View style={{ paddingBottom: 12 }}>{children}</View> : null}
  </View>
}

/** Seção com tela própria (comprovantes e devoluções). */
function SectionLink({ icon, title, value, hot, onPress }: { icon: IconName; title: string; value: string; hot?: boolean; onPress: () => void }) {
  const colors = useThemeColors()
  return <View style={{ borderBottomWidth: 1, borderBottomColor: colors.line }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${value}`} onPress={onPress} style={rowStyle}>
      <RowBody icon={icon} title={title} value={value} hot={hot} trailing={<Icon name="chevron" size={17} color={colors['ink-muted']} />} />
    </Pressable>
  </View>
}

/** Seção que ainda não pode ser aberta (chaveamento antes do sorteio, resultados da corrida): apagada, sem ação, com o aviso. */
function SectionLater({ icon, title, value }: { icon: IconName; title: string; value: string }) {
  const colors = useThemeColors()
  return <View accessible accessibilityLabel={`${title}, ${value}`} accessibilityState={{ disabled: true }} style={{ borderBottomWidth: 1, borderBottomColor: colors.line, opacity: 0.6 }}>
    <View style={rowStyle}><RowBody icon={icon} title={title} value={value} /></View>
  </View>
}

/** Lista de dados do evento ou do Pix; valor ausente aparece como "—". */
function DataList({ rows }: { rows: [string, ReactNode, boolean?][] }) {
  const colors = useThemeColors()
  return <View style={{ borderRadius: 12, backgroundColor: colors.subtle, paddingHorizontal: 12, paddingVertical: 4 }}>
    {rows.map(([label, value, mono], index) => {
      const empty = value === null || value === ''
      return <View key={label} accessible accessibilityLabel={`${label}: ${empty ? 'não informado' : typeof value === 'string' ? value : ''}`}
        style={{ flexDirection: 'row', gap: 8, paddingVertical: 8, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
        <Text style={{ width: '40%', color: colors['ink-muted'], fontSize: 11.5 }}>{label}</Text>
        <Text selectable style={{ flex: 1, color: empty ? colors['ink-muted'] : colors.ink, fontSize: 11.5, fontWeight: empty ? '400' : '600', fontFamily: mono && !empty ? 'monospace' : undefined }}>{empty ? '—' : value}</Text>
      </View>
    })}
  </View>
}

/**
 * Gestão do evento (G3): o cartaz no topo, o cartão "Agora" com a próxima ação da API e as seções — inscritos (lista da
 * API), comprovantes e devoluções (tela própria), chaveamento (ou tabela) e partidas do campeonato (telas próprias, com os
 * contadores do cartaz; apagadas até o sorteio ser possível), dados do evento (editáveis conforme `editable_fields`) e pagamento/Pix —, o canal de avisos e as ações de
 * excluir rascunho, retirar da aprovação e cancelar.
 */
export default function EventManageScreen({ params, navigation, onExpired }: ScreenProps<'event-manage'>) {
  const colors = useThemeColors()
  const eventId = params.eventId
  const load = useCallback(() => getOrganizerEvent(eventId), [eventId])
  const resource = useResource(load, onExpired, { fallback: 'Não foi possível carregar o evento.' })
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({ entries: false, data: false, pix: false })
  const [sheet, setSheet] = useState<SheetKind>(null)
  const action = useSubmit(onExpired)
  const scroll = useRef<ScrollViewInstance>(null)
  const entriesY = useRef(0)
  const detail = resource.data

  const toggle = (key: SectionKey) => () => setOpen(old => ({ ...old, [key]: !old[key] }))
  /** Guarda o evento atualizado e confirma a ação com um toast de sucesso (o título e, se houver, o próximo passo). */
  function update(next: OrganizerEventDetail, message: string, description?: string) {
    resource.setData(next)
    toast.success(message, description ? { description } : undefined)
  }
  const receipts = () => navigation.go('event-receipts', { eventId })
  const bracket = () => navigation.go('event-bracket', { eventId })
  const matches = () => navigation.go('event-matches', { eventId })
  const edit = (step?: number) => navigation.go('event-wizard', step === undefined ? { eventId } : { eventId, step })

  const topBar = <DarkTopBar eyebrow="Organizador" title="Gestão do evento" onBack={navigation.back} />
  if (!detail) {
    return <View style={{ flex: 1 }}>
      <TeamsPlate bottom={16}>{topBar}</TeamsPlate>
      <View style={{ padding: 20 }}>
        {resource.loading ? <Text accessibilityLiveRegion="polite" style={{ color: colors['ink-muted'], fontSize: 12 }}>Carregando o evento…</Text> : null}
        {resource.error ? <LoadError size="screen" title="Não foi possível carregar o evento" text={resource.error} cause={resource.errorCause} onRetry={resource.reload} /> : null}
      </View>
    </View>
  }

  const paid = Boolean(detail.price_cents)
  const editable = detail.editable_fields.length > 0
  const draft = detail.state === 'rascunho'
  const published = detail.state === 'publicado' || detail.state === 'em_andamento'
  const beforeRegistration = draft || detail.state === 'em_aprovacao'
  const phaseOpen = beforeRegistration || detail.phase === 'inscricoes_abertas'
  const unit = entrantsUnit(detail.sport)
  const pending = detail.pending
  const refunds = pending.refunds_to_send + pending.refunds_awaiting + pending.refund_disputes
  const missing = detail.checklist.filter(item => !item.done).length
  const sportLabel = sports.find(sport => sport.value === detail.sport)?.label
  const format = detail.sport ? eventFormatParts({ sport: detail.sport, format: detail.format, distanceKm: detail.distance_km, eventType: detail.competition_type }) : []
  const tierText = detail.accepted_tiers ? detail.accepted_tiers.map(tier => tiers[tier]?.name ?? tier).join(', ') : 'Aberto a todos'
  const canEditPublished = published && detail.editable_fields.some(field => ['venue', 'course_notes', 'pix_instructions', 'contact'].includes(field))

  async function submit() {
    if (!detail) return
    const sent = await action.run(() => submitEvent(detail.id), paid ? 'Não foi possível enviar para aprovação.' : 'Não foi possível publicar.')
    if (sent) {
      if (sent.state === 'em_aprovacao') update(sent, 'Enviado para aprovação.', 'Você recebe a resposta nas notificações.')
      else update(sent, 'Evento publicado.', 'As inscrições estão abertas.')
    }
    else getOrganizerEvent(detail.id).then(fresh => resource.setData(fresh)).catch((cause: unknown) => { if (cause instanceof ApiError && cause.status === 401) onExpired() })
  }
  async function withdraw() {
    if (!detail) return
    const back = await action.run(() => withdrawEvent(detail.id), 'Não foi possível retirar da aprovação.')
    if (back) update(back, 'Evento retirado da aprovação.', 'Edite e envie de novo quando quiser.')
  }
  function showEntries() {
    setOpen(old => ({ ...old, entries: true }))
    scroll.current?.scrollTo?.({ y: entriesY.current, animated: true })
  }

  const dataRows: [string, ReactNode][] = [
    ['Nome', detail.name],
    ['Modalidade', sportLabel ? [sportLabel, ...format].join(' · ') : null],
    ['Vagas', detail.capacity ? `${detail.capacity} ${unit}` : null],
    ['Elos aceitos', tierText],
    ['Início', formatDeadline(detail.starts_at)],
    ['Inscrições até', formatDeadline(detail.registration_closes_at)],
    ...(paid && detail.registration_deadline && detail.registration_deadline !== detail.registration_closes_at
      ? [['Fecham de fato', `${formatDeadline(detail.registration_deadline)} (12 h antes, por ser pago)`] as [string, ReactNode]] : []),
    ['Cidade', detail.city ? `${detail.city.name} · ${detail.city.state}` : null],
    ['Local', detail.venue],
    ...(detail.sport === 'corrida' ? [['Percurso', detail.course_notes] as [string, ReactNode]] : []),
    ['Inscrição', detail.price_cents == null ? null : formatPrice(detail.price_cents)],
    ['Contato', detail.contact],
  ]
  const pix = detail.pix
  const pixRows: [string, ReactNode, boolean?][] = pix ? [
    ['Favorecido', pix.beneficiary],
    ['Tipo de chave', pix.key_type ? pixKeyType[pix.key_type].label : null],
    ['Chave', pix.key, true],
    ['Copia e Cola', pix.copy_paste ? 'Cadastrado' : 'Não informado'],
    ['Instruções', pix.instructions],
  ] : []

  // Chaveamento (ou Tabela) e Partidas: apagados até haver o que fazer; depois abrem as telas do campeonato.
  const champ = detail.championship ?? null
  const treeTitle = detail.competition_type === 'todos_contra_todos' ? 'Tabela' : 'Chaveamento'
  const drawable = detail.state === 'publicado' && !phaseOpen && champ !== null && champ.confirmed >= 2
  const bracketReady = champ !== null && (champ.bracket === 'confirmado' || (detail.state === 'publicado' && (champ.bracket === 'sorteado' || drawable)))
  const bracketValue = champ === null ? (phaseOpen ? 'Depois das inscrições' : 'Em breve no Arena')
    : champ.bracket === 'confirmado' ? `Confirmado · ${plural(champ.matches_total, 'jogo', 'jogos')}`
    : champ.bracket === 'sorteado' ? 'Sorteio feito · falta confirmar'
    : phaseOpen ? 'Depois das inscrições'
    : drawable ? `Pronto para sortear · ${plural(champ.confirmed, 'confirmado', 'confirmados')}` : detail.state === 'publicado' ? 'Confirme pelo menos 2 inscrições' : 'Sem chaveamento'
  const matchesReady = champ !== null && champ.bracket === 'confirmado'
  const matchesValue = champ === null || !matchesReady ? (champ?.bracket === 'sorteado' ? 'Depois de confirmar o chaveamento' : phaseOpen ? 'Depois das inscrições' : 'Depois do sorteio')
    : [champ.to_decide && `${champ.to_decide} para decidir`, champ.to_schedule && `${champ.to_schedule} para agendar`, champ.scheduled && plural(champ.scheduled, 'agendada', 'agendadas'),
      champ.waiting && `${champ.waiting} esperando`, champ.finished && `${champ.finished} de ${champ.matches_total} encerradas`].filter(Boolean).join(' · ') || plural(champ.matches_total, 'jogo', 'jogos')

  return <View style={{ flex: 1 }}>
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 48 }}>
      <TeamsPlate bottom={16}>
        {topBar}
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}><EventPoster {...posterProps(detail)} size="hero" /></View>
      </TeamsPlate>

      <View style={{ padding: 16 }}>
      {/* Só a validação do servidor com campos (422) fica na tela; os demais erros de ação são toast ou aviso de conexão. */}
      {action.error ? <Notice>{action.error}</Notice> : null}

      <View style={{ marginTop: 14 }}>
        <NextActionCard detail={detail} busy={action.busy} onSubmit={() => void submit()} onWithdraw={() => void withdraw()} onFill={edit} onReceipts={receipts} onShowEntries={showEntries} onBracket={bracket} onMatches={matches} />
      </View>

      <Text accessibilityRole="header" style={{ marginTop: 20, marginBottom: 8, color: colors.ink, fontSize: 16, fontWeight: '700' }}>Seções</Text>
      <View style={{ borderRadius: 16, backgroundColor: colors.surface, paddingHorizontal: 14 }}>
        {beforeRegistration
          ? <SectionLater icon="users" title={entriesTitle(detail.sport)} value={detail.capacity ? `0 de ${detail.capacity} · depois de publicar` : 'Depois de publicar'} />
          : <SectionPanel icon="users" title={entriesTitle(detail.sport)} open={open.entries} onToggle={toggle('entries')} onLayout={y => { entriesY.current = y }}
            value={detail.capacity ? `${detail.entries_count} de ${detail.capacity} ${unit} · ${detail.confirmed_count} confirmados` : `${detail.entries_count} ${unit}`}>
            {open.entries ? <EventEntries eventId={detail.id} onReceipts={receipts} onExpired={onExpired} /> : null}
          </SectionPanel>}
        {paid && !beforeRegistration ? <SectionLink icon="receipt" title="Comprovantes" onPress={receipts} hot={pending.receipts > 0}
          value={pending.receipts ? `${plural(pending.receipts, 'comprovante', 'comprovantes')} para analisar` : 'Nenhum pendente'} /> : null}
        {refunds > 0 ? <SectionLink icon="undo" title="Devoluções" onPress={receipts} hot={pending.refunds_to_send > 0}
          value={[pending.refunds_to_send && `${pending.refunds_to_send} para enviar`, pending.refunds_awaiting && `${pending.refunds_awaiting} aguardando`,
            pending.refund_disputes && `${pending.refund_disputes} contestadas`].filter(Boolean).join(' · ')} /> : null}
        {detail.sport === 'corrida'
          ? <SectionLater icon="flag" title="Resultados" value={phaseOpen ? 'Depois da prova · disponível em breve' : 'Disponível em breve'} />
          : <>
            {bracketReady
              ? <SectionLink icon="fork" title={treeTitle} value={bracketValue} hot={champ?.bracket === 'sorteado'} onPress={bracket} />
              : <SectionLater icon="fork" title={treeTitle} value={bracketValue} />}
            {matchesReady
              ? <SectionLink icon="calendar" title="Partidas" value={matchesValue} hot={champ.attention > 0} onPress={matches} />
              : <SectionLater icon="calendar" title="Partidas" value={matchesValue} />}
          </>}
        <SectionPanel icon="file-text" title="Dados do evento" open={open.data} onToggle={toggle('data')} hot={draft && missing > 0}
          value={draft ? (missing ? `${missing === 1 ? 'Falta 1 item' : `Faltam ${missing} itens`} do checklist` : 'Rascunho completo') : 'Modalidade, datas, local e elos'}>
          <DataList rows={dataRows} />
          {detail.tennis_bonus ? <Text style={{ marginTop: 8, color: colors['ink-muted'], fontSize: 10.5, lineHeight: 16 }}>
            Bônus do ranking do tênis (RN16): campeão +{detail.tennis_bonus.champion}, vice +{detail.tennis_bonus.runner_up} e semifinalistas +{detail.tennis_bonus.semifinalist}, com pelo menos {detail.tennis_bonus.min_entries} inscritos{detail.tennis_bonus.applies ? ' (já vale).' : '.'}
          </Text> : null}
          {draft && editable ? <View style={{ marginTop: 10 }}><ActionButton fit tone="outline" icon="pencil" title="Editar no assistente" onPress={() => edit()} /></View> : null}
          {canEditPublished ? <View style={{ marginTop: 10 }}><ActionButton fit tone="outline" icon="pencil" title="Editar local e contato" onPress={() => setSheet('edit')} /></View> : null}
          {!draft && !published && detail.state !== 'em_aprovacao' ? <Text style={{ marginTop: 8, color: colors['ink-muted'], fontSize: 10.5 }}>Este evento não pode mais ser editado.</Text> : null}
          {detail.state === 'em_aprovacao' ? <Text style={{ marginTop: 8, color: colors['ink-muted'], fontSize: 10.5 }}>Para editar, retire o evento da aprovação.</Text> : null}
        </SectionPanel>
        <SectionPanel icon="qr-code" title="Pagamento e Pix" open={open.pix} onToggle={toggle('pix')}
          value={detail.price_cents == null ? 'Gratuito ou pago: a definir' : paid ? `${formatPrice(detail.price_cents)} · chave, Copia e Cola e instruções` : 'Evento gratuito'}>
          {paid && pix ? <>
            <DataList rows={pixRows} />
            <Text style={{ marginTop: 8, color: colors['ink-muted'], fontSize: 10.5, lineHeight: 16 }}>Só aparece para quem está logado. O Arena não recebe pagamentos: só registra os comprovantes.</Text>
          </> : <Text style={{ color: colors['ink-muted'], fontSize: 11.5, lineHeight: 17 }}>{detail.price_cents == null ? 'Escolha no assistente se a inscrição é gratuita ou paga.' : 'Evento gratuito: sem Pix e sem comprovantes.'}</Text>}
          {draft && editable ? <View style={{ marginTop: 10 }}><ActionButton fit tone="outline" icon="pencil" title="Editar inscrição e Pix" onPress={() => edit(4)} /></View> : null}
        </SectionPanel>
      </View>

      {PUBLISHED_STATES.includes(detail.state) ? <EventNotices key={detail.state} eventId={detail.id} canWrite={!detail.revocation_pending} onExpired={onExpired} /> : null}

      {(draft || published) && editable ? <View style={{ marginTop: 24, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 16 }}>
        {draft ? <ActionButton block tone="outline" icon="trash" title="Excluir rascunho" onPress={() => setSheet('delete')} /> : null}
        {published ? <>
          <ActionButton block tone="danger" icon="circle-x" title="Cancelar evento" onPress={() => setSheet('cancel')} />
          <Text style={{ marginTop: 8, color: colors['ink-muted'], fontSize: 10.5, lineHeight: 16 }}>
            {paid ? 'As inscrições pagas viram “Devolução pendente”: você devolve por Pix e anexa o comprovante de cada devolução.' : 'As inscrições são canceladas e os inscritos, avisados.'}
          </Text>
        </> : null}
      </View> : null}
      </View>
    </ScrollView>

    {sheet === 'cancel' ? <CancelEventSheet detail={detail} onClose={() => setSheet(null)} onExpired={onExpired}
      onCancelled={next => { setSheet(null); update(next, 'Evento cancelado.', 'Os inscritos foram avisados no canal e nas notificações.') }} /> : null}
    {sheet === 'delete' ? <DeleteDraftSheet detail={detail} onClose={() => setSheet(null)} onExpired={onExpired} onDeleted={() => { setSheet(null); navigation.back() }} /> : null}
    {sheet === 'edit' ? <EditPublishedSheet detail={detail} onClose={() => setSheet(null)} onExpired={onExpired}
      onSaved={next => { setSheet(null); update(next, 'Dados do evento salvos.') }} /> : null}
  </View>
}
