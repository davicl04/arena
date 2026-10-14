import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ScrollView, Text, View } from 'react-native'
import type { Position, Profile, Sport } from '../api/client'
import type { MyRankingOverviewLine, RankingOverview } from '../api/results'
import { ActionButton, TextAction } from '../components/arena/controls'
import { LoadError } from '../components/arena/LoadError'
import { Icon } from '../components/Icon'
import type { IconName } from '../components/Icon'
import { NotificationBell } from '../components/notifications/NotificationBell'
import { rankedTier } from '../components/play/tierLines'
import { CategoryCard } from '../components/ranking/CategoryCard'
import { CategorySheet } from '../components/ranking/CategorySheet'
import { activeSports, categoryOf, categoryShort, categoryText, rankingKeyOf, subjectNoun } from '../components/ranking/category'
import type { CategoryChoice } from '../components/ranking/category'
import { LegendsEntry } from '../components/ranking/LegendsEntry'
import { PositionPlate } from '../components/ranking/PositionPlate'
import { TeamSwitch } from '../components/ranking/TeamSwitch'
import { TierPicker } from '../components/ranking/TierPicker'
import { TierPlate } from '../components/ranking/TierPlate'
import { emptyTierCounts } from '../components/ranking/tiers'
import { useRankingOverview } from '../components/ranking/useRankingOverview'
import { LoadState } from '../components/review/ui'
import type { TierKey } from '../data/arena'
import { loadProfiles } from '../hooks/useCities'
import { useResource } from '../hooks/useResource'
import { openUser } from '../navigation/openUser'
import type { ScreenProps } from '../navigation/screens'
import { useThemeColors } from '../hooks/useTheme'

