import { Pressable, Text, View } from 'react-native'
import type { MatchDetail } from '../../api/matches'
import { headerNames, matchPhases, orderedSides, sideName, whenText } from '../../data/match'
import { colors } from '../../theme'
import { Icon } from '../Icon'
import { StateBadge } from '../arena/StateBadge'
import { TeamsPlate } from '../arena/TeamsPlate'
import { TeamMark } from './TeamMark'

/** Botão de voltar da placa escura (também usado nas telas sem a partida: carregando, erro e inexistente). */
export function BackButton({ onBack, label = 'Voltar' }: { onBack: () => void; label?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onBack}
    style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)' }}>
    <Icon name="arrow-left" size={21} color="#ffffff" />
  </Pressable>
}

/** Barra mínima (voltar e título) das telas sem a partida: carregando, erro e partida inexistente. */
export function BareTop({ onBack }: { onBack: () => void }) {
  return <TeamsPlate bottom={10}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 10 }}>
      <BackButton onBack={onBack} />
      <Text accessibilityRole="header" style={{ flex: 1, color: '#ffffff', fontSize: 15, fontWeight: '800' }}>Partida</Text>
    </View>
  </TeamsPlate>
}

/**
 * Cabeçalho da partida (P2): placa `forest` com o voltar, os brasões com o elo gravado no pareamento, "Ferrugem × Leões", o
 * estado (Combinando, Agendada…) e quando/onde. No tênis, as fotos dos atletas. Na partida de campeonato o organizador abre
 * partidas com um lado só (ou nenhum): o que falta aparece como "A definir". O elo só aparece se o pareamento o guardou; quem
 * está em classificação não ganha elo. O título tem um nome acessível só ("Ferrugem FC contra Leões do Cerrado").
 */
export function MatchHeader({ detail, onBack, token }: { detail: MatchDetail; onBack: () => void; token?: string | null }) {
  const sides = orderedSides(detail)
  const [first, second] = sides
  const phase = matchPhases[detail.phase] ?? { label: detail.phase, tone: 'draft' as const }
  const [firstName = 'A definir', secondName = 'A definir'] = headerNames(sides)
  const spoken = `${first ? sideName(first) : 'A definir'} contra ${second ? sideName(second) : 'A definir'}`
  const when = [whenText(detail.starts_at), detail.court?.name].filter(Boolean).join(' · ')
  return <TeamsPlate bottom={14}>
    <View testID="match-header" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 10 }}>
      <BackButton onBack={onBack} />
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4 }}>
        <View style={{ alignSelf: 'center', minWidth: 26 }}>{first ? <TeamMark side={first} token={token} /> : null}</View>
        <Text accessibilityRole="header" accessibilityLabel={spoken} style={{ flex: 1, minWidth: 0, textAlign: 'center', color: '#ffffff', fontSize: 13, lineHeight: 18 }}>
          <Text style={{ fontWeight: '800' }}>{firstName}</Text>
          <Text style={{ color: colors.mint, fontWeight: '800' }}>{'  ×  '}</Text>
          <Text style={{ fontWeight: '800' }}>{secondName}</Text>
        </Text>
        <View style={{ alignSelf: 'center', minWidth: 26 }}>{second ? <TeamMark side={second} token={token} /> : null}</View>
      </View>
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 10 }}>
      <StateBadge tone={phase.tone} surface="dark">{phase.label}</StateBadge>
      {when ? <Text testID="match-when" style={{ flexShrink: 1, color: 'rgba(255,255,255,0.72)', fontSize: 11.5 }}>{when}</Text> : null}
    </View>
  </TeamsPlate>
}
