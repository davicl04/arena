import { useCallback, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import type { ReceiptReview } from '../api/events'
import { eventReceiptsPath, getReceiptsEvent, subjectName } from '../api/receipts'
import type { ReceiptTab, ReceiptsEvent } from '../api/receipts'
import { ReceiptImage } from '../components/arena/ReceiptImage'
import { DarkTopBar, TeamsPlate } from '../components/arena/TeamsPlate'
import { StateBadge } from '../components/arena/StateBadge'
import { SectionTabs } from '../components/events/SectionTabs'
import { ReceiptSheet } from '../components/receipts/ReceiptSheet'
import { RefundList } from '../components/receipts/RefundList'
import { receiptSummary } from '../components/receipts/receiptView'
import { LeadRow, RowList } from '../components/review/Rows'
import { LiveNotice } from '../components/arena/controls'
import { Banner, ListMessage, LoadMore, LoadState } from '../components/review/ui'
import { usePagedList } from '../hooks/usePagedList'
import { useResource } from '../hooks/useResource'
import { useSessionToken } from '../hooks/useSessionToken'
import type { ScreenProps } from '../navigation/screens'
import { announce } from '../utils/announce'
import { formatPrice } from '../utils/format'
import { relativeTime } from '../utils/relativeTime'

type PageTab = ReceiptTab | 'devolucoes'

/** Linha da lista: miniatura, quem enviou, quando e o valor; a segunda tentativa e a decisão ganham selo. */
function ReceiptRow({ review, decided, token, onOpen }: { review: ReceiptReview; decided: boolean; token: string | null; onOpen: () => void }) {
  const { receipt, entry, attempt } = review
  const name = subjectName(entry.subject)
  const when = decided ? `Decidido ${relativeTime(receipt.decided_at ?? receipt.created_at)}` : `Enviado ${relativeTime(receipt.created_at)}`
  const status = decided ? (receipt.decision === 'aprovado' ? 'Aprovado' : 'Recusado') : attempt > 1 ? `${attempt}ª tentativa` : undefined
  const badge = status ? <StateBadge tone={decided ? (receipt.decision === 'aprovado' ? 'open' : 'danger') : 'pending'}>{status}</StateBadge> : null
  return <LeadRow label={`${name}: ${when.toLowerCase()} · ${receipt.file_type === 'pdf' ? 'PDF' : 'imagem'}`} title={name} text={`${when} · ${formatPrice(entry.price_cents)}`}
    lead={<ReceiptImage receipt={receipt} title={`Comprovante enviado por ${name}`} variant="thumb" token={token} />} badge={badge} status={status} onPress={onOpen} />
}

/** Aba "Para analisar" (do mais antigo ao mais recente) ou "Decididos" (do mais recente), com a folha do comprovante. */
function ReceiptQueue({ event, tab, token, onDecided, onExpired }: {
  event: ReceiptsEvent; tab: ReceiptTab; token: string | null; onDecided: (message: string) => void; onExpired: () => void
}) {
  const list = usePagedList<ReceiptReview>(eventReceiptsPath(event.id, tab), onExpired)
  const [open, setOpen] = useState<ReceiptReview | null>(null)
  const decided = tab === 'decididos'
  return <>
    <ListMessage list={list} loadingText="Carregando comprovantes…" emptyTitle={decided ? 'Nenhum comprovante decidido' : 'Nada para analisar'}
      emptyText={decided ? 'Os comprovantes aprovados ou recusados aparecem aqui.' : 'Quando alguém enviar o comprovante, ele aparece aqui e nas suas notificações.'} />
    {list.items.length > 0 ? <RowList label={decided ? 'Comprovantes decididos' : 'Comprovantes para analisar'}>
      {list.items.map(item => <ReceiptRow key={item.receipt.id} review={item} decided={decided} token={token} onOpen={() => setOpen(item)} />)}
    </RowList> : null}
    <LoadMore list={list} label="Carregar mais comprovantes" />
    {open ? <ReceiptSheet review={open} pix={event.pix} locked={event.revocation_pending} token={token} onClose={() => setOpen(null)} onExpired={onExpired}
      onDecided={(item, message) => {
        list.setItems(old => old.filter(other => other.receipt.id !== item.receipt.id))
        setOpen(null)
        onDecided(message)
      }} /> : null}
  </>
}

/**
 * Comprovantes do evento (A2): abas Para analisar | Decididos com miniaturas e a folha do comprovante. No evento
 * cancelado, a primeira aba vira Devoluções: o organizador anexa a devolução de cada inscrição paga e acompanha a
 * resposta do participante. Aberta pela gestão do evento (G3) e pela notificação de comprovante recebido. A análise é do
 * organizador dono do evento; o servidor recusa as decisões da administração.
 */
export default function ReceiptsScreen({ params, navigation, onExpired }: ScreenProps<'event-receipts'>) {
  const { eventId } = params
  const token = useSessionToken()
  const load = useCallback(() => getReceiptsEvent(eventId), [eventId])
  const event = useResource(load, onExpired, { fallback: 'Não foi possível carregar o evento.' })
  const [chosen, setChosen] = useState<PageTab | null>(null)
  const [notice, setNotice] = useState('')
  const data = event.data
  const cancelled = data?.state === 'cancelado'
  const first: PageTab = cancelled ? 'devolucoes' : 'para_analisar'
  const tab: PageTab = chosen === 'decididos' ? 'decididos' : first
  const { setData } = event

  const say = useCallback((message: string) => { setNotice(message); announce(message) }, [])
  /** Atualiza os contadores da placa e das abas depois de uma decisão ou envio, sem recarregar a tela. */
  const refresh = useCallback(() => {
    getReceiptsEvent(eventId).then(fresh => setData(fresh)).catch(() => undefined)
  }, [eventId, setData])

  const tabs: { value: PageTab; label: string }[] = data ? [
    cancelled
      ? { value: 'devolucoes', label: data.pending.refunds_to_send ? `Devoluções (${data.pending.refunds_to_send})` : 'Devoluções' }
      : { value: 'para_analisar', label: data.pending.receipts ? `Para analisar (${data.pending.receipts})` : 'Para analisar' },
    { value: 'decididos', label: 'Decididos' },
  ] : []

  return <ScrollView contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
    <TeamsPlate bottom={16}>
      <DarkTopBar eyebrow={data?.name ?? 'Evento'} title="Comprovantes" backLabel="Voltar para o evento" onBack={navigation.back} />
      {data ? <Text style={{ paddingHorizontal: 18, paddingTop: 8, color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 18 }}>{receiptSummary(data)}</Text> : null}
    </TeamsPlate>
    <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
      <LoadState loading={event.loading} error={event.error || null} onRetry={event.reload} loadingText="Carregando o evento…" />
      {data ? <>
        {data.revocation_pending ? <Banner>A administração está decidindo se o evento segue. A análise dos comprovantes fica em espera; as devoluções continuam.</Banner> : null}
        <View style={{ marginTop: 12 }}>
          <SectionTabs label="Comprovantes do evento" items={tabs} value={tab} onChange={value => { setChosen(value); setNotice('') }} />
        </View>
        <LiveNotice text={notice} />
        <View style={{ paddingTop: 8 }}>
          {tab === 'devolucoes'
            ? <RefundList eventId={data.id} token={token} onExpired={onExpired}
              onSent={entry => { say(`Devolução de ${subjectName(entry.subject)} enviada. O participante confirma o recebimento.`); refresh() }} />
            : <ReceiptQueue key={tab} event={data} tab={tab} token={token} onExpired={onExpired} onDecided={message => { say(message); refresh() }} />}
        </View>
      </> : null}
    </View>
  </ScrollView>
}