/** Estado vazio honesto: sem ninguém classificado, sem pontos nem posições inventados. */
function EmptyCard({ icon, title, text, action, testID = 'ranking-empty' }: { icon: IconName; title: string; text: string; action?: ReactNode; testID?: string }) {
  const c = useThemeColors()
  return <View testID={testID} style={{ alignItems: 'center', gap: 6, borderRadius: 16, backgroundColor: c.surface, padding: 22 }}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: c['success-bg'] }}>
      <Icon name={icon} size={22} color={c.brand} />
    </View>
    <Text accessibilityRole="header" style={{ color: c.ink, fontSize: 14, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
    <Text style={{ color: c['ink-muted'], fontSize: 12, lineHeight: 18, textAlign: 'center' }}>{text}</Text>
    {action}
  </View>
}

type Chosen = Omit<CategoryChoice, 'position'> & { position: Position | null }

function RankingBody({ user, navigation, params, onExpired, available, profilePosition, reveal }: Pick<ScreenProps<'ranking'>, 'user' | 'navigation' | 'params' | 'onExpired'> & {
  available: Sport[]
  profilePosition: Position | null
  reveal: (node: View | null) => void
}) {
  const startSport = params?.sport && available.includes(params.sport) ? params.sport : available[0]
  const [chosen, setChosen] = useState<Chosen>({ sport: startSport, kind: 'time', format: 'society', position: null, distance: params?.distanceKm ?? 5 })
  // Pedido de abertura vindo de outra tela (a pilha mantém a tela quando só os parâmetros mudam): aplicado uma vez por pedido.
  const asked = `${params?.sport ?? ''}|${params?.distanceKm ?? ''}`
  const [applied, setApplied] = useState(asked)
  if (applied !== asked) {
    setApplied(asked)
    setChosen(old => ({
      ...old,
      sport: params?.sport && available.includes(params.sport) ? params.sport : old.sport,
      distance: params?.distanceKm ?? old.distance,
    }))
  }
  const [sheet, setSheet] = useState(false)
  const [teamId, setTeamId] = useState<number | null>(null)
  const [tierPick, setTierPick] = useState<{ scope: string; tier: TierKey } | null>(null)

  const choice: CategoryChoice = { ...chosen, position: chosen.position ?? profilePosition ?? 'atacante' }
  const category = categoryOf(choice)
  const ranking = rankingKeyOf(category)
  const noun = subjectNoun(category)
  const isTeams = category.sport === 'futebol' && category.kind === 'time'
  const overview = useRankingOverview(category, isTeams ? teamId : null, onExpired)
  const data: RankingOverview | null = overview.overview
  const change = (patch: Partial<CategoryChoice>) => setChosen(old => ({ ...old, ...patch }))

  const lines: MyRankingOverviewLine[] = data?.mine ?? []
  const line: MyRankingOverviewLine | null = lines.find(item => item.team?.id === data?.selected_team_id) ?? lines[0] ?? null
  const mineTier = rankedTier(line ?? undefined)
  const teams = (data ?? overview.previous)?.mine.flatMap(item => item.team ? [item.team] : []) ?? []
  const scope = overview.path
  const shown: TierKey = tierPick?.scope === scope ? tierPick.tier : (mineTier ?? 'bronze')
  const showTier = (tier: TierKey) => setTierPick({ scope, tier })
  const openHall = () => navigation.go('legends', { category })
  const counts = data?.tier_counts ?? emptyTierCounts
  const teamName = isTeams ? line?.team?.name ?? null : null

  return <>
    <CategoryCard sport={choice.sport} text={categoryText(category)} onOpen={() => setSheet(true)} />
    {isTeams ? <TeamSwitch teams={teams} selectedId={data?.selected_team_id ?? teamId} onSelect={setTeamId} /> : null}
    <View testID="ranking-panel" accessibilityLabel={`Ranking de ${categoryShort(category)}`} accessibilityState={{ busy: overview.loading }} style={{ gap: 14 }}>
      {overview.loading
        ? <LoadState loading error={null} onRetry={overview.reload} loadingText="Carregando ranking…" />
        : overview.error || !data
          ? <LoadError size="screen" title="Não foi possível carregar o ranking" text={overview.error} cause={overview.errorCause} onRetry={overview.reload} />
          : <>
            {data.classified_count > 0
              ? <LegendsEntry count={data.tier_counts.lendario} preview={data.legends_preview} inHall={mineTier === 'lendario'} onOpen={openHall} />
              : null}
            {mineTier ? null
              : <PositionPlate line={line} noTeam={isTeams && !lines.length} runKm={category.sport === 'corrida' ? category.distance_km ?? null : null} teamName={teamName}
                onTeams={() => navigation.go('teams')} onRun={() => navigation.go('play')} />}
            {data.classified_count > 0
              ? <>
                {mineTier ? null : <TierPicker value={shown} onChange={showTier} />}
                <TierPlate key={`${scope}|${shown}`} category={category} ranking={ranking} tier={shown} counts={counts} mineTier={mineTier} line={line} window={data.window}
                  teamName={teamName} noun={noun} onShow={showTier} onHall={openHall} onExpired={onExpired} onOpenUser={userId => openUser(navigation, user.id, userId)} reveal={reveal} />
              </>
              : category.sport === 'corrida'
                ? <EmptyCard icon="timer" title={`Ninguém com marca nos ${categoryShort(category)} ainda`}
                  text="O ranking usa o melhor tempo das últimas 52 semanas de cada atleta. A primeira marca já classifica."
                  action={<TextAction title="Registrar uma corrida" onPress={() => navigation.go('play')} />} />
                : <EmptyCard icon="trophy" title="Ninguém classificado ainda"
                  text={`O ranking de ${categoryShort(category)} começa quando as primeiras partidas forem confirmadas. São ${data.required} partidas para sair da classificação.`} />}
          </>}
    </View>
    {sheet ? <CategorySheet available={available} value={choice} onChange={change} onClose={() => setSheet(false)} /> : null}
  </>
}

/**
 * Tela Ranking: você no centro. A barra clara leva só o título e o sino (aba raiz, sem voltar). Abaixo: o cartão Categoria (abre
 * a folha de filtros, só com as modalidades de perfil ativo), os chips dos times (ranking de Times com mais de um time ativo), a
 * entrada do Salão dos Lendários e a placa contínua do elo, onde cada elo é um ranking próprio (posição de 1 ao último dentro
 * do elo, sem posição geral). Quem está sem elo vê o estado da classificação e as faixas, com Bronze por padrão. Os dados vêm de
 * `GET /rankings/overview` e, ao trocar de elo ou expandir, de `GET /rankings?tier=`. `params` abre já na modalidade (e, na
 * corrida, na distância), como o "Ver ranking" de "Suas marcas" e do Início. Só dados da API: nada é de exemplo.
 */
export default function RankingScreen({ user, navigation, params, onExpired, notificationSummary }: ScreenProps<'ranking'>) {
  const c = useThemeColors()
  const profiles = useResource(loadProfiles, onExpired)
  const list: Profile[] = Array.isArray(profiles.data) ? profiles.data : []
  const available = activeSports(list)
  const profilePosition = list.find(profile => profile.sport === 'futebol')?.position ?? null
  const scroll = useRef<ScrollView>(null)
  const content = useRef<View>(null)
  // Depois de expandir o elo, leva a linha do titular à vista (a posição na tela é medida em relação ao conteúdo da rolagem).
  const reveal = useCallback((node: View | null) => {
    const base = content.current
    if (!node || !base || typeof node.measureLayout !== 'function') return
    node.measureLayout(base, (_x, y) => scroll.current?.scrollTo({ y: Math.max(0, y - 200), animated: true }), () => undefined)
  }, [])

  return <ScrollView ref={scroll} testID="ranking-screen" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 14, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
    <View ref={content} collapsable={false} style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text accessibilityRole="header" style={{ color: c.heading, fontSize: 28, fontWeight: '800' }}>Ranking</Text>
        <View style={{ marginRight: -8 }}><NotificationBell tone="light" count={notificationSummary.count} onOpen={() => navigation.go('notifications')} /></View>
      </View>
      {profiles.loading
        ? <LoadState loading error={null} onRetry={profiles.reload} loadingText="Carregando ranking…" />
        : profiles.error
          ? <LoadError size="screen" title="Não foi possível carregar o ranking" text={profiles.error} cause={profiles.errorCause} onRetry={profiles.reload} />
          : available.length
            ? <RankingBody user={user} navigation={navigation} params={params} onExpired={onExpired} available={available} profilePosition={profilePosition} reveal={reveal} />
            : <EmptyCard testID="ranking-no-profile" icon="trophy" title="Você ainda não joga nenhuma modalidade"
              text="O Ranking mostra os elos das modalidades em que você tem perfil ativo. Configure futebol, tênis ou corrida para entrar."
              action={<View style={{ alignSelf: 'stretch', marginTop: 8 }}><ActionButton block title="Configurar modalidade" onPress={() => navigation.go('profile')} /></View>} />}
    </View>
  </ScrollView>
}
