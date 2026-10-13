import type { RankingRow } from '@/api/results'

/*
 * A lista dentro da placa contínua é uma sequência de linhas e de bordas esmaecidas. Duas montagens:
 * - recolhida: a janela (a posição do titular ±2, ou os 5 primeiros) com a borda esmaecida de cada lado que tem linhas
 *   escondidas; a próxima linha escondida vem do que a API já trouxe (a ponta da janela do overview, ou a 6ª linha de
 *   `tier=…&limit=6`);
 * - expandida: as páginas lidas do elo, a partir do 1º, juntas com a janela do titular (ele continua na tela mesmo que o
 *   elo seja grande); onde falta um trecho entre as duas, uma borda chama a próxima página.
 */

/** Uma borda esmaecida: `expand` abre o elo inteiro; `more` lê a próxima página do elo expandido. */
export interface EdgeEntry {
  type: 'edge'
  side: 'up' | 'down'
  /** Quantas linhas estão escondidas deste lado. */
  count: number
  /** A próxima linha escondida, quando a API já a trouxe. */
  row?: RankingRow
  action: 'expand' | 'more'
}
export interface RowEntry { type: 'row'; row: RankingRow }
export type WindowEntry = RowEntry | EdgeEntry

const byPosition = (rows: readonly RankingRow[]) => [...rows].sort((a, b) => a.tier_position - b.tier_position)

/** Linhas de `first` a `last` (posições no elo) com as bordas dos dois lados; `total` é o tamanho do elo. */
export function collapsedEntries(known: readonly RankingRow[], first: number, last: number, total: number): WindowEntry[] {
  const at = (position: number) => known.find(row => row.tier_position === position)
  const entries: WindowEntry[] = []
  if (first > 1) entries.push({ type: 'edge', side: 'up', count: first - 1, row: at(first - 1), action: 'expand' })
  for (const row of byPosition(known)) {
    if (row.tier_position >= first && row.tier_position <= last) entries.push({ type: 'row', row })
  }
  if (last < total) entries.push({ type: 'edge', side: 'down', count: total - last, row: at(last + 1), action: 'expand' })
  return entries
}

/**
 * O elo expandido: `loaded` são as páginas lidas (do 1º em diante) e `extra` a janela do titular. Onde há um buraco entre
 * duas linhas, uma borda `more` (só com `hasMore`); depois da última linha, outra borda se ainda faltam linhas e não há
 * buraco antes (senão a ordem das páginas não chegaria nelas).
 */
export function expandedEntries(loaded: readonly RankingRow[], extra: readonly RankingRow[], total: number, hasMore: boolean): WindowEntry[] {
  const merged = new Map<number, RankingRow>()
  for (const row of [...extra, ...loaded]) merged.set(row.tier_position, row)
  const entries: WindowEntry[] = []
  let previous = 0
  let gap = false
  for (const row of byPosition([...merged.values()])) {
    const missing = row.tier_position - previous - 1
    if (previous > 0 && missing > 0) {
      gap = true
      if (hasMore) entries.push({ type: 'edge', side: 'down', count: missing, action: 'more' })
    }
    entries.push({ type: 'row', row })
    previous = row.tier_position
  }
  if (!gap && hasMore && previous < total) entries.push({ type: 'edge', side: 'down', count: total - previous, action: 'more' })
  return entries
}
