import { useCallback, useEffect, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { cancelEntry, confirmRefund, contestRefund, createEntry, getEntry, getEvent, pixInfo, sendReceipt } from '../api/entries'
import type { EventDetail, MyEntry } from '../api/entries'
import { ApiError } from '../api/client'
import type { UploadFile } from '../api/client'
import { TextAction } from '../components/arena/controls'
import { EventPoster } from '../components/arena/EventPoster'
import { BracketPanel } from '../components/brackets/BracketPanel'
import { EntryStatus } from '../components/events/EntryStatus'
import { CancelEntrySheet, ConfirmRefundSheet, ContactSheet, ContestRefundSheet, EnterSheet, ReceiptSheet } from '../components/events/EntrySheets'
import { EventEntrants } from '../components/events/EventEntrants'
import { EventFacts, InfoCard, OrganizerCard, PaymentHint, PaymentInfoButton } from '../components/events/EventFacts'
import { EventNotices } from '../components/events/EventNotices'
import { PaymentInfoSheet } from '../components/events/PaymentInfoSheet'
import { SectionTabs } from '../components/events/SectionTabs'
import { Term } from '../components/events/Term'
import { entryCta, isLocked } from '../components/events/entryCta'
import { placeText } from '../components/events/eventText'
import { Icon } from '../components/Icon'
import { toast } from '../components/toast/toastStore'
import { Button } from '../components/ui'
import { eventFormatParts } from '../data/arena'
import { useResource } from '../hooks/useResource'
import { isStale, useSubmit } from '../hooks/useSubmit'
import type { ScreenProps } from '../navigation/screens'
import { colors } from '../theme'
import { formatDeadline, parseIso } from '../utils/format'

type Section = 'info' | 'tabela' | 'percurso' | 'inscritos'
type SheetKind = 'enter' | 'info' | 'receipt' | 'confirm-refund' | 'contest' | 'cancel' | 'contact'
/** Estados do evento em que o cartaz do detalhe mostra o selo (aberto não precisa de selo). */
const BADGE_STATES = ['em_andamento', 'encerrado', 'cancelado'] as const
/** Intervalo em que a tela confere se a reserva venceu enquanto está aberta. */
const EXPIRY_CHECK_MS = 30_000

function Banner({ icon, title, tone, children }: { icon: 'alert' | 'info' | 'lock' | 'trophy'; title: string; tone: 'danger' | 'neutral'; children: string }) {
  const danger = tone === 'danger'
  return <View accessible accessibilityLabel={`${title}. ${children}`} style={{ flexDirection: 'row', gap: 10, borderRadius: 14, backgroundColor: danger ? '#fff0f2' : colors.subtle, padding: 12 }}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Icon name={icon} size={20} color={danger ? colors.danger : colors['ink-muted']} /></View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ color: danger ? colors.danger : colors.ink, fontSize: 12.5, fontWeight: '700' }}>{title}</Text>
      <Text style={{ color: danger ? colors.ink : colors['ink-muted'], fontSize: 11, lineHeight: 16, marginTop: 2 }}>{children}</Text>
    </View>
  </View>
}

/**
 * Detalhe do evento do atleta (D2 do Jogar): cartaz no topo, o cartão S1 da inscrição de quem vê, os avisos do
 * organizador (para os inscritos), as abas Informações | Tabela (ou Percurso, na corrida) | Inscritos e o botão fixo de
 * inscrição, acima da navegação inferior (fora da rolagem, sem cobrir conteúdo). Inscrição gratuita confirmada na hora;
 * paga com reserva, Pix, comprovante e, no cancelamento do evento, a resposta à devolução.
 */
