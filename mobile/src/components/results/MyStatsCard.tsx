import { useState } from 'react'
import { Text, View } from 'react-native'
import type { Position } from '../../api/client'
import { putMyStats } from '../../api/results'
import type { Lineup, MyStatsResult, ResultMatch } from '../../api/results'
import { useSubmit } from '../../hooks/useSubmit'
import { colors } from '../../theme'
import { StateBadge } from '../arena/StateBadge'
import { ActionButton, ChoicePills, ErrorText } from '../arena/controls'
import { formatNumber, localPreview, positionStat, statFieldLabel } from './format'
import type { Outcome } from './format'
import { Stepper } from './Stepper'
import { CardTitle, Eyebrow, Muted, ResultCard, positionChoices } from './ui'

/*
 * "Suas estatísticas" (R4): a posição em que a pessoa jogou, gols, assistências e a estatística da posição (RN13), com a
 * prévia de pontos (RN12) que se atualiza ao mexer nos contadores. Enviar marca a presença; o representante do próprio
 * lado revisa e o adversário pode contestar antes de pontuar. Campo zerado vai vazio: não soma nem tira pontos.
 */
const resultName: Record<number, string> = { 3: 'vitória', 1: 'empate', 0: 'derrota' }
const badgeText = { enviada: 'Enviadas', revisada: 'Revisadas', contestada: 'Contestadas' } as const
const badgeTone = { enviada: 'draft', revisada: 'open', contestada: 'pending' } as const

export function MyStatsCard({ match, lineup, outcome, onSaved, onExpired }: {
  match: ResultMatch
  /** A atuação de quem vê (null se ainda não tem registro). */
  lineup: Lineup | null
  /** Resultado conhecido para a prévia: o placar confirmado, senão o do meu lado. */
  outcome: Outcome | null
  onSaved: (result: MyStatsResult) => void
  onExpired: () => void
}) {
  const stat = lineup?.stat ?? null
  // Depois da contestação, a revisão do representante é final e o servidor recusa edições, mesmo com `send_stats`.
  const finalReview = stat?.state === 'revisada' && stat.contested_at != null
  const editable = match.permissions.send_stats && !finalReview
  const [position, setPosition] = useState<Position | null>(lineup?.position ?? null)
  const [goals, setGoals] = useState(stat?.goals ?? 0)
  const [assists, setAssists] = useState(stat?.assists ?? 0)
  const [extra, setExtra] = useState(stat?.position_stat ?? 0)
  const { busy, error, run } = useSubmit(onExpired)
  const dirty = position !== (lineup?.position ?? null) || goals !== (stat?.goals ?? 0)
    || assists !== (stat?.assists ?? 0) || extra !== (stat?.position_stat ?? 0)
  const extraName = position ? positionStat[position].label : 'Estatística da posição'
  const server = !dirty ? lineup?.points ?? null : null
  const preview = server
    ? { presence: server.presence, result: server.result, goals: server.goals, assists: server.assists, positionStat: server.position_stat, total: server.total }
    : localPreview(outcome, goals, assists, extra)

  async function send() {
    if (!position) return
    const result = await run(() => putMyStats(match.id, {
      position, goals: goals || null, assists: assists || null, position_stat: extra || null,
    }), 'Não foi possível enviar as estatísticas.')
    if (result) onSaved(result)
  }

  const parts = [
    `${formatNumber(preview.presence)} presença`,
    preview.result !== null ? `${formatNumber(preview.result)} ${resultName[preview.result] ?? 'resultado'}` : null,
    goals ? `${preview.goals} ${preview.goals === 1 ? 'gol' : 'gols'}` : null,
    assists ? `${preview.assists} ${preview.assists === 1 ? 'assistência' : 'assistências'}` : null,
    extra ? `${formatNumber(preview.positionStat)} (${extraName.toLowerCase()}, até 4)` : null,
  ].filter(Boolean)

  const caption = !stat ? 'Vale após a confirmação do placar e a revisão do representante.'
    : stat.state === 'contestada' ? 'O representante do seu time revisa de novo. Enquanto isso, o item contestado não pontua.'
      : finalReview ? 'Revisão final do representante do seu time, depois da contestação.'
        : stat.state === 'revisada' ? 'Revisadas pelo representante. Se você editar, voltam para a revisão.'
          : 'O representante do seu time revisa; o adversário pode contestar antes de pontuar.'
  const counted = server?.counted.map(field => statFieldLabel(field, position).toLowerCase()) ?? []
  const summary = `${parts.join(' + ')}.${preview.result === null ? ' O resultado soma quando o placar for confirmado.' : ''} ${caption}${counted.length > 0 ? ` Já pontuam: ${counted.join(', ')}.` : ''}${server?.final ? ' Pontuação final.' : ''}`

  return <ResultCard testID="my-stats">
    <CardTitle icon="user-round" title="Suas estatísticas" trailing={<StateBadge tone={stat ? badgeTone[stat.state] : 'draft'}>{stat ? badgeText[stat.state] : 'Opcional'}</StateBadge>} />

    {lineup?.present === false ? <ErrorText>O representante marcou que você não jogou. Fale com ele.</ErrorText> : null}
    {stat?.state === 'contestada'
      ? <View style={{ borderRadius: 10, backgroundColor: colors['warning-bg'], padding: 9 }}>
        <Muted tone="warning">{stat.contested_by?.name ?? 'O adversário'} contestou{stat.contest_reason ? `: “${stat.contest_reason}”` : '.'}</Muted>
      </View>
      : null}

    <View style={{ gap: 6 }}>
      <Eyebrow>Posição em que você jogou</Eyebrow>
      <ChoicePills label="Posição em que você jogou" options={positionChoices} value={position} disabled={!editable || busy} onChange={setPosition} />
    </View>

    <View style={{ gap: 2 }}>
      {([['Gols', goals, setGoals], ['Assistências', assists, setAssists], [extraName, extra, setExtra]] as const).map(([title, value, set]) => (
        <View key={title} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Text style={{ flex: 1, minWidth: 0, color: colors.ink, fontSize: 12.5, fontWeight: '600' }}>{title}</Text>
          <Stepper label={title} value={value} max={50} disabled={!editable || busy} onChange={set} />
        </View>
      ))}
    </View>

    <View testID="points-preview" accessible accessibilityLabel={`Prévia: ${formatNumber(preview.total)} pontos. ${summary}`} style={{ gap: 3, borderRadius: 12, backgroundColor: colors.subtle, paddingHorizontal: 12, paddingVertical: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Eyebrow>Prévia</Eyebrow>
        <Text style={{ color: colors.brand, fontSize: 16, fontWeight: '800' }}>{formatNumber(preview.total)} pts</Text>
      </View>
      <Muted>{summary}</Muted>
    </View>

    {error ? <ErrorText>{error}</ErrorText> : null}
    {editable
      ? <ActionButton tone="brand" block title={busy ? 'Enviando…' : stat ? 'Atualizar estatísticas' : 'Enviar estatísticas'}
        accessibilityLabel={stat ? 'Atualizar estatísticas' : 'Enviar estatísticas'} busy={busy} disabled={!position || (Boolean(stat) && !dirty)} onPress={() => void send()} />
      : null}
  </ResultCard>
}
