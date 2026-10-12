import type { ReactNode } from 'react'
import type { ResultMatch } from '@/api/results'
import type { MatchResultOut, ScoreOut } from '@/api/matches'
import { StatusCard, StatusCardButton } from '@/components/events/StatusCard'
import { useNow } from '@/hooks/useNow'
import { formatDeadline } from '@/utils/format'
import { otherSide, pointsPill, scoreSpoken, scoreText, viewSide, walkoverScoreText } from './format'
import { sideName, sideOf } from '@/data/match'

/*
 * Estados do resultado no cartão S1 (verde-escuro): aguardando (anel com as horas até o prazo), confirmado (selo menta e
 * "+3 pts"), divergente (≠ e os dois placares), sem resultado e W.O. Aqui só se lê o detalhe da partida; as ações do cartão
 * (corrigir o meu, conversar e, no W.O., as da tela da partida) chegam por callbacks.
 */
export interface ResultStatusProps {
  match: ResultMatch
  result: MatchResultOut
  /** "Corrigir o meu" (quem age pelo lado); sem ele o botão não aparece. */
  onCorrect?: () => void
  /** "Conversar": rola até o chat da partida. */
  onChat?: () => void
  /** Botões do W.O. (registrar, retirar, contestar), que pertencem à tela da partida. */
  walkoverActions?: ReactNode
}

