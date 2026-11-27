import { Fragment } from 'react'
import { Pressable, View } from 'react-native'
import { Text } from '../Text'
import { sports } from '../../api/client'
import type { MatchCard } from '../../api/matches'
import { countdownParts, countdownText, emptyPlacarText, matchupLabel } from '../../data/home'
import { orderedSides } from '../../data/match'
import { colors } from '../../theme'
import { formatDeadline, parseIso } from '../../utils/format'
import { Icon } from '../Icon'
import { SportIcon } from '../arena/SportIcon'
import { DarkEyebrow, TeamsPlate } from '../arena/TeamsPlate'
import { SideMark } from '../play/SideBadge'

const RADIUS = 22
const muted = 'rgba(255,255,255,0.66)'
// Números e unidades da contagem em Sora (`display`), como `font-display` na web.
const big = { color: '#ffffff', fontSize: 46, lineHeight: 50, fontWeight: '700' as const, fontVariant: ['tabular-nums' as const] }
const unit = { color: '#ffffff', fontSize: 18, fontWeight: '700' as const }

/** Etiqueta da modalidade sobre o bloco escuro: ícone e nome ("Futebol", "Tênis"). */
function SportTag({ sport }: { sport: MatchCard['sport'] }) {
  const label = sports.find(item => item.value === sport)?.label ?? sport
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: 'rgba(255,255,255,0.08)' }}>
    <SportIcon sport={sport} shape="aro" size={14} color="#ffffff" />
    <Text style={{ color: '#ffffff', fontSize: 10.5, fontWeight: '600' }}>{label}</Text>
  </View>
}

/**
 * Placar do Início: a próxima partida agendada num bloco escuro por design (`forest` com o Coliseu, igual nos dois temas).
 * Com partida, mostra a modalidade, a Contagem em números grandes (recalculada a partir de `now`, o relógio de 60 s da tela),
 * a data e a hora locais e a linha do confronto, e o bloco inteiro é um único botão que abre a partida. Sem partida,
 * mostra "—", "Nenhuma partida agendada" e o convite conforme haja perfis esportivos; nesse estado não é tocável.
 */
export function Placar({ match, now, hasProfiles, onOpen }: {
  /** A próxima partida agendada (`nextScheduledMatch`), ou `null`. */
  match: MatchCard | null
  now: number
  /** Há ao menos um perfil esportivo (sem perfis, o convite é para prepará-los). */
  hasProfiles: boolean
  onOpen: (matchId: number) => void
}) {
  if (!match) {
    const text = emptyPlacarText(hasProfiles)
    return <View testID="placar-empty" accessible accessibilityLabel={`Próxima partida: nenhuma partida agendada. ${text}`} style={{ borderRadius: RADIUS, overflow: 'hidden' }}>
      <TeamsPlate round={RADIUS} mark="corner" testID="placar-plate">
        <View style={{ padding: 18 }}>
          <DarkEyebrow>Próxima partida</DarkEyebrow>
          <Text display style={{ ...big, marginTop: 10, color: 'rgba(255,255,255,0.3)' }}>—</Text>
          <Text display style={{ marginTop: 8, marginBottom: 4, color: '#ffffff', fontSize: 17, lineHeight: 22, fontWeight: '700' }}>Nenhuma partida agendada</Text>
          <Text style={{ color: muted, fontSize: 12, lineHeight: 18 }}>{text}</Text>
        </View>
      </TeamsPlate>
    </View>
  }
  const start = parseIso(match.starts_at)
  const left = (start?.getTime() ?? now) - now
  const parts = countdownParts(left)
  const when = formatDeadline(match.starts_at, new Date(now))
  const matchup = matchupLabel(match)
  const place = match.court?.name ?? ''
  const [first, second] = orderedSides(match)
  const label = [`Próxima partida em ${countdownText(left)}`, matchup, when, place].filter(Boolean).join(', ')
  return <Pressable testID="placar" accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Abre a partida" onPress={() => onOpen(match.id)}
    style={{ borderRadius: RADIUS, overflow: 'hidden' }}>
    <TeamsPlate round={RADIUS} mark="corner" testID="placar-plate">
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ padding: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <DarkEyebrow>Próxima partida</DarkEyebrow>
          <SportTag sport={match.sport} />
        </View>
        <Text testID="placar-countdown" display style={{ marginTop: 10, color: '#ffffff' }}>
          {parts.map((part, index) => <Fragment key={part.unit}>
            {index > 0 ? ' ' : ''}<Text style={big}>{part.value}</Text> <Text style={unit}>{part.unit}</Text>
          </Fragment>)}
        </Text>
        <Text style={{ marginTop: 4, color: muted, fontSize: 12 }}>{when}</Text>
        <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors['forest-line'], flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flexDirection: 'row' }}>
            <SideMark side={first} />
            <View style={{ marginLeft: -8 }}><SideMark side={second} /></View>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>{matchup}</Text>
            {place ? <Text numberOfLines={1} style={{ marginTop: 2, color: muted, fontSize: 11 }}>{place}</Text> : null}
          </View>
          <Icon name="chevron" size={18} color={muted} />
        </View>
      </View>
    </TeamsPlate>
  </Pressable>
}
