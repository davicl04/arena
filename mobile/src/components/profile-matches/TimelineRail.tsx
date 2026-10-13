import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { colors } from '../../theme'
import { SportIcon } from '../arena/SportIcon'
import { DuelCard } from './DuelCard'
import { RunDuelCard } from './RunDuelCard'
import { itemSport, railEntries } from './timelineView'
import type { TimelineItem } from '../../api/profile'

const RAIL_WIDTH = 40
const NODE = 30

/** Linha de uma entrada do trilho: coluna do fio com o nó à esquerda e o conteúdo à direita. */
export function RailRow({ node, last = false, children }: { node: ReactNode; last?: boolean; children: ReactNode }) {
  return <View style={{ flexDirection: 'row' }}>
    <View style={{ width: RAIL_WIDTH, alignItems: 'center' }}>
      <View style={{ position: 'absolute', top: 0, bottom: last ? undefined : 0, height: last ? NODE / 2 + 2 : undefined, width: 2, backgroundColor: colors.line }} />
      {node}
    </View>
    <View style={{ flex: 1, minWidth: 0, paddingBottom: 12, paddingTop: 2 }}>{children}</View>
  </View>
}

/** Nó com o ícone da modalidade (decorativo: o texto do cartão diz tudo). */
export function RailNode({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: NODE, height: NODE, borderRadius: NODE / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: dark ? colors.forest : colors.line, backgroundColor: dark ? colors.forest : '#ffffff' }}>
    {children}
  </View>
}

/**
 * O trilho vertical único: separadores de mês e um nó por registro, do mais recente para o mais antigo. `leading` é o
 * primeiro nó (a próxima partida, só no perfil próprio) e `continues` mantém o fio descendo quando há mais páginas.
 */
export function TimelineRail({ items, own, leading, continues, onOpenMatch }: {
  items: readonly TimelineItem[]; own: boolean; leading?: ReactNode; continues: boolean; onOpenMatch?: (matchId: number) => void
}) {
  const entries = railEntries(items)
  return <View testID="timeline-rail" style={{ paddingHorizontal: 20 }}>
    {leading}
    {entries.map((entry, index) => {
      const last = !continues && index === entries.length - 1
      if (entry.type === 'month') {
        return <RailRow key={entry.key} node={<View style={{ width: NODE, height: NODE, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors['line-strong'] }} /></View>}>
          <Text accessibilityRole="header" style={{ marginTop: 5, color: colors.brand, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>{entry.label}</Text>
        </RailRow>
      }
      const { item } = entry
      return <RailRow key={entry.key} last={last} node={<RailNode><SportIcon sport={itemSport(item)} size={18} /></RailNode>}>
        {item.kind === 'corrida'
          ? <RunDuelCard run={item} />
          : <DuelCard match={item} own={own} onOpen={own ? onOpenMatch : undefined} />}
      </RailRow>
    })}
  </View>
}

