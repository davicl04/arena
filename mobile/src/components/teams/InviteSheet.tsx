import { Text, View } from 'react-native'
import { decideInvite } from '../../api/teams'
import type { TeamCard, TeamInviteReceived } from '../../api/teams'
import { footballFormat, shownTier, tiers } from '../../data/arena'
import { isStale, useSubmit } from '../../hooks/useSubmit'
import { colors } from '../../theme'
import { relativeTime } from '../../utils/relativeTime'
import { PlacementBadge } from '../arena/PlacementMeter'
import { TeamCrest } from '../arena/TeamCrest'
import { TierEmblem } from '../arena/TierEmblem'
import { RosterStack } from './TeamIdCard'
import { ActionSheet } from '../arena/ActionSheet'
import { playedFormats } from './teamView'
import { ActionButton } from '../arena/controls'
import { LoadError } from '../arena/LoadError'
import { onDark, useTeamToken } from './ui'
import { Icon } from '../Icon'

/** Pílulas dos formatos em que o time já jogou: o elo (só com a classificação completa) ou "n/3". */
function FormatPills({ team }: { team: TeamCard }) {
  const cells = playedFormats(team.formats)
  if (!cells.length) return null
  return <View accessibilityLabel="Formatos em que o time jogou" style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
    {cells.map(cell => {
      const tier = shownTier(cell.tier, cell.played, cell.required)
      const label = footballFormat[cell.format].label
      return <View key={cell.format} accessible accessibilityLabel={tier ? `${label}, elo ${tiers[tier].name}` : `${label}, ${Math.min(cell.played, cell.required)} de ${cell.required} partidas de classificação`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)', paddingVertical: 3, paddingRight: 8, paddingLeft: 4 }}>
        {tier ? <TierEmblem tier={tier} size="xs" decorative /> : <PlacementBadge played={cell.played} required={cell.required} size="xs" decorative />}
        <Text style={{ color: '#ffffff', fontSize: 10, fontWeight: '700' }}>{label}{tier ? '' : ` ${Math.min(cell.played, cell.required)}/${cell.required}`}</Text>
      </View>
    })}
  </View>
}

/** Cartão único do convite recebido (K1): brasão e nome, quem convidou e quando, elos, mensagem citada e elenco. */
function InviteCard({ invite, busy, onDecide }: { invite: TeamInviteReceived; busy: boolean; onDecide: (decision: 'aceitar' | 'recusar') => void }) {
  const { team } = invite
  const token = useTeamToken()
  return <View testID="invite-card" style={{ borderRadius: 18, padding: 14, backgroundColor: onDark.card, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
      <TeamCrest name={team.name} initials={team.initials} path={team.crest_url} size="md" decorative token={token} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text accessibilityRole="header" numberOfLines={1} style={{ color: '#ffffff', fontSize: 15, fontWeight: '800' }}>{team.name}</Text>
        <Text style={{ marginTop: 1, color: onDark.soft, fontSize: 10.5, lineHeight: 15 }}>{invite.inviter?.name ?? 'Um representante'} convidou você · {relativeTime(invite.created_at)}</Text>
      </View>
    </View>
    <FormatPills team={team} />
    {invite.message ? <View style={{ marginTop: 10, borderLeftWidth: 3, borderLeftColor: colors.mint, paddingLeft: 11, paddingVertical: 2 }}>
      <Text style={{ color: 'rgba(255,255,255,0.88)', fontSize: 12.5, lineHeight: 19 }}>{invite.message}</Text>
    </View> : null}
    <View style={{ marginTop: 10 }}><RosterStack roster={team.roster_preview} count={team.member_count} /></View>
    <View style={{ marginTop: 12, flexDirection: 'row', gap: 8 }}>
      <ActionButton tone="mint" grow icon="check" title="Aceitar" accessibilityLabel={`Aceitar convite do ${team.name}`} disabled={busy} onPress={() => onDecide('aceitar')} />
      <ActionButton grow tone="line" title="Recusar" accessibilityLabel={`Recusar convite do ${team.name}`} disabled={busy} onPress={() => onDecide('recusar')} />
    </View>
  </View>
}

/**
 * Folha escura dos convites recebidos (R2 + K1). Aceitar põe o time no carrossel como membro; recusar só tira o convite.
 * Um convite que deixou de valer (409) some da lista com a mensagem do servidor.
 */
export function InviteSheet({ invites, loadError = '', loadCause, onRetry, onClose, onAccepted, onDeclined, onStale, onExpired }: {
  invites: TeamInviteReceived[]
  /** Falha ao carregar os convites: a folha não diz "nenhum convite" quando a lista não chegou. */
  loadError?: string
  /** A causa da falha de carregamento (para o `LoadError` reconhecer a falta de conexão). */
  loadCause?: unknown
  onRetry: () => void
  onClose: () => void
  onAccepted: (invite: TeamInviteReceived, team: TeamCard | null) => void
  onDeclined: (invite: TeamInviteReceived) => void
  /** Convite que não está mais pendente: a tela recarrega a lista. */
  onStale: () => void
  onExpired: () => void
}) {
  const { busy, run } = useSubmit(onExpired)
  async function decide(invite: TeamInviteReceived, decision: 'aceitar' | 'recusar') {
    // 404/409: o toast de aviso já mostrou a mensagem do servidor; a tela relê a lista.
    const result = await run(() => decideInvite(invite.id, decision), 'Não foi possível responder ao convite.', cause => { if (isStale(cause)) onStale() })
    if (result?.state === 'aceito') onAccepted(invite, result.team)
    else if (result) onDeclined(invite)
  }
  return <ActionSheet dark locked={busy} onClose={onClose} title={invites.length > 1 ? `Convites para times · ${invites.length}` : 'Convite para time'}>
    {loadError ? <LoadError size="section" tone="dark" title="Não foi possível carregar os convites" text={loadError} cause={loadCause} onRetry={onRetry} /> : null}
    {invites.length
      ? <View style={{ marginTop: 8, gap: 12 }}>{invites.map(invite => <InviteCard key={invite.id} invite={invite} busy={busy} onDecide={decision => void decide(invite, decision)} />)}</View>
      : !loadError ? <Text style={{ paddingVertical: 14, textAlign: 'center', color: onDark.soft, fontSize: 11.5 }}>Nenhum convite pendente.</Text> : null}
    <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
      <View style={{ marginTop: 1 }}><Icon name="info" size={15} color={colors.mint} /></View>
      <Text style={{ flex: 1, color: onDark.soft, fontSize: 11, lineHeight: 17 }}>
        Ao aceitar, você entra como membro e sua posição preferida do futebol aparece no elenco. Você pode estar em vários times.
      </Text>
    </View>
  </ActionSheet>
}
