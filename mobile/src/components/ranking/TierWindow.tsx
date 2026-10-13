import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import type { MyRankingOverviewLine, RankingCategory, RankingKey, RankingRow, TierCounts } from '../../api/results'
import type { TierKey } from '../../data/arena'
import { ActionButton, TextAction } from '../arena/controls'
import { FadeEdge } from './FadeEdge'
import { RankingLine } from './RankingLine'
import { inTier } from './tiers'
import { PREVIEW_PAGE_SIZE, RANKING_PAGE_SIZE, useRanking } from './useRanking'

/** Quantas linhas de cada lado do titular a janela mostra (o backend manda mais uma de cada lado para a borda esmaecida). */
const AROUND = 2
/** Quantas linhas de um elo sem o titular a placa mostra antes de expandir. */
const PREVIEW_ROWS = 5

const keyOf = (row: RankingRow) => `${row.tier_position}-${row.team?.id ?? row.athlete?.id}`
const rowsWord = (n: number, noun: { one: string; many: string }) => (n === 1 ? noun.one : noun.many)

/**
 * Lista do elo dentro da placa. No elo do titular (`line` com `window`), a janela tem o titular com 2 acima e 2 abaixo e a
 * próxima linha de cada lado aparece em borda esmaecida; em outro elo (ou sem elo), os 5 primeiros. A borda abre o **elo inteiro**
 * (`GET /rankings?tier=`, paginado por cursor, a partir do 1º) mantendo a linha do titular à vista; "Mostrar só ao seu redor"
 * volta à janela. Um erro ao expandir aparece abaixo da lista com "Tentar de novo" e a janela continua visível. Monte-o com
 * `key` do elo: trocar de elo ou de categoria recomeça recolhido.
 */
export function TierWindow({ category, ranking, tier, counts, line, window, noun, onExpired, onOpenUser, reveal }: {
  category: RankingCategory
  ranking: RankingKey
  tier: TierKey
  counts: TierCounts
  /** Linha do titular neste elo (nulo em outro elo ou sem elo). */
  line: MyRankingOverviewLine | null
  /** `window` do overview: as linhas do elo do titular de `tier_position − 3` a `+ 3`. */
  window: RankingRow[] | null
  noun: { one: string; many: string }
  onExpired: () => void
  onOpenUser?: (userId: number) => void
  /** Rola a tela até a linha do titular depois de expandir. */
  reveal?: (node: View | null) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const at = line?.tier_position ?? null
  const windowed = at !== null && Boolean(window?.length)
  const total = counts[tier]
  const list = useRanking({ ...category, tier }, onExpired, {
    enabled: (expanded || !windowed) && total > 0,
    pageSize: expanded ? RANKING_PAGE_SIZE : PREVIEW_PAGE_SIZE,
  })
  const mineRef = useRef<View>(null)
  const loaded = expanded && !list.loading && list.items.length > 0
  useEffect(() => { if (loaded && reveal) reveal(mineRef.current) }, [loaded, reveal])

  const row = (item: RankingRow, decorative = false) => {
    const current = at !== null && item.tier_position === at
    return <RankingLine key={decorative ? undefined : keyOf(item)} row={item} ranking={ranking} onOpenUser={onOpenUser} selected={current} decorative={decorative} rowRef={current ? mineRef : undefined} />
  }

  let top: ReactNode = null
  let rows: RankingRow[] = []
  let bottom: ReactNode = null
  let status: ReactNode = null
  const collapse = () => setExpanded(false)

  if (total === 0) {
    status = <Text style={{ paddingHorizontal: 6, paddingVertical: 10, color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{`Ninguém ${inTier(tier)} ainda.`}</Text>
  } else if (expanded && list.items.length) {
    rows = list.items
    if (list.hasMore) {
      const remaining = Math.max(1, total - list.items.length)
      bottom = <FadeEdge side="down" count={remaining} busy={list.busy} label={`Ver mais ${remaining} ${rowsWord(remaining, noun)}`} onPress={() => void list.loadMore()} />
    }
  } else if (windowed && window) {
    const near = window.filter(item => Math.abs(item.tier_position - at!) <= AROUND)
    rows = near.length ? near : window
    const first = rows[0].tier_position
    const last = rows[rows.length - 1].tier_position
    const size = line?.tier_size ?? total
    const above = first - 1
    const below = Math.max(0, size - last)
    const peekUp = window.find(item => item.tier_position === first - 1)
    const peekDown = window.find(item => item.tier_position === last + 1)
    if (!expanded && above > 0) top = <FadeEdge side="up" count={above} label={`Ver ${above} ${rowsWord(above, noun)} acima`} onPress={() => setExpanded(true)}>{peekUp ? row(peekUp, true) : null}</FadeEdge>
    if (!expanded && below > 0) bottom = <FadeEdge side="down" count={below} label={`Ver ${below} ${rowsWord(below, noun)} abaixo`} onPress={() => setExpanded(true)}>{peekDown ? row(peekDown, true) : null}</FadeEdge>
  } else if (!windowed && !expanded && list.items.length) {
    rows = list.items.slice(0, PREVIEW_ROWS)
    const hidden = Math.max(0, total - rows.length)
    const peek = list.items[PREVIEW_ROWS]
    if (hidden > 0) bottom = <FadeEdge side="down" count={hidden} label={`Ver ${hidden} ${rowsWord(hidden, noun)} abaixo`} onPress={() => setExpanded(true)}>{peek ? row(peek, true) : null}</FadeEdge>
  }

  // Estados da leitura da lista (primeira página, página seguinte e erros): a janela já mostrada continua visível.
  if (list.loading) {
    status = <View accessibilityLiveRegion="polite" accessibilityRole="progressbar" accessibilityLabel={expanded ? 'Carregando o elo inteiro…' : 'Carregando o elo…'} style={{ paddingVertical: 10 }}>
      <Text style={{ textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{expanded ? 'Carregando o elo inteiro…' : 'Carregando o elo…'}</Text>
    </View>
  } else if (list.error) {
    status = <View accessibilityRole="alert" style={{ alignItems: 'center', gap: 2, paddingVertical: 8 }}>
      <Text style={{ textAlign: 'center', color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>{list.error}</Text>
      <TextAction title="Tentar de novo" surface="dark" onPress={list.reload} />
    </View>
  } else if (list.moreError) {
    status = <View accessibilityRole="alert" style={{ alignItems: 'center', gap: 2, paddingVertical: 8 }}>
      <Text style={{ textAlign: 'center', color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>{list.moreError}</Text>
      <TextAction title="Tentar de novo" surface="dark" onPress={() => void list.loadMore()} />
    </View>
  }

  const canCollapse = expanded
  return <View testID="tier-window" accessibilityLabel={`Ranking ${inTier(tier)}`} accessibilityState={{ busy: list.loading || list.busy }} style={{ gap: 6, paddingHorizontal: 12, paddingTop: 10 }}>
    {top}
    {rows.map(item => row(item))}
    {bottom}
    {status}
    {canCollapse ? <ActionButton tone="line" block title={windowed ? 'Mostrar só ao seu redor' : `Mostrar só os ${PREVIEW_ROWS} primeiros`} onPress={collapse} /> : null}
    <View style={{ height: 6 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
  </View>
}
