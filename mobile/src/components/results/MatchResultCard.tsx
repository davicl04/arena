import { useState } from 'react'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { reportResult } from '../../api/results'
import type { ResultInput, ResultMatch } from '../../api/results'
import { sideName, sideOf } from '../../data/match'
import { useSubmit } from '../../hooks/useSubmit'
import { useThemeColors } from '../../hooks/useTheme'
import { LoadError } from '../arena/LoadError'
import { Icon } from '../Icon'
import { toast } from '../toast/toastStore'
import { otherSide, outcomeFor } from './format'
import { MyStatsCard } from './MyStatsCard'
import { ResultStatus } from './ResultStatus'
import { RosterSheet } from './RosterSheet'
import { ScoreEntry } from './ScoreEntry'
import { useLineups } from './useLineups'

/*
 * Cartão de resultado da partida (R4 + S1; docs/decisoes/0002-jogar.md, seções 10.1 e 12): depois do horário vira "Informe
 * o placar" para quem age pelo lado; o placar enviado, a espera pelo outro lado, a confirmação, a divergência, a partida
 * sem resultado e o W.O. aparecem no cartão verde-escuro; no futebol, "Suas estatísticas" com a prévia de pontos e o
 * "Revisar elenco" do representante (presença, revisão e contestação de estatísticas, RN10). Tudo obedece a
 * `match.permissions`: o servidor decide o que cada pessoa pode fazer.
 *
 * É independente da tela da partida: recebe o detalhe (`MatchDetail`) por props e avisa por `onChanged` quando algo muda
 * (a resposta de `PUT /result` vem como argumento; quem prefere recarrega o detalhe). Sem `result` (antes do início ou
 * partida cancelada), não renderiza nada. Mantenha o cartão montado ao recarregar: a folha do elenco é dele. Os avisos saem pelo `toast` global.
 *
 * Relato cego (12.3): o placar do outro lado só aparece depois que o meu lado informou o meu (ou na divergência); antes,
 * o aviso diz que ele já informou, sem o placar. No campeonato, o organizador não vê o elenco e, na divergência, "o
 * organizador decide" (17.4).
 */
export interface MatchResultCardProps<T extends ResultMatch = ResultMatch> {
  /** Detalhe da partida (`MatchDetail`): `result`, `permissions`, lados e prazos. */
  match: T
  /** Id de quem vê (a atuação própria vem da lista do elenco, que a API não marca). */
  viewerId: number
  /** Algo mudou: o placar enviado (com o novo detalhe), a presença, as estatísticas ou a contestação. */
  onChanged: (detail?: T) => void
  /** "Conversar" (divergência): leva ao chat da partida. Sem ele, o botão não aparece. */
  onOpenChat?: () => void
  /** Sessão expirada (401). */
  onExpired: () => void
  /** Botões do W.O. (registrar, retirar, contestar), que a tela da partida controla. */
  walkoverActions?: ReactNode
}

