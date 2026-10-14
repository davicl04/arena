import { useCallback, useState } from 'react'
import { Text, View } from 'react-native'
import { WALKOVER_REASON_MESSAGE, decideWalkover, reasonError } from '../../api/admin'
import type { DisputeMatch, WalkoverDecision, WalkoverDispute } from '../../api/admin'
import { ApiError } from '../../api/client'
import { getMessages } from '../../api/matches'
import type { MatchSideOut } from '../../api/matches'
import { footballFormat } from '../../data/arena'
import { sideOf } from '../../data/match'
import { useResource } from '../../hooks/useResource'
import { useSubmit } from '../../hooks/useSubmit'
import { useResolvedTheme, useThemeColors } from '../../hooks/useTheme'
import { formatDeadline } from '../../utils/format'
import { ActionButton, BusyStatus, ErrorText } from '../arena/controls'
import { ReasonPanel } from '../review/ReasonPanel'
import { otherSide } from '../results/format'
import { ActionRow, Eyebrow, InfoGrid, LoadState } from '../review/ui'
import Sheet from '../Sheet'
import { matchTitle, sideName } from './adminMatchView'

/** Placar do W.O. (3×0 no futebol, 6-0 6-0 no tênis), para o lado que compareceu. */
const walkoverScore = { futebol: '3 × 0', tenis: '6-0 6-0' } as const

/** Quantas mensagens do chat a administração lê para decidir. */
export const CHAT_EXCERPT = 12

export const modality = (match: DisputeMatch) => (match.format ? footballFormat[match.format].label : match.sport === 'tenis' ? 'Tênis' : 'Futebol')

/** Quem fez o registro ou a contestação: pessoa, lado, horário e, na contestação, o motivo. */
function Party({ title, person, side, role, at, reason }: {
  title: string; person: WalkoverDispute['walkover']['registered_by']; side: MatchSideOut | undefined; role: string; at: string | null; reason?: string | null
}) {
  const colors = useThemeColors()
  const dark = useResolvedTheme() === 'dark'
  return <View accessibilityLabel={title} style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 12 }}>
    <Eyebrow>{title}</Eyebrow>
    <Text selectable style={{ marginTop: 2, color: colors.ink, fontSize: 13, fontWeight: '700' }}>{person?.name ?? 'Conta indisponível'}</Text>
    <Text style={{ color: colors['ink-muted'], fontSize: 11 }}>{sideName(side)} · {role}{at ? ` · ${formatDeadline(at)}` : ''}</Text>
    {reason !== undefined
      ? <View testID="walkover-reason" accessible style={{ marginTop: 8, borderRadius: 12, borderLeftWidth: 4, borderLeftColor: colors.danger, backgroundColor: dark ? '#ff8a8022' : '#fff0f2', paddingHorizontal: 12, paddingVertical: 10 }}>
        <Text selectable style={{ color: colors.ink, fontSize: 12, lineHeight: 18 }}>{reason ?? 'Sem motivo informado.'}</Text>
      </View>
      : null}
  </View>
}

/** Trecho do chat: a administração lê as últimas mensagens para decidir (0002-jogar, seção 8). */
function ChatExcerpt({ match, onExpired }: { match: DisputeMatch; onExpired: () => void }) {
  const colors = useThemeColors()
  const load = useCallback(() => getMessages(match.id, { limit: CHAT_EXCERPT }), [match.id])
  const chat = useResource(load, onExpired, { fallback: 'Não foi possível carregar o chat da partida.' })
  const lines = chat.data?.items ?? []
  return <View accessibilityLabel="Trecho do chat da partida">
    <Eyebrow>Chat da partida</Eyebrow>
    <LoadState loading={chat.loading} error={chat.error || null} onRetry={chat.reload} loadingText="Carregando o chat…" />
    {chat.data && !lines.length ? <Text style={{ marginTop: 4, color: colors['ink-muted'], fontSize: 11.5 }}>Nenhuma mensagem no chat.</Text> : null}
    {lines.length > 0 ? <>
      <View accessibilityLabel="Mensagens do chat" style={{ marginTop: 6, gap: 6, borderRadius: 12, backgroundColor: colors.subtle, padding: 10 }}>
        {lines.map(line => line.kind === 'evento'
          ? <Text key={line.id} style={{ textAlign: 'center', color: colors['ink-muted'], fontSize: 10.5, lineHeight: 15, fontStyle: 'italic' }}>{line.body}</Text>
          : <View key={line.id} accessible style={{ borderRadius: 10, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 8 }}>
            <Text style={{ color: colors.ink, fontSize: 11.5 }}>
              <Text style={{ fontWeight: '700' }}>{line.author?.name ?? 'Conta indisponível'}</Text>
              <Text style={{ color: colors['ink-muted'], fontSize: 10 }}>{` · ${sideName(sideOf(match, line.side ?? 'a'))} · ${formatDeadline(line.created_at)}`}</Text>
            </Text>
            <Text selectable style={{ marginTop: 2, color: line.removed ? colors['ink-muted'] : colors.ink, fontSize: 11.5, lineHeight: 17, fontStyle: line.removed ? 'italic' : 'normal' }}>{line.removed ? 'Mensagem removida' : line.body}</Text>
          </View>)}
      </View>
      {chat.data?.has_more ? <Text style={{ marginTop: 4, color: colors['ink-muted'], fontSize: 10.5 }}>Mostrando as últimas {lines.length} mensagens.</Text> : null}
    </> : null}
  </View>
}

