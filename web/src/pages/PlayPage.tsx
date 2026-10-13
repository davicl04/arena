import { useEffect, useId, useRef, useState } from 'react'
import { MapPin, Shield, User } from 'lucide-react'
import { sports } from '../api/client'
import type { City, Profile, Sport } from '../api/client'
import { cancelSearch, createSearch } from '../api/matchmaking'
import type { MatchSearch, PlayBoard, SearchCreated } from '../api/matchmaking'
import { getMyStandings } from '../api/play'
import type { RunCreated, RunFilter } from '../api/runs'
import { ArenaMark } from '../components/Brand'
import SportIcon from '../components/SportIcon'
import { TeamCrest } from '../components/arena/TeamCrest'
import { CancelSearchDialog } from '../components/play/CancelSearchDialog'
import { formatChips } from '../components/play/formatChips'
import { MyMatches } from '../components/play/MyMatches'
import { OtherWays } from '../components/play/OtherWays'
import { NotificationBell } from '../components/notifications/NotificationBell'
import { PlateChips } from '../components/play/PlateChips'
import type { PlateOption } from '../components/play/PlateChips'
import { PlayButton } from '../components/play/PlayButton'
import { ProposalCard, SlotOfferCard } from '../components/play/PlateCards'
import { PrepareSearchSheet } from '../components/play/PrepareSearchSheet'
import { ProposalDialog } from '../components/play/ProposalDialog'
import { RunHistorySheet } from '../components/play/RunHistorySheet'
import { RunMarks } from '../components/play/RunMarks'
import { RunSavedCard } from '../components/play/RunSavedCard'
import { RunStopwatchDialog } from '../components/play/RunStopwatchDialog'
import { SlotOfferDialog } from '../components/play/SlotOfferDialog'
import { TierLine } from '../components/play/TierLine'
import { slotsSummary } from '../components/play/slots'
import { avulsoLine, lineView, normalizeStandings, runBestLine, teamLine } from '../components/play/tierLines'
import type { AvulsoPosition, TierLineView } from '../components/play/tierLines'
import { footballFormat, positionOptions, runDistances } from '../data/arena'
import type { FootballFormat, RunDistance, Screen } from '../data/arena'
import { useResource } from '../hooks/useResource'
import { useRunBests } from '../hooks/useRunBests'
import { useSubmit } from '../hooks/useSubmit'
import type { PlayBoardState } from '../hooks/usePlayBoard'
import { Button } from '@/components/ui/button'
import { LoadError } from '@/components/ui/load-error'
import { Tabs } from '@/components/ui/tabs'
import { toast } from '@/components/ui/toast'

type Mode = 'time' | 'avulso'
const sportTabs = sports.map(sport => ({
  value: sport.value,
  label: sport.label,
  icon: <span className="inline-flex opacity-60 [[aria-selected=true]>&]:opacity-100 [&_[data-slot=sport-icon]]:mix-blend-screen [&_[data-slot=sport-icon]]:[filter:grayscale(1)_invert(1)]"><SportIcon sport={sport.value} size={18} /></span>,
}))
const modeOptions: PlateOption<Mode>[] = [
  { value: 'time', label: <><Shield aria-hidden="true" />Com meu time</> },
  { value: 'avulso', label: <><User aria-hidden="true" />Avulso</> },
]
const positionChips: PlateOption<AvulsoPosition>[] = [
  { value: 'qualquer', label: 'Qualquer posição' },
  ...positionOptions.map(option => ({ value: option.value, label: option.label })),
]
const distanceChips: PlateOption<`${RunDistance}`>[] = runDistances.map(distance => ({ value: `${distance.value}`, label: distance.label }))
const lower = (value: string) => value.toLocaleLowerCase('pt-BR')

