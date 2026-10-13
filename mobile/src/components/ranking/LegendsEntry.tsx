import { Pressable, Text, View } from 'react-native'
import type { RankingSubject } from '../../api/results'
import { useSessionToken } from '../../hooks/useSessionToken'
import { colors } from '../../theme'
import { plural } from '../../utils/format'
import { TeamCrest } from '../arena/TeamCrest'
import { TierEmblem } from '../arena/TierEmblem'
import { Icon } from '../Icon'
import { Avatar } from '../media'
import { Wash } from './Wash'

/** Até 4 escudos ou fotos sobrepostos, com "+N" quando há mais Lendários do que a prévia traz. */
function Faces({ subjects, extra }: { subjects: RankingSubject[]; extra: number }) {
  const token = useSessionToken()
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
    {subjects.slice(0, 4).map((subject, index) => <View key={subject.team?.id ?? subject.athlete?.id ?? index}
      style={{ marginLeft: index ? -6 : 0, borderRadius: 14, borderWidth: 2, borderColor: colors.forest }}>
      {subject.team
        ? <TeamCrest name={subject.team.name} initials={subject.team.initials} path={subject.team.crest_url} size="xs" decorative token={token} />
        : <Avatar path={subject.athlete?.avatar_url ?? null} name={subject.athlete?.name ?? 'Atleta'} token={token} size={22} />}
    </View>)}
    {extra > 0 ? <View style={{ marginLeft: -6, height: 26, minWidth: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 2, borderColor: colors.forest, backgroundColor: colors.legend, paddingHorizontal: 4 }}>
      <Text style={{ color: '#3a2d05', fontSize: 10, fontWeight: '800' }}>+{extra}</Text>
    </View> : null}
  </View>
}

/**
 * Entrada do Salão dos Lendários: cartão escuro com gradiente dourado, o brasão Lendário, a contagem e até 4 escudos ou fotos.
 * Se o titular é Lendário, o texto vira "Você está no Salão" e o contorno fica menta. Sem Lendários, um cartão discreto explica
 * quando as vagas abrem.
 */
export function LegendsEntry({ count, preview, inHall, onOpen }: { count: number; preview: RankingSubject[]; inHall: boolean; onOpen: () => void }) {
  if (count <= 0) {
    return <View testID="legends-none" accessible accessibilityLabel="Nenhum Lendário ainda. As vagas abrem com 7 classificados, 15% deles, entre quem tem os pontos de Diamante."
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, backgroundColor: colors.forest, padding: 12 }}>
      <View style={{ opacity: 0.55 }}><TierEmblem tier="lendario" size="lg" decorative /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>Nenhum Lendário ainda</Text>
        <Text style={{ marginTop: 2, color: 'rgba(255,255,255,0.6)', fontSize: 11, lineHeight: 16 }}>As vagas abrem com 7 classificados (15%), entre quem tem os pontos de Diamante.</Text>
      </View>
    </View>
  }
  const title = inHall ? 'Você está no Salão' : plural(count, 'Lendário', 'Lendários')
  return <Pressable testID="legends-entry" accessibilityRole="button" accessibilityLabel={`Salão dos Lendários. ${title}. Abrir`} onPress={onOpen}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'hidden', borderRadius: 18, borderWidth: 1, backgroundColor: colors.forest, padding: 12,
      borderColor: inHall ? colors.mint : 'rgba(244,222,154,0.25)' }}>
    <Wash id="legends-entry" color="#4a4214" from={0.9} reach={0.65} horizontal />
    <TierEmblem tier="lendario" size="xl" decorative />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ color: colors.legend, fontSize: 9.5, fontWeight: '700', letterSpacing: 1 }}>SALÃO DOS LENDÁRIOS</Text>
      <Text numberOfLines={1} style={{ marginTop: 2, color: '#ffffff', fontSize: 13.5, fontWeight: '700' }}>{title}</Text>
      <Faces subjects={preview} extra={Math.max(0, count - Math.min(preview.length, 4))} />
    </View>
    <Icon name="chevron" size={18} color="rgba(255,255,255,0.7)" />
  </Pressable>
}
