import { Pressable, View } from 'react-native'
import { Text } from '../Text'
import { sports } from '../../api/client'
import type { Profile } from '../../api/client'
import type { MeStandings } from '../../api/play'
import { tiers } from '../../data/arena'
import { pillAccessibilityLabel, pillMetric, pillStatus, pillTexts } from '../../data/home'
import type { PillStatus } from '../../data/home'
import type { ScreenParams } from '../../navigation/routes'
import { colors } from '../../theme'
import { ArenaMark } from '../arena/ArenaMark'
import { SportIcon } from '../arena/SportIcon'
import { TextAction } from '../arena/controls'
import { TierEmblem } from '../arena/TierEmblem'
import { modalityStanding } from '../arena/modalityStanding'

const RADIUS = 22
const soft = 'rgba(255,255,255,0.7)'
const faint = 'rgba(255,255,255,0.75)'

/** Conteúdo abaixo do nome da modalidade, conforme a situação (emblema e métrica, situação e detalhe, ou carregamento). */
function PillBody({ status }: { status: PillStatus }) {
  if (status.kind === 'tier') {
    const metric = pillMetric(status.metric, status.distanceKm)
    return <>
      <View style={{ maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <TierEmblem tier={status.tier} size="xs" decorative />
        <Text numberOfLines={1} style={{ flexShrink: 1, color: '#ffffff', fontSize: 10, fontWeight: '600' }}>{tiers[status.tier]?.name ?? status.tier}</Text>
      </View>
      {metric ? <Text numberOfLines={2} style={{ marginTop: 1, color: faint, fontSize: 10, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{metric}</Text> : null}
    </>
  }
  const texts = pillTexts(status)
  if (!texts) return <Text style={{ color: soft, fontSize: 10, fontWeight: '700' }}>…</Text>
  return <>
    <Text numberOfLines={2} style={{ color: soft, fontSize: 10, textAlign: 'center' }}>{texts.status}</Text>
    {texts.detail ? <Text numberOfLines={1} style={{ marginTop: 1, color: faint, fontSize: 10, textAlign: 'center' }}>{texts.detail}</Text> : null}
  </>
}

/**
 * Pílulas do Início ("Seu elo"): o cabeçalho com "Ver elos" (abre o Ranking) e um bloco escuro por design (`forest` com o
 * Coliseu em marca-d'água, igual nos dois temas) com uma pílula por modalidade, na ordem de `sports` (futebol, tênis e
 * corrida). Cada pílula mostra o ícone, o nome e, pela regra de `modalityStanding` (`GET /me/standings`, lido uma vez pela
 * tela): o emblema e o nome do elo com a métrica; "{n} de {3}" e "Sem classificação"; na corrida, "Sem marca"; sem perfil
 * esportivo, "Sem perfil" e "Configurar"; o carregamento; ou "Classificação indisponível". Nunca mostra elo para quem está em
 * classificação nem a posição no ranking. Com perfil, a pílula abre o Ranking da modalidade (na corrida, na distância do elo);
 * sem perfil, a tela de modalidades.
 */
export function Pilulas({ standings, standingsLoading, profiles, profilesLoading, onOpenRanking, onOpenModalities }: {
  /** Classificação lida (`GET /me/standings`); `null` enquanto carrega ou se a leitura falhou. */
  standings: Partial<MeStandings> | null
  standingsLoading: boolean
  /** Perfis esportivos lidos; `null` (ou fora do formato) enquanto carregam ou se a leitura falhou: as pílulas seguem a classificação. */
  profiles: readonly Profile[] | null
  profilesLoading: boolean
  onOpenRanking: (params?: ScreenParams['ranking']) => void
  onOpenModalities: () => void
}) {
  const list = Array.isArray(profiles) ? profiles : null
  return <View testID="pilulas" className="mb-3.5">
    <View className="mb-2 flex-row items-center justify-between gap-2">
      <Text accessibilityRole="header" className="text-[16px] font-bold text-heading">Seu elo</Text>
      <TextAction title="Ver elos" accessibilityLabel="Ver elos no Ranking" onPress={() => onOpenRanking()} />
    </View>
    <View testID="pilulas-plate" style={{ overflow: 'hidden', borderRadius: RADIUS, backgroundColor: colors.forest, padding: 12 }}>
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
        style={{ position: 'absolute', top: -10, right: -20, width: 200, height: 110, opacity: 0.07 }}>
        <ArenaMark width={200} height={110} color="#ffffff" />
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {sports.map(({ value: sport, label }) => {
          const hasProfile = list ? list.some(profile => profile.sport === sport) : null
          const standing = standings ? modalityStanding(sport, standings) : null
          const status = pillStatus(sport, { standing, loading: standingsLoading || profilesLoading, hasProfile })
          const open = status.kind === 'no-profile' ? onOpenModalities
            : () => onOpenRanking(status.kind === 'tier' && status.distanceKm ? { sport, distanceKm: status.distanceKm } : { sport })
          return <Pressable key={sport} testID={`pilula-${sport}`} accessibilityRole="button" accessibilityLabel={pillAccessibilityLabel(label, status)}
            accessibilityHint={status.kind === 'no-profile' ? 'Abre suas modalidades' : `Abre o Ranking de ${label}`} onPress={open}
            style={{ flex: 1, minWidth: 0, minHeight: 44, alignItems: 'center', gap: 3, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 4, backgroundColor: 'rgba(255,255,255,0.07)' }}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: '100%', alignItems: 'center', gap: 3 }}>
              <SportIcon sport={sport} shape="aro" size={20} color="rgba(255,255,255,0.82)" />
              <Text numberOfLines={1} style={{ color: '#ffffff', fontSize: 11, fontWeight: '700' }}>{label}</Text>
              <PillBody status={status} />
            </View>
          </Pressable>
        })}
      </View>
    </View>
  </View>
}
