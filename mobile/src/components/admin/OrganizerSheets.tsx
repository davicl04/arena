import { useState } from 'react'
import { Linking, Pressable, Text, View } from 'react-native'
import { decideOrganizerRequest, refusalError, refusalInput, revokeError, revokeOrganizer } from '../../api/admin'
import { ApiError } from '../../api/client'
import { ORGANIZER_LIMITS, ORGANIZER_REFUSAL_REASONS, refusalText, sportNames } from '../../api/organizer'
import type { AdminOrganizer, AdminOrganizerRequest, OrganizerRefusalReason } from '../../api/organizer'
import { useSubmit } from '../../hooks/useSubmit'
import { useThemeColors } from '../../hooks/useTheme'
import { relativeTime, shortDate } from '../../utils/relativeTime'
import { Avatar } from '../media'
import { ReasonPanel } from '../review/ReasonPanel'
import { ActionButton, BusyStatus, ErrorText, Hint } from '../arena/controls'
import { ActionRow, InfoGrid, InfoText } from '../review/ui'
import Sheet from '../Sheet'
import { toast } from '../toast/toastStore'

const stateLabels = { em_analise: 'Em análise', aprovado: 'Aprovado', recusado: 'Recusado', cancelado: 'Cancelado pelo autor' } as const
const firstNameOf = (name: string) => name.trim().split(/\s+/)[0]

/** Pessoa da folha: foto, nome do organizador e a linha de apoio. */
function PersonHeader({ name, avatarPath, token, title, subtitle }: { name: string; avatarPath: string | null; token: string | null; title: string; subtitle: string }) {
  const colors = useThemeColors()
  return <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
    <Avatar path={avatarPath} name={name} token={token} size={52} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 16, fontWeight: '800' }}>{title}</Text>
      <Text style={{ color: colors['ink-muted'], fontSize: 11.5 }}>{subtitle}</Text>
    </View>
  </View>
}

/** "Ver perfil de Fulano": só aparece quando a tela sabe abrir o perfil; a folha fecha antes de navegar. */
function ProfileLink({ firstName, onPress }: { firstName: string; onPress: () => void }) {
  const colors = useThemeColors()
  return <Pressable accessibilityRole="link" accessibilityLabel={`Ver perfil de ${firstName}`} onPress={onPress} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
    <Text style={{ color: colors.brand, fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' }}>Ver perfil de {firstName}</Text>
  </Pressable>
}

/** Link do pedido: abre no navegador do aparelho (só http e https), com falha avisada num toast. */
function RequestLink({ link }: { link: string }) {
  const colors = useThemeColors()
  const safe = /^https?:\/\//i.test(link)
  async function open() {
    try { await Linking.openURL(link) } catch { toast.error('Não foi possível abrir o link.') }
  }
  if (!safe) return <Text selectable style={{ color: colors.ink, fontSize: 12.5, fontWeight: '600' }}>{link}</Text>
  return <View>
    <Pressable accessibilityRole="link" accessibilityLabel={`Abrir o link do pedido: ${link}`} onPress={() => void open()} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={{ color: colors.brand, fontSize: 12.5, fontWeight: '600', textDecorationLine: 'underline' }}>{link}</Text>
    </Pressable>
  </View>
}

/**
 * Folha do pedido de organizador (AD1): dados do pedido, "Ver perfil" e, na fila, Aprovar | Recusar. Recusar exige o
 * motivo do contrato; em "Outro", o detalhe.
 */
export function OrganizerRequestSheet({ item, token, onClose, onOpenProfile, onDecided, onStale, onExpired }: {
  item: AdminOrganizerRequest
  token: string | null
  onClose: () => void
  /** Abre o perfil de quem pediu; sem ele, a folha só mostra os dados. */
  onOpenProfile?: (userId: number) => void
  onDecided: (decided: AdminOrganizerRequest, message: string) => void
  /** O pedido já foi decidido ou cancelado (409/404): a fila recarrega e a folha fecha com a mensagem do servidor. */
  onStale: (message: string) => void
  onExpired: () => void
}) {
  const colors = useThemeColors()
  const [refusing, setRefusing] = useState(false)
  const [reason, setReason] = useState<OrganizerRefusalReason | null>(null)
  const [detail, setDetail] = useState('')
  const [attempted, setAttempted] = useState(false)
  const { busy, error, setError, run } = useSubmit(onExpired)
  const problem = attempted ? refusalError(reason, detail) : null
  const firstName = firstNameOf(item.requester.name)
  const pending = item.state === 'em_analise'

  /** Decide; um pedido que deixou de estar em análise (409/404) avisa a fila em vez de manter o item na lista. */
  async function decide(input: Parameters<typeof decideOrganizerRequest>[1], fallback: string) {
    let stale = ''
    const decided = await run(async () => {
      try { return await decideOrganizerRequest(item.id, input) } catch (cause) {
        if (cause instanceof ApiError && (cause.status === 409 || cause.status === 404)) stale = cause.message
        throw cause
      }
    }, fallback)
    if (!decided && stale) onStale(stale)
    return decided
  }
  async function approve() {
    const decided = await decide({ decision: 'aprovar' }, 'Não foi possível aprovar o pedido.')
    if (decided) onDecided(decided, `${item.display_name} agora é organizador.`)
  }
  async function refuse() {
    setAttempted(true)
    if (refusalError(reason, detail) || !reason) return
    const decided = await decide(refusalInput(reason, detail), 'Não foi possível recusar o pedido.')
    if (decided) onDecided(decided, `Pedido de ${item.display_name} recusado.`)
  }

  return <Sheet title="Pedido de organizador" onClose={onClose}>
    <PersonHeader name={item.requester.name} avatarPath={item.requester.avatar_url} token={token} title={item.display_name}
      subtitle={`Pedido de ${item.requester.name} · ${relativeTime(item.created_at)}`} />
    <InfoGrid items={[
      ['Cidade', `${item.city.name} · ${item.city.state}`],
      ['Modalidades', sportNames(item.sports)],
      ['Contato', item.contact],
      ['Link', item.link ? <RequestLink link={item.link} /> : '—'],
    ]}>
      <InfoText title="Experiência" text={item.experience} empty="Não informada" />
    </InfoGrid>
    {onOpenProfile ? <ProfileLink firstName={firstName} onPress={() => { onClose(); onOpenProfile(item.requester.id) }} /> : null}

    {pending ? null : <View testID="request-decision" accessible style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 12 }}>
      <Text style={{ color: colors.ink, fontSize: 12.5, lineHeight: 19 }}>
        <Text style={{ fontWeight: '700' }}>{stateLabels[item.state]}</Text>
        {item.decided_at ? ` · ${shortDate(item.decided_at)}` : ''}
        {item.decided_by && item.state !== 'cancelado' ? ` · por ${item.decided_by.name}` : ''}
      </Text>
      {item.state === 'recusado' ? <Text style={{ marginTop: 4, color: colors['ink-muted'], fontSize: 12, lineHeight: 18 }}>Motivo: {refusalText(item.reason_code, item.reason_detail)}</Text> : null}
    </View>}

    {pending && !refusing ? <ActionRow>
      <ActionButton icon="check" title={busy ? 'Aprovando…' : 'Aprovar organizador'} disabled={busy} onPress={() => void approve()} grow />
      <ActionButton tone="outline" title="Recusar" disabled={busy} onPress={() => { setRefusing(true); setError('') }} grow />
    </ActionRow> : null}

    {pending && refusing ? <ReasonPanel title="Motivo da recusa" options={ORGANIZER_REFUSAL_REASONS} option={reason} onOption={setReason}
      textLabel={`Detalhe para quem pediu ${reason === 'outro' ? '(obrigatório)' : '(opcional)'}`} text={detail} onText={setDetail} max={ORGANIZER_LIMITS.detailMax}
      error={problem} note="A pessoa vê o motivo e pode enviar um novo pedido."
      confirmLabel="Recusar pedido" busyLabel="Recusando…" busy={busy} onConfirm={() => void refuse()}
      onCancel={() => { setRefusing(false); setAttempted(false); setError('') }} /> : null}
    {error ? <ErrorText>{error}</ErrorText> : null}
    <BusyStatus text={busy ? 'Registrando a decisão…' : ''} />
  </Sheet>
}

