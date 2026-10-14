import { useRef } from 'react'
import type { RefObject } from 'react'
import { CalendarDays, MapPin } from 'lucide-react'
import { acceptSlotOffer, declineSlotOffer } from '@/api/matchmaking'
import { sideName } from '@/data/match'
import type { SlotOffer } from '@/api/matchmaking'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { footballFormat } from '@/data/arena'
import { useSubmit } from '@/hooks/useSubmit'
import { eventDateParts, formatClock, parseIso } from '@/utils/format'
import { Countdown } from './Countdown'
import { positionLabel } from './matchView'
import { SideBadge } from './SideBadge'
import { darkMint, darkOutline } from './styles'

/**
 * Oferta de vaga ao avulso (contrato 0002, 11.2): a partida (data, quadra, formato e os dois times), a posição da vaga
 * e as 2 h para responder. "Quero jogar" preenche a vaga e leva à partida; "Agora não" recusa (a vaga vai ao próximo
 * avulso e a busca termina); fechar ou Esc responde depois, e a oferta continua na placa até o prazo.
 */
export function SlotOfferDialog({ offer, onLater, onAccepted, onDeclined, onElapsed, onExpired, returnFocus }: {
  offer: SlotOffer
  onLater: () => void
  /** Vaga preenchida: `matchId` abre a partida. */
  onAccepted: (matchId: number) => void
  onDeclined: () => void
  onElapsed: () => void
  onExpired: () => void
  returnFocus?: RefObject<HTMLElement | null>
}) {
  const { busy, run } = useSubmit(onExpired)
  const popup = useRef<HTMLDivElement>(null)
  const { match } = offer
  const opening = match.sides.find(side => side.side === offer.side)
  const against = match.sides.find(side => side.side !== offer.side)
  const start = parseIso(match.starts_at)
  const date = eventDateParts(match.starts_at)
  const format = match.format ? footballFormat[match.format]?.label : null
  const position = positionLabel(offer.position)

  async function accept() {
    const accepted = await run(() => acceptSlotOffer(offer.slot_id), 'Não foi possível aceitar a vaga.')
    if (accepted) onAccepted(accepted.id)
  }
  async function decline() {
    const done = await run(async () => { await declineSlotOffer(offer.slot_id); return true }, 'Não foi possível recusar a vaga.')
    if (done) onDeclined()
  }

  return <Dialog open onOpenChange={next => { if (!next) onLater() }}>
    <DialogContent ref={popup} initialFocus={popup} finalFocus={returnFocus} showCloseButton={false} data-testid="slot-offer-dialog"
      className="inset-0 h-full w-full max-w-none translate-none overflow-y-auto overflow-x-hidden rounded-none bg-[radial-gradient(120%_70%_at_50%_30%,#1b5a3d_0%,var(--color-night)_70%)] p-0 text-white shadow-none sm:max-w-none">
      <div className="relative grid min-h-full content-center justify-items-center gap-[18px] px-[22px] py-[30px] text-center">
        <span aria-hidden="true" className="pointer-events-none absolute top-[16%] left-1/2 h-[260px] w-[420px] -translate-x-1/2 bg-white opacity-[0.05] mask-[url(/images/brand/coliseum.svg)] mask-contain mask-center mask-no-repeat" />
        <DialogTitle className="relative text-[11px] font-bold tracking-[0.1em] text-mint uppercase">Vaga encontrada{format ? ` · ${format}` : ''}</DialogTitle>
        <DialogDescription className="relative m-0 font-display text-[22px] leading-tight font-extrabold text-white">
          Vaga de {position.toLocaleLowerCase('pt-BR')}
        </DialogDescription>
        <div className="relative grid w-full grid-cols-[1fr_auto_1fr] items-start gap-2.5">
          <SideBadge side={opening} size="xl" />
          <span aria-hidden="true" className="self-center font-display text-[22px] font-extrabold text-mint">×</span>
          <SideBadge side={against} size="xl" />
        </div>
        <div className="relative flex w-full items-center gap-3 rounded-[16px] bg-white/8 p-3 text-left shadow-[inset_0_0_0_1px_#ffffff1f]">
          {date && <span className="grid w-[54px] flex-none place-items-center rounded-xl bg-white/10 py-[7px] text-center" aria-hidden="true">
            <small className="text-[9px] font-bold tracking-[0.08em] text-mint uppercase">{date.weekday}</small>
            <b className="font-display text-[20px] leading-[1.1] font-extrabold">{date.day}</b>
            <small className="text-[9px] font-bold tracking-[0.08em] text-mint uppercase">{date.month}</small>
          </span>}
          <div className="min-w-0 text-[11.5px] leading-[1.55]">
            <b className="flex items-center gap-1.5 text-[13px]"><CalendarDays size={15} aria-hidden="true" className="text-mint" />
              <span className="min-w-0 wrap-anywhere">{date ? `${date.label}${start ? ` · ${formatClock(start)}` : ''}` : 'Data a definir'}</span></b>
            {match.court && <span className="mt-0.5 flex items-center gap-1.5 text-white/80"><MapPin size={14} aria-hidden="true" className="flex-none text-mint" />
              <span className="min-w-0 wrap-anywhere">{match.court.name}</span></span>}
            <span className="mt-0.5 block text-white/65">
              {sideName(opening)} abriu esta vaga. Você joga como {position.toLocaleLowerCase('pt-BR')} convidado, só nesta partida.
            </span>
          </div>
        </div>
        <div className="relative grid gap-0.5">
          <Countdown until={offer.expires_at} onElapsed={onElapsed} className="font-display text-[26px] font-extrabold text-mint" />
          <small className="text-[10.5px] text-white/65">para responder</small>
        </div>
        <div className="relative grid w-full gap-3">
          <div className="flex w-full gap-2">
            <button type="button" className={darkOutline} disabled={busy} onClick={() => void decline()}>Agora não</button>
            <button type="button" className={darkMint} disabled={busy} onClick={() => void accept()}>Quero jogar</button>
          </div>
          <Button variant="glass-link" className="justify-self-center self-center" disabled={busy} onClick={onLater}>Responder depois</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
}