export default function EventScreen({ params, navigation, onExpired }: ScreenProps<'event'>) {
  const eventId = params.eventId
  const loadEvent = useCallback(() => getEvent(eventId), [eventId])
  const event = useResource(loadEvent, onExpired, { fallback: 'Não foi possível carregar o evento.' })
  const detail = event.data
  const summaryId = detail?.my_entry?.id ?? null
  const loadEntry = useCallback(() => getEntry(summaryId ?? 0), [summaryId])
  const mine = useResource(loadEntry, onExpired, { enabled: summaryId !== null, fallback: 'Não foi possível carregar a sua inscrição.' })
  const entry = mine.data && mine.data.id === summaryId ? mine.data : null
  const [section, setSection] = useState<Section>(params.section === 'tabela' ? 'tabela' : 'info')
  const [sheet, setSheet] = useState<SheetKind | null>(null)
  const [infoReturn, setInfoReturn] = useState<SheetKind | null>(null)
  const [pickedTeam, setPickedTeam] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const action = useSubmit(onExpired)
  const { setError } = action
  const sport = detail?.sport ?? params.sport ?? 'futebol'

  // A modalidade do evento dá o título da barra ("Campeonato" ou "Prova").
  useEffect(() => {
    if (detail?.sport && params.sport !== detail.sport) navigation.setParams('event', { sport: detail.sport })
  }, [detail?.sport, params.sport, navigation])

  const setEvent = event.setData
  const setEntry = mine.setData
  /** Relê o evento (e a inscrição) sem esconder a tela; a inscrição nova é lida quando o resumo muda. */
  const refresh = useCallback(async (next?: MyEntry) => {
    if (next) setEntry(next)
    try {
      setEvent(await getEvent(eventId))
      if (!next && summaryId !== null) setEntry(await getEntry(summaryId))
    } catch (cause) {
      // Sessão expirada volta ao login; nos outros erros a tela segue com os dados anteriores e a próxima leitura corrige.
      if (cause instanceof ApiError && cause.status === 401) onExpired()
    }
  }, [eventId, onExpired, setEntry, setEvent, summaryId])
  async function pullToRefresh() {
    setRefreshing(true)
    await refresh()
    setRefreshing(false)
  }

  // A reserva (ou a recusa) vence enquanto a tela está aberta: relê no fim do prazo para mostrar "A vaga foi liberada".
  const waitsReceipt = entry?.state === 'reservada' || entry?.state === 'rejeitada'
  const reservedUntil = entry?.reserved_until
  useEffect(() => {
    const end = parseIso(reservedUntil)?.getTime()
    if (!waitsReceipt || !end || end <= Date.now()) return
    const id = setInterval(() => {
      if (Date.now() < end + 1500) return
      clearInterval(id)
      void refresh()
    }, EXPIRY_CHECK_MS)
    return () => clearInterval(id)
  }, [waitsReceipt, reservedUntil, refresh])

  function open(kind: SheetKind) {
    setError('')
    setSheet(kind)
  }
  function openInfo(from: SheetKind | null) {
    setInfoReturn(from)
    setSheet('info')
  }
  function closeSheet() {
    setSheet(null)
    setInfoReturn(null)
  }
  /** "Voltar" da folha de pagamento: retorna à folha de onde veio (a inscrição). */
  function backFromInfo() {
    setSheet(infoReturn)
    setInfoReturn(null)
  }

  if (event.loading) return <View style={{ flex: 1, padding: 24 }}><Text accessibilityLiveRegion="polite" style={{ color: colors['ink-muted'], fontSize: 14 }}>Carregando evento…</Text></View>
  if (!detail) return <View style={{ flex: 1, padding: 24 }}>
    <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 14, lineHeight: 21 }}>{event.error}</Text>
    <Button title="Tentar novamente" onPress={event.reload} />
  </View>

  const current: EventDetail = detail
  const paid = (current.price_cents ?? 0) > 0
  const pix = pixInfo(current)
  const cta = entryCta(current, entry)
  const enterTeams = cta?.kind === 'enter' ? cta.teams : []
  const enterTeam = (enterTeams.find(item => item.team.id === pickedTeam) ?? enterTeams[0])?.team.id ?? null
  const run = sport === 'corrida'
  const locked = isLocked(current)
  const showLock = !current.is_organizer && !current.eligibility.eligible && Boolean(current.eligibility.message) && (!entry || ['expirada', 'cancelada'].includes(entry.state))
  const sections: { value: Section; label: string }[] = [
    { value: 'info', label: 'Informações' },
    run ? { value: 'percurso', label: 'Percurso' } : { value: 'tabela', label: 'Tabela' },
    { value: 'inscritos', label: 'Inscritos' },
  ]
  const badgeState = BADGE_STATES.find(state => state === current.state) ?? null
  // Provas de corrida não têm Tabela: o pedido da aba (notificações) cai nas informações.
  const shown: Section = run && section === 'tabela' ? 'info' : section

  /**
   * Roda a ação de uma folha. Se o servidor recusar porque a situação mudou (404 ou 409: vaga liberada, inscrição já decidida
   * ou cancelada), `useSubmit` mostra a mensagem do servidor como aviso; a folha fecha e a tela relê o evento e a inscrição,
   * em vez de seguir com dados velhos. Os outros erros viram toast de erro e a folha continua aberta.
   */
  function guarded<T>(task: () => Promise<T>, fallback: string): Promise<T | undefined> {
    return action.run(task, fallback, async cause => {
      if (!isStale(cause)) return
      closeSheet()
      await refresh()
    })
  }
  async function enter(teamId: number | null) {
    const created = await guarded(() => createEntry(current.id, teamId), 'Não foi possível concluir a inscrição.')
    if (!created) return
    setSheet(null)
    // Reserva sem pagamento ainda: exige o próximo passo (comprovante), então vira aviso.
    if (created.state === 'confirmada') toast.success(`Inscrição confirmada em ${current.name}.`)
    else toast.warning('Vaga reservada.', { description: `Envie o comprovante até ${formatDeadline(created.reserved_until)}.` })
    await refresh(created)
  }
  async function upload(file: UploadFile) {
    if (!entry) return
    const updated = await guarded(() => sendReceipt(entry.id, file), 'Não foi possível enviar o comprovante.')
    if (!updated) return
    setSheet(null)
    toast.success(`Comprovante enviado. ${current.organizer.display_name} vai analisar o pagamento.`)
    await refresh(updated)
  }
  async function answerRefund(reason?: string) {
    if (!entry) return
    const updated = await guarded(() => (reason === undefined ? confirmRefund(entry.id) : contestRefund(entry.id, reason)), 'Não foi possível responder à devolução.')
    if (!updated) return
    setSheet(null)
    toast.success(reason === undefined ? 'Recebimento da devolução confirmado.' : 'Contestação enviada à administração.')
    await refresh(updated)
  }
  async function giveUp() {
    if (!entry) return
    const done = await guarded(async () => { await cancelEntry(entry.id); return true }, 'Não foi possível cancelar a inscrição.')
    if (!done) return
    setSheet(null)
    toast.success('Inscrição cancelada. A vaga ficou livre.')
    await refresh()
  }

  return <View testID="event-screen" style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={{ gap: 12, padding: 20, paddingBottom: 20 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void pullToRefresh()} />}>
      <EventPoster size="hero" name={current.name} sport={sport} startsAt={current.starts_at} format={current.format} distanceKm={current.distance_km} eventType={current.competition_type}
        priceCents={current.price_cents ?? 0} acceptedTiers={current.accepted_tiers} state={badgeState} organizer={current.organizer.display_name} locked={locked} />
      {current.state === 'cancelado' ? <Banner icon="alert" tone="danger" title="Evento cancelado">
        {current.cancel_reason ? `Motivo: ${current.cancel_reason}` : 'O organizador cancelou o evento.'}
      </Banner> : null}
      {current.revocation_pending && current.state !== 'cancelado' ? <Banner icon="info" tone="neutral" title="Inscrições suspensas">A administração está decidindo se o evento segue.</Banner> : null}
      {current.is_organizer ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, borderRadius: 16, backgroundColor: '#ffffff', paddingHorizontal: 14, paddingVertical: 12 }}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Icon name="trophy" size={19} color={colors.brand} /></View>
        <Text style={{ flex: 1, minWidth: 160, color: colors.ink, fontSize: 11.5, lineHeight: 17 }}>Você organiza {run ? 'esta prova' : 'este campeonato'}. Inscrições, comprovantes e avisos ficam na gestão.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Abrir gestão" onPress={() => navigation.go('event-manage', { eventId: current.id })}
          style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors['brand-soft'], paddingHorizontal: 14 }}>
          <Text style={{ color: colors.brand, fontSize: 12, fontWeight: '700' }}>Abrir gestão</Text>
        </Pressable>
      </View> : null}
      {summaryId !== null && !entry && mine.loading ? <Text accessibilityLiveRegion="polite" style={{ color: colors['ink-muted'], fontSize: 11, paddingHorizontal: 4 }}>Carregando sua inscrição…</Text> : null}
      {summaryId !== null && !entry && mine.error ? <View>
        <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 12, lineHeight: 17 }}>{mine.error}</Text>
        <Button secondary title="Tentar novamente" onPress={mine.reload} />
      </View> : null}
      {entry ? <EntryStatus entry={entry} detail={current} hasPix={Boolean(pix)} busy={action.busy} onPayment={() => openInfo(null)} onConfirmRefund={() => open('confirm-refund')} onContestRefund={() => open('contest')} /> : null}
      {entry?.can_cancel ? <TextAction title="Desistir da inscrição" onPress={() => open('cancel')} /> : null}
      {showLock ? <Banner icon="lock" tone="danger" title={current.eligibility.reason === 'sem_time' ? 'Inscrição por time' : 'Fora da faixa'}>
        {`${current.eligibility.message ?? ''}${current.eligibility.reason === 'sem_time' ? '' : ' Eventos abertos aceitam qualquer nível.'}`}
      </Banner> : null}
      {current.can_read_messages ? <EventNotices eventId={current.id} onExpired={onExpired} /> : null}
      <SectionTabs items={sections} value={shown} onChange={setSection} label={`Seções ${run ? 'da prova' : 'do campeonato'}`} />
      <View style={{ gap: 12 }}>
        {shown === 'info' ? <>
          <EventFacts detail={current} onPaymentInfo={pix ? () => openInfo(null) : undefined} />
          <OrganizerCard name={current.organizer.display_name} onContact={current.contact ? () => open('contact') : undefined} />
          {paid ? <PaymentHint /> : null}
        </> : null}
        {shown === 'tabela' ? <BracketPanel eventId={current.id} canRead={current.is_organizer || current.my_entry !== null} bonus={current.tennis_bonus} onExpired={onExpired} bleed={20} /> : null}
        {shown === 'percurso' ? <InfoCard>
          <Term icon="route">{eventFormatParts({ sport, distanceKm: current.distance_km }).join(' · ') || 'Distância a definir'}</Term>
          <Term icon="map-pin">{placeText(current) || 'Local a definir'}</Term>
          <Text style={{ color: colors['ink-muted'], fontSize: 11.5, lineHeight: 17, marginTop: 4 }}>{current.course_notes || 'O organizador ainda não descreveu o percurso.'}</Text>
        </InfoCard> : null}
        {shown === 'inscritos' ? <EventEntrants eventId={current.id} sport={sport} myEntryId={entry?.id ?? null} onExpired={onExpired} /> : null}
      </View>
    </ScrollView>
    {cta ? <View testID="entry-bar" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: '#ffffff', paddingHorizontal: 20, paddingVertical: 10 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={cta.label} accessibilityState={{ disabled: cta.kind === 'blocked' || action.busy }} disabled={cta.kind === 'blocked' || action.busy}
        onPress={() => (cta.kind === 'teams' ? navigation.go('teams') : open(cta.kind === 'enter' ? 'enter' : 'receipt'))}
        style={{ flex: 1, minHeight: 48, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 8, backgroundColor: cta.kind === 'blocked' ? colors.line : colors.brand, paddingHorizontal: 12, opacity: action.busy ? 0.5 : 1 }}>
        {cta.kind === 'blocked' && cta.locked ? <Icon name="lock" size={16} color={colors.ink} /> : null}
        {cta.kind === 'receipt' ? <Icon name="upload" size={16} color="#ffffff" /> : null}
        <Text numberOfLines={2} style={{ flexShrink: 1, color: cta.kind === 'blocked' ? colors.ink : '#ffffff', fontSize: 14, fontWeight: '600', textAlign: 'center' }}>{cta.label}</Text>
      </Pressable>
      {paid && pix && cta.kind !== 'teams' ? <PaymentInfoButton onPress={() => openInfo(null)} /> : null}
    </View> : null}
    {sheet === 'enter' && cta?.kind === 'enter' ? <EnterSheet detail={current} teams={cta.teams} teamId={enterTeam} onTeam={setPickedTeam} pix={pix} busy={action.busy} error={action.error} onConfirm={teamId => void enter(teamId)} onPaymentInfo={() => openInfo('enter')} onClose={closeSheet} /> : null}
    {sheet === 'info' && pix ? <PaymentInfoSheet eventName={current.name} priceCents={current.price_cents ?? 0} sport={sport} pix={pix} receiptDeadline={entry?.reserved_until}
      onClose={closeSheet} onBack={infoReturn ? backFromInfo : undefined} /> : null}
    {sheet === 'receipt' && entry ? <ReceiptSheet entry={entry} eventName={current.name} busy={action.busy} error={action.error} onSend={file => void upload(file)} onClose={closeSheet} /> : null}
    {sheet === 'confirm-refund' && entry ? <ConfirmRefundSheet entry={entry} busy={action.busy} error={action.error} onConfirm={() => void answerRefund()} onClose={closeSheet} /> : null}
    {sheet === 'contest' && entry ? <ContestRefundSheet entry={entry} busy={action.busy} error={action.error} onContest={reason => void answerRefund(reason)} onClose={closeSheet} /> : null}
    {sheet === 'cancel' && entry ? <CancelEntrySheet entry={entry} busy={action.busy} error={action.error} onConfirm={() => void giveUp()} onClose={closeSheet} /> : null}
    {sheet === 'contact' && current.contact ? <ContactSheet name={current.organizer.display_name} contact={current.contact} onClose={closeSheet} /> : null}
  </View>
}
