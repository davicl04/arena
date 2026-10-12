import { ScrollView, Text, View } from 'react-native'
import type { Bracket, Competitor, TableRow } from '../../api/brackets'
import { useSessionToken } from '../../hooks/useSessionToken'
import { colors } from '../../theme'
import { TeamCrest } from '../arena/TeamCrest'
import { Avatar } from '../media'
import { scoreText } from '../results/format'
import { competitorName, planCompetitors } from './bracketText'

/*
 * Todos contra todos (B3): a tabela cruzada com a rodada de cada confronto (e o placar, quando houver), quem folga em cada
 * rodada e a classificação (3/1/0, saldo e gols pró). Antes de confirmar, o sorteio só muda a ordem das linhas; depois, a
 * classificação anda com os resultados. Tudo sai de `Bracket.rounds` e `Bracket.table`. As duas tabelas rolam na horizontal
 * dentro do quadro e cada linha tem uma frase completa para o leitor de tela.
 */

/** Marca de um competidor: o escudo do time ou a foto do atleta (tênis), pequena e decorativa (o nome vem ao lado). */
export function CompetitorMark({ competitor, size = 'xs' }: { competitor: Competitor; size?: 'xs' | 'sm' }) {
  const token = useSessionToken()
  if (competitor.kind === 'time' && competitor.team) {
    return <TeamCrest name={competitor.team.name} initials={competitor.team.initials} path={competitor.team.crest_url} size={size} decorative token={token} />
  }
  return <View accessible={false} importantForAccessibility="no-hide-descendants">
    <Avatar path={competitor.athlete?.avatar_url ?? null} name={competitorName(competitor)} token={token} size={size === 'xs' ? 20 : 26} />
  </View>
}

/** Nome curto para a tabela: a primeira palavra do time ou do atleta. */
const shortLabel = (competitor: Competitor) => competitorName(competitor).split(/\s+/)[0]

const CELL = 46
const NAME_W = 92
const head = { color: colors['ink-muted'], fontSize: 9.5, fontWeight: '700' } as const

interface Cell { round: number; label: string | null; text: string | null }

/** Células da tabela cruzada: `"idLinha:idColuna"` → o jogo que reúne os dois, com o placar do ponto de vista da linha. */
export function crossCells(bracket: Pick<Bracket, 'rounds' | 'sport'>): Map<string, Cell> {
  const cells = new Map<string, Cell>()
  const sport = bracket.sport === 'tenis' ? 'tenis' : 'futebol'
  for (const round of bracket.rounds) {
    for (const node of round.nodes) {
      const [a, b] = node.slots
      if (!a.competitor || !b.competitor) continue
      const score = node.match?.score ?? null
      cells.set(`${a.competitor.entry_id}:${b.competitor.entry_id}`, { round: round.number, label: node.label, text: score ? scoreText(sport, score, 'a') : null })
      cells.set(`${b.competitor.entry_id}:${a.competitor.entry_id}`, { round: round.number, label: node.label, text: score ? scoreText(sport, score, 'b') : null })
    }
  }
  return cells
}

