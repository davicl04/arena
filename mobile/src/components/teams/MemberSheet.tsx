import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { ApiError } from '../../api/client'
import { removeMember, updateMember } from '../../api/teams'
import type { TeamCard, TeamMember } from '../../api/teams'
import { useSubmit } from '../../hooks/useSubmit'
import { colors } from '../../theme'
import { monthYear } from '../../utils/relativeTime'
import { MemberFace } from './MemberFace'
import { ActionSheet } from '../arena/ActionSheet'
import { positionLabel } from './teamView'
import { ConfirmBox, ErrorText } from '../arena/controls'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'

function SheetAction({ icon, label, hint, danger = false, disabled = false, onPress }: { icon: IconName; label: string; hint?: string; danger?: boolean; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={hint ? `${label}. ${hint}` : label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 8, opacity: disabled ? 0.5 : 1 }}>
    <Icon name={icon} size={19} color={danger ? colors.danger : colors.brand} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ color: danger ? colors.danger : colors.ink, fontSize: 13.5, fontWeight: '600' }}>{label}</Text>
      {hint ? <Text style={{ marginTop: 1, color: colors['ink-muted'], fontSize: 11, lineHeight: 15 }}>{hint}</Text> : null}
    </View>
  </Pressable>
}

/**
 * Folha do atleta (E1): ver perfil; para representantes, tornar representante ou tirar a braçadeira e remover do time
 * (com confirmação); para o próprio atleta, sair do time. O time precisa de pelo menos um representante: a folha já
 * avisa quando a braçadeira é a última, e o servidor tem a palavra final (o erro dele aparece aqui).
 */
export function MemberSheet({ team, member, viewerIsRepresentative, onClose, onOpenProfile, onChanged, onRemoved, onStale, onExpired }: {
  team: TeamCard
  member: TeamMember
  viewerIsRepresentative: boolean
  onClose: () => void
  onOpenProfile: (userId: number) => void
  /** Papel alterado: devolve o atleta atualizado e a mensagem para o aviso da tela. */
  onChanged: (member: TeamMember, message: string) => void
  /** Atleta removido (ou o próprio titular saiu). */
  onRemoved: (member: TeamMember, message: string) => void
  /** O servidor recusou por estado desatualizado (409/404): a tela recarrega o time, e a folha mostra o erro. */
  onStale?: () => void
  onExpired: () => void
}) {
  const [confirm, setConfirm] = useState<'remove' | 'leave' | null>(null)
  const { busy, error, run } = useSubmit(onExpired)
  const representative = member.role === 'representante'
  const lastRepresentative = representative && team.representative_count <= 1
  const firstName = member.is_me ? 'Você' : member.first_name

  /** Executa a ação; um 409/404 indica que o elenco mudou desde a leitura, e a tela recarrega. */
  async function attempt<T>(action: () => Promise<T>, fallback: string) {
    let stale = false
    const result = await run(async () => {
      try { return await action() } catch (cause) {
        stale = cause instanceof ApiError && (cause.status === 409 || cause.status === 404)
        throw cause
      }
    }, fallback)
    if (result === undefined && stale) onStale?.()
    return result
  }
  async function toggleRole() {
    const role = representative ? 'membro' : 'representante'
    const updated = await attempt(() => updateMember(team.id, member.user_id, { role }), 'Não foi possível mudar a braçadeira.')
    if (updated) onChanged(updated, representative
      ? `${member.is_me ? 'Você deixou de ser representante' : `${member.first_name} deixou de ser representante`}.`
      : `${member.first_name} agora é representante do ${team.name}.`)
  }
  async function remove() {
    const done = await attempt(async () => { await removeMember(team.id, member.user_id); return true }, member.is_me ? 'Não foi possível sair do time.' : 'Não foi possível remover o atleta.')
    if (done) onRemoved(member, member.is_me ? `Você saiu do ${team.name}.` : `${member.name} foi removido do ${team.name}.`)
  }

  return <ActionSheet title={member.name} locked={busy} onClose={onClose}>
    <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <MemberFace name={member.name} avatarUrl={member.avatar_url} representative={representative} size="sheet" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: colors['ink-muted'], fontSize: 12 }}>@{member.username}</Text>
        <Text style={{ marginTop: 2, color: colors['ink-muted'], fontSize: 12 }}>{positionLabel(member.position)} · no time desde {monthYear(member.joined_at)}</Text>
        <Text style={{ marginTop: 2, color: colors.ink, fontSize: 12, fontWeight: '600' }}>{representative ? 'Representante' : 'Membro'}</Text>
      </View>
    </View>
    <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: colors.line }}>
      {!member.is_me ? <SheetAction icon="user" label="Ver perfil" onPress={() => onOpenProfile(member.user_id)} /> : null}
      {viewerIsRepresentative ? (representative
        ? <SheetAction icon="shield-off" label="Tirar a braçadeira de representante" disabled={busy || lastRepresentative}
          hint={lastRepresentative ? 'O time precisa de pelo menos um representante.' : 'Continua no elenco como membro.'} onPress={() => void toggleRole()} />
        : <SheetAction icon="shield-check" label="Tornar representante" disabled={busy}
          hint="Convida atletas, aprova pedidos e gere o elenco." onPress={() => void toggleRole()} />) : null}
      {viewerIsRepresentative && !member.is_me ? <SheetAction icon="user-minus" label="Remover do time" danger disabled={busy} onPress={() => setConfirm('remove')} /> : null}
      {member.is_me ? <SheetAction icon="log-out" label="Sair do time" danger disabled={busy || lastRepresentative}
        hint={lastRepresentative ? 'Passe a braçadeira a outro atleta antes de sair, ou encerre o time em Editar time.' : undefined} onPress={() => setConfirm('leave')} /> : null}
    </View>
    {confirm === 'remove' ? <ConfirmBox title={`Remover ${member.name} do ${team.name}?`} confirmLabel="Remover" busy={busy} onConfirm={() => void remove()} onCancel={() => setConfirm(null)}>
      O histórico de partidas com o time continua registrado. Para voltar, {firstName} precisa de um novo convite.
    </ConfirmBox> : null}
    {confirm === 'leave' ? <ConfirmBox title={`Sair do ${team.name}?`} confirmLabel="Sair do time" busy={busy} onConfirm={() => void remove()} onCancel={() => setConfirm(null)}>
      Seu histórico com o time continua registrado. Para voltar, é preciso um novo convite ou pedido.
    </ConfirmBox> : null}
    {error ? <ErrorText>{error}</ErrorText> : null}
  </ActionSheet>
}