export function MatchResultCard<T extends ResultMatch = ResultMatch>({
  match, viewerId, onChanged, onOpenChat, onExpired, walkoverActions,
}: MatchResultCardProps<T>) {
  const colors = useThemeColors()
  const result = match.result
  const football = match.sport === 'futebol'
  const [editing, setEditing] = useState(false)
  const [roster, setRoster] = useState(false)
  const score = useSubmit(onExpired)

  // O elenco e as estatísticas voltam a ser lidos quando o estado do resultado muda (confirmação, divergência, prazo).
  // O organizador do campeonato não age pelo lado: não há elenco nem estatísticas para ele.
  const signature = `${match.state}|${result?.state}|${result?.confirmed_at}`
  const lineups = useLineups(match.id, signature, football && result !== null && match.my_role !== 'organizador', onExpired)
  const items = lineups.items

  if (!result) return null

  const mySide = match.my_side
  const ownReport = mySide ? result.reports[mySide] : null
  const canReport = match.permissions.report_result
  const form = canReport && (result.state === 'aguardando' || result.state === 'divergente') && (editing || !ownReport)
  const mine = items.find(item => item.user.id === viewerId) ?? null
  const outcome = mySide && football
    ? (result.final ? outcomeFor(result.final, mySide) : ownReport?.score ? outcomeFor(ownReport.score, mySide) : null)
    : null

  const otherReport = mySide ? result.reports[otherSide(mySide)] : null
  const rosterSide = mySide ?? 'a'
  const present = items.filter(item => item.side === rosterSide && item.present === true)
  const sent = present.filter(item => item.stat).length
  const toReview = items.filter(item => item.can_review && item.stat && item.stat.state !== 'revisada').length
  const summary = present.length ? `${sent}/${present.length} estatísticas` : undefined
  // O organizador do campeonato não registra presença nem estatísticas: o elenco é dos times.
  const hasRoster = football && items.length > 0 && !['organizador', 'historico'].includes(match.my_role)

  async function send(input: ResultInput) {
    const detail = await score.run(() => reportResult<T>(match.id, input), 'Não foi possível enviar o placar.')
    if (!detail) return
    setEditing(false)
    const state = detail.result?.state
    if (state === 'confirmado') toast.success('Placar confirmado pelos dois lados')
    else if (state === 'divergente') toast.warning('Placar enviado. Os placares não bateram.')
    else toast.success('Placar enviado. Falta o outro lado.')
    if (football) lineups.reload()
    onChanged(detail)
  }

  const rosterSummary = `${present.length ? `${sent} de ${present.length} que jogaram enviaram` : 'Ninguém marcado como presente ainda'}${toReview > 0 ? ` · ${toReview} para revisar` : ''}`

  return <View testID="match-result" style={{ gap: 12 }}>
    {form
      ? <ScoreEntry key={ownReport ? `corrigir-${ownReport.updated_at}` : 'novo'}
        match={match} initial={ownReport?.score ?? undefined} busy={score.busy} error={score.error} summary={summary}
        notice={!ownReport && otherReport && mySide ? `${sideName(sideOf(match, otherSide(mySide)))} já informou o placar. Informe o seu: se os dois baterem, o resultado é confirmado.` : undefined}
        onRoster={hasRoster ? () => setRoster(true) : undefined}
        onCancel={ownReport ? () => setEditing(false) : undefined}
        onSubmit={input => void send(input)} />
      : <ResultStatus match={match} result={result} onChat={onOpenChat} walkoverActions={walkoverActions}
        onCorrect={canReport && (result.state === 'aguardando' || result.state === 'divergente') && ownReport ? () => setEditing(true) : undefined} />}

    {hasRoster && (!form || ownReport)
      ? <Pressable accessibilityRole="button" accessibilityLabel={`Elenco e estatísticas. ${rosterSummary}`} onPress={() => setRoster(true)}
        style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, backgroundColor: colors.surface, padding: 14 }}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Icon name="users" size={20} color={colors.brand} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }}>Elenco e estatísticas</Text>
          <Text style={{ marginTop: 2, color: colors['ink-muted'], fontSize: 10.5 }}>{rosterSummary}</Text>
        </View>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Icon name="chevron" size={18} color={colors['ink-muted']} /></View>
      </Pressable>
      : null}
    {football && lineups.error
      ? <LoadError size="section" title="Não foi possível carregar o elenco" text={lineups.error} cause={lineups.errorCause} onRetry={lineups.reload} />
      : null}

    {football && (match.permissions.send_stats || mine?.stat)
      ? <MyStatsCard key={`${mine?.stat?.id ?? 'nova'}|${mine?.stat?.state}|${mine?.stat?.submitted_at}|${mine?.position}`}
        match={match} lineup={mine} outcome={outcome} onExpired={onExpired}
        onSaved={saved => {
          lineups.replaceOne(saved.lineup)
          toast.success('Estatísticas enviadas')
          onChanged()
        }} />
      : null}

    {roster
      ? <RosterSheet match={match} lineups={items} onLineups={lineups.replaceAll} onUpdated={lineups.replaceOne} onChanged={() => onChanged()}
        onClose={() => setRoster(false)} onExpired={onExpired} />
      : null}
  </View>
}
