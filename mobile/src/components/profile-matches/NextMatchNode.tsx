import { Pressable, Text, View } from 'react-native'
import type { MatchCard } from '../../api/matches'
import { footballFormat } from '../../data/arena'
import { colors } from '../../theme'
import { Icon } from '../Icon'
import { matchTitle } from '../play/matchView'
import { SideMark } from '../play/SideBadge'
import { RailNode, RailRow } from './TimelineRail'
import { nextMatchWhen } from './timelineView'

/** "Society · Amistoso · Arena Sudoeste": formato, origem e quadra (o que existir). */
function nextDetail(card: MatchCard): string {
  return [
    card.format ? footballFormat[card.format].label : card.sport === 'tenis' ? 'Tênis' : null,
    card.origin === 'campeonato' ? 'Campeonato' : 'Amistoso',
    card.court?.name,
  ].filter(Boolean).join(' · ')
}

/**
 * Primeiro nó do trilho no perfil próprio: a próxima partida agendada (a mesma que o Início mostra, vinda da placa do Jogar,
 * sem nova leitura) no cartão forest, com a data em menta. Leva à tela da partida. Nunca aparece no perfil visitado.
 */
export function NextMatchNode({ card, now, onOpen }: { card: MatchCard; now?: Date; onOpen: (matchId: number) => void }) {
  const when = card.starts_at ? nextMatchWhen(card.starts_at, now) : 'Data a definir'
  const title = matchTitle(card)
  const detail = nextDetail(card)
  const mine = card.sides.find(side => side.side === card.my_side) ?? card.sides[0]
  const other = card.sides.find(side => side !== mine)
  return <RailRow node={<RailNode dark><Icon name="calendar-days" size={15} color={colors.mint} /></RailNode>}>
    <Pressable testID="next-match" accessibilityRole="button" accessibilityLabel={`Próxima partida, ${when}, ${title}, ${detail}`} accessibilityHint="Abre a partida" onPress={() => onOpen(card.id)}
      style={{ minHeight: 44, borderRadius: 14, backgroundColor: colors.forest, padding: 14, gap: 8 }}>
      <Text style={{ color: colors.mint, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 }}>PRÓXIMA PARTIDA</Text>
      <Text style={{ color: colors.mint, fontSize: 13, fontWeight: '800' }}>{when}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row' }}>
          <SideMark side={mine} />
          <View style={{ marginLeft: -8 }}><SideMark side={other} /></View>
        </View>
        <Text numberOfLines={2} style={{ flex: 1, color: '#ffffff', fontSize: 14, fontWeight: '800' }}>{title}</Text>
      </View>
      <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>{detail}</Text>
    </Pressable>
  </RailRow>
}
