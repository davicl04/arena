import { useId, useState } from 'react'
import { MapPin, Shield, User } from 'lucide-react'
import { sports } from '../api/client'
import type { City, Profile, Sport } from '../api/client'
import { getMyStandings } from '../api/play'
import { ArenaMark } from '../components/Brand'
import SportIcon from '../components/SportIcon'
import { TeamCrest } from '../components/arena/TeamCrest'
import { OtherWays } from '../components/play/OtherWays'
import { PlateChips } from '../components/play/PlateChips'
import type { PlateOption } from '../components/play/PlateChips'
import { PlayButton } from '../components/play/PlayButton'
import { TierLine } from '../components/play/TierLine'
import { avulsoLine, lineView, normalizeStandings, runLine, teamLine } from '../components/play/tierLines'
import type { AvulsoPosition, TierLineView } from '../components/play/tierLines'
import { footballFormats, positionOptions, runDistances } from '../data/arena'
import type { FootballFormat, RunDistance, Screen } from '../data/arena'
import { useResource } from '../hooks/useResource'
import { Button } from '@/components/ui/button'
import { Tabs } from '@/components/ui/tabs'

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
const formatChips: PlateOption<FootballFormat>[] = footballFormats.map(format => ({
  value: format.value,
  label: <>{format.label}<small className="font-semibold opacity-70">{format.size}</small></>,
  ariaLabel: `${format.label} ${format.players} contra ${format.players}`,
}))
const distanceChips: PlateOption<`${RunDistance}`>[] = runDistances.map(distance => ({ value: `${distance.value}`, label: distance.label }))

/**
 * Jogar, fase 1 (J1 + H1): placa `forest` com o Coliseu, a cidade do perfil da modalidade, as abas Futebol |
 * Tênis | Corrida, a chave e os chips de cada modalidade, a linha do elo de `GET /me/standings` e o botão
 * redondo. O pareamento e o registro de corrida ainda não existem: o botão leva a preparar o perfil ou ao
 * time, ou fica desabilitado com o aviso — nunca simula busca nem partida encontrada.
 */
