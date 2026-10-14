import { Text, View } from 'react-native'
import { eventEntriesPath } from '../../api/events'
import type { OrganizerEntry } from '../../api/events'
import { entryState } from '../../data/arena'
import { usePagedList } from '../../hooks/usePagedList'
import { useSessionToken } from '../../hooks/useSessionToken'
import { useThemeColors } from '../../hooks/useTheme'
import { formatDeadline } from '../../utils/format'
import { relativeTime } from '../../utils/relativeTime'
import { StateBadge } from '../arena/StateBadge'
import { TeamCrest } from '../arena/TeamCrest'
import { Avatar } from '../media'
import { ActionButton, Notice, TextAction } from '../arena/controls'
import { LoadError } from '../arena/LoadError'

/** Linha secundária da inscrição: quando entrou, o prazo da reserva ou o estado do comprovante e da devolução. */
export function entryInfo(entry: OrganizerEntry): string {
  switch (entry.state) {
    case 'reservada': return entry.reserved_until ? `Reserva até ${formatDeadline(entry.reserved_until)}` : 'Vaga reservada'
    case 'em_analise': return entry.latest_payment ? `Comprovante enviado ${relativeTime(entry.latest_payment.created_at)}` : 'Comprovante em análise'
    case 'rejeitada': return entry.reserved_until ? `Pode enviar outro até ${formatDeadline(entry.reserved_until)}` : 'Comprovante recusado'
    case 'confirmada': return `Confirmada ${relativeTime(entry.confirmed_at ?? entry.created_at)}`
    case 'devolucao_pendente': return entry.refund && entry.refund.participant_response === null && entry.refund.resolution === null
      ? `Devolução enviada ${relativeTime(entry.refund.created_at)} · aguardando o participante` : 'Envie o comprovante da devolução'
    case 'devolucao_contestada': return 'A administração decide a devolução'
    default: return `Inscrição ${relativeTime(entry.created_at)}`
  }
}

/**
 * "Times inscritos" / "Inscritos" da gestão (`GET /organizer/events/{id}/entries`), em ordem de inscrição: escudo ou
 * foto, nome, estado efetivo e o prazo ou a situação do comprovante. "Ver comprovante" abre a tela de comprovantes.
 */
export function EventEntries({ eventId, onReceipts, onExpired }: { eventId: number; onReceipts: () => void; onExpired: () => void }) {
  const colors = useThemeColors()
  const list = usePagedList<OrganizerEntry>(eventEntriesPath(eventId), onExpired)
  const token = useSessionToken()
  if (list.loading) return <Text accessibilityLiveRegion="polite" style={{ paddingVertical: 12, color: colors['ink-muted'], fontSize: 11.5 }}>Carregando as inscrições…</Text>
  if (list.error) return <LoadError size="section" title="Não foi possível carregar as inscrições" text={list.error.message} cause={list.error} onRetry={list.reload} />
  if (!list.items.length) return <Text style={{ paddingVertical: 12, color: colors['ink-muted'], fontSize: 11.5, lineHeight: 17 }}>Nenhuma inscrição ainda. Quem se inscrever aparece aqui, com o estado do pagamento.</Text>
  return <View>
    <View accessibilityLabel="Inscrições do evento">
      {list.items.map((entry, index) => {
        const team = entry.subject.team
        const athlete = entry.subject.athlete
        const name = team?.name ?? athlete?.name ?? 'Inscrição'
        const info = entryState[entry.state]
        return <View key={entry.id} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
          {team ? <TeamCrest name={team.name} initials={team.initials} path={team.crest_url} size="sm" decorative token={token} />
            : <Avatar path={athlete?.avatar_url ?? null} name={name} token={token} size={34} />}
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '700' }}>{name}</Text>
            {info ? <StateBadge tone={info.tone}>{info.label}</StateBadge> : null}
            <Text style={{ color: colors['ink-muted'], fontSize: 10.5 }}>{entryInfo(entry)}</Text>
          </View>
          {entry.state === 'em_analise' ? <ActionButton fit tone="outline" title="Ver comprovante" accessibilityLabel={`Ver comprovante de ${name}`} onPress={onReceipts} /> : null}
        </View>
      })}
    </View>
    {list.moreError ? <Notice>{list.moreError}</Notice> : null}
    {list.hasMore ? <TextAction title={list.busy ? 'Carregando…' : 'Carregar mais'} disabled={list.busy} onPress={() => void list.loadMore()} /> : null}
  </View>
}
