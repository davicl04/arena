import { useRef } from 'react'
import type { RefObject } from 'react'
import { Check, Hourglass } from 'lucide-react'
import { acceptProposal, declineProposal } from '@/api/matchmaking'
import { sideName } from '@/data/match'
import type { Proposal } from '@/api/matchmaking'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { footballFormat } from '@/data/arena'
import { useSubmit } from '@/hooks/useSubmit'
import { Countdown } from './Countdown'
import { SideBadge } from './SideBadge'
import { darkMint, darkOutline } from './styles'

export type ProposalAnswer = 'aceitar' | 'recusar'

/**
 * Proposta em tela cheia (P2): brasões e elos dos dois lados, a contagem regressiva das 2 h e as respostas. Só quem age
 * pelo lado (o representante, ou o atleta no tênis) recusa e aceita; o membro lê "Só os representantes aceitam.".
 * "Responder depois" (e Esc) não chama a API: a proposta continua na placa até o prazo.
 *
 * `onAnswer` recebe a proposta devolvida pelo servidor, com a resposta dada; quem chama decide o que vem depois
 * (ir à partida quando os dois aceitam, reler a placa). Fica dentro da moldura do app (`DialogContainerProvider`).
 */
export function ProposalDialog({ proposal, onLater, onAnswer, onOpenMatch, onElapsed, onExpired, returnFocus }: {
  proposal: Proposal
  onLater: () => void
  onAnswer: (updated: Proposal, answer: ProposalAnswer) => void | Promise<void>
  /** Proposta já confirmada (`combinando`): abre a partida. */
  onOpenMatch: (matchId: number) => void
  /** O prazo de 2 h passou: a placa lê de novo. */
  onElapsed: () => void
  onExpired: () => void
  /** Elemento que recebe o foco quando o diálogo fecha (o botão redondo da placa). */
  returnFocus?: RefObject<HTMLElement | null>
}) {
  const { busy, run } = useSubmit(onExpired)
  const popup = useRef<HTMLDivElement>(null)
  const mine = proposal.sides.find(side => side.side === proposal.my_side)
  const other = proposal.sides.find(side => side.side !== proposal.my_side)
  const open = proposal.state === 'proposta'
  const iAccepted = Boolean(mine?.accepted_at)
  const otherName = sideName(other)
  const athletes = proposal.sport === 'tenis'
  const format = proposal.format ? footballFormat[proposal.format]?.label : 'Tênis'

  /** Chama a API e espera `onAnswer` (que relê a placa): os botões ficam ocupados até a tela refletir a resposta. */
  async function answer(kind: ProposalAnswer) {
    await run(async () => {
      const updated = await (kind === 'aceitar' ? acceptProposal : declineProposal)(proposal.match_id)
      await onAnswer(updated, kind)
    }, kind === 'aceitar' ? 'Não foi possível aceitar a proposta.' : 'Não foi possível recusar a proposta.')
  }

  return <Dialog open onOpenChange={next => { if (!next) onLater() }}>
    <DialogContent ref={popup} initialFocus={popup} finalFocus={returnFocus} showCloseButton={false} data-testid="proposal-dialog"
      className="inset-0 h-full w-full max-w-none translate-none overflow-y-auto overflow-x-hidden rounded-none bg-[radial-gradient(120%_70%_at_50%_30%,#1b5a3d_0%,var(--color-night)_70%)] p-0 text-white shadow-none sm:max-w-none">
      <div className="relative grid min-h-full content-center justify-items-center gap-[18px] px-[22px] py-[30px] text-center">
        <span aria-hidden="true" className="pointer-events-none absolute top-[16%] left-1/2 h-[260px] w-[420px] -translate-x-1/2 bg-white opacity-[0.05] mask-[url(/images/brand/coliseum.svg)] mask-contain mask-center mask-no-repeat" />
        <DialogTitle className="relative text-[11px] font-bold tracking-[0.1em] text-mint uppercase">
          {open ? 'Adversário encontrado' : proposal.state === 'combinando' ? 'Partida confirmada' : 'Proposta encerrada'} · {format}
        </DialogTitle>
        <div className="relative grid w-full grid-cols-[1fr_auto_1fr] items-start gap-2.5">
          <SideBadge side={mine} size="xl" />
          <span aria-hidden="true" className="self-center font-display text-[22px] font-extrabold text-mint">VS</span>
          <SideBadge side={other} size="xl" />
        </div>

        {open && <div className="relative grid gap-0.5">
          <Countdown until={proposal.expires_at} onElapsed={onElapsed} className="font-display text-[30px] font-extrabold text-mint" />
          <small className="text-[10.5px] text-white/65">para {athletes ? 'os atletas' : 'os representantes'} aceitarem</small>
        </div>}
        <DialogDescription className="sr-only">
          {open ? `Proposta de amistoso contra ${otherName}. Responda em até 2 horas.` : `Proposta contra ${otherName}.`}
        </DialogDescription>

        <div className="relative grid w-full gap-3">
          {open && proposal.can_respond && <div className="flex w-full gap-2">
            <button type="button" className={darkOutline} disabled={busy} onClick={() => void answer('recusar')}>Recusar</button>
            <button type="button" className={darkMint} disabled={busy} onClick={() => void answer('aceitar')}>Aceitar partida</button>
          </div>}
          {open && !proposal.can_respond && iAccepted && <div className="flex flex-wrap justify-center gap-1.5" role="status">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-mint px-3 py-1.5 text-[10.5px] font-bold text-night"><Check size={14} aria-hidden="true" />Você aceitou</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5 text-[10.5px] font-bold text-white"><Hourglass size={14} aria-hidden="true" />Aguardando {otherName}</span>
          </div>}
          {open && !proposal.can_respond && !iAccepted && <p role="note" className="m-0 text-[12px] leading-normal text-white/80">
            {athletes ? 'Só o atleta aceita a proposta.' : 'Só os representantes aceitam.'}
          </p>}
          {proposal.state === 'combinando' && <button type="button" className={darkMint} onClick={() => onOpenMatch(proposal.match_id)}>Abrir partida</button>}
          {!open && proposal.state !== 'combinando' && <p role="status" className="m-0 text-[12px] leading-normal text-white/80">
            {proposal.state === 'recusada' ? 'A proposta foi recusada.' : 'O prazo da proposta terminou.'}
          </p>}
          <Button variant="glass-link" className="justify-self-center self-center" disabled={busy} onClick={onLater}>
            {open && proposal.can_respond ? 'Responder depois' : 'Fechar'}
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
}
