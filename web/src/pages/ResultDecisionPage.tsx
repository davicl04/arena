import { useCallback } from 'react'
import { Flag, GitCompareArrows, Hourglass, MessagesSquare, Upload } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { decideResult } from '@/api/brackets'
import type { ResultDecisionInput } from '@/api/brackets'
import { ApiError } from '@/api/client'
import { getMatch, getMessages } from '@/api/matches'
import type { MatchDetail, MatchMessageOut } from '@/api/matches'
import { TeamMark } from '@/components/match/TeamMark'
import { DecisionForm } from '@/components/organizer/DecisionForm'
import { scoreText, walkoverScoreText } from '@/components/results/format'
import { DarkTopBar, TeamsPlate } from '@/components/teams/TeamsPlate'
import { Button } from '@/components/ui/button'
import { feedbackVariants } from '@/components/ui/feedback'
import { headerNames, orderedSides, sideName, sideOf, whenText } from '@/data/match'
import { useResource } from '@/hooks/useResource'
import { isStale, useSubmit } from '@/hooks/useSubmit'
import { cn } from '@/lib/utils'
import { formatClock, parseIso } from '@/utils/format'

interface TimelineEvent { Icon: LucideIcon; title: string; detail: string; bad?: boolean }

/** A linha do tempo da partida: o jogo, os dois envios (quem e quando) e o que falta decidir. */
function timelineOf(match: MatchDetail): TimelineEvent[] {
  const events: TimelineEvent[] = []
  const result = match.result
  events.push({ Icon: Flag, title: match.state === 'agendada' && !result ? 'Partida agendada' : 'Partida jogada', detail: [whenText(match.starts_at), match.court?.name].filter(Boolean).join(' · ') || 'Sem data' })
  const reports = (['a', 'b'] as const).map(key => result?.reports[key] ?? null)
  const informed = reports.filter(Boolean).sort((a, b) => Date.parse(a!.updated_at) - Date.parse(b!.updated_at))
  for (const report of informed) {
    const name = sideName(sideOf(match, report!.side))
    const who = report!.reported_by?.name
    const when = whenText(report!.updated_at)
    events.push({
      Icon: Upload,
      title: report!.score ? `${name} informou ${scoreText(match.sport, report!.score, 'a')}` : `${name} informou o placar`,
      detail: [who, when].filter(Boolean).join(' · '),
    })
  }
  for (const key of ['a', 'b'] as const) {
    if (result && !result.reports[key] && match.state === 'agendada') events.push({ Icon: Hourglass, title: `${sideName(sideOf(match, key))} não informou o placar`, detail: 'Ainda sem envio' })
  }
  if (result?.state === 'divergente') events.push({ Icon: GitCompareArrows, title: 'Placares diferentes', detail: 'A partida aguarda a sua decisão', bad: true })
  else if (match.state === 'agendada' && result && Date.now() >= Date.parse(result.deadline)) events.push({ Icon: Hourglass, title: 'Prazo de 48 h vencido', detail: 'Sem placar confirmado: a partida aguarda a sua decisão', bad: true })
  return events
}

/** Resumo do que foi decidido (partida já encerrada pelo organizador). */
function DecidedCard({ match }: { match: MatchDetail }) {
  const result = match.result
  const score = result?.final ? scoreText(match.sport, result.final, 'a') : null
  const wo = match.walkover?.absent_side
  return (
    <section aria-label="Resultado registrado" className="grid gap-1.5 rounded-card bg-success-bg p-3.5 text-[12px] leading-[1.5] text-ink">
      <b className="text-[13px] text-brand">Resultado registrado{score ? `: ${score}` : ''}</b>
      {wo && <span>W.O. de {sideName(sideOf(match, wo))}: o lado presente venceu por {walkoverScoreText(match.sport)}.</span>}
      {result?.decision_reason && <span><b>Justificativa:</b> {result.decision_reason}</span>}
      <small className="text-[10.5px] text-ink-muted">A tabela e o ranking foram atualizados e os dois elencos foram avisados.</small>
    </section>
  )
}

/**
 * Placar divergente (D3), do lado do organizador: a linha do tempo da partida (o jogo, os dois envios e a divergência), o
 * trecho do chat com "Abrir chat" e a decisão (um dos placares, outro placar ou W.O.) com a justificativa obrigatória. O
 * servidor valida (na eliminação não há empate); ao registrar, a tela volta e quem a abriu relê os dados.
 */
