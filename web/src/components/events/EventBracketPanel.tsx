import { useCallback } from 'react'
import { GitFork, Medal } from 'lucide-react'
import { ApiError } from '@/api/client'
import { getBracket } from '@/api/brackets'
import type { TennisBonus } from '@/api/events'
import { BracketView } from '@/components/brackets/BracketView'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { feedbackVariants } from '@/components/ui/feedback'
import { useResource } from '@/hooks/useResource'

/** Texto honesto de quem não lê a tabela (sem inscrição ativa) ou ainda não tem o que ver (antes de confirmar). */
function Notice({ title, text }: { title: string; text: string }) {
  return <EmptyState Icon={GitFork} title={title} text={text} className="rounded-card bg-white" />
}

/** Bônus de ranking do tênis (RN16), lembrado na aba enquanto o campeonato não termina. */
function BonusNote({ bonus }: { bonus: TennisBonus }) {
  return (
    <p className="m-0 flex items-start gap-2 rounded-card bg-white p-3 text-[11px] leading-[1.5] text-ink-muted" data-slot="tennis-bonus">
      <Medal size={16} className="mt-px flex-none text-brand" aria-hidden="true" />
      <span>
        <b className="text-ink">Bônus no ranking do tênis:</b> campeão +{bonus.champion}, vice +{bonus.runner_up} e semifinalistas +{bonus.semifinalist}
        {' '}(com {bonus.min_entries} ou mais inscrições confirmadas{bonus.applies ? '; já vale' : '; ainda não vale'}).
      </span>
    </p>
  )
}

/**
 * Aba Tabela do detalhe do evento (D2), em modo leitura: a árvore (eliminação simples) ou a tabela cruzada com a classificação
 * (todos contra todos), os resultados e, com o evento encerrado, o campeão e as colocações (no tênis, com o bônus do ranking).
 * Só os inscritos, o organizador e a administração leem (`GET /events/{id}/bracket`); quem não está inscrito, ou antes de o
 * organizador confirmar o chaveamento, vê um texto honesto no lugar. `canRead` evita a leitura de quem a API recusaria.
 */
export function EventBracketPanel({ eventId, canRead, bonus, onExpired }: {
  eventId: number
  /** Tem inscrição ativa (ou organiza o evento): só estes pedem a tabela à API. */
  canRead: boolean
  bonus: TennisBonus | null
  onExpired: () => void
}) {
  // A API recusa quem não lê a tabela (403) ou não vê o evento (404): vira `null`, o mesmo texto de quem não está inscrito.
  const load = useCallback(async () => {
    try {
      return await getBracket(eventId)
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) return null
      throw cause
    }
  }, [eventId])
  const resource = useResource(load, onExpired, { enabled: canRead, fallback: 'Não foi possível carregar a tabela.' })

  if (!canRead) {
    return <>
      <Notice title="A tabela é dos inscritos" text="Quem está inscrito acompanha aqui a árvore ou a tabela e os resultados, depois que o organizador confirmar o chaveamento." />
      {bonus && <BonusNote bonus={bonus} />}
    </>
  }
  if (resource.loading) return <p role="status" className="m-0 text-[12px] text-ink-muted">Carregando a tabela…</p>
  const bracket = resource.data
  if (resource.error) return <div className={feedbackVariants()} role="alert">{resource.error} <Button variant="text" className="inline min-h-0 p-0" onClick={resource.reload}>Tentar novamente</Button></div>
  if (!bracket) return <Notice title="A tabela é dos inscritos" text="Quem está inscrito acompanha aqui a árvore ou a tabela e os resultados." />
  if (bracket.state !== 'confirmado') {
    return <>
      <Notice title="Tabela ainda não definida"
        text={bracket.is_organizer && bracket.state === 'sorteado'
          ? 'O sorteio está feito, mas os inscritos só veem a tabela depois que você confirmar o chaveamento, na gestão do evento.'
          : 'A tabela aparece quando o organizador confirmar o chaveamento.'} />
      {bonus && <BonusNote bonus={bonus} />}
    </>
  }
  return <>
    <BracketView bracket={bracket} />
    {bonus && bracket.event_state !== 'encerrado' && <BonusNote bonus={bonus} />}
  </>
}

