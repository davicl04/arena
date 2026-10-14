import { Text, View } from 'react-native'
import type { Bracket, BracketNode, BracketRound } from '../../api/brackets'
import { whenText } from '../../data/match'
import { useThemeColors } from '../../hooks/useTheme'
import { StateBadge } from '../arena/StateBadge'
import { Icon } from '../Icon'
import { bracketSummary, competitorName, nodeScore, nodeSentence, placementLabel, slotName } from './bracketText'
import { MirrorBracket } from './MirrorBracket'
import { CompetitorMark, CrossTable, RestList, StandingsTable } from './RoundRobin'

/*
 * A árvore (eliminação simples) ou a tabela (todos contra todos) em modo leitura, com a lista dos confrontos por fase e,
 * com o evento encerrado, o campeão e as colocações (no tênis, com o bônus do ranking, RN16). O organizador usa a mesma
 * visão na tela do chaveamento, ligando a troca de lugares da árvore; o atleta inscrito a vê na aba Tabela do evento.
 * A lista por rodada é a alternativa acessível ao desenho: cada confronto é lido como uma frase.
 */

const eyebrow = (color: string) => ({ color, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }) as const

/** Detalhe curto de um confronto na lista: o placar, a data e a quadra, ou "Sem data". */
export function nodeMeta(node: BracketNode, sport: Bracket['sport']): { text: string; decided: boolean } | null {
  const match = node.match
  if (!match) return null
  const score = nodeScore(sport, match.score)
  if (score) return { text: score, decided: true }
  if (match.starts_at) return { text: `${whenText(match.starts_at)}${match.court_name ? ` · ${match.court_name}` : ''}`, decided: false }
  return { text: 'Sem data', decided: false }
}

function RoundBlock({ round, bracket }: { round: BracketRound; bracket: Bracket }) {
  const colors = useThemeColors()
  return <View accessibilityLabel={round.name} style={{ gap: 6 }}>
    <Text accessibilityRole="header" style={eyebrow(colors['ink-muted'])}>{round.name}</Text>
    <View style={{ borderRadius: 16, backgroundColor: colors.surface, paddingHorizontal: 12 }}>
      {round.nodes.map((node, index) => {
        const [a, b] = node.slots
        const meta = nodeMeta(node, bracket.sport)
        return <View key={node.position} testID={node.label ? `node-${node.label}` : undefined} accessible accessibilityLabel={`${round.name}: ${nodeSentence(node, bracket.sport)}`}
          style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
          <View style={{ minWidth: 32, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: colors.forest, paddingHorizontal: 6 }}>
            <Text style={{ color: colors.mint, fontSize: 9, fontWeight: '800' }}>{node.label ?? '—'}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '700', lineHeight: 16 }}>
              {node.bye ? `${slotName(a.kind === 'folga' ? b : a)} avança direto` : `${slotName(a)} × ${slotName(b)}`}
            </Text>
            {node.bye
              ? <Text style={{ color: colors['ink-muted'], fontSize: 10.5 }}>Folga: não há partida</Text>
              : meta ? <Text style={{ color: meta.decided ? colors.brand : colors['ink-muted'], fontSize: 10.5, fontWeight: meta.decided ? '700' : '400' }}>{meta.text}</Text> : null}
          </View>
          {node.match?.awaiting_decision ? <StateBadge tone="danger">Decisão pendente</StateBadge> : null}
        </View>
      })}
    </View>
  </View>
}

/** Campeão e colocações finais (só com o evento encerrado). */
export function FinalBoard({ bracket }: { bracket: Bracket }) {
  const colors = useThemeColors()
  const { champion, placements } = bracket
  if (!champion && !placements?.length) return null
  const bonus = bracket.sport === 'tenis'
  return <View accessibilityLabel="Classificação final" style={{ gap: 8 }}>
    {champion ? <View testID="champion" accessible accessibilityLabel={`Campeão: ${competitorName(champion)}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, backgroundColor: colors.forest, borderWidth: 2, borderColor: '#d9a937', padding: 14 }}>
      <Icon name="trophy" size={30} color="#d9a937" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: colors.mint, fontSize: 9.5, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>Campeão</Text>
        <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '800', lineHeight: 21 }}>{competitorName(champion)}</Text>
      </View>
      <CompetitorMark competitor={champion} size="sm" />
    </View> : null}
    {placements && placements.length > 0 ? <>
      <Text accessibilityRole="header" style={[eyebrow(colors['ink-muted']), { marginTop: 4 }]}>Colocações</Text>
      <View style={{ borderRadius: 16, backgroundColor: colors.surface, paddingHorizontal: 12 }}>
        {placements.map((item, index) => <View key={item.competitor.entry_id} accessible
          accessibilityLabel={`${item.placement}º lugar, ${competitorName(item.competitor)}, ${placementLabel(item.placement, bracket.kind)}${bonus && item.bonus_points > 0 ? `, mais ${item.bonus_points} pontos no ranking` : ''}`}
          style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
          <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.subtle }}>
            <Text style={{ color: colors.ink, fontSize: 10.5, fontWeight: '800' }}>{item.placement}º</Text>
          </View>
          <CompetitorMark competitor={item.competitor} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 12, fontWeight: '700' }}>{competitorName(item.competitor)}</Text>
            <Text style={{ color: colors['ink-muted'], fontSize: 10.5 }}>{placementLabel(item.placement, bracket.kind)}</Text>
          </View>
          {bonus && item.bonus_points > 0 ? <StateBadge tone="open">{`+${item.bonus_points} no ranking`}</StateBadge> : null}
        </View>)}
      </View>
      {bonus && placements.every(item => item.bonus_points === 0)
        ? <Text style={{ color: colors['ink-muted'], fontSize: 10.5, lineHeight: 16 }}>O bônus do ranking do tênis vale com 4 ou mais inscrições confirmadas.</Text> : null}
    </> : null}
  </View>
}

export interface BracketViewProps {
  bracket: Bracket
  /** Lugar escolhido na troca e a função que recebe o toque (só o organizador, antes de confirmar, na eliminação). */
  picked?: number | null
  onPick?: (place: number) => void
  busy?: boolean
  /** Margem lateral da tela que contém a visão, para a árvore ocupar a largura inteira (16 pt por padrão). */
  bleed?: number
}

/**
 * Árvore ou tabela do campeonato. `onPick` e `picked` ligam a troca de lugares da árvore; no todos contra todos o sorteio só
 * muda a ordem, sem troca manual. A árvore ocupa a largura da tela (margem negativa igual à do conteúdo, `bleed`).
 */
export function BracketView({ bracket, picked, onPick, busy, bleed = 16 }: BracketViewProps) {
  const colors = useThemeColors()
  const elimination = bracket.kind === 'eliminacao_simples'
  return <View style={{ gap: 14 }}>
    <Text style={{ color: colors['ink-muted'], fontSize: 11, lineHeight: 17 }}>{bracketSummary(bracket)}</Text>
    {elimination
      ? <View style={{ marginHorizontal: -bleed }}><MirrorBracket bracket={bracket} picked={picked} onPick={onPick} busy={busy} /></View>
      : <>
        <CrossTable bracket={bracket} />
        <RestList bracket={bracket} />
        {bracket.table && bracket.table.length > 0 ? <>
          <Text accessibilityRole="header" style={eyebrow(colors['ink-muted'])}>Classificação</Text>
          <StandingsTable rows={bracket.table} sport={bracket.sport} />
        </> : null}
      </>}
    <FinalBoard bracket={bracket} />
    {bracket.rounds.map(round => <RoundBlock key={round.number} round={round} bracket={bracket} />)}
  </View>
}