/** Tabela cruzada: a célula (A, B) é o jogo que reúne os dois, com a rodada ("R2") e o placar. */
export function CrossTable({ bracket }: { bracket: Bracket }) {
  const competitors = planCompetitors(bracket.rounds)
  if (!competitors.length) return null
  const cells = crossCells(bracket)
  return <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator accessibilityLabel="Tabela cruzada (role para os lados se não couber)"
    style={{ borderRadius: 14, backgroundColor: '#ffffff' }} contentContainerStyle={{ padding: 8 }}>
    <View testID="cross-table" accessibilityRole="list" accessibilityLabel="Tabela cruzada: a rodada de cada confronto e, depois do jogo, o placar">
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: NAME_W }} />
        {competitors.map(item => <View key={item.entry_id} accessible accessibilityLabel={competitorName(item)} style={{ width: CELL, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <CompetitorMark competitor={item} />
        </View>)}
      </View>
      {competitors.map(row => <View key={row.entry_id} style={{ flexDirection: 'row' }}>
        <View style={{ width: NAME_W, minHeight: CELL, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <CompetitorMark competitor={row} />
          <Text numberOfLines={1} style={{ flex: 1, color: colors.ink, fontSize: 10.5, fontWeight: '700' }}>{shortLabel(row)}</Text>
        </View>
        {competitors.map(column => {
          if (row.entry_id === column.entry_id) {
            return <View key={column.entry_id} accessibilityLabel="Mesmo competidor" accessible style={{ width: CELL, minHeight: CELL, borderWidth: 0.5, borderColor: colors.line, backgroundColor: colors.subtle }} />
          }
          const cell = cells.get(`${row.entry_id}:${column.entry_id}`)
          const spoken = cell ? `${competitorName(row)} contra ${competitorName(column)}: rodada ${cell.round}${cell.text ? `, placar ${cell.text}` : ''}` : `${competitorName(row)} contra ${competitorName(column)}: sem jogo`
          return <View key={column.entry_id} accessible accessibilityLabel={spoken} style={{ width: CELL, minHeight: CELL, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: colors.line }}>
            {cell ? <>
              <Text style={{ color: colors.brand, fontSize: 10, fontWeight: '800' }}>R{cell.round}</Text>
              {cell.text ? <Text style={{ color: colors.ink, fontSize: 9, fontWeight: '700' }}>{cell.text}</Text> : null}
            </> : null}
          </View>
        })}
      </View>)}
    </View>
  </ScrollView>
}

/** Quem folga em cada rodada (número ímpar de competidores). */
export function RestList({ bracket }: { bracket: Bracket }) {
  const rests = bracket.rounds.filter(round => round.rest)
  if (!rests.length) return null
  return <Text testID="rest-list" style={{ color: colors['ink-muted'], fontSize: 11, lineHeight: 17 }}>
    <Text style={{ color: colors.ink, fontWeight: '700' }}>Folga por rodada: </Text>
    {rests.map(round => `rodada ${round.number}, ${competitorName(round.rest)}`).join(' · ')}.
  </Text>
}

const columns = (tennis: boolean) => [
  { key: 'played', head: 'J', name: 'jogos' }, { key: 'wins', head: 'V', name: 'vitórias' },
  { key: 'draws', head: 'E', name: 'empates' }, { key: 'losses', head: 'D', name: 'derrotas' },
  { key: 'goals_for', head: tennis ? 'SP' : 'GP', name: tennis ? 'sets pró' : 'gols pró' },
  { key: 'goals_against', head: tennis ? 'SC' : 'GC', name: tennis ? 'sets contra' : 'gols contra' },
  { key: 'goal_difference', head: tennis ? 'SS' : 'SG', name: tennis ? 'saldo de sets' : 'saldo de gols' },
] as const

/** Frase da linha da classificação para o leitor de tela. */
export function standingSentence(row: TableRow, tennis: boolean): string {
  const parts = columns(tennis).map(column => `${row[column.key]} ${column.name}`)
  return `${row.position}º, ${competitorName(row.competitor)}: ${row.points} ${row.points === 1 ? 'ponto' : 'pontos'}, ${parts.join(', ')}`
}

/** Classificação: pontos (3/1/0), saldo e gols pró desempatam. No tênis, os gols são os sets. */
export function StandingsTable({ rows, sport }: { rows: TableRow[]; sport: Bracket['sport'] }) {
  const tennis = sport === 'tenis'
  const unit = tennis ? 'sets' : 'gols'
  const cols = columns(tennis)
  return <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator accessibilityLabel="Classificação (role para os lados se não couber)"
    style={{ borderRadius: 14, backgroundColor: '#ffffff' }}>
    <View testID="standings" accessibilityLabel={`Classificação: vitória vale 3 pontos, empate 1 e derrota 0; saldo, ${unit} pró e vitórias desempatam`} style={{ minWidth: 340, paddingHorizontal: 10, paddingBottom: 4 }}>
      <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ minHeight: 34, flexDirection: 'row', alignItems: 'center' }}>
        <Text style={[head, { width: 22 }]}>#</Text>
        <Text style={[head, { flex: 1, minWidth: 100 }]}>{tennis ? 'Atleta' : 'Time'}</Text>
        {cols.map(column => <Text key={column.key} style={[head, { width: 28, textAlign: 'center' }]}>{column.head}</Text>)}
        <Text style={[head, { width: 34, textAlign: 'center' }]}>Pts</Text>
      </View>
      {rows.map(row => <View key={row.competitor.entry_id} accessible accessibilityLabel={standingSentence(row, tennis)}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.line }}>
        <Text style={{ width: 22, color: colors['ink-muted'], fontSize: 11, fontWeight: '800' }}>{row.position}</Text>
        <View style={{ flex: 1, minWidth: 100, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <CompetitorMark competitor={row.competitor} />
          <Text numberOfLines={1} style={{ flex: 1, color: colors.ink, fontSize: 11, fontWeight: '700' }}>{competitorName(row.competitor)}</Text>
        </View>
        {cols.map(column => <Text key={column.key} style={{ width: 28, textAlign: 'center', color: column.key === 'goal_difference' && row.goal_difference > 0 ? colors.brand : colors.ink, fontSize: 11 }}>
          {column.key === 'goal_difference' && row.goal_difference > 0 ? `+${row.goal_difference}` : row[column.key]}
        </Text>)}
        <Text style={{ width: 34, textAlign: 'center', color: colors.brand, fontSize: 12, fontWeight: '800' }}>{row.points}</Text>
      </View>)}
    </View>
  </ScrollView>
}
