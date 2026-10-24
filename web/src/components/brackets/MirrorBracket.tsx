import { useId, useMemo } from 'react'
import { Trophy } from 'lucide-react'
import { apiUrl } from '@/api/client'
import type { Bracket, BracketSlot, Competitor } from '@/api/brackets'
import { TeamCrest } from '@/components/arena/TeamCrest'
import { cn } from '@/lib/utils'
import { competitorInitials, nodeSentence, shortRound, slotName } from './bracketText'
import { mirrorLayout } from './mirrorLayout'
import type { PlacedNode } from './mirrorLayout'

/*
 * Árvore espelhada do eliminação simples (B3 + T2): as fases de fora para dentro dos dois lados e a final escura no centro,
 * com o troféu e o contorno dourado. É um SVG próprio, sem biblioteca: os conectores, os confrontos, os escudos com as
 * iniciais (`TeamCrest`), "Folga", "Venc. J1" e os placares são desenhados nele. Cabe em 390 px com 8 lugares e rola na
 * horizontal em telas mais estreitas ou com 16 lugares.
 *
 * Acessibilidade: o SVG é uma imagem (`role="img"` e `aria-label`); os confrontos, com nomes completos, estão na lista
 * alternativa (`sr-only`) logo abaixo e na lista visível da tela. A troca de lugares usa botões de verdade sobre os
 * escudos da primeira fase (Tab, Enter e Espaço), com `aria-pressed` no escolhido.
 */

const shield = 'M20 2 L37 8 V21 C37 31 29 38 20 42 C11 38 3 31 3 21 V8 Z'
const CREST_W = 26
const CREST_H = 29
const SLOT_H = 46
const SLOT_GAP = 12
/** Distância do topo do confronto ao primeiro escudo: a final tem o troféu e o título acima. */
const slotOffset = (final: boolean) => (final ? 64 : 20)

