import { Pressable, ScrollView, Text, View } from 'react-native'
import { SvgXml } from 'react-native-svg'
import { brandSvgs } from '../assets/brand-svgs'
import { ActionButton } from '../components/arena/controls'
import { LoadError } from '../components/arena/LoadError'
import { ArenaMark } from '../components/arena/ArenaMark'
import { DarkScreen } from '../components/arena/TeamsPlate'
import { Icon } from '../components/Icon'
import { categoryText, rankingKeyOf } from '../components/ranking/category'
import { RankingLine } from '../components/ranking/RankingLine'
import { Wash } from '../components/ranking/Wash'
import { useRanking } from '../components/ranking/useRanking'
import { openUser } from '../navigation/openUser'
import type { ScreenProps } from '../navigation/screens'
import { colors } from '../theme'

/** Regra do elo Lendário: "Topo 12 (15% dos classificados) com os pontos de Diamante. 12 de 12 vagas ocupadas." */
export function legendsRule(slots: number, filled: number): string {
  if (slots <= 0) return 'Topo 15% com os pontos de Diamante.'
  return `Topo ${slots} (15% dos classificados) com os pontos de Diamante. ${filled} de ${slots} ${slots === 1 ? 'vaga ocupada' : 'vagas ocupadas'}.`
}

/**
 * Salão dos Lendários: subtela escura com os Lendários da categoria (`GET /rankings?tier=lendario`, 1º ao último do elo), a regra do
 * elo e um rodapé que lembra o retorno ao Diamante. Abre pelo Ranking com a categoria; tem voltar e não leva o sino.
 */
export default function LegendsScreen({ user, navigation, params, onExpired }: ScreenProps<'legends'>) {
  const category = params.category
  const ranking = rankingKeyOf(category)
  const list = useRanking({ ...category, tier: 'lendario' }, onExpired)
  const page = list.page
  const filled = page?.tier_counts.lendario ?? list.items.length
  return <DarkScreen>
    <ScrollView testID="legends-screen" contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      <View style={{ overflow: 'hidden' }}>
        <Wash id="legends-hall" color="#6b5a14" from={0.55} reach={0.6} />
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', top: 40, left: '50%', marginLeft: -170, width: 340, height: 194, opacity: 0.05 }}>
          <ArenaMark width={340} height={194} color="#ffffff" />
        </View>
        <View style={{ paddingHorizontal: 8, paddingTop: 10 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={navigation.back}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)' }}>
            <Icon name="arrow-left" size={21} color="#ffffff" />
          </Pressable>
        </View>
        <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 4, paddingBottom: 18 }}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><SvgXml xml={brandSvgs.lendario} width={104} height={104} /></View>
          <Text style={{ marginTop: 6, color: colors.legend, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.4 }}>SALÃO DOS LENDÁRIOS</Text>
          <Text accessibilityRole="header" style={{ marginTop: 4, color: '#ffffff', fontSize: 20, fontWeight: '800', textAlign: 'center' }}>{categoryText(category)}</Text>
          {page ? <Text style={{ marginTop: 6, color: 'rgba(255,255,255,0.7)', fontSize: 12, lineHeight: 18, textAlign: 'center' }}>{legendsRule(page.legend_slots, filled)}</Text> : null}
        </View>
      </View>
      <View testID="legends-panel" accessibilityState={{ busy: list.loading }} style={{ gap: 8, paddingHorizontal: 16 }}>
        {list.loading
          ? <View accessibilityRole="progressbar" accessibilityLabel="Carregando o Salão…" accessibilityLiveRegion="polite" style={{ paddingVertical: 24 }}>
            <Text style={{ textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 12.5 }}>Carregando o Salão…</Text>
          </View>
          : list.error
            ? <LoadError size="section" tone="dark" title="Não foi possível carregar o Salão" text={list.error} cause={list.errorCause} onRetry={list.reload} />
            : list.items.length
              ? <>
                {list.items.map(row => <RankingLine key={`${row.tier_position}-${row.team?.id ?? row.athlete?.id}`} row={row} ranking={ranking} variant="hall"
                  onOpenUser={userId => openUser(navigation, user.id, userId)} />)}
                {list.moreError ? <Text accessibilityRole="alert" style={{ color: colors['glass-danger'], fontSize: 12.5 }}>{list.moreError}</Text> : null}
                {list.hasMore ? <ActionButton tone="line" block title={list.busy ? 'Carregando…' : 'Carregar mais'} accessibilityLabel="Carregar mais" busy={list.busy} onPress={() => void list.loadMore()} /> : null}
              </>
              : <View testID="legends-empty" style={{ alignItems: 'center', gap: 4, paddingVertical: 20 }}>
                <Text accessibilityRole="header" style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>Nenhum Lendário ainda</Text>
                <Text style={{ maxWidth: 280, textAlign: 'center', color: 'rgba(255,255,255,0.65)', fontSize: 12, lineHeight: 18 }}>As vagas abrem com 7 classificados (15%), entre quem tem os pontos de Diamante.</Text>
              </View>}
      </View>
      <Text style={{ marginTop: 18, paddingHorizontal: 28, textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 11, lineHeight: 17 }}>
        Quem sai do topo 15% ou perde os pontos de Diamante volta ao Diamante no próximo cálculo.
      </Text>
    </ScrollView>
  </DarkScreen>
}
