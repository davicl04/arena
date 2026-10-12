import { useMemo } from 'react'
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native'
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg'
import type { Bracket, BracketSlot, Competitor } from '../../api/brackets'
import { useSessionToken } from '../../hooks/useSessionToken'
import { colors } from '../../theme'
import { TeamCrest } from '../arena/TeamCrest'
import { Icon } from '../Icon'
import { Avatar } from '../media'
import { competitorInitials, shortRound, slotName } from './bracketText'
import { CREST_H, CREST_W, SLOT_H, chooseMetrics, mirrorLayout, shieldPath, slotBoxes } from './mirrorLayout'
import type { PlacedNode, SlotBox } from './mirrorLayout'

/*
 * Árvore espelhada do eliminação simples (B3 + T2), em `react-native-svg`: as fases de fora para dentro dos dois lados e a
 * final escura no centro, com o troféu e o contorno dourado. O SVG desenha os cartões, os conectores, as siglas, "Folga",
 * "Venc. J1" e os placares; os escudos (imagens com o Bearer da sessão) são camadas nativas sobre ele. Com 8 lugares cabe em
 * 320 pt (medida compacta); com 16 a árvore rola na horizontal dentro do quadro.
 *
 * Acessibilidade: o desenho é uma imagem com o resumo; os confrontos, com nomes completos, estão na lista por rodada logo
 * abaixo (`BracketView`), que o leitor de tela lê. A troca de lugares usa botões de 44 pt sobre os lugares da primeira fase,
 * com o escolhido marcado.
 */

const GOLD = '#d9a937'
const MARGIN = 8

function Ghost({ x, y, question }: { x: number; y: number; question: boolean }) {
  return <>
    <Path d={shieldPath(x, y)} fill="none" stroke={colors['ink-muted']} strokeOpacity={0.55} strokeWidth={1.4} strokeDasharray="3 3" />
    {question ? <SvgText x={x + CREST_W / 2} y={y + 18} textAnchor="middle" fontSize={12} fontWeight="800" fill={colors['ink-muted']} fillOpacity={0.7}>?</SvgText> : null}
  </>
}

/** Camada nativa do escudo (time) ou da foto (atleta) sobre o desenho; decorativa, o nome está na lista de confrontos. */
function CompetitorLayer({ competitor, x, y, token }: { competitor: Competitor; x: number; y: number; token: string | null }) {
  return <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: x, top: y }}>
    {competitor.kind === 'time' && competitor.team
      ? <TeamCrest name={competitor.team.name} initials={competitor.team.initials} path={competitor.team.crest_url} size="sm" decorative token={token} />
      : <View style={{ marginTop: (CREST_H - CREST_W) / 2 }}><Avatar path={competitor.athlete?.avatar_url ?? null} name={competitor.athlete?.name ?? 'Atleta'} token={token} size={CREST_W} /></View>}
  </View>
}

/** Um lado do confronto no SVG: escudo tracejado (folga, vencedor) ou a sigla, e o placar. */
function SlotShapes({ box, score, dark, picked }: { box: SlotBox; score: number | null; dark: boolean; picked: boolean }) {
  const { slot, x, y, w } = box
  const cx = x + w / 2
  const competitor = slot.kind === 'competidor' ? slot.competitor : null
  const label = competitor ? competitorInitials(competitor) : slot.kind === 'folga' ? 'Folga' : `Venc. J${slot.from_match ?? ''}`.trim()
  const ink = dark ? '#ffffff' : colors.ink
  const muted = dark ? 'rgba(255,255,255,0.6)' : colors['ink-muted']
  const lost = score !== null && !slot.winner && slot.kind === 'competidor'
  const scoreText = score === null ? '' : String(score)
  return <>
    {picked ? <Rect x={x + 1} y={y - 3} width={w - 2} height={SLOT_H} rx={10} fill={colors.mint} fillOpacity={0.25} stroke={colors.brand} strokeWidth={1.5} /> : null}
    {competitor ? null : <Ghost x={cx - CREST_W / 2} y={y} question={slot.kind === 'vencedor'} />}
    <SvgText x={cx} y={y + CREST_H + 11} textAnchor="middle" fontSize={competitor ? 9 : 8} fontWeight="800" fill={competitor ? ink : muted} fillOpacity={lost ? 0.62 : 1}>{label}</SvgText>
    {score !== null ? <SvgText x={x + w - 3} y={y + CREST_H / 2 + 5} textAnchor="end" fontSize={scoreText.length > 1 ? 10 : 12} fontWeight="800"
      fill={slot.winner ? (dark ? colors.mint : colors.brand) : muted}>{scoreText}</SvgText> : null}
  </>
}

