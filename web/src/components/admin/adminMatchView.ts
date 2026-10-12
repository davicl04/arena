import type { MatchSideOut } from '@/api/matches'
import { sideName as nameOf } from '@/data/match'

/** Nome do lado: o time ou, no tênis, o atleta. */
export const sideName = (side: MatchSideOut | undefined) => nameOf(side, 'Lado sem nome')

/** "Ferrugem FC × Tigres do Lago", na ordem dos lados A e B. */
export function matchTitle(sides: MatchSideOut[]) {
  const named = (['a', 'b'] as const).map(key => sides.find(item => item.side === key)).filter((item): item is MatchSideOut => Boolean(item))
  return named.length ? named.map(sideName).join(' × ') : 'Partida'
}

/** Rótulo pequeno em caixa alta das seções da folha. */
export const sheetEyebrow = 'mt-3 text-[9px] font-extrabold tracking-[0.08em] text-ink-muted uppercase'