export default function ResultDecisionPage({ matchId, onBack, onOpenChat, onDone, onExpired }: {
  matchId: number
  onBack: () => void
  /** "Abrir chat": a tela da partida. */
  onOpenChat: () => void
  /** Decisão registrada: volta e atualiza. */
  onDone: () => void
  onExpired: () => void
}) {
  const loadMatch = useCallback(() => getMatch(matchId), [matchId])
  const loadChat = useCallback(() => getMessages(matchId, { limit: 20 }), [matchId])
  const match = useResource(loadMatch, onExpired, { fallback: 'Não foi possível carregar a partida.' })
  const detail = match.data
  const chat = useResource(loadChat, onExpired, { enabled: detail?.permissions.read_chat === true, fallback: 'Não foi possível carregar o chat.' })
  const action = useSubmit(onExpired)

  /** Um `409`/`404` mostra que a partida mudou (já decidida, cancelada, placar acertado): relê o detalhe e mostra o estado atual. */
  async function reread(cause: unknown) {
    if (!isStale(cause)) return
    try {
      match.setData(await getMatch(matchId))
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) onExpired()
    }
  }

  async function decide(input: ResultDecisionInput) {
    const done = await action.run(() => decideResult<MatchDetail>(matchId, input), 'Não foi possível registrar a decisão.', reread)
    if (done) onDone()
  }

  if (!detail) {
    return <div>
      <TeamsPlate className="pb-4"><DarkTopBar eyebrow="Organizador" title="Decidir resultado" onBack={onBack} /></TeamsPlate>
      <div className="px-5 pt-4">
        {match.loading && <p role="status" className="text-[12px] text-ink-muted">Carregando a partida…</p>}
        {match.error && <div className={feedbackVariants()} role="alert">{match.error} <Button variant="text" onClick={match.reload}>Tentar novamente</Button></div>}
      </div>
    </div>
  }

  const sides = orderedSides(detail)
  const names = headerNames(sides)
  const divergent = detail.result?.state === 'divergente'
  const decided = detail.state === 'encerrada' && detail.result?.source === 'organizador'
  const canDecide = detail.permissions.decide_result === true
  const recent: MatchMessageOut[] = (chat.data?.items ?? []).filter(item => item.kind === 'texto' && !item.removed && item.body).sort((a, b) => a.id - b.id).slice(-3)
  const title = decided ? 'Resultado decidido' : divergent ? 'Placar divergente' : 'Decidir resultado'

  return <div>
    <TeamsPlate className="pb-4">
      <DarkTopBar eyebrow={detail.event?.name ?? 'Organizador'} title={title} onBack={onBack} />
    </TeamsPlate>

    <div className="grid grid-cols-[minmax(0,1fr)] gap-3.5 px-4 pt-4">
      <div className="flex items-center justify-center gap-2.5 rounded-card bg-white px-3 py-2.5" data-slot="decision-vs">
        {sides[0] && <TeamMark side={sides[0]} />}
        <h2 className="m-0 flex min-w-0 items-center gap-2 text-[13px]">
          <span className="sr-only">{sides.map(side => sideName(side)).join(' contra ')}</span>
          <b aria-hidden="true" className="truncate">{names[0]}</b>
          <span aria-hidden="true" className="font-display font-extrabold text-brand">×</span>
          <b aria-hidden="true" className="truncate">{names[1]}</b>
        </h2>
        {sides[1] && <TeamMark side={sides[1]} />}
      </div>

      <section aria-label="Linha do tempo da partida" className="rounded-card bg-white p-3.5">
        <ol className="m-0 grid list-none gap-0 p-0">
          {timelineOf(detail).map((item, index, all) => (
            <li key={`${item.title}-${index}`} className={cn('relative flex gap-3 pb-3.5 last:pb-0', index < all.length - 1 && 'before:absolute before:top-7 before:bottom-0 before:left-[13px] before:w-px before:bg-line')}>
              <span className={cn('relative z-1 grid size-[27px] flex-none place-items-center rounded-full', item.bad ? 'bg-[#fff0f2] text-danger' : 'bg-[#005a3612] text-brand')}>
                <item.Icon size={14} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <b className={cn('block text-[12px] leading-tight', item.bad && 'text-danger')}>{item.title}</b>
                <small className="text-[10.5px] leading-snug text-ink-muted">{item.detail}</small>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {detail.permissions.read_chat && (
        <section aria-label="No chat da partida" className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="m-0 flex items-center gap-1.5 text-[14px]"><MessagesSquare size={16} className="text-brand" aria-hidden="true" />No chat da partida</h2>
            <Button variant="link" onClick={onOpenChat}>Abrir chat</Button>
          </div>
          {chat.loading && <p role="status" className="m-0 text-[11px] text-ink-muted">Carregando o chat…</p>}
          {chat.error && <p className="m-0 text-[11px] text-ink-muted" role="status">{chat.error}</p>}
          {!chat.loading && !chat.error && recent.length === 0 && <p className="m-0 rounded-card bg-white p-3 text-[11.5px] text-ink-muted">Ainda não há mensagens no chat desta partida.</p>}
          {recent.length > 0 && (
            <ul className="m-0 grid list-none gap-2 rounded-card bg-white p-3">
              {recent.map(item => {
                const side = sideOf(detail, item.side)
                const time = parseIso(item.created_at)
                return (
                  <li key={item.id} className="flex items-start gap-2">
                    {side ? <TeamMark side={side} /> : <span aria-hidden="true" className="grid size-[29px] flex-none place-items-center rounded-full bg-forest text-[8px] font-extrabold text-mint">ORG</span>}
                    <div className="min-w-0 flex-1">
                      <b className="text-[11.5px]">{item.author?.name ?? 'Participante'}{item.author_role === 'organizador' && <span className="ml-1 rounded bg-forest px-1 py-px text-[8.5px] font-extrabold text-mint">Organizador</span>} <small className="font-normal text-ink-muted">{time ? formatClock(time) : ''}</small></b>
                      <p className="m-0 text-[11.5px] leading-[1.45] wrap-anywhere text-ink">{item.body}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {decided && <DecidedCard match={detail} />}

      {canDecide && <DecisionForm key={detail.id} match={detail} busy={action.busy} error={action.error} onSubmit={input => void decide(input)} />}

      {/* Sem o formulário (a decisão não cabe mais), a mensagem do servidor continua visível. */}
      {!canDecide && action.error && <p className={cn(feedbackVariants(), 'my-0')} role="alert">{action.error}</p>}

      {!canDecide && !decided && (
        <p className="m-0 rounded-card bg-white p-3.5 text-[12px] leading-[1.5] text-ink-muted" role="note">
          {detail.state === 'cancelada' ? 'Esta partida foi cancelada.' : detail.state === 'agendada' ? 'A partida ainda não começou: a decisão fica disponível depois do horário.' : 'Não há resultado para decidir nesta partida agora.'}
        </p>
      )}
    </div>
  </div>
}
