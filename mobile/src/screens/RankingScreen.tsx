import { useState } from 'react'
import type { ReactNode } from 'react'
import { ScrollView, Text, View } from 'react-native'
import type { Position, Sport } from '../api/client'
import type { RankingKey } from '../api/results'
import { ActionButton, ChoicePills, TextAction, sportChoices } from '../components/arena/controls'
import type { ChoiceOption } from '../components/arena/controls'
import { TierEmblem } from '../components/arena/TierEmblem'
import { SectionTabs } from '../components/events/SectionTabs'
import { Icon } from '../components/Icon'
import type { IconName } from '../components/Icon'
import { MyRankingPlate, RankingRows } from '../components/ranking/RankingRows'
import { useRanking } from '../components/ranking/useRanking'
import { LoadState } from '../components/review/ui'
import { footballFormat, footballFormats, positionOptions, rankingTiers, runDistances } from '../data/arena'
import type { FootballFormat, RunDistance } from '../data/arena'
import { loadProfiles } from '../hooks/useCities'
import { useResource } from '../hooks/useResource'
import { openUser } from '../navigation/openUser'
import type { ScreenProps } from '../navigation/screens'
import { colors } from '../theme'
import { plural } from '../utils/format'

type Kind = 'time' | 'individual'
const kinds: { value: Kind; label: string }[] = [
  { value: 'time', label: 'Times' },
  { value: 'individual', label: 'Individual' },
]
const formatChoices: ChoiceOption<FootballFormat>[] = footballFormats.map(item => ({ value: item.value, label: `${item.label} ${item.size}`, accessibilityLabel: `${item.label}, ${item.size}` }))
const positionChoices: ChoiceOption<Position>[] = positionOptions.map(item => ({ value: item.value, label: item.label }))
const distanceChoices: ChoiceOption<RunDistance>[] = runDistances.map(item => ({ value: item.value, label: item.label }))

/** Chave do ranking mostrada, para os textos; a API devolve a mesma em `ranking`. */
function rankingKey(sport: Sport, kind: Kind, distance: RunDistance): RankingKey {
  if (sport === 'tenis') return 'tenis'
  if (sport === 'corrida') return `corrida_${distance}`
  return kind === 'time' ? 'futebol_time' : 'futebol_individual'
}

/** Estado vazio honesto da lista: sem ninguém classificado, sem pontos nem posições inventados. */
function EmptyCard({ icon, title, text, action }: { icon: IconName; title: string; text: string; action?: ReactNode }) {
  return <View testID="ranking-empty" style={{ alignItems: 'center', gap: 6, borderRadius: 16, backgroundColor: '#ffffff', padding: 22 }}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors['success-bg'] }}>
      <Icon name={icon} size={22} color={colors.brand} />
    </View>
    <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 14, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
    <Text style={{ color: colors['ink-muted'], fontSize: 12, lineHeight: 18, textAlign: 'center' }}>{text}</Text>
    {action}
  </View>
}

/**
 * Tela Ranking: os elos de referência no topo e a lista **geral** (sem cidade) de `GET /rankings`, por modalidade. No
 * futebol, Times | Individual, o formato e, no individual, a posição; no tênis, a lista única; na corrida, a distância,
 * com o melhor tempo das últimas 52 semanas de cada atleta (menor vence). Cada linha traz o brasão do elo de quem já se
 * classificou; a linha de quem vê fica em destaque e a placa "Sua posição" mostra também quem ainda está em classificação
 * ("n de 3 partidas", sem elo). `params` abre já na modalidade (e, na corrida, na distância), como o "Ver ranking" de
 * "Suas marcas" e do Início. Só dados da API: lista vazia é estado vazio, nunca pontos de exemplo.
 */