/**
 * Folha do W.O. contestado: quem registrou, quem contestou (com o motivo), o trecho do chat e a decisão. Manter dá a
 * vitória a quem compareceu (3×0 ou 6-0 6-0) e encerra a partida; anular a deixa sem resultado. Os dois exigem a
 * justificativa (5 a 500 caracteres). Um W.O. já decidido (404 ou 409) fecha a folha e avisa a fila por `onStale`.
 */
export function WalkoverSheet({ dispute, onClose, onDecided, onStale, onExpired }: {
  dispute: WalkoverDispute
  onClose: () => void
  onDecided: (message: string) => void
  /** O W.O. já foi decidido (409/404): a fila recarrega e a folha fecha. */
  onStale: (message: string) => void
  onExpired: () => void
}) {
  const colors = useThemeColors()
  const { match, walkover } = dispute
  const absent = sideOf(match, walkover.absent_side)
  const present = sideOf(match, otherSide(walkover.absent_side))
  const [decision, setDecision] = useState<WalkoverDecision | null>(null)
  const [reason, setReason] = useState('')
  const [attempted, setAttempted] = useState(false)
  const { busy, error, setError, run } = useSubmit(onExpired)
  const title = matchTitle(match.sides)
  const score = walkoverScore[match.sport]

  async function decide() {
    setAttempted(true)
    if (!decision || reasonError(reason, WALKOVER_REASON_MESSAGE)) return
    let stale = ''
    const decided = await run(async () => {
      try { return await decideWalkover(match.id, decision, reason) } catch (cause) {
        if (cause instanceof ApiError && (cause.status === 404 || cause.status === 409)) stale = cause.message
        throw cause
      }
    }, 'Não foi possível registrar a decisão.')
    if (!decided && stale) onStale(stale)
    if (decided) onDecided(decision === 'manter'
      ? `W.O. mantido: vitória de ${sideName(present)} por ${score}.`
      : `W.O. anulado: ${title} ficou sem resultado.`)
  }
  const back = () => { setDecision(null); setAttempted(false); setError('') }

  return <Sheet title="W.O. contestado" onClose={onClose}>
    <Text style={{ color: colors['ink-muted'], fontSize: 12, marginBottom: 4 }}>{title}</Text>
    <InfoGrid items={[
      ['Partida', `${modality(match)} · #${match.id}`],
      ['Horário', formatDeadline(match.starts_at) || '—'],
      ['Quadra', match.court?.name ?? '—'],
      ['Lado ausente', sideName(absent)],
    ]} />
    <Party title="Registrou o W.O." person={walkover.registered_by} side={present} role="compareceu" at={walkover.registered_at} />
    <Party title="Contestou" person={walkover.contested_by} side={absent} role="lado ausente" at={walkover.contested_at} reason={walkover.contest_reason} />
    <ChatExcerpt match={match} onExpired={onExpired} />

    {!decision ? <ActionRow>
      <ActionButton icon="check" title="Manter o W.O." disabled={busy} onPress={() => { setDecision('manter'); setError('') }} grow />
      <ActionButton icon="x" tone="outline" title="Anular" accessibilityLabel="Anular o W.O." disabled={busy} onPress={() => { setDecision('anular'); setError('') }} grow />
    </ActionRow> : <ReasonPanel tone={decision === 'manter' ? 'brand' : 'danger'}
      title={decision === 'manter' ? 'Manter o W.O.' : 'Anular o W.O.'}
      textLabel="Justificativa da decisão (os dois lados veem)" text={reason} onText={setReason} max={500}
      error={attempted ? reasonError(reason, WALKOVER_REASON_MESSAGE) : null}
      note={decision === 'manter'
        ? `Vale ${score} para ${sideName(present)}: a partida é encerrada e o ranking é recalculado.`
        : 'A partida fica sem resultado e ninguém pontua. Os dois lados recebem a decisão nas notificações.'}
      confirmLabel={decision === 'manter' ? 'Manter o W.O.' : 'Anular o W.O.'} busyLabel="Registrando…" busy={busy}
      onConfirm={() => void decide()} onCancel={back} />}
    {error ? <ErrorText>{error}</ErrorText> : null}
    <BusyStatus text={busy ? 'Registrando a decisão…' : ''} />
  </Sheet>
}
