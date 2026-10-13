import { useCallback, useState } from 'react'
import { CalendarDays, Check, Hand, Info, Shuffle, TriangleAlert } from 'lucide-react'
import { confirmBracket, drawBracket, getBracket, swapBracket } from '@/api/brackets'
import type { Bracket } from '@/api/brackets'
import { ApiError } from '@/api/client'
import { BracketView } from '@/components/brackets/BracketView'
import { planCompetitors, slotName } from '@/components/brackets/bracketText'
import { teamButton } from '@/components/teams/styles'
import { DarkTopBar, TeamsPlate } from '@/components/teams/TeamsPlate'
import { Button } from '@/components/ui/button'
import { LoadError } from '@/components/ui/load-error'
import { Sheet, SheetActions } from '@/components/ui/sheet'
import { toast } from '@/components/ui/toast'
import { useResource } from '@/hooks/useResource'
import { isStale, useSubmit } from '@/hooks/useSubmit'
import { formatDeadline } from '@/utils/format'

/** Nome de quem ocupa o lugar `place` da primeira fase (para a frase da troca). */
function nameAtPlace(bracket: Bracket, place: number): string {
  for (const node of bracket.rounds[0]?.nodes ?? []) {
    for (const slot of node.slots) if (slot.place === place) return slotName(slot)
  }
  return 'o lugar escolhido'
}

/**
 * Chaveamento do campeonato (B3 + T2), do lado do organizador. Sem sorteio: explica e sorteia. Sorteado: mostra a árvore
 * espelhada (eliminação simples, com a troca de lugares por toque) ou a tabela cruzada (todos contra todos), com "Sortear de
 * novo" e "Confirmar chaveamento" (folha de confirmação). Confirmado: a árvore ou a tabela com os resultados, e o atalho
 * para as partidas. `permissions` (da API) decide o que aparece; `draw_blocker` explica o que impede o sorteio agora.
 */