/** Escudo tracejado de "Folga" e "Vencedor": `?` para o vencedor que ainda não saiu. */
function GhostCrest({ x, y, question }: { x: number; y: number; question: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${CREST_W / 40} ${CREST_H / 44})`} aria-hidden="true">
      <path d={shield} className="fill-none stroke-ink-muted/55" strokeWidth={1.6} strokeDasharray="3 3" />
      {question && <text x="20" y="27" textAnchor="middle" fontSize="12" className="fill-ink-muted/70 font-display font-extrabold">?</text>}
    </g>
  )
}

/** Foto do atleta (tênis) recortada em círculo, ou as iniciais. */
function AthleteMark({ x, y, competitor }: { x: number; y: number; competitor: Competitor }) {
  const clip = `ath-${useId().replace(/[^\w-]/g, '')}`
  const photo = competitor.athlete?.avatar_url
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden="true">
      <circle cx={CREST_W / 2} cy={CREST_H / 2} r={13} className="fill-tile stroke-line-strong" strokeWidth={1.4} />
      {photo
        ? <>
          <clipPath id={clip}><circle cx={CREST_W / 2} cy={CREST_H / 2} r={13} /></clipPath>
          <image href={apiUrl(photo)} x={0} y={(CREST_H - CREST_W) / 2} width={CREST_W} height={CREST_W} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
        </>
        : <text x={CREST_W / 2} y={CREST_H / 2 + 4} textAnchor="middle" fontSize="10" className="fill-ink font-display font-extrabold">{competitorInitials(competitor)}</text>}
    </g>
  )
}

interface SlotBox { slot: BracketSlot; x: number; y: number; w: number }

/** Um lado do confronto: escudo (ou tracejado), sigla ou "Venc. J1" e o placar. */
function SlotMark({ box, score, dark, picked }: { box: SlotBox; score: number | null; dark: boolean; picked: boolean }) {
  const { slot, x, y, w } = box
  const cx = x + w / 2
  const competitor = slot.kind === 'competidor' ? slot.competitor : null
  const label = slot.kind === 'competidor' ? competitorInitials(competitor) : slot.kind === 'folga' ? 'Folga' : `Venc. J${slot.from_match ?? ''}`.trim()
  const ink = dark ? 'fill-white' : 'fill-ink'
  const muted = dark ? 'fill-white/60' : 'fill-ink-muted'
  const lost = score !== null && !slot.winner && slot.kind === 'competidor'
  return (
    <g>
      {picked && <rect x={x + 1} y={y - 3} width={w - 2} height={SLOT_H} rx={10} className="fill-mint/25 stroke-brand" strokeWidth={1.5} />}
      <g opacity={lost ? 0.62 : 1}>
        {slot.kind === 'competidor' && competitor
          ? competitor.kind === 'time' && competitor.team
            // O escudo é um <svg> aninhado: precisa de uma janela (x, y, largura e altura) para ter o tamanho do desenho.
            ? <svg x={cx - CREST_W / 2} y={y} width={CREST_W} height={CREST_H} viewBox={`0 0 ${CREST_W} ${CREST_H}`} overflow="visible" aria-hidden="true">
              <TeamCrest name={competitor.team.name} initials={competitor.team.initials} path={competitor.team.crest_url} size="sm" decorative className="h-full w-full" />
            </svg>
            : <AthleteMark x={cx - CREST_W / 2} y={y} competitor={competitor} />
          : <GhostCrest x={cx - CREST_W / 2} y={y} question={slot.kind === 'vencedor'} />}
        <text x={cx} y={y + CREST_H + 11} textAnchor="middle" fontSize={slot.kind === 'competidor' ? 9 : 8} fontWeight={800}
          className={cn('font-display', slot.kind === 'competidor' ? ink : muted)}>{label}</text>
      </g>
      {score !== null && (
        <text x={x + w - 4} y={y + CREST_H / 2 + 5} textAnchor="end" fontSize={12} fontWeight={800}
          className={cn('font-display', slot.winner ? (dark ? 'fill-mint' : 'fill-brand') : muted)}>{score}</text>
      )}
    </g>
  )
}

function NodeCard({ placed, picked }: { placed: PlacedNode; picked: number | null }) {
  const { node, x, y, w, h, side } = placed
  const final = side === 'center'
  const [a, b] = node.slots
  const score = node.match?.score ?? null
  const first = y + slotOffset(final)
  const second = first + SLOT_H + SLOT_GAP
  const tag = node.label
  return (
    <g data-node={node.label ?? `bye-${placed.round}-${placed.index}`}>
      <rect x={x} y={y} width={w} height={h} rx={16}
        className={final ? 'fill-forest' : node.bye ? 'fill-white/70 noite:fill-[#ffffff0d] stroke-ink-muted/30' : 'fill-white noite:fill-[#0f1813]'}
        strokeWidth={final ? 0 : 1} strokeDasharray={node.bye ? '3 3' : undefined}
        style={final ? undefined : { filter: 'drop-shadow(0 2px 6px rgb(0 0 0 / 0.08))' }} />
      {final && <rect x={x + 1} y={y + 1} width={w - 2} height={h - 2} rx={15} fill="none" stroke="#d9a937" strokeWidth={2} />}
      {final && (
        <>
          <g transform={`translate(${x + w / 2 - 14} ${y + 10})`} aria-hidden="true"><Trophy size={28} color="#d9a937" strokeWidth={1.8} /></g>
          <text x={x + w / 2} y={y + 52} textAnchor="middle" fontSize={11} fontWeight={800} letterSpacing="0.08em" className="fill-white font-display">FINAL</text>
        </>
      )}
      {tag && (
        <g aria-hidden="true">
          <rect x={x + w / 2 - 12} y={y - 7} width={24} height={14} rx={6} className={final ? 'fill-mint' : 'fill-forest'} />
          <text x={x + w / 2} y={y + 3.5} textAnchor="middle" fontSize={8.5} fontWeight={800} className={cn('font-display', final ? 'fill-night' : 'fill-mint')}>{tag}</text>
        </g>
      )}
      <SlotMark box={{ slot: a, x, y: first, w }} score={score?.a ?? null} dark={final} picked={picked !== null && a.place === picked} />
      <text x={x + w / 2} y={first + SLOT_H + 5} textAnchor="middle" fontSize={9} fontWeight={800} className={cn('font-display', final ? 'fill-white/60' : 'fill-ink-muted')}>×</text>
      <SlotMark box={{ slot: b, x, y: second, w }} score={score?.b ?? null} dark={final} picked={picked !== null && b.place === picked} />
    </g>
  )
}

export function MirrorBracket({ bracket, picked = null, onPick, busy = false, list = true }: {
  bracket: Bracket
  /** Lugar escolhido para a troca (a primeira escolha); só com `onPick`. */
  picked?: number | null
  /** Habilita a troca: recebe o lugar (`place`) tocado, Enter ou Espaço no escudo. */
  onPick?: (place: number) => void
  busy?: boolean
  /**
   * Inclui a lista alternativa dos confrontos para leitor de tela (`sr-only`). Quem já mostra os confrontos em lista
   * visível logo abaixo (`BracketView`) a dispensa, para não repetir a leitura.
   */
  list?: boolean
}) {
  const layout = useMemo(() => mirrorLayout(bracket.rounds), [bracket.rounds])
  const label = `Árvore do chaveamento: ${bracket.size ?? layout.nodes.length * 2} lugares${bracket.byes ? `, ${bracket.byes} ${bracket.byes === 1 ? 'folga' : 'folgas'}` : ''}. Os confrontos estão na lista logo abaixo.`
  if (!layout.nodes.length) return null
  const swappable = layout.nodes.filter(item => item.round === 0 && onPick)
  return (
    <div className="-mx-4 px-4">
      <div role="region" aria-label="Árvore do chaveamento (role para os lados se não couber)" tabIndex={0}
        className="overflow-x-auto pb-2 outline-offset-2 focus-visible:outline-3 focus-visible:outline-focus">
        <div className="relative mx-auto" style={{ width: layout.width, height: layout.height }}>
          <svg role="img" aria-label={label} width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} className="absolute top-0 left-0 overflow-visible">
            {layout.columns.map(column => {
              const sample = bracket.rounds[column.round]
              return <text key={`${column.side}-${column.round}`} x={column.x + column.w / 2} y={12} textAnchor="middle" fontSize={9} fontWeight={800}
                letterSpacing="0.08em" className="fill-ink-muted font-display uppercase">{shortRound(sample?.name ?? '')}</text>
            })}
            <g fill="none" className="stroke-brand/45" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {layout.connectors.map(path => <path key={path} d={path} />)}
            </g>
            {layout.nodes.map(placed => <NodeCard key={`${placed.round}-${placed.index}`} placed={placed} picked={picked} />)}
          </svg>
          {swappable.map(placed => placed.node.slots.map((slot, index) => {
            if (slot.place === null) return null
            const top = placed.y + slotOffset(placed.side === 'center') + index * (SLOT_H + SLOT_GAP) - 4
            const name = slotName(slot)
            const chosen = picked === slot.place
            return (
              <button key={slot.place} type="button" disabled={busy} aria-pressed={chosen}
                aria-label={`${name}, lugar ${slot.place + 1} da chave${chosen ? ', escolhido' : ''}. ${picked === null ? 'Selecione para trocar de lugar.' : chosen ? 'Selecione de novo para cancelar.' : 'Selecione para trocar com o escolhido.'}`}
                onClick={() => onPick?.(slot.place as number)}
                className="absolute cursor-pointer rounded-[10px] border-0 bg-transparent p-0 outline-offset-1 focus-visible:outline-3 focus-visible:outline-focus disabled:cursor-wait"
                style={{ left: placed.x, top, width: placed.w, height: SLOT_H }} />
            )
          }))}
        </div>
      </div>
      {list && (
        <ol className="sr-only" aria-label="Confrontos do chaveamento">
          {bracket.rounds.map(round => round.nodes.map(node => <li key={`${round.number}-${node.position}`}>{round.name}: {nodeSentence(node, bracket.sport)}</li>))}
        </ol>
      )}
    </div>
  )
}
