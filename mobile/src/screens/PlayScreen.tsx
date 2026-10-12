import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { sports } from '../api/client'
import type { City, Profile, Sport } from '../api/client'
import { cancelSearch, createSearch, normalizeBoard } from '../api/matchmaking'
import type { MatchSearch, Proposal, SearchCreated } from '../api/matchmaking'
import { getMyStandings } from '../api/play'
import { ArenaMark } from '../components/arena/ArenaMark'
import { LiveNotice, Notice, TextAction } from '../components/arena/controls'
import { TeamCrest } from '../components/arena/TeamCrest'
import { TeamsPlate } from '../components/arena/TeamsPlate'
import { Icon } from '../components/Icon'
import { CancelSearchSheet } from '../components/play/CancelSearchSheet'
import { formatChips } from '../components/play/formatChips'
import { MyMatches } from '../components/play/MyMatches'
import { OtherWays } from '../components/play/OtherWays'
import { PlateNote, PlateChips, SportTabs, formatOptions } from '../components/play/PlateChips'
import type { PlateOption } from '../components/play/PlateChips'
import { ProposalCard, SlotOfferCard } from '../components/play/PlateCards'
import { PlayButton } from '../components/play/PlayButton'
import { plateButton, searchHint } from '../components/play/plateView'
import type { PlateAction, PlayMode } from '../components/play/plateView'
import { PrepareSearchSheet } from '../components/play/PrepareSearchSheet'
import { ProposalSheet } from '../components/play/ProposalSheet'
import { RunArea } from '../components/play/RunArea'
import { SlotOfferSheet } from '../components/play/SlotOfferSheet'
import { TierLine } from '../components/play/TierLine'
import { avulsoLine, lineView, normalizeStandings, runBestLine, teamLine } from '../components/play/tierLines'
import type { AvulsoPosition, TierLineView } from '../components/play/tierLines'
import { positionOptions, runDistances } from '../data/arena'
import type { FootballFormat, RunDistance } from '../data/arena'
import { loadPlaces } from '../hooks/useCities'
import { useResource } from '../hooks/useResource'
import { useRunBests } from '../hooks/useRunBests'
import { useSubmit } from '../hooks/useSubmit'
import type { ScreenProps } from '../navigation/screens'
import { colors } from '../theme'

/** Perfis esportivos e cidades: a cidade e a posição da placa vêm do perfil da modalidade. */

const modeOptions: PlateOption<PlayMode>[] = [
  { value: 'time', label: 'Com meu time', icon: 'shield' },
  { value: 'avulso', label: 'Avulso', icon: 'user' },
]
const positionChips: PlateOption<AvulsoPosition>[] = [
  { value: 'qualquer', label: 'Qualquer posição' },
  ...positionOptions.map(option => ({ value: option.value, label: option.label })),
]
const distanceChips: PlateOption<`${RunDistance}`>[] = runDistances.map(distance => ({ value: `${distance.value}` as const, label: distance.label }))
const formatChoices = formatOptions(formatChips)

/** Proposta ou oferta aberta numa folha pela pessoa (um toque no cartão, o botão redondo ou uma notificação). */
type Picked = { kind: 'proposta' | 'oferta'; id: number }

/**
 * Jogar (J1 + H1 + V2 + P2): placa `forest` com o Coliseu, a cidade do perfil da modalidade, as abas Futebol | Tênis |
 * Corrida, a chave e os chips de cada modalidade, a linha do elo de `GET /me/standings` e o botão redondo.
 *
 * O botão busca de verdade: "Com meu time" abre a folha Preparar busca (V2); Avulso e Tênis buscam direto. Durante a
 * busca ele conta o tempo e, tocado, pede a confirmação para cancelar. A placa (`GET /me/play`, lida pelo shell e entregue
 * por `playBoard`) mostra a proposta (P2, numa folha), a oferta de vaga ao avulso e as partidas do titular, que levam à
 * tela da partida. Sem perfil da modalidade, o botão leva a prepará-lo. A Corrida mostra só a linha do elo; as ações dela
 * ficam em `RunArea`.
 *
 * `params.matchId` (vindo de notificações) abre a proposta ou a oferta de vaga dessa partida; se ela já não está pendente,
 * abre a própria partida.
 */