/** Quem a busca encontra, para a linha de apoio da placa e da folha ("Times de Brasília Bronze, Prata ou Ouro"). */
function searchHint(sport: Sport, mode: Mode, city: string, position: AvulsoPosition, levels: string): string {
  if (sport === 'tenis') return `Tenistas de ${city} ${levels === 'qualquer nível' ? 'de qualquer nível' : levels}`
  if (mode === 'avulso') {
    const label = positionOptions.find(option => option.value === position)?.label
    const where = label ? `Vagas de ${lower(label)} em partidas de ${city}` : `Vagas em partidas de ${city}`
    return levels === 'qualquer nível' ? where : `${where} (${levels})`
  }
  return `Times de ${city} ${levels === 'qualquer nível' ? 'de qualquer nível' : levels}`
}

/**
 * Jogar (J1 + H1 + V2 + P2): placa `forest` com o Coliseu, a cidade do perfil da modalidade, as abas Futebol | Tênis |
 * Corrida, a chave e os chips de cada modalidade, a linha do elo de `GET /me/standings` e o botão redondo.
 *
 * O botão busca de verdade (etapa 3): "Com meu time" abre a folha Preparar busca (V2); Avulso e Tênis buscam direto.
 * Durante a busca ele pulsa, conta o tempo e, tocado, pede a confirmação para cancelar. A placa (`GET /me/play`, lida
 * pelo ArenaPage) mostra a proposta (P2, em tela cheia), a oferta de vaga ao avulso e as partidas do titular, que levam
 * à tela da partida. Na Corrida (K2 + K4, etapa 5), o botão REGISTRAR abre o cronômetro em tela cheia; a placa mostra o elo e
 * o melhor tempo da distância escolhida (`GET /me/run-bests`) e, abaixo, "Suas marcas" com o histórico de cada distância.
 */