export default function BracketPage({ eventId, onBack, onMatches, onExpired }: {
  eventId: number
  onBack: () => void
  /** Abre a lista de partidas do evento (tela `event-matches`). */
  onMatches: () => void
  onExpired: () => void
}) {
  const load = useCallback(() => getBracket(eventId), [eventId])
  const resource = useResource(load, onExpired, { fallback: 'Não foi possível carregar o chaveamento.' })
  const bracket = resource.data
  const action = useSubmit(onExpired)
  const [picked, setPicked] = useState<number | null>(null)
  const [confirming, setConfirming] = useState(false)

  const elimination = bracket?.kind === 'eliminacao_simples'
  const unit = bracket?.sport === 'tenis' ? 'atletas' : 'times'
  const title = bracket && !elimination ? 'Tabela' : 'Chaveamento'

  if (!bracket) {
    return <div>
      <TeamsPlate className="pb-4"><DarkTopBar eyebrow="Organizador" title="Chaveamento" onBack={onBack} /></TeamsPlate>
      <div className="px-5 pt-4">
        {resource.loading && <p role="status" className="text-[12px] text-ink-muted">Carregando o chaveamento…</p>}
        {resource.error && <LoadError size="screen" text={resource.error} cause={resource.errorCause} onRetry={resource.reload} />}
      </div>
    </div>
  }

  const current: Bracket = bracket
  const { permissions } = current

  /** Um `404`/`409` mostra que o chaveamento mudou (confirmado em outra aba, evento cancelado): relê; a mensagem do servidor já saiu como aviso. */
  async function reread(cause: unknown) {
    if (!isStale(cause)) return
    try {
      const fresh = await getBracket(eventId)
      resource.setData(fresh)
      setPicked(null)
      if (!fresh.permissions.can_confirm) setConfirming(false)
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) onExpired()
    }
  }

  async function draw() {
    const next = await action.run(() => drawBracket(eventId), 'Não foi possível sortear.', reread)
    if (!next) return
    resource.setData(next)
    setPicked(null)
    if (current.state === 'sorteado') toast.success('Sorteio refeito.', { description: 'As trocas anteriores foram descartadas.' })
    else toast.success('Sorteio feito.', { description: 'Confira e confirme quando estiver pronto.' })
  }
  async function pick(place: number) {
    // A instrução do segundo toque fica na tela (`hint`); só o desfecho vira toast.
    if (picked === null) { setPicked(place); return }
    if (picked === place) { setPicked(null); toast.info('Troca cancelada.'); return }
    const first = nameAtPlace(current, picked)
    const second = nameAtPlace(current, place)
    const next = await action.run(() => swapBracket(eventId, picked, place), 'Não foi possível trocar os lugares.', reread)
    setPicked(null)
    if (!next) return
    resource.setData(next)
    toast.success('Troca concluída.', { description: `${first} e ${second} trocaram de lugar.` })
  }
  async function confirm() {
    const next = await action.run(() => confirmBracket(eventId), 'Não foi possível confirmar o chaveamento.', reread)
    if (!next) return
    resource.setData(next)
    setConfirming(false)
    setPicked(null)
    toast.success(elimination ? 'Chaveamento confirmado.' : 'Tabela confirmada.',
      { description: `${elimination ? 'As partidas' : 'As rodadas'} foram criadas e os ${unit} foram avisados.` })
  }

  const drawn = current.state === 'sorteado'
  const confirmed = current.state === 'confirmado'
  const drawLabel = elimination ? 'Sortear chaveamento' : 'Sortear rodadas'
  const competitors = planCompetitors(current.rounds).length
  const hint = !drawn || !elimination || !permissions.can_swap ? null
    : picked === null ? 'Toque em dois times para trocá-los de lugar.' : `Agora toque no time que vai para o lugar de ${nameAtPlace(current, picked)}.`

  return <div>
    <TeamsPlate className="pb-4">
      <DarkTopBar eyebrow={current.event_name} title={title} onBack={onBack} />
    </TeamsPlate>

    <div className="grid grid-cols-[minmax(0,1fr)] gap-3.5 px-4 pt-4">
      {current.state === 'sem_chaveamento' && (
        <div className="grid gap-3 surface rounded-card p-3.5 inset-ring inset-ring-surface-edge">
          <div className="flex items-start gap-3">
            <Shuffle size={22} className="mt-px flex-none text-brand" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h2 className="text-[14px] leading-[1.3]">{elimination ? 'Sorteie o chaveamento' : 'Sorteie as rodadas'}</h2>
              <p className="mt-1 mb-0 text-[11.5px] leading-[1.55] text-ink-muted">
                {elimination
                  ? `O sorteio monta a chave com os ${unit} confirmados. Quem ficar sem adversário na primeira fase tem folga e passa direto. Depois você pode trocar dois ${unit} de lugar.`
                  : `O sorteio define a ordem das rodadas: cada ${unit === 'times' ? 'time' : 'atleta'} joga uma vez por rodada e, com número ímpar, um folga em cada rodada.`}
              </p>
            </div>
          </div>
          {permissions.draw_blocker && (
            <p className="m-0 flex items-start gap-2 rounded-[12px] bg-warning-bg p-2.5 text-[11.5px] leading-[1.5] text-ink" data-slot="draw-blocker">
              <TriangleAlert size={16} className="mt-px flex-none text-warning" aria-hidden="true" />{permissions.draw_blocker}
            </p>
          )}
          <button type="button" className={teamButton({ tone: 'brand', size: 'block' })} disabled={!permissions.can_draw || action.busy} onClick={() => void draw()}>
            <Shuffle aria-hidden="true" />{action.busy ? 'Sorteando…' : drawLabel}
          </button>
        </div>
      )}

      {drawn && (
        <>
          <p className="m-0 flex items-start gap-2 text-[11px] leading-[1.5] text-ink-muted">
            <Info size={15} className="mt-px flex-none text-brand" aria-hidden="true" />
            {elimination
              ? `Sorteio${current.draw_count && current.draw_count > 1 ? ` nº ${current.draw_count}` : ''}${current.drawn_at ? ` em ${formatDeadline(current.drawn_at)}` : ''}: ${competitors} ${unit} confirmados. Os ${unit} só veem a chave depois que você confirmar.`
              : `No todos contra todos não há encaixe manual: a ordem das rodadas sai do sorteio. Os ${unit} só veem a tabela depois que você confirmar.`}
          </p>
          {hint && <p className="m-0 flex items-center gap-2 text-[11.5px] font-semibold text-brand"><Hand size={16} aria-hidden="true" />{hint}</p>}
        </>
      )}

      {(drawn || confirmed) && (
        <BracketView bracket={current} picked={drawn && permissions.can_swap ? picked : undefined} onPick={drawn && permissions.can_swap && elimination ? place => void pick(place) : undefined} busy={action.busy} />
      )}

      {drawn && permissions.draw_blocker && (
        <p className="m-0 flex items-start gap-2 rounded-[12px] bg-warning-bg p-2.5 text-[11.5px] leading-[1.5] text-ink" data-slot="draw-blocker">
          <TriangleAlert size={16} className="mt-px flex-none text-warning" aria-hidden="true" />{permissions.draw_blocker}
        </p>
      )}

      {drawn && (
        <div className="grid gap-2">
          <button type="button" className={teamButton({ tone: 'outline', size: 'block' })} disabled={!permissions.can_draw || action.busy} onClick={() => void draw()}>
            <Shuffle aria-hidden="true" />Sortear de novo
          </button>
          <button type="button" className={teamButton({ tone: 'brand', size: 'block' })} disabled={!permissions.can_confirm || action.busy}
            onClick={() => setConfirming(true)}>
            <Check aria-hidden="true" />{elimination ? 'Confirmar chaveamento' : 'Confirmar tabela'}
          </button>
          <p className="m-0 flex items-start gap-2 text-[10.5px] leading-[1.5] text-ink-muted">
            <Info size={14} className="mt-px flex-none text-brand" aria-hidden="true" />Depois de confirmar, os {unit} veem {elimination ? 'a chave' : 'a tabela'} e você agenda as partidas.
          </p>
        </div>
      )}

      {confirmed && (
        <div className="grid gap-2">
          <p className="m-0 flex items-start gap-2 text-[11px] leading-[1.5] text-ink-muted">
            <Info size={15} className="mt-px flex-none text-brand" aria-hidden="true" />
            {elimination ? 'Chaveamento' : 'Tabela'} confirmado{current.confirmed_at ? ` em ${formatDeadline(current.confirmed_at)}` : ''}. {current.event_state === 'encerrado' ? 'O campeonato terminou.' : 'Os vencedores avançam sozinhos quando o resultado de cada jogo é definido.'}
          </p>
          <button type="button" className={teamButton({ tone: 'brand', size: 'block' })} onClick={onMatches}>
            <CalendarDays aria-hidden="true" />Ver e agendar partidas
          </button>
        </div>
      )}
    </div>

    {confirming && (
      <Sheet title={elimination ? 'Confirmar chaveamento' : 'Confirmar tabela'} description={current.event_name} onClose={() => setConfirming(false)}>
        <div className="grid gap-3 pt-2 text-[12px] leading-[1.55] text-ink">
          <p className="m-0">As partidas são criadas e os {unit} inscritos recebem a {elimination ? 'chave' : 'tabela'}. Depois de confirmar, <b>não dá mais para trocar os lugares nem sortear de novo</b>.</p>
          <p className="m-0 text-ink-muted">Reservas e comprovantes recusados ainda abertos são liberados. Com algum comprovante em análise, a confirmação é recusada até você analisá-lo.</p>
          <SheetActions>
            <Button variant="secondary" disabled={action.busy} onClick={() => setConfirming(false)}>Voltar</Button>
            <Button disabled={action.busy} onClick={() => void confirm()}><Check size={16} aria-hidden="true" />{action.busy ? 'Confirmando…' : 'Confirmar'}</Button>
          </SheetActions>
        </div>
      </Sheet>
    )}
  </div>
}
