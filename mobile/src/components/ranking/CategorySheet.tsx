import { Pressable, Text, View } from 'react-native'
import type { ReactNode } from 'react'
import { sports } from '../../api/client'
import type { Position, Sport } from '../../api/client'
import { footballFormats, positionOptions, runDistances } from '../../data/arena'
import type { FootballFormat, RunDistance } from '../../data/arena'
import { colors } from '../../theme'
import { useThemeColors } from '../../hooks/useTheme'
import { ChoicePills } from '../arena/controls'
import type { ChoiceOption } from '../arena/controls'
import { SportIcon } from '../arena/SportIcon'
import { SectionTabs } from '../events/SectionTabs'
import Sheet from '../Sheet'
import { Button } from '../ui'
import type { CategoryChoice, RankingKind } from './category'

const kinds: { value: RankingKind; label: string }[] = [
  { value: 'time', label: 'Times' },
  { value: 'individual', label: 'Individual' },
]
const formatChoices: ChoiceOption<FootballFormat>[] = footballFormats.map(item => ({ value: item.value, label: `${item.label} ${item.size}`, accessibilityLabel: `${item.label}, ${item.size}` }))
const positionChoices: ChoiceOption<Position>[] = positionOptions.map(item => ({ value: item.value, label: item.label }))
const distanceChoices: ChoiceOption<RunDistance>[] = runDistances.map(item => ({ value: item.value, label: item.label }))
const sportLabel = (sport: Sport) => sports.find(item => item.value === sport)?.label ?? sport

function Group({ label, children }: { label: string; children: ReactNode }) {
  const c = useThemeColors()
  return <View style={{ gap: 8, marginTop: 14 }}>
    <Text accessibilityRole="header" style={{ color: c['ink-muted'], fontSize: 10.5, fontWeight: '800', letterSpacing: 1 }}>{label.toUpperCase()}</Text>
    {children}
  </View>
}

/**
 * Folha "Categoria do ranking": a modalidade em blocos com o ícone (só as modalidades com perfil ativo; com uma só, o bloco some
 * e a folha diz que é a única), Times | Individual, o formato e a posição (futebol) ou a distância (corrida). A escolha vale na hora;
 * "Ver ranking" fecha a folha.
 */
export function CategorySheet({ available, value, onChange, onClose }: {
  /** Modalidades com perfil ativo do titular. */
  available: Sport[]
  value: CategoryChoice
  onChange: (patch: Partial<CategoryChoice>) => void
  onClose: () => void
}) {
  const c = useThemeColors()
  return <Sheet title="Categoria do ranking" onClose={onClose}>
    {available.length > 1
      ? <Group label="Modalidade">
        <View accessibilityRole="radiogroup" accessibilityLabel="Modalidade" style={{ flexDirection: 'row', gap: 8 }}>
          {available.map(sport => {
            const selected = sport === value.sport
            return <Pressable key={sport} testID={`sport-tile-${sport}`} accessibilityRole="radio" accessibilityLabel={sportLabel(sport)} accessibilityState={{ checked: selected, selected }}
              onPress={() => { if (!selected) onChange({ sport }) }}
              style={{ flex: 1, minHeight: 76, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 14, borderWidth: 1, paddingVertical: 8,
                backgroundColor: selected ? colors.forest : c.surface, borderColor: selected ? colors.forest : c['line-strong'] }}>
              <SportIcon sport={sport} size={30} inverted={selected} />
              <Text style={{ color: selected ? '#ffffff' : c.ink, fontSize: 12, fontWeight: '700' }}>{sportLabel(sport)}</Text>
            </Pressable>
          })}
        </View>
      </Group>
      : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <SportIcon sport={available[0] ?? value.sport} size={26} />
        <Text style={{ flex: 1, color: c['ink-muted'], fontSize: 12.5 }}>{`${sportLabel(available[0] ?? value.sport)} é a sua única modalidade ativa`}</Text>
      </View>}
    {value.sport === 'futebol' ? <>
      <Group label="Ranking"><SectionTabs label="Tipo de ranking" items={kinds} value={value.kind} onChange={kind => onChange({ kind })} /></Group>
      <Group label="Formato"><ChoicePills label="Formato" options={formatChoices} value={value.format} onChange={format => onChange({ format })} /></Group>
      {value.kind === 'individual' ? <Group label="Posição"><ChoicePills label="Posição" options={positionChoices} value={value.position} onChange={position => onChange({ position })} /></Group> : null}
    </> : null}
    {value.sport === 'corrida'
      ? <Group label="Distância"><ChoicePills label="Distância" options={distanceChoices} value={value.distance} onChange={distance => onChange({ distance })} /></Group>
      : null}
    <Button title="Ver ranking" onPress={onClose} />
  </Sheet>
}