export default function RankingScreen({ user, navigation, params, onExpired }: ScreenProps<'ranking'>) {
  const [sport, setSport] = useState<Sport>(params?.sport ?? 'futebol')
  const [kind, setKind] = useState<Kind>('time')
  const [format, setFormat] = useState<FootballFormat>('society')
  const [chosenPosition, setChosenPosition] = useState<Position | null>(null)
  const [distance, setDistance] = useState<RunDistance>(params?.distanceKm ?? 5)
  // Pedido de abertura vindo de outra tela (a pilha mantém a tela quando só os parâmetros mudam): aplicado uma vez por pedido.
  const asked = `${params?.sport ?? ''}|${params?.distanceKm ?? ''}`
  const [applied, setApplied] = useState(asked)
  if (applied !== asked) {
    setApplied(asked)
    if (params?.sport) setSport(params.sport)
    if (params?.distanceKm) setDistance(params.distanceKm)
  }
  // Posição do individual: a escolhida; senão a do perfil de futebol; senão atacante.
  const profiles = useResource(loadProfiles, onExpired)
  const profilePosition = Array.isArray(profiles.data) ? profiles.data.find(profile => profile.sport === 'futebol')?.position : null
  const position: Position = chosenPosition ?? profilePosition ?? 'atacante'

  const football = sport === 'futebol'
  const running = sport === 'corrida'
  const ranking = useRanking(
    football
      ? { sport, kind, format, position: kind === 'individual' ? position : undefined }
      : running ? { sport, distance_km: distance } : { sport },
    onExpired,
  )
  const key = rankingKey(sport, kind, distance)
  const page = ranking.page
  const category = football
    ? `${footballFormat[format].label}${kind === 'individual' ? ` · ${positionOptions.find(item => item.value === position)?.label}` : ''}`
    : running ? `${distance} km` : 'Tênis'
  const classified = page?.classified_count ?? 0

  return <ScrollView testID="ranking-screen" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 6, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
    <Text style={{ color: colors.brand, fontSize: 11, fontWeight: '800', letterSpacing: 2 }}>CADA JOGO CONTA</Text>
    <Text accessibilityRole="header" style={{ marginTop: 3, color: colors.ink, fontSize: 28, fontWeight: '800' }}>Ranking</Text>
    <Text style={{ marginTop: 4, marginBottom: 18, color: colors['ink-muted'], fontSize: 12, lineHeight: 19 }}>Reconstrua sua arena a cada elo.</Text>

    <View accessibilityLabel="Elos do ranking" style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginBottom: 20 }}>
      {rankingTiers.map(tier => <View key={tier.image} testID={`tier-${tier.image}`} accessible accessibilityLabel={`Elo ${tier.name}`}
        style={{ width: '30.5%', alignItems: 'center', borderRadius: 12, backgroundColor: colors.forest, paddingHorizontal: 6, paddingVertical: 12 }}>
        <TierEmblem tier={tier.image} size="xl" decorative />
        <Text style={{ marginTop: 6, color: '#edebe2', fontSize: 11, fontWeight: '700' }}>{tier.name}</Text>
      </View>)}
    </View>

    <View style={{ gap: 12 }}>
      <ChoicePills label="Modalidade" options={sportChoices('light')} value={sport} onChange={setSport} />
      {football ? <>
        <SectionTabs label="Tipo de ranking" items={kinds} value={kind} onChange={setKind} />
        <ChoicePills label="Formato" options={formatChoices} value={format} onChange={setFormat} />
        {kind === 'individual' ? <ChoicePills label="Posição" options={positionChoices} value={position} onChange={setChosenPosition} /> : null}
      </> : null}
      {running ? <ChoicePills label="Distância" options={distanceChoices} value={distance} onChange={setDistance} /> : null}

      <View testID="ranking-panel" accessibilityLabel={`Ranking de ${category}`} style={{ gap: 12 }}>
        {ranking.loading || ranking.error
          ? <LoadState loading={ranking.loading} error={ranking.error || null} onRetry={ranking.reload} loadingText="Carregando ranking…" />
          : page
            ? <>
              <MyRankingPlate lines={page.mine ?? []} ranking={key}
                empty={football && kind === 'time'
                  ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderRadius: 16, backgroundColor: '#ffffff', paddingLeft: 14, paddingVertical: 2, paddingRight: 8 }}>
                    <Text style={{ color: colors['ink-muted'], fontSize: 12, lineHeight: 18 }}>Você ainda não faz parte de um time ativo.</Text>
                    <TextAction title="Meus times" onPress={() => navigation.go('teams')} />
                  </View>
                  : undefined} />
              {ranking.items.length
                ? <View accessibilityLabel={`Ranking · ${category}`} style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 4 }}>
                    <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 14, fontWeight: '700' }}>{category}</Text>
                    <Text style={{ color: colors['ink-muted'], fontSize: 10.5 }}>
                      {plural(classified, 'classificado', 'classificados')}
                      {page.legend_slots > 0 ? ` · ${plural(page.legend_slots, 'vaga', 'vagas')} de Lendário` : ''}
                      {running ? ' · menor tempo vence' : ''}
                    </Text>
                  </View>
                  <RankingRows items={ranking.items} ranking={key} onOpenUser={userId => openUser(navigation, user.id, userId)} />
                  {ranking.moreError ? <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 12.5 }}>{ranking.moreError}</Text> : null}
                  {ranking.hasMore ? <ActionButton tone="outline" block title={ranking.busy ? 'Carregando…' : 'Carregar mais'} accessibilityLabel="Carregar mais" busy={ranking.busy} onPress={() => void ranking.loadMore()} /> : null}
                </View>
                : running
                  ? <EmptyCard icon="timer" title={`Ninguém com marca nos ${category} ainda`}
                    text="O ranking usa o melhor tempo das últimas 52 semanas de cada atleta. A primeira marca já classifica."
                    action={<TextAction title="Registrar uma corrida" onPress={() => navigation.go('play')} />} />
                  : <EmptyCard icon="trophy" title="Ninguém classificado ainda"
                    text={`O ranking de ${category} começa quando as primeiras partidas forem confirmadas. São ${page.required} partidas para sair da classificação.`} />}
            </>
            : null}
      </View>
    </View>
  </ScrollView>
}
