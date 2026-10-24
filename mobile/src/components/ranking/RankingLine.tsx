import { Pressable, Text, View } from 'react-native'
import type { Ref } from 'react'
import type { RankingKey, RankingRow } from '../../api/results'
import { useSessionToken } from '../../hooks/useSessionToken'
import { colors } from '../../theme'
import { StateBadge } from '../arena/StateBadge'
import { TeamCrest } from '../arena/TeamCrest'
import { Avatar } from '../media'
import { formSpoken, formatMetric, isRunRanking, markDay, metricText, metricUnit } from './metric'
import { RecentForm } from './RecentForm'

/*
 * Linha do Ranking por elo (vidro sobre a placa escura): a posição dentro do elo, o escudo do time ou a foto do atleta, o nome
 * (com o selo "Você" ou "Seu time" na linha do titular), a forma recente (na corrida, "melhor marca em dd/mm") e a métrica.
 * Não leva brasão de elo: todas as linhas de uma lista são do mesmo elo. A linha do titular fica com borda menta e
 * `selected` (a posição atual da janela, anunciada como selecionada); a linha de um atleta abre o perfil.
 */

/** Texto abaixo do nome: a forma recente (futebol e tênis) ou a data da melhor marca (corrida); nulo quando ainda não há. */
export function lineDetail(row: RankingRow, ranking: RankingKey): string | null {
  if (isRunRanking(ranking)) {
    const day = markDay(row.best_mark_on)
    return day ? `melhor marca em ${day}` : null
  }
  return row.form?.length ? formSpoken(row.form) : null
}

function Subject({ row, token }: { row: RankingRow; token: string | null }) {
  if (row.team) return <TeamCrest name={row.team.name} initials={row.team.initials} path={row.team.crest_url} size="sm" decorative token={token} />
  return <Avatar path={row.athlete?.avatar_url ?? null} name={row.athlete?.name ?? 'Atleta'} token={token} size={32} />
}

export function RankingLine({ row, ranking, onOpenUser, selected = false, variant = 'plate', decorative = false, rowRef }: {
  row: RankingRow
  ranking: RankingKey
  onOpenUser?: (userId: number) => void
  /** Linha da posição do titular na janela (o `aria-current` da web). */
  selected?: boolean
  /** `hall`: lista do Salão dos Lendários (número e métrica dourados). */
  variant?: 'plate' | 'hall'
  /** Cópia visual da borda esmaecida: sem testID, sem toque e fora da árvore de acessibilidade. */
  decorative?: boolean
  rowRef?: Ref<View>
}) {
  const token = useSessionToken()
  const name = row.team?.name ?? row.athlete?.name ?? 'Atleta'
  const athleteId = row.athlete?.id
  const open = !decorative && athleteId !== undefined && onOpenUser ? () => onOpenUser(athleteId) : undefined
  const hall = variant === 'hall'
  const gold = hall || row.tier === 'lendario'
  const style = {
    minHeight: 56, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 14, borderWidth: 1,
    backgroundColor: row.is_mine ? 'rgba(143,224,180,0.12)' : gold ? 'rgba(244,222,154,0.07)' : 'rgba(255,255,255,0.05)',
    borderColor: row.is_mine ? 'rgba(143,224,180,0.4)' : gold ? 'rgba(244,222,154,0.2)' : 'rgba(255,255,255,0.08)',
  }
  const detail = lineDetail(row, ranking)
  const spoken = `${row.is_mine ? `${row.team ? 'Seu time' : 'Você'}. ` : ''}Posição ${row.tier_position} no elo, ${name}${detail ? `, ${detail}` : ''}, ${metricText(row.metric_value, ranking)}`
  const content = <>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: hall ? 28 : 24, alignItems: 'center' }}>
      <Text style={{ color: gold ? colors.legend : 'rgba(255,255,255,0.7)', fontSize: hall ? 20 : 14, fontWeight: '800' }}>{row.tier_position}</Text>
    </View>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Subject row={row} token={token} /></View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text numberOfLines={1} style={{ flexShrink: 1, color: '#ffffff', fontSize: 12.5, fontWeight: '700' }}>{name}</Text>
        {row.is_mine ? <StateBadge tone="open" surface="dark">{row.team ? 'Seu time' : 'Você'}</StateBadge> : null}
      </View>
      {isRunRanking(ranking)
        ? detail ? <Text numberOfLines={1} style={{ marginTop: 3, color: 'rgba(255,255,255,0.55)', fontSize: 10.5 }}>{detail}</Text> : null
        : <RecentForm form={row.form} decorative={decorative} />}
    </View>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ minWidth: 44, alignItems: 'flex-end' }}>
      <Text style={{ color: hall ? colors.legend : '#ffffff', fontSize: 14, fontWeight: '800' }}>{formatMetric(row.metric_value, ranking)}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 9.5 }}>{metricUnit(ranking)}</Text>
    </View>
  </>
  if (decorative) return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={style}>{content}</View>
  return open
    ? <Pressable ref={rowRef} testID="ranking-row" accessibilityRole="button" accessibilityLabel={`Abrir perfil de ${name}. ${spoken}`} accessibilityState={{ selected }} onPress={open} style={style}>{content}</Pressable>
    : <View ref={rowRef} testID="ranking-row" accessible accessibilityLabel={spoken} accessibilityState={{ selected }} style={style}>{content}</View>
}