function NodeShapes({ placed, picked }: { placed: PlacedNode; picked: number | null }) {
  const { node, x, y, w, h, side } = placed
  const final = side === 'center'
  const [a, b] = slotBoxes(placed)
  const score = node.match?.score ?? null
  return <>
    {final
      ? <>
        <Rect x={x} y={y} width={w} height={h} rx={16} fill={colors.forest} />
        <Rect x={x + 1} y={y + 1} width={w - 2} height={h - 2} rx={15} fill="none" stroke={GOLD} strokeWidth={2} />
        <SvgText x={x + w / 2} y={y + 52} textAnchor="middle" fontSize={11} fontWeight="800" letterSpacing={0.9} fill="#ffffff">FINAL</SvgText>
      </>
      : node.bye
        ? <Rect x={x} y={y} width={w} height={h} rx={16} fill="#ffffff" fillOpacity={0.7} stroke={colors['ink-muted']} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="3 3" />
        : <Rect x={x} y={y} width={w} height={h} rx={16} fill="#ffffff" stroke={colors.line} strokeWidth={1} />}
    {node.label ? <>
      <Rect x={x + w / 2 - 12} y={y - 7} width={24} height={14} rx={6} fill={final ? colors.mint : colors.forest} />
      <SvgText x={x + w / 2} y={y + 3.5} textAnchor="middle" fontSize={8.5} fontWeight="800" fill={final ? colors.night : colors.mint}>{node.label}</SvgText>
    </> : null}
    <SlotShapes box={a} score={score?.a ?? null} dark={final} picked={picked !== null && a.slot.place === picked} />
    <SvgText x={x + w / 2} y={a.y + SLOT_H + 5} textAnchor="middle" fontSize={9} fontWeight="800" fill={final ? 'rgba(255,255,255,0.6)' : colors['ink-muted']}>×</SvgText>
    <SlotShapes box={b} score={score?.b ?? null} dark={final} picked={picked !== null && b.slot.place === picked} />
  </>
}

/** Frase do botão de troca: quem está no lugar e o que o toque faz. */
function pickLabel(slot: BracketSlot, picked: number | null): string {
  const place = (slot.place ?? 0) + 1
  const chosen = picked === slot.place
  const action = picked === null ? 'Toque para trocar de lugar.' : chosen ? 'Toque de novo para cancelar.' : 'Toque para trocar com o escolhido.'
  return `${slotName(slot)}, lugar ${place} da chave${chosen ? ', escolhido' : ''}. ${action}`
}

export interface MirrorBracketProps {
  bracket: Bracket
  /** Lugar escolhido para a troca (a primeira escolha); só com `onPick`. */
  picked?: number | null
  /** Habilita a troca: recebe o lugar (`place`) tocado na primeira fase. */
  onPick?: (place: number) => void
  busy?: boolean
  /** Largura do quadro (a da janela, por padrão). */
  width?: number
}

export function MirrorBracket({ bracket, picked = null, onPick, busy = false, width }: MirrorBracketProps) {
  const window = useWindowDimensions().width
  const token = useSessionToken()
  const available = (width ?? window) - 2 * MARGIN
  const total = bracket.rounds.length
  const metrics = chooseMetrics(total, available)
  const layout = useMemo(() => mirrorLayout(bracket.rounds, metrics), [bracket.rounds, metrics])
  if (!layout.nodes.length) return null
  const label = `Árvore do chaveamento: ${bracket.size ?? layout.nodes.length * 2} lugares${bracket.byes ? `, ${bracket.byes} ${bracket.byes === 1 ? 'folga' : 'folgas'}` : ''}. Os confrontos estão na lista por rodada logo abaixo.`
  const swappable = onPick ? layout.nodes.filter(item => item.round === 0) : []
  const rolls = layout.width > available
  return <ScrollView horizontal testID="mirror-scroll" showsHorizontalScrollIndicator={rolls} nestedScrollEnabled
    accessibilityLabel={rolls ? 'Árvore do chaveamento (role para os lados)' : undefined}
    contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: MARGIN, paddingBottom: 4 }}>
    <View testID="mirror-canvas" style={{ width: layout.width, height: layout.height }}>
      <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ position: 'absolute', left: 0, top: 0, width: layout.width, height: layout.height }}>
        <Svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`}>
          {layout.columns.map(column => <SvgText key={`${column.side}-${column.round}`} x={column.x + column.w / 2} y={12} textAnchor="middle" fontSize={9} fontWeight="800"
            letterSpacing={0.7} fill={colors['ink-muted']}>{shortRound(bracket.rounds[column.round]?.name ?? '').toUpperCase()}</SvgText>)}
          {layout.connectors.map(path => <Path key={path} d={path} fill="none" stroke={colors.brand} strokeOpacity={0.45} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />)}
          {layout.nodes.map(placed => <NodeShapes key={`${placed.round}-${placed.index}`} placed={placed} picked={picked} />)}
        </Svg>
        {layout.nodes.flatMap(placed => slotBoxes(placed)).map(box => box.slot.kind === 'competidor' && box.slot.competitor
          ? <CompetitorLayer key={`${box.x}-${box.y}`} competitor={box.slot.competitor} x={box.x + box.w / 2 - CREST_W / 2} y={box.y} token={token} />
          : null)}
        {layout.nodes.filter(placed => placed.side === 'center').map(placed => <View key={`trophy-${placed.round}`} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', left: placed.x + placed.w / 2 - 14, top: placed.y + 10 }}><Icon name="trophy" size={28} color={GOLD} strokeWidth={1.8} /></View>)}
      </View>
      {swappable.map(placed => slotBoxes(placed).map(box => {
        const slot = box.slot
        if (slot.place === null) return null
        const chosen = picked === slot.place
        return <Pressable key={slot.place} accessibilityRole="button" accessibilityLabel={pickLabel(slot, picked)} accessibilityState={{ selected: chosen, disabled: busy, busy }}
          disabled={busy} onPress={() => onPick?.(slot.place as number)}
          style={{ position: 'absolute', left: box.x, top: box.y - 4, width: box.w, height: SLOT_H }} />
      }))}
    </View>
  </ScrollView>
}