export default function PlayPage({ profiles, cities, loading, board, openMatch, notificationCount = 0, go, onExpired }: {
  profiles: Profile[]
  cities: City[]
  /** Perfis esportivos ainda carregando (ArenaPage). */
  loading: boolean
  /** Placa do Jogar, lida pelo ArenaPage (também acende o ponto menta da navegação). */
  board: PlayBoardState
  /** Partida cuja proposta (ou oferta de vaga) abre em tela cheia ao entrar: as notificações "Partida encontrada" e "Vaga encontrada". */
  openMatch?: number
  /** Não lidas mais pedidos para seguir (resumo das notificações do ArenaPage): o número do sino. */
  notificationCount?: number
  go: (screen: Screen, context?: { teamId?: number; sport?: Sport; matchId?: number; distance?: RunDistance }) => void
  onExpired: () => void
}) {
  const ids = useId()
  const [sport, setSport] = useState<Sport>('futebol')
  const [mode, setMode] = useState<Mode>('time')
  const [format, setFormat] = useState<FootballFormat>('society')
  const [teamChoice, setTeamChoice] = useState<number | null>(null)
  const football = profiles.find(profile => profile.sport === 'futebol')
  const [position, setPosition] = useState<AvulsoPosition>(football?.position ?? 'qualquer')
  const [distance, setDistance] = useState<RunDistance>(5)
  const [sheet, setSheet] = useState(false)
  const [confirming, setConfirming] = useState(false)
  /** Corrida: distância com que o cronômetro (K2) abre, o histórico aberto (K4) e a última marca salva (cartão sobre a placa). */
  const [registering, setRegistering] = useState<RunDistance | null>(null)
  const [history, setHistory] = useState<RunFilter | null>(null)
  const [savedRun, setSavedRun] = useState<RunCreated | null>(null)
  /** Diálogo aberto pela pessoa; sem ele, a primeira proposta pendente que ela pode responder abre sozinha. */
  const [picked, setPicked] = useState<{ kind: 'proposta' | 'oferta' | 'partida'; id: number } | null>(
    openMatch === undefined ? null : { kind: 'partida', id: openMatch })
  /** Proposta que eu aceitei e que espera o outro lado: quando os dois aceitam, vai à partida. */
  const [watching, setWatching] = useState<number | null>(null)
  const start = useSubmit(onExpired)
  const cancel = useSubmit(onExpired)
  const standings = useResource(getMyStandings, onExpired, { fallback: 'Não foi possível carregar seu elo.' })
  const bests = useRunBests(onExpired, sport === 'corrida')
  const data = standings.data ? normalizeStandings(standings.data) : normalizeStandings(null)
  const represented = data.teams.filter(entry => entry.my_role === 'representante')
  const team = represented.find(entry => entry.team.id === teamChoice) ?? represented[0]
  const plate: PlayBoard = board.board ?? { attention: false, searches: [], proposals: [], offers: [], matches: [] }
  const reload = board.reload

  const profile = profiles.find(item => item.sport === sport)
  const city = cities.find(item => item.id === profile?.city_id)
  const sportLabel = sports.find(item => item.value === sport)?.label ?? ''
  const timeMode = sport === 'futebol' && mode === 'time'
  const noteId = `${ids}-note`
  const playButton = useRef<HTMLButtonElement>(null)

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
    ? { loading: bests.loading && !bests.loaded, error: bests.loaded ? '' : bests.error, cause: bests.errorCause, reload: bests.reload }
    : { loading: standings.loading, error: standings.error, cause: standings.errorCause, reload: standings.reload }
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

  /* Diálogos: a proposta que a pessoa abriu ou a primeira que ela ainda pode responder; a oferta que ela abriu. */
  const showConfirm = confirming && searching
  const auto = sheet || showConfirm ? undefined
    : plate.proposals.find(item => item.can_respond && item.state === 'proposta' && !board.deferred.includes(item.match_id))
  // `partida` vem da notificação: a proposta daquela partida ou, no avulso, a oferta de vaga dela.
  // Uma escolha que já não existe na placa (prazo, resposta do outro lado) deixa de valer e a abertura automática volta.
  const pickedProposal = picked?.kind === 'proposta' || picked?.kind === 'partida' ? plate.proposals.find(item => item.match_id === picked.id) : undefined
  const openOffer = picked?.kind === 'oferta' ? plate.offers.find(item => item.slot_id === picked.id)
    : picked?.kind === 'partida' && !pickedProposal ? plate.offers.find(item => item.match.id === picked.id) : undefined
  const openProposal = pickedProposal ?? (openOffer ? undefined : auto)
  const proposalsHere = plate.proposals.filter(item => item.sport === sport && item.state === 'proposta')
  const offersHere = sport === 'futebol' ? plate.offers : []

  /* Os dois lados aceitaram enquanto a pessoa esperava: a partida passa a existir e é para lá que ela vai. */
  const waitingOver = watching !== null && !plate.proposals.some(item => item.match_id === watching)
  const confirmedId = waitingOver ? plate.matches.find(card => card.id === watching)?.id ?? null : null
  const goTo = useRef(go)
  useEffect(() => { goTo.current = go })
  useEffect(() => {
    if (confirmedId !== null) goTo.current('match', { matchId: confirmedId })
  }, [confirmedId])

  function created(result: SearchCreated) {
    setSheet(false)
    setWatching(null)
    void reload().then(() => {
      if (result.proposal) setPicked({ kind: 'proposta', id: result.proposal.match_id })
      else if (result.offer) setPicked({ kind: 'oferta', id: result.offer.slot_id })
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
      toast.success('Busca cancelada.')
    }
    void reload()
  }
  /** Abre o cronômetro (K2) na distância dada (REGISTRAR ou o "+" do cartão). */
  function register(km: RunDistance) {
    setSavedRun(null)
    setRegistering(km)
  }
  function registered(created: RunCreated) {
    setRegistering(null)
    setSavedRun(created)
    if (created.run.standard_distance_km) setDistance(created.run.standard_distance_km)
    void bests.refresh()
  }
  function openHeld() {
    if (heldProposal) setPicked({ kind: 'proposta', id: heldProposal.match_id })
    else if (heldOffer) setPicked({ kind: 'oferta', id: heldOffer.slot_id })
  }
  function later(matchId: number) {
    board.defer(matchId)
    setPicked(null)
    toast.info('A proposta continua na placa e nas notificações até o prazo.')
  }

  /* Estado do botão: preparar o perfil, criar ou representar um time, buscar, esperar ou responder. */
  const verb = sport === 'corrida' ? 'REGISTRAR' : 'ENCONTRAR'
  const caption = sport === 'corrida' ? 'treino ou prova' : sport === 'futebol' && mode === 'avulso' ? 'vaga' : 'partida'
  const idleLabel = `${verb === 'REGISTRAR' ? 'Registrar' : 'Encontrar'} ${caption}`
  let button: { verb: string; caption: string; label: string; onClick?: () => void; since?: string }
  let note: string
  if (loading) {
    button = { verb, caption, label: idleLabel }
    note = 'Carregando suas modalidades…'
  } else if (!profile) {
    button = { verb: 'PREPARAR', caption: 'seu perfil', label: `Preparar perfil de ${sportLabel}`, onClick: () => go('sports') }
    note = sport === 'corrida'
      ? 'Prepare seu perfil de corrida: o Arena usa a sua cidade para mostrar as provas perto de você.'
      : `Prepare seu perfil de ${sportLabel.toLocaleLowerCase('pt-BR')}: o Arena usa a sua cidade para encontrar partidas perto de você.`
  } else if (timeMode && standings.data && !team) {
    button = { verb: 'MEU TIME', caption: 'crie ou represente', label: 'Crie ou represente um time', onClick: () => go('teams') }
    note = 'Só quem representa um time busca amistosos entre times. Sem time, você ainda pode jogar avulso.'
  } else if (sport === 'corrida') {
    button = { verb, caption, label: idleLabel, onClick: () => register(distance) }
    note = 'Registre o tempo de um treino ou de uma prova do Arena. O ranking usa o melhor tempo das últimas 52 semanas.'
  } else if (searching && search) {
    button = { verb: 'BUSCANDO', caption: '', label: 'Buscando, toque para cancelar a busca', onClick: search.can_cancel ? () => setConfirming(true) : undefined, since: search.started_at }
    note = `${hint}${search.format ? ` · ${footballFormat[search.format]?.label ?? ''}` : ''}.${search.kind === 'time' ? ` ${slotsSummary(search.open_slots)}.` : ''}`
  } else if (held && heldProposal && !heldProposal.can_respond) {
    button = { verb: 'AGUARDANDO', caption: 'o adversário', label: 'Ver a proposta, que aguarda o adversário', onClick: openHeld }
    note = 'Você aceitou a proposta. Falta o adversário responder, em até 2 h.'
  } else if (held) {
    button = { verb: 'RESPONDER', caption: heldOffer ? 'oferta de vaga' : 'proposta', label: heldOffer ? 'Responder à oferta de vaga' : 'Responder à proposta', onClick: heldProposal || heldOffer ? openHeld : undefined }
    note = heldOffer ? 'Uma vaga foi reservada para você. Responda em até 2 h.' : 'Encontramos um adversário. Os dois lados têm até 2 h para aceitar.'
  } else if (timeMode && !standings.data) {
    button = { verb, caption, label: idleLabel }
    note = standings.loading ? 'Carregando seus times…' : 'Não foi possível carregar seus times. Tente novamente.'
  } else if (!board.board) {
    button = { verb, caption, label: idleLabel }
    note = board.loading ? 'Carregando a placa…' : 'Não foi possível carregar a placa do Jogar. Tente novamente.'
  } else {
    button = { verb, caption, label: idleLabel, onClick: start.busy ? undefined : timeMode ? () => setSheet(true) : () => void startDirect() }
    note = start.busy ? 'Iniciando a busca…' : `${hint}.`
  }
  /* A placa que não carregou é erro de carga (LoadError); `start.error` só traz a recusa de campo do servidor (422). */
  const boardFailed = !board.board && !board.loading && board.error !== ''

  return <div className="min-h-full">
    <section aria-labelledby={`${ids}-title`} className="relative overflow-hidden rounded-b-[28px] bg-forest pb-[26px] text-white">
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-[30px] left-1/2 h-[240px] w-[420px] -translate-x-1/2 bg-white opacity-[0.045] mask-[url(/images/brand/coliseum.svg)] mask-contain mask-center mask-no-repeat" />
      <div className="relative flex min-h-[54px] items-center gap-2.5 pt-1.5 pr-2 pl-[18px]">
        <ArenaMark className="h-[22px] w-[30px] text-mint" />
        <h1 id={`${ids}-title`} className="min-w-fit flex-1 text-[17px] text-white">Jogar</h1>
        <button type="button" className="inline-flex max-w-[55%] min-w-0 shrink items-center gap-[5px] rounded-full border-0 bg-white/8 px-2.5 py-1.5 text-[10.5px] font-semibold text-white/80 hover:bg-white/12 focus-visible:outline-mint"
          aria-label={city ? `Cidade do perfil de ${sportLabel}: ${city.name}. Alterar em Suas modalidades` : `Definir a cidade do perfil de ${sportLabel}`}
          onClick={() => go('sports')}>
          <MapPin size={13} className="text-mint" aria-hidden="true" />
          <span className="truncate">{city ? city.name : 'Definir cidade'}</span>
        </button>
        <NotificationBell tone="dark" count={notificationCount} onOpen={() => go('notifications')} />
      </div>
      <Tabs variant="dark" items={sportTabs} value={sport} onChange={next => { setSport(next); setSavedRun(null) }} label="Modalidade" idPrefix={`${ids}-tab-`} controls={`${ids}-panel`}
        className="relative border-b border-solid border-white/7" />
      <div id={`${ids}-panel`} role="tabpanel" aria-labelledby={`${ids}-tab-${sport}`} className="relative grid justify-items-center gap-3.5 px-5 pt-4 text-center">
        {sport === 'futebol' && <PlateChips variant="segmented" label="Jogar como" options={modeOptions} value={mode} onChange={setMode} />}
        {timeMode && represented.length > 1 && <PlateChips label="Time que você representa" value={String(team?.team.id ?? '')}
          options={represented.map(entry => ({ value: String(entry.team.id), label: <><TeamCrest name={entry.team.name} initials={entry.team.initials} path={entry.team.crest_url} size="xs" decorative />{entry.team.name}</> }))}
          onChange={value => setTeamChoice(Number(value))} />}
        {timeMode && represented.length === 1 && team && <p className="flex min-w-0 items-center gap-2 text-[11px] text-white/75">
          <TeamCrest name={team.team.name} initials={team.team.initials} path={team.team.crest_url} size="xs" decorative />
          <span className="truncate"><b className="text-white">{team.team.name}</b> · você representa</span>
        </p>}
        {timeMode && team && <PlateChips label="Formato" options={formatChips} value={shownFormat} onChange={setFormat} disabled={locked} />}
        {sport === 'futebol' && mode === 'avulso' && <PlateChips label="Posição" options={positionChips} value={shownPosition} onChange={setPosition} disabled={locked} />}
        {sport === 'corrida' && <PlateChips label="Distância" options={distanceChips} value={`${distance}`} onChange={value => setDistance(Number(value) as RunDistance)} />}
        <div className="flex min-h-11 items-center justify-center" aria-live="polite">
          {elo.loading && <p role="status" className="text-[11px] text-white/65">Carregando seu elo…</p>}
          {elo.error && <LoadError size="section" tone="dark" text={elo.error} cause={elo.cause} onRetry={elo.reload} />}
          {view && <TierLine view={view} />}
          {standings.data && timeMode && !team && <p className="max-w-[280px] text-[11.5px] leading-[1.5] text-white/75">Você ainda não representa um time.</p>}
        </div>
        <PlayButton ref={playButton} verb={button.verb} caption={button.caption} label={button.label} disabled={!button.onClick} onClick={button.onClick}
          describedBy={noteId} searchedSince={button.since} />
        <p id={noteId} className="max-w-[290px] text-[10.5px] leading-[1.55] text-white/65" aria-live="polite">{note}</p>
        {searching && search?.can_cancel && <Button variant="glass-link" className="-mt-2 self-center" onClick={() => setConfirming(true)}>Cancelar busca</Button>}
        {sport === 'futebol' && otherTeamSearches.map(item => <p key={item.id} role="status" className="max-w-[290px] text-[10.5px] leading-[1.55] text-white/75">
          {item.team?.name} está buscando {item.state === 'pareada' ? 'e encontrou um adversário' : 'partida'}. Só os representantes respondem.
        </p>)}
        {boardFailed && <LoadError size="section" tone="dark" text={board.error} cause={board.errorCause} onRetry={() => void reload()} />}
        {start.error && <p role="alert" className="max-w-[290px] text-[11px] leading-[1.5] text-[#ffd0d7]">{start.error}</p>}
        {waitingOver && confirmedId === null && <p role="status" className="max-w-[290px] text-[11px] leading-[1.5] text-mint">
          A proposta foi encerrada. Veja a situação da busca na placa.
        </p>}
        {sport === 'corrida' && savedRun && <RunSavedCard created={savedRun} onDismiss={() => setSavedRun(null)} />}
        {(proposalsHere.length > 0 || offersHere.length > 0) && <div className="grid w-full gap-3 text-left">
          {proposalsHere.map(item => <ProposalCard key={item.match_id} proposal={item} onElapsed={() => void reload()}
            onOpen={() => setPicked({ kind: 'proposta', id: item.match_id })} />)}
          {offersHere.map(item => <SlotOfferCard key={item.slot_id} offer={item} onElapsed={() => void reload()}
            onOpen={() => setPicked({ kind: 'oferta', id: item.slot_id })} />)}
        </div>}
      </div>
    </section>
    {sport === 'corrida' && profile && !loading && <RunMarks items={bests.items} loading={bests.loading} error={bests.error} errorCause={bests.errorCause} selected={distance}
      onAdd={register} onOpen={setHistory} onRetry={bests.reload}
      onOpenRanking={km => go('ranking', { sport: 'corrida', distance: km })} />}
    {sport !== 'corrida' && <MyMatches sport={sport} upcoming={plate.matches} onOpen={matchId => go('match', { matchId })} onExpired={onExpired} />}
    <OtherWays sport={sport} onTeams={() => go('teams')} onEvents={() => go('events', { sport })} />

    {sheet && team && <PrepareSearchSheet team={team.team} eyebrow={`${team.team.name} · ${view?.kind === 'ranked' ? view.title : 'Em classificação'}`}
      format={format} onFormat={setFormat} hint={hint} onCreated={created} onClose={() => setSheet(false)} onExpired={onExpired} />}
    {registering !== null && <RunStopwatchDialog initialDistance={registering} onClose={() => setRegistering(null)}
      onSaved={registered} onFindRaces={() => { setRegistering(null); go('events', { sport: 'corrida' }) }} onExpired={onExpired} />}
    {history !== null && <RunHistorySheet filter={history} onClose={() => setHistory(null)} onChanged={() => void bests.refresh()} onExpired={onExpired}
      onAdd={history === 'outra' ? undefined : () => { const km = Number(history) as RunDistance; setHistory(null); register(km) }} />}
    {showConfirm && <CancelSearchDialog returnFocus={playButton} busy={cancel.busy} onKeep={() => setConfirming(false)} onConfirm={() => void endSearch()} />}
    {openProposal && <ProposalDialog key={openProposal.match_id} returnFocus={playButton} proposal={openProposal} onLater={() => later(openProposal.match_id)}
      onOpenMatch={matchId => { setPicked(null); go('match', { matchId }) }} onElapsed={() => void reload()} onExpired={onExpired}
      onAnswer={async (updated, answer) => {
        if (answer === 'recusar') { setPicked(null); toast.success('Proposta recusada.'); await reload(); return }
        if (updated.state === 'combinando') { setPicked(null); void reload(); go('match', { matchId: updated.match_id }); return }
        setWatching(updated.match_id)
        setPicked({ kind: 'proposta', id: updated.match_id })
        await reload()
      }} />}
    {openOffer && <SlotOfferDialog key={openOffer.slot_id} returnFocus={playButton} offer={openOffer} onLater={() => { setPicked(null) }} onExpired={onExpired}
      onElapsed={() => void reload()}
      onAccepted={matchId => { setPicked(null); void reload(); go('match', { matchId }) }}
      onDeclined={() => { setPicked(null); toast.info('Vaga recusada. Sua busca terminou.'); void reload() }} />}
  </div>
}
