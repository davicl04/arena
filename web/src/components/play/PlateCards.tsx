import { Check, Hourglass, Swords, Timer, UserPlus } from 'lucide-react'
import { sideName } from '@/data/match'
import type { Proposal, SlotOffer } from '@/api/matchmaking'
import { StateBadge } from '@/components/events/StateBadge'
import { eventDateParts, formatClock, parseIso } from '@/utils/format'
import { Countdown } from './Countdown'
import { positionLabel } from './matchView'
import { SideBadge } from './SideBadge'
import { darkMint, plateCard } from './styles'

const timerChip = 'inline-flex flex-none items-center gap-[5px] rounded-full bg-[#f6c26b22] px-[9px] py-1 text-[10.5px] font-bold text-[#f6c26b]'

/**
 * Cartão da proposta sobre a placa (`.st.dk`): os dois lados, a contagem regressiva e o caminho para a tela cheia
 * (P2). A resposta mora no diálogo; aqui só se abre. Quem já aceitou lê "Você aceitou" e quem espera.
 */
export function ProposalCard({ proposal, onOpen, onElapsed }: { proposal: Proposal; onOpen: () => void; onElapsed: () => void }) {
  const mine = proposal.sides.find(side => side.side === proposal.my_side)
  const other = proposal.sides.find(side => side.side !== proposal.my_side)
  const accepted = Boolean(mine?.accepted_at)
  return <article data-slot="proposal-card" aria-label={`Proposta contra ${sideName(other)}`} className={plateCard}>
    <header className="flex items-center gap-2">
      <Swords size={17} aria-hidden="true" className="text-mint" />
      <h2 className="min-w-0 flex-1 text-[14px] text-white">Adversário encontrado</h2>
      <span className={timerChip}><Timer size={13} aria-hidden="true" /><Countdown until={proposal.expires_at} onElapsed={onElapsed} /></span>
    </header>
    <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
      <SideBadge side={mine} size="md" />
      <span aria-hidden="true" className="self-center font-display text-[12px] font-extrabold text-white/60">VS</span>
      <SideBadge side={other} size="md" />
    </div>
    {accepted
      ? <div className="flex flex-wrap gap-1.5" role="status">
        <StateBadge surface="dark" tone="open"><Check aria-hidden="true" />Você aceitou</StateBadge>
        <StateBadge surface="dark" tone="draft"><Hourglass aria-hidden="true" />Aguardando {sideName(other)}</StateBadge>
      </div>
      : <p className="m-0 text-[11px] leading-[1.55] text-white/70">
        {proposal.can_respond
          ? 'Os dois lados precisam aceitar em até 2 h. A proposta expira se ninguém responder.'
          : proposal.sport === 'tenis' ? 'Só o atleta aceita a proposta.' : 'Só os representantes aceitam.'}
      </p>}
    <button type="button" className={darkMint} onClick={onOpen}>
      {proposal.can_respond ? 'Responder à proposta' : 'Ver proposta'}
    </button>
  </article>
}

/** Cartão da oferta de vaga ao avulso: a partida, a posição e o prazo; "Ver vaga" abre o diálogo. */
export function SlotOfferCard({ offer, onOpen, onElapsed }: { offer: SlotOffer; onOpen: () => void; onElapsed: () => void }) {
  const { match } = offer
  const opening = match.sides.find(side => side.side === offer.side)
  const against = match.sides.find(side => side.side !== offer.side)
  const date = eventDateParts(match.starts_at)
  const start = parseIso(match.starts_at)
  const position = positionLabel(offer.position).toLocaleLowerCase('pt-BR')
  return <article data-slot="slot-offer-card" aria-label={`Vaga de ${position} no ${sideName(opening)}`} className={plateCard}>
    <header className="flex items-center gap-2">
      <UserPlus size={17} aria-hidden="true" className="text-mint" />
      <h2 className="min-w-0 flex-1 text-[14px] text-white">Vaga encontrada</h2>
      <span className={timerChip}><Timer size={13} aria-hidden="true" /><Countdown until={offer.expires_at} onElapsed={onElapsed} /></span>
    </header>
    <div className="flex items-center gap-3">
      {date && <span aria-hidden="true" className="grid w-[54px] flex-none place-items-center rounded-xl bg-white/10 py-[7px] text-center">
        <small className="text-[9px] font-bold tracking-[0.08em] text-mint uppercase">{date.weekday}</small>
        <b className="font-display text-[20px] leading-[1.1] font-extrabold">{date.day}</b>
        <small className="text-[9px] font-bold tracking-[0.08em] text-mint uppercase">{date.month}</small>
      </span>}
      <div className="min-w-0 text-[11.5px] leading-[1.55]">
        <b className="block text-[13px] wrap-anywhere">{sideName(opening)} × {sideName(against)}</b>
        <span className="block text-white/80">
          {start ? `${formatClock(start)}` : 'Horário a definir'}{match.court ? ` · ${match.court.name}` : ''}
        </span>
        <span className="block text-white/65">Você joga como {position} convidado, só nesta partida</span>
      </div>
    </div>
    <button type="button" className={darkMint} onClick={onOpen}>Ver vaga</button>
  </article>
}