export default function PlayScreen({ navigation, onExpired, playBoard: board, refreshPlayBoard, params }: ScreenProps<'play'>) {
  // A modalidade escolhida fica também na entrada da pilha: voltar da partida remonta a tela e retoma a mesma aba.
  const [sport, setSport] = useState<Sport>(params?.sport ?? 'futebol')
  const [mode, setMode] = useState<PlayMode>('time')
  const [format, setFormat] = useState<FootballFormat>('society')
  const [teamChoice, setTeamChoice] = useState<number | null>(null)
  const [positionChoice, setPositionChoice] = useState<AvulsoPosition | null>(null)
  const [distance, setDistance] = useState<RunDistance>(5)
  const [sheet, setSheet] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState('')
  /** Folha aberta pela pessoa; sem ela, a primeira proposta pendente que ela pode responder abre sozinha. */
  const [picked, setPicked] = useState<Picked | null>(null)
  /** Proposta que eu aceitei e que espera o outro lado: quando os dois aceitam, vai à partida. */
  const [watching, setWatching] = useState<number | null>(null)
  const start = useSubmit(onExpired)
  const cancel = useSubmit(onExpired)
  const places = useResource(loadPlaces, onExpired, { fallback: 'Não foi possível carregar suas modalidades.' })
  const standings = useResource(getMyStandings, onExpired, { fallback: 'Não foi possível carregar seu elo.' })
  const bests = useRunBests(onExpired, sport === 'corrida')
  const [profiles, cities]: [Profile[], City[]] = places.data ?? [[], []]
  const data = normalizeStandings(standings.data)
  const represented = data.teams.filter(entry => entry.my_role === 'representante')
  const team = represented.find(entry => entry.team.id === teamChoice) ?? represented[0]
  const plate = useMemo(() => normalizeBoard(board.board), [board.board])

  const profile = profiles.find(item => item.sport === sport)
  const football = profiles.find(item => item.sport === 'futebol')
  const city = cities.find(item => item.id === profile?.city_id)
  const sportLabel = sports.find(item => item.value === sport)?.label ?? ''
  const timeMode = sport === 'futebol' && mode === 'time'
  const position: AvulsoPosition = positionChoice ?? football?.position ?? 'qualquer'

  /* A busca aberta do contexto (modalidade, chave e time escolhidos) e o que ela segura. */
  const search: MatchSearch | undefined = plate.searches.find(item =>
    sport === 'tenis' ? item.kind === 'tenis'
      : sport === 'futebol' && (mode === 'avulso' ? item.kind === 'avulso' : item.kind === 'time' && item.team?.id === team?.team.id))
  const searching = search?.state === 'ativa'
  const held = search?.state === 'pareada'
  const heldProposal = held ? plate.proposals.find(item => item.match_id === search.match_id) : undefined
  const heldOffer = held ? plate.offers.find(item => item.slot_id === search.slot_id) : undefined
  const shownFormat = timeMode && search?.format ? search.format : format
  const shownPosition: AvulsoPosition = mode === 'avulso' && search ? search.position ?? 'qualquer' : position
  const locked = Boolean(search)
  const otherTeamSearches = plate.searches.filter(item => item.kind === 'time' && item.team && !represented.some(entry => entry.team.id === item.team?.id))

  /* A corrida lê o elo e o melhor tempo de `run-bests`; as outras modalidades, de `standings`. */
  const elo = sport === 'corrida'
    ? { loading: bests.loading && !bests.loaded, error: bests.loaded ? '' : bests.error, reload: bests.reload }
    : { loading: standings.loading, error: standings.error, reload: standings.reload }
  let view: TierLineView | null = null
  if (sport === 'corrida') {
    if (bests.loaded) view = runBestLine(bests.items, distance)
  } else if (standings.data) {
    if (sport === 'tenis') view = lineView(data.tenis)
    else if (mode === 'avulso') view = avulsoLine(data.individual, shownPosition)
    else if (team) view = teamLine(team, shownFormat)
  }
  const levels = view?.kind === 'ranked' ? view.levels : 'qualquer nível'
  const hint = searchHint(sport, mode, city?.name ?? 'sua cidade', shownPosition, levels)

  /*
   * Folhas: a proposta ou a oferta que a pessoa abriu; sem escolha, a da notificação (`params.matchId`) ou a primeira
   * proposta que ela ainda pode responder.
   */
  const showConfirm = confirming && searching
  const hintedMatch = params?.matchId
  const hintedProposal = hintedMatch === undefined ? undefined : plate.proposals.find(item => item.match_id === hintedMatch)
  const hintedOffer = hintedMatch === undefined || hintedProposal ? undefined : plate.offers.find(item => item.match.id === hintedMatch)
  const chosen: Picked | null = picked ?? (hintedProposal ? { kind: 'proposta', id: hintedProposal.match_id } : hintedOffer ? { kind: 'oferta', id: hintedOffer.slot_id } : null)
  const auto = sheet || showConfirm ? undefined
    : plate.proposals.find(item => item.can_respond && item.state === 'proposta' && !board.deferred.includes(item.match_id))
  const chosenProposal = chosen?.kind === 'proposta' ? plate.proposals.find(item => item.match_id === chosen.id) : undefined
  const openOffer = chosen?.kind === 'oferta' && !sheet && !showConfirm ? plate.offers.find(item => item.slot_id === chosen.id) : undefined
  const openProposal = chosenProposal ?? (openOffer ? undefined : auto)
  const proposalsHere = plate.proposals.filter(item => item.sport === sport && item.state === 'proposta')
  const offersHere = sport === 'futebol' ? plate.offers : []
  /** Escolhe (ou fecha, com `null`) a folha e consome o pedido da notificação, que já cumpriu o papel dele. */
  function pick(next: Picked | null) {
    setPicked(next)
    if (hintedMatch !== undefined) navigation.setParams('play', { matchId: undefined })
  }

  /* Os dois lados aceitaram enquanto a pessoa esperava: a partida passa a existir e é para lá que ela vai. */
  const waitingOver = watching !== null && !plate.proposals.some(item => item.match_id === watching)
  const confirmedId = waitingOver ? plate.matches.find(card => card.id === watching)?.id ?? null : null
  useEffect(() => {
    if (confirmedId !== null) navigation.go('match', { matchId: confirmedId })
  }, [confirmedId, navigation])

  /* Notificação de uma partida sem proposta nem oferta pendente (já respondida ou vencida): abre a própria partida. */
  const noPending = hintedMatch !== undefined && !board.loading && !hintedProposal && !hintedOffer
  useEffect(() => {
    if (!noPending || hintedMatch === undefined) return
    navigation.setParams('play', { matchId: undefined })
    navigation.go('match', { matchId: hintedMatch })
  }, [noPending, hintedMatch, navigation])

  function created(result: SearchCreated) {
    setSheet(false)
    setNotice('')
    setWatching(null)
    void refreshPlayBoard().then(() => {
      if (result.proposal) pick({ kind: 'proposta', id: result.proposal.match_id })
      else if (result.offer) pick({ kind: 'oferta', id: result.offer.slot_id })
    })
  }
  async function startDirect() {
    const result = await start.run(() => createSearch(sport === 'tenis'
      ? { sport: 'tenis' }
      : { sport: 'futebol', position: shownPosition === 'qualquer' ? null : shownPosition }), 'Não foi possível iniciar a busca.')
    if (result) created(result)
  }
  async function endSearch() {
    if (!search) return
    const done = await cancel.run(async () => { await cancelSearch(search.id); return true }, 'Não foi possível cancelar a busca.')
    if (done) {
      setConfirming(false)
      setNotice('Busca cancelada.')
    }
    void refreshPlayBoard()
  }
  function openHeld() {
    if (heldProposal) pick({ kind: 'proposta', id: heldProposal.match_id })
    else if (heldOffer) pick({ kind: 'oferta', id: heldOffer.slot_id })
  }
  function later(proposal: Proposal) {
    board.defer(proposal.match_id)
    pick(null)
    setNotice(proposal.can_respond ? 'A proposta continua na placa e nas notificações até o prazo.' : '')
  }

  const button = plateButton({
    sport, mode, sportLabel, timeMode, search, heldProposal, heldOffer, hint, starting: start.busy,
    profilesLoading: places.loading, profilesFailed: Boolean(places.error), hasProfile: Boolean(profile),
    standingsLoaded: Boolean(standings.data), standingsLoading: standings.loading, hasTeam: Boolean(team),
    boardLoaded: Boolean(board.board), boardLoading: board.loading,
  })
  const actions: Record<PlateAction, () => void> = {
    prepare: () => navigation.go('profile'),
    teams: () => navigation.go('teams'),
    start: () => { setNotice(''); if (timeMode) setSheet(true); else void startDirect() },
    cancel: () => setConfirming(true),
    held: openHeld,
  }
  const boardFailed = !board.board && !board.loading
  const feedback = start.error || (cancel.error && !showConfirm ? cancel.error : '') || (boardFailed ? board.error || 'Não foi possível carregar a placa do Jogar.' : '') || places.error
  const retryFeedback = boardFailed ? () => void refreshPlayBoard() : places.error ? places.reload : null
  const message = notice || (waitingOver && confirmedId === null ? 'A proposta foi encerrada. Veja a situação da busca na placa.' : '')

  return <View style={{ flex: 1 }}>
    <ScrollView testID="play-screen" contentContainerStyle={{ paddingBottom: 32 }}>
      <TeamsPlate bottom={26}>
        <View style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 6, paddingRight: 12, paddingLeft: 18 }}>
          <ArenaMark compact width={30} height={22} color={colors.mint} />
          <Text accessibilityRole="header" style={{ flex: 1, color: '#ffffff', fontSize: 17, fontWeight: '800' }}>Jogar</Text>
          <Pressable accessibilityRole="button" onPress={() => navigation.go('profile')}
            accessibilityLabel={city ? `Cidade do perfil de ${sportLabel}: ${city.name}. Alterar em Suas modalidades` : `Definir a cidade do perfil de ${sportLabel}`}
            style={{ maxWidth: '55%', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 22, paddingHorizontal: 12, backgroundColor: 'rgba(255,255,255,0.08)' }}>
            <Icon name="map-pin" size={13} color={colors.mint} />
            <Text numberOfLines={1} style={{ flexShrink: 1, color: 'rgba(255,255,255,0.8)', fontSize: 10.5, fontWeight: '600' }}>{city ? city.name : 'Definir cidade'}</Text>
          </Pressable>
        </View>
        <SportTabs value={sport} onChange={next => { setSport(next); setNotice(''); navigation.setParams('play', { sport: next }) }} />
        <View style={{ alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 16 }}>
          {sport === 'futebol' ? <PlateChips variant="segmented" label="Jogar como" options={modeOptions} value={mode} onChange={next => { setMode(next); setNotice('') }} /> : null}
          {timeMode && represented.length > 1 ? <PlateChips label="Time que você representa" value={String(team?.team.id ?? '')}
            options={represented.map(entry => ({ value: String(entry.team.id), label: entry.team.name }))} onChange={value => setTeamChoice(Number(value))} /> : null}
          {timeMode && represented.length === 1 && team ? <View accessible accessibilityLabel={`${team.team.name}, você representa`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TeamCrest name={team.team.name} initials={team.team.initials} path={team.team.crest_url} size="xs" decorative />
            <Text numberOfLines={1} style={{ flexShrink: 1, color: 'rgba(255,255,255,0.75)', fontSize: 11 }}><Text style={{ color: '#ffffff', fontWeight: '800' }}>{team.team.name}</Text> · você representa</Text>
          </View> : null}
          {timeMode && team ? <PlateChips label="Formato" options={formatChoices} value={shownFormat} onChange={setFormat} disabled={locked} /> : null}
          {sport === 'futebol' && mode === 'avulso' ? <PlateChips label="Posição" options={positionChips} value={shownPosition} onChange={setPositionChoice} disabled={locked} /> : null}
          {sport === 'corrida' ? <PlateChips label="Distância" options={distanceChips} value={`${distance}`} onChange={value => setDistance(Number(value) as RunDistance)} /> : null}
          <View style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            {elo.loading ? <Text accessibilityLiveRegion="polite" style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>Carregando seu elo…</Text> : null}
            {elo.error ? <View style={{ alignItems: 'center' }}>
              <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ textAlign: 'center', color: '#ffd0d7', fontSize: 11, lineHeight: 17 }}>{elo.error}</Text>
              <TextAction surface="dark" title="Tentar novamente" accessibilityLabel="Tentar carregar o elo novamente" onPress={elo.reload} />
            </View> : null}
            {view ? <TierLine view={view} /> : null}
            {standings.data && timeMode && !team ? <PlateNote tone="strong">Você ainda não representa um time.</PlateNote> : null}
          </View>
          {button
            ? <>
              <PlayButton verb={button.verb} caption={button.caption} label={button.label} hint={button.note} searchedSince={button.since}
                disabled={!button.action} onPress={button.action ? actions[button.action] : undefined} />
              <PlateNote>{button.note}</PlateNote>
            </>
            : <RunArea part="plate" distance={distance} onDistance={setDistance} bests={bests} navigation={navigation} onExpired={onExpired} />}
          {searching && search?.can_cancel ? <TextAction surface="dark" title="Cancelar busca" onPress={() => setConfirming(true)} /> : null}
          {sport === 'futebol' ? otherTeamSearches.map(item => <PlateNote key={item.id} tone="strong">
            {item.team?.name} está buscando {item.state === 'pareada' ? 'e encontrou um adversário' : 'partida'}. Só os representantes respondem.
          </PlateNote>) : null}
          {feedback ? <View style={{ alignSelf: 'stretch', alignItems: 'center' }}>
            <View style={{ alignSelf: 'stretch' }}><Notice surface="dark">{feedback}</Notice></View>
            {retryFeedback ? <TextAction surface="dark" title="Tentar novamente" onPress={retryFeedback} /> : null}
          </View> : null}
          <View style={{ alignSelf: 'stretch' }}><LiveNotice text={message} /></View>
          {proposalsHere.length > 0 || offersHere.length > 0 ? <View style={{ alignSelf: 'stretch', gap: 12 }}>
            {proposalsHere.map(item => <ProposalCard key={item.match_id} proposal={item} onElapsed={() => void refreshPlayBoard()} onOpen={() => pick({ kind: 'proposta', id: item.match_id })} />)}
            {offersHere.map(item => <SlotOfferCard key={item.slot_id} offer={item} onElapsed={() => void refreshPlayBoard()} onOpen={() => pick({ kind: 'oferta', id: item.slot_id })} />)}
          </View> : null}
        </View>
      </TeamsPlate>
      {sport === 'corrida' && profile && !places.loading
        ? <RunArea part="marks" distance={distance} onDistance={setDistance} bests={bests} navigation={navigation} onExpired={onExpired} />
        : null}
      {sport !== 'corrida' ? <MyMatches sport={sport} upcoming={plate.matches} onOpen={matchId => navigation.go('match', { matchId })} onExpired={onExpired} /> : null}
      <OtherWays sport={sport} onTeams={() => navigation.go('teams')} onEvents={() => navigation.go('events', { sport })} />
    </ScrollView>

    {sheet && team ? <PrepareSearchSheet team={team.team} eyebrow={`${team.team.name} · ${view?.kind === 'ranked' ? view.title : 'Em classificação'}`}
      format={format} onFormat={setFormat} hint={hint} onCreated={created} onClose={() => setSheet(false)} onExpired={onExpired} /> : null}
    {showConfirm ? <CancelSearchSheet busy={cancel.busy} error={cancel.error} onKeep={() => { setConfirming(false); cancel.setError('') }} onConfirm={() => void endSearch()} /> : null}
    {openProposal ? <ProposalSheet key={openProposal.match_id} proposal={openProposal} onLater={() => later(openProposal)}
      onOpenMatch={matchId => { pick(null); navigation.go('match', { matchId }) }} onElapsed={() => void refreshPlayBoard()} onExpired={onExpired}
      onAnswer={async (updated, answer) => {
        setNotice('')
        if (answer === 'recusar') { pick(null); setNotice('Proposta recusada.'); await refreshPlayBoard(); return }
        if (updated.state === 'combinando') { pick(null); void refreshPlayBoard(); navigation.go('match', { matchId: updated.match_id }); return }
        setWatching(updated.match_id)
        pick({ kind: 'proposta', id: updated.match_id })
        await refreshPlayBoard()
      }} /> : null}
    {openOffer ? <SlotOfferSheet key={openOffer.slot_id} offer={openOffer} onLater={() => pick(null)} onElapsed={() => void refreshPlayBoard()} onExpired={onExpired}
      onAccepted={matchId => { pick(null); void refreshPlayBoard(); navigation.go('match', { matchId }) }}
      onDeclined={() => { pick(null); setNotice('Vaga recusada. Sua busca terminou.'); void refreshPlayBoard() }} /> : null}
  </View>
}