/** Folha do organizador ativo, com "Revogar" exigindo o motivo (5 a 500 caracteres). */
export function OrganizerSheet({ item, token, onClose, onOpenProfile, onRevoked, onExpired }: {
  item: AdminOrganizer
  token: string | null
  onClose: () => void
  onOpenProfile?: (userId: number) => void
  onRevoked: () => void
  onExpired: () => void
}) {
  const [revoking, setRevoking] = useState(false)
  const [reason, setReason] = useState('')
  const [attempted, setAttempted] = useState(false)
  const { busy, error, setError, run } = useSubmit(onExpired)
  const problem = attempted ? revokeError(reason) : null
  async function revoke() {
    setAttempted(true)
    if (revokeError(reason)) return
    const done = await run(async () => { await revokeOrganizer(item.id, reason); return true }, 'Não foi possível revogar a permissão.')
    if (done) onRevoked()
  }
  return <Sheet title="Organizador" onClose={onClose}>
    <PersonHeader name={item.user.name} avatarPath={item.user.avatar_url} token={token} title={item.display_name} subtitle={`${item.user.name} · @${item.user.username}`} />
    <InfoGrid items={[
      ['Organizador desde', shortDate(item.approved_at)],
      ['Aprovado por', item.approved_by?.name ?? 'Administração'],
    ]} />
    {onOpenProfile ? <ProfileLink firstName={firstNameOf(item.user.name)} onPress={() => { onClose(); onOpenProfile(item.user.id) }} /> : null}
    {!revoking
      ? <ActionRow><ActionButton tone="outline" title="Revogar permissão" disabled={busy} onPress={() => { setRevoking(true); setError('') }} grow /></ActionRow>
      : <ReasonPanel title="Motivo da revogação" textLabel="Motivo da revogação" text={reason} onText={setReason} max={ORGANIZER_LIMITS.detailMax} error={problem}
        note="A pessoa recebe o motivo nas notificações e deixa de ver a seção Organizador."
        confirmLabel="Revogar" busyLabel="Revogando…" busy={busy} onConfirm={() => void revoke()}
        onCancel={() => { setRevoking(false); setAttempted(false); setError('') }} />}
    {error ? <ErrorText>{error}</ErrorText> : null}
    {revoking ? null : <View style={{ marginTop: 8 }}><Hint>Os eventos abertos dessa pessoa vão para a fila Organizador revogado, onde a administração decide se seguem ou são cancelados.</Hint></View>}
  </Sheet>
}