export default function PlayPage({ profiles, cities, loading, go, onExpired }: {
  profiles: Profile[]
  cities: City[]
  /** Perfis esportivos ainda carregando (ArenaPage). */
  loading: boolean
  go: (screen: Screen, context?: { teamId?: number }) => void
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
  const standings = useResource(getMyStandings, onExpired, { fallback: 'Não foi possível carregar seu elo.' })
  const data = normalizeStandings(standings.data)
  const represented = data.teams.filter(entry => entry.my_role === 'representante')
  const team = represented.find(entry => entry.team.id === teamChoice) ?? represented[0]

  const profile = profiles.find(item => item.sport === sport)
  const city = cities.find(item => item.id === profile?.city_id)
  const sportLabel = sports.find(item => item.value === sport)?.label ?? ''
  const timeMode = sport === 'futebol' && mode === 'time'
  const noteId = `${ids}-note`

  let view: TierLineView | null = null
  if (standings.data) {
    if (sport === 'tenis') view = lineView(data.tenis)
    else if (sport === 'corrida') view = runLine(data.corrida, distance)
    else if (mode === 'avulso') view = avulsoLine(data.individual, position)
    else if (team) view = teamLine(team, format)
  }

  /* Estado do botão: preparar o perfil, criar ou representar um time, ou aguardar o pareamento (desabilitado). */
  const verb = sport === 'corrida' ? 'REGISTRAR' : 'ENCONTRAR'
  const caption = sport === 'corrida' ? 'treino ou prova' : sport === 'futebol' && mode === 'avulso' ? 'vaga' : 'partida'
  let button: { verb: string; caption: string; label: string; onClick?: () => void }
  let note: string
  if (loading) {
    button = { verb, caption, label: `${verb === 'REGISTRAR' ? 'Registrar' : 'Encontrar'} ${caption}` }
    note = 'Carregando suas modalidades…'
  } else if (!profile) {
    button = { verb: 'PREPARAR', caption: 'seu perfil', label: `Preparar perfil de ${sportLabel}`, onClick: () => go('sports') }
    note = sport === 'corrida'
      ? 'Prepare seu perfil de corrida: o Arena usa a sua cidade para mostrar as provas perto de você.'
      : `Prepare seu perfil de ${sportLabel.toLocaleLowerCase('pt-BR')}: o Arena usa a sua cidade para encontrar partidas perto de você.`
  } else if (timeMode && standings.data && !team) {
    button = { verb: 'MEU TIME', caption: 'crie ou represente', label: 'Crie ou represente um time', onClick: () => go('teams') }
    note = 'Só quem representa um time busca amistosos entre times. Sem time, você ainda pode jogar avulso.'
  } else {
    button = { verb, caption, label: `${verb === 'REGISTRAR' ? 'Registrar' : 'Encontrar'} ${caption}` }
    note = sport === 'corrida'
      ? 'O registro de treinos e provas chega numa próxima etapa do Arena.'
      : `A busca de ${caption === 'vaga' ? 'vagas' : 'partidas'} chega numa próxima etapa do Arena.`
  }

  return <div className="min-h-full">
    <section aria-labelledby={`${ids}-title`} className="relative overflow-hidden rounded-b-[28px] bg-forest pb-[26px] text-white">
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-[30px] left-1/2 h-[240px] w-[420px] -translate-x-1/2 bg-white opacity-[0.045] mask-[url(/images/brand/coliseum.svg)] mask-contain mask-center mask-no-repeat" />
      <div className="relative flex min-h-[54px] items-center gap-2.5 pt-1.5 pr-3 pl-[18px]">
        <ArenaMark className="h-[22px] w-[30px] text-mint" />
        <h1 id={`${ids}-title`} className="min-w-0 flex-1 text-[17px] text-white">Jogar</h1>
        <button type="button" className="inline-flex max-w-[55%] min-w-0 items-center gap-[5px] rounded-full border-0 bg-white/8 px-2.5 py-1.5 text-[10.5px] font-semibold text-white/80 hover:bg-white/12 focus-visible:outline-mint"
          aria-label={city ? `Cidade do perfil de ${sportLabel}: ${city.name}. Alterar em Suas modalidades` : `Definir a cidade do perfil de ${sportLabel}`}
          onClick={() => go('sports')}>
          <MapPin size={13} className="text-mint" aria-hidden="true" />
          <span className="truncate">{city ? city.name : 'Definir cidade'}</span>
        </button>
      </div>
      <Tabs variant="dark" items={sportTabs} value={sport} onChange={setSport} label="Modalidade" idPrefix={`${ids}-tab-`} controls={`${ids}-panel`}
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
        {timeMode && team && <PlateChips label="Formato" options={formatChips} value={format} onChange={setFormat} />}
        {sport === 'futebol' && mode === 'avulso' && <PlateChips label="Posição" options={positionChips} value={position} onChange={setPosition} />}
        {sport === 'corrida' && <PlateChips label="Distância" options={distanceChips} value={`${distance}`} onChange={value => setDistance(Number(value) as RunDistance)} />}
        <div className="flex min-h-11 items-center justify-center" aria-live="polite">
          {standings.loading && <p role="status" className="text-[11px] text-white/65">Carregando seu elo…</p>}
          {standings.error && <p role="alert" className="text-[11px] leading-[1.5] text-[#ffd0d7]">
            {standings.error} <Button variant="glass-link" className="inline min-h-0 p-0 align-baseline" onClick={standings.reload}>Tentar novamente</Button>
          </p>}
          {view && <TierLine view={view} />}
          {standings.data && timeMode && !team && <p className="max-w-[280px] text-[11.5px] leading-[1.5] text-white/75">Você ainda não representa um time.</p>}
        </div>
        <PlayButton verb={button.verb} caption={button.caption} label={button.label} disabled={!button.onClick} onClick={button.onClick} describedBy={noteId} />
        <p id={noteId} className="max-w-[290px] text-[10.5px] leading-[1.55] text-white/65" aria-live="polite">{note}</p>
      </div>
    </section>
    <OtherWays sport={sport} onTeams={() => go('teams')} />
  </div>
}