export function ResultStatus({ match, result, onCorrect, onChat, walkoverActions }: ResultStatusProps) {
  const now = useNow()
  const view = viewSide(match)
  const opponent = sideName(sideOf(match, otherSide(view)))
  const fecha = formatDeadline(result.deadline)
  const expired = now >= Date.parse(result.deadline)
  const own = match.my_side ? result.reports[match.my_side] : null
  // No campeonato o prazo vencido e a divergência não tiram o resultado da partida: o organizador decide (0002, 17.4).
  const championship = match.origin === 'campeonato'
  const text = (score: ScoreOut) => (
    <>{scoreText(match.sport, score, view)}<span className="sr-only"> ({scoreSpoken(match, score)})</span></>
  )
  // Como no S1 do protótipo: "Corrigir o meu" com contorno e "Conversar" em menta.
  const chat = onChat && match.permissions.read_chat ? <StatusCardButton onClick={onChat}>Conversar</StatusCardButton> : null
  const correct = onCorrect ? <StatusCardButton variant="secondary" onClick={onCorrect}>Corrigir o meu</StatusCardButton> : null

  switch (result.state) {
    case 'aguardando': {
      if (expired) {
        return (
          <StatusCard tone="neutro" title="Prazo encerrado">
            {championship
              ? <>Sem placar confirmado até <b>{fecha}</b>. O organizador decide o resultado.</>
              : <>Sem placar confirmado até <b>{fecha}</b>, a partida fica sem resultado e não pontua.</>}
          </StatusCard>
        )
      }
      if (own?.score) {
        return (
          <StatusCard tone="aguardando" title={`Aguardando ${opponent}`} deadline={result.deadline} windowStart={match.starts_at}
            actions={correct}>
            {match.sport === 'tenis' ? 'Você informou' : 'Vocês informaram'} <b>{text(own.score)}</b>. Fecha <b>{fecha}</b>.
          </StatusCard>
        )
      }
      const informed = [result.reports.a, result.reports.b].filter(Boolean).map(report => sideName(sideOf(match, report!.side)))
      return (
        <StatusCard tone="aguardando" title="Aguardando o placar" deadline={result.deadline} windowStart={match.starts_at}>
          {informed.length
            ? <>{informed[0]} já informou o placar. Fecha <b>{fecha}</b>.</>
            : <>Os representantes informam o placar até <b>{fecha}</b>.</>}
        </StatusCard>
      )
    }

    case 'divergente': {
      const first = result.reports[view]
      const second = result.reports[otherSide(view)]
      if (expired) {
        return (
          <StatusCard tone="divergente" title="Placares diferentes">
            {championship
              ? <>Sem acordo até <b>{fecha}</b>: o organizador decide o resultado.</>
              : <>Sem acordo até <b>{fecha}</b>: a partida fica sem resultado e não pontua.</>}
          </StatusCard>
        )
      }
      const tail = championship
        ? <>Os times podem corrigir até <b>{fecha}</b>; o organizador decide se os placares seguirem diferentes.</>
        : <>Sem acordo até <b>{fecha}</b>, não pontua.</>
      return (
        <StatusCard tone="divergente" title="Placares diferentes" actions={correct || chat ? <>{correct}{chat}</> : undefined}>
          {first?.score && second?.score && own
            ? <>{match.sport === 'tenis' ? 'Você informou' : 'Vocês informaram'} <b>{text(first.score)}</b>; {opponent} informou <b>{text(second.score)}</b>. {tail}</>
            : first?.score && second?.score
              ? <>{sideName(sideOf(match, view))} informou <b>{text(first.score)}</b> e {opponent}, <b>{text(second.score)}</b>. {tail}</>
              : <>Os placares informados não batem. {tail}</>}
        </StatusCard>
      )
    }

    case 'confirmado': {
      const score = result.final
      const pill = result.points != null ? pointsPill(result.points) : undefined
      const decided = result.decision_reason ? <> {result.decision_reason}</> : null
      if (result.source === 'wo') {
        return (
          <StatusCard tone="confirmado" pill={pill} title={`W.O. valendo${score ? ` · ${scoreText(match.sport, score, view)}` : ''}`}>
            O W.O. não foi contestado e vale como resultado.{decided}
          </StatusCard>
        )
      }
      return (
        <StatusCard tone="confirmado" pill={pill} title={<>Placar confirmado{score && <> · {text(score)}</>}</>}>
          {result.source === 'administracao' ? <>A administração decidiu o resultado.{decided}</>
            : result.source === 'organizador' ? <>O organizador decidiu o resultado.{decided}</>
              : <>Os dois lados informaram o mesmo resultado.</>}
        </StatusCard>
      )
    }

    case 'wo_registrado':
    case 'wo_contestado': {
      const walkover = match.walkover
      const absent = walkover ? sideName(sideOf(match, walkover.absent_side)) : opponent
      const fails = walkover && match.my_side === walkover.absent_side
      const registered = walkover?.registered_by?.name
      const worth = walkoverScoreText(match.sport)
      if (result.state === 'wo_contestado') {
        return (
          <StatusCard tone="neutro" title="W.O. contestado" actions={walkoverActions}>
            {walkover?.contested_by?.name ?? 'Um representante'} contestou o W.O.{walkover?.contest_reason ? <>: “{walkover.contest_reason}”</> : null}
            {' '}A administração decide; até lá a partida fica sem resultado.
          </StatusCard>
        )
      }
      return (
        <StatusCard tone="aguardando" title={fails ? 'W.O. registrado contra o seu lado' : `W.O. registrado contra ${absent}`}
          deadline={walkover?.contest_until ?? result.deadline} windowStart={match.starts_at} actions={walkoverActions}>
          {fails
            ? <>{registered ?? opponent} registrou que {match.sport === 'tenis' ? 'você não compareceu' : 'vocês não compareceram'}. Se compareceram, conteste até <b>{formatDeadline(walkover?.contest_until ?? result.deadline)}</b>.</>
            : <>Vale <b>{worth}</b> se {absent} não contestar até <b>{formatDeadline(walkover?.contest_until ?? result.deadline)}</b>.</>}
        </StatusCard>
      )
    }

    default: {
      const walkover = match.walkover
      const reason = walkover?.decision === 'anulado'
        ? <>A administração anulou o W.O.{walkover.decision_reason ? <> Motivo: “{walkover.decision_reason}”</> : null} A partida não pontua.</>
        : result.reports.a && result.reports.b
          ? <>Os placares não bateram até <b>{fecha}</b>. A partida não pontua.</>
          : <>Ninguém concluiu o placar até <b>{fecha}</b>. A partida não pontua.</>
      return <StatusCard tone="neutro" title="Partida sem resultado">{reason}</StatusCard>
    }
  }
}
