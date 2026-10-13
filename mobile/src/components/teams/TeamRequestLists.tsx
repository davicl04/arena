import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import type { JoinRequest, Person, TeamInviteSent } from '../../api/teams'
import { colors } from '../../theme'
import { relativeTime } from '../../utils/relativeTime'
import { MemberFace } from './MemberFace'
import { ActionButton, TextAction } from '../arena/controls'
import { SectionTitle } from './ui'

/** Linha de pessoa das listas do representante: rosto, nome, detalhe e ações. */
function PersonLine({ person, detail, last, children }: { person: Person; detail: string; last: boolean; children: ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingVertical: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.line }}>
    <MemberFace name={person.name} avatarUrl={person.avatar_url} size="row" />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 13, fontWeight: '600' }}>{person.name}</Text>
      <Text style={{ marginTop: 1, color: colors['ink-muted'], fontSize: 11, lineHeight: 15 }}>{detail}</Text>
    </View>
    {children}
  </View>
}

const listCard = { borderRadius: 16, backgroundColor: '#ffffff', paddingHorizontal: 13, paddingVertical: 2 } as const

/** Pedidos para entrar pelo link (só representantes): Aprovar | Recusar. */
export function JoinRequestsList({ requests, busyId, onDecide, onOpenLink }: {
  requests: JoinRequest[]
  busyId: number | null
  onDecide: (request: JoinRequest, decision: 'aprovar' | 'recusar') => void
  onOpenLink: () => void
}) {
  if (!requests.length) return null
  return <View>
    <SectionTitle title={`Pedidos para entrar · ${requests.length}`} action={<TextAction title="Link e QR" accessibilityLabel="Abrir Link e QR do time" onPress={onOpenLink} />} />
    <View style={listCard}>
      {requests.map((request, index) => <PersonLine key={request.id} person={request.requester} last={index === requests.length - 1} detail={`Pelo link · ${relativeTime(request.created_at)}`}>
        <ActionButton tone="brand" size="sm" title="Aprovar" accessibilityLabel={`Aprovar pedido de ${request.requester.name}`} disabled={busyId !== null} onPress={() => onDecide(request, 'aprovar')} fit />
        <ActionButton tone="outline" size="sm" iconOnly icon="x" title={`Recusar pedido de ${request.requester.name}`} disabled={busyId !== null} onPress={() => onDecide(request, 'recusar')} />
      </PersonLine>)}
    </View>
  </View>
}

/** Convites enviados e pendentes (só representantes), com Cancelar. */
export function SentInvitesList({ invites, busyId, onCancel, onInvite }: {
  invites: TeamInviteSent[]
  busyId: number | null
  onCancel: (invite: TeamInviteSent) => void
  onInvite: () => void
}) {
  if (!invites.length) return null
  return <View>
    <SectionTitle title="Convites enviados" action={<TextAction title="Convidar" accessibilityLabel="Convidar atletas" onPress={onInvite} />} />
    <View style={listCard}>
      {invites.map((invite, index) => <PersonLine key={invite.id} person={invite.invitee} last={index === invites.length - 1} detail={`Aguardando resposta · enviado ${relativeTime(invite.created_at)}`}>
        <TextAction title={busyId === invite.id ? 'Cancelando…' : 'Cancelar'} accessibilityLabel={`Cancelar convite de ${invite.invitee.name}`} disabled={busyId !== null} onPress={() => onCancel(invite)} />
      </PersonLine>)}
    </View>
  </View>
}
