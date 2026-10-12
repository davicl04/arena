import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { MyRankingLine, RankingKey, RankingRow } from '../../api/results'
import { tiers } from '../../data/arena'
import { useSessionToken } from '../../hooks/useSessionToken'
import { colors } from '../../theme'
import { plural } from '../../utils/format'
import { PlacementMeter } from '../arena/PlacementMeter'
import { StateBadge } from '../arena/StateBadge'
import { TeamCrest } from '../arena/TeamCrest'
import { TierEmblem } from '../arena/TierEmblem'
import { Avatar } from '../media'
import { rankedTier } from '../play/tierLines'
import { formatMetric, isRunRanking, metricText, metricUnit } from './metric'

/*
 * Linhas do Ranking geral: posição, brasão do time ou foto do atleta, nome, campanha, o brasão do elo (todo classificado
 * tem elo; quem está em classificação não aparece na lista) e a métrica. A linha de quem vê fica em destaque; a placa
 * "Sua posição" mostra as linhas do titular (cada time ativo dele, ou ele mesmo), inclusive em classificação, sem elo.
 */

/** Campanha da linha: na corrida, as marcas da janela (não há vitórias nem derrotas); no tênis V e D; no futebol V, E e D. */
export function recordText(row: RankingRow, ranking: RankingKey): string {
  if (isRunRanking(ranking)) return plural(row.matches_played, 'marca', 'marcas')
  const record = ranking === 'tenis' ? `${row.wins}V ${row.losses}D` : `${row.wins}V ${row.draws}E ${row.losses}D`
  return `${plural(row.matches_played, 'partida', 'partidas')} · ${record}`
}

function Subject({ row, token }: { row: RankingRow; token: string | null }) {
  if (row.team) return <TeamCrest name={row.team.name} initials={row.team.initials} path={row.team.crest_url} size="sm" decorative token={token} />
  return <Avatar path={row.athlete?.avatar_url ?? null} name={row.athlete?.name ?? 'Atleta'} token={token} size={32} />
}

/** Texto lido pelo leitor de tela: posição, nome, campanha, elo e métrica, na ordem em que a linha é lida. */
function spoken(row: RankingRow, ranking: RankingKey, name: string): string {
  const mine = row.is_mine ? `${row.team ? 'Seu time' : 'Você'}. ` : ''
  const tier = row.tier in tiers ? `, elo ${tiers[row.tier].name}` : ''
  return `${mine}Posição ${row.rank_position}, ${name}, ${recordText(row, ranking)}${tier}, ${metricText(row.metric_value, ranking)}`
}

export function RankingRows({ items, ranking, onOpenUser }: {
  items: RankingRow[]
  ranking: RankingKey
  onOpenUser?: (userId: number) => void
}) {
  const token = useSessionToken()
  return <View accessibilityLabel="Classificação" style={{ overflow: 'hidden', borderRadius: 16, backgroundColor: '#ffffff' }}>
    {items.map((row, index) => {
      const name = row.team?.name ?? row.athlete?.name ?? 'Atleta'
      const athleteId = row.athlete?.id
      const open = athleteId !== undefined && onOpenUser ? () => onOpenUser(athleteId) : undefined
      const style = {
        minHeight: 56, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingHorizontal: 14, paddingVertical: 10,
        borderTopWidth: index > 0 ? 1 : 0, borderTopColor: colors.line,
        ...(row.is_mine ? { backgroundColor: 'rgba(143,224,180,0.2)', borderLeftWidth: 3, borderLeftColor: colors.brand } : {}),
      }
      const content = <>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 24, alignItems: 'center' }}>
          <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '800' }}>{row.rank_position}</Text>
        </View>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Subject row={row} token={token} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 12.5, fontWeight: '700' }}>{name}</Text>
          <View style={{ marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {row.is_mine ? <StateBadge tone="open">{row.team ? 'Seu time' : 'Você'}</StateBadge> : null}
            <Text numberOfLines={1} style={{ flexShrink: 1, color: colors['ink-muted'], fontSize: 10.5 }}>{recordText(row, ranking)}</Text>
          </View>
        </View>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {row.tier in tiers ? <TierEmblem tier={row.tier} size="md" decorative /> : null}
          <View style={{ minWidth: 36, alignItems: 'flex-end' }}>
            <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '800' }}>{formatMetric(row.metric_value, ranking)}</Text>
            <Text style={{ color: colors['ink-muted'], fontSize: 9.5 }}>{metricUnit(ranking)}</Text>
          </View>
        </View>
      </>
      const key = `${row.rank_position}-${row.team?.id ?? row.athlete?.id}`
      return open
        ? <Pressable key={key} testID="ranking-row" accessibilityRole="button" accessibilityLabel={`Abrir perfil de ${name}. ${spoken(row, ranking, name)}`} onPress={open} style={style}>{content}</Pressable>
        : <View key={key} testID="ranking-row" accessible accessibilityLabel={spoken(row, ranking, name)} style={style}>{content}</View>
    })}
  </View>
}

/** "Sua posição": o elo e a colocação, ou a classificação "n de 3", de cada linha do titular neste ranking. */
export function MyRankingPlate({ lines, ranking, empty }: { lines: MyRankingLine[]; ranking: RankingKey; empty?: ReactNode }) {
  if (!lines.length) return empty ? <View testID="my-ranking">{empty}</View> : null
  return <View testID="my-ranking" accessibilityLabel="Sua posição" style={{ gap: 12, borderRadius: 16, backgroundColor: colors.forest, padding: 14 }}>
    <Text accessibilityRole="header" style={{ color: colors.mint, fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>SUA POSIÇÃO</Text>
    {lines.map((line, index) => {
      const tier = rankedTier(line)
      return <View key={line.team?.id ?? index} style={{ gap: 6, ...(index > 0 ? { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)', paddingTop: 12 } : {}) }}>
        {line.team ? <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10.5 }}>{line.team.name}</Text> : null}
        {tier
          ? <View accessible accessibilityLabel={`Elo ${tiers[tier].name}. ${line.rank_position ? `${line.rank_position}º lugar` : 'Ranqueado'}${line.metric_value != null ? `, ${metricText(line.metric_value, ranking)}` : ''}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TierEmblem tier={tier} size="lg" decorative />
            <View style={{ flexShrink: 1 }}>
              <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>{tiers[tier].name}</Text>
              <Text style={{ marginTop: 2, color: 'rgba(255,255,255,0.65)', fontSize: 10.5 }}>
                {line.rank_position ? `${line.rank_position}º lugar` : 'Ranqueado'}{line.metric_value != null ? ` · ${metricText(line.metric_value, ranking)}` : ''}
              </Text>
            </View>
          </View>
          : line.state === 'sem_marca'
            ? <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>Sem marca neste ranking</Text>
            : <PlacementMeter played={line.played} required={line.required} title="Em classificação" />}
      </View>
    })}
  </View>
}
