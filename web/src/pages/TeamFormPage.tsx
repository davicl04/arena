import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ImageUp, Info, MapPin, ShieldCheck, Trash2 } from 'lucide-react'
import type { Area } from 'react-easy-crop'
import type { City, Profile, User } from '@/api/client'
import { ApiError } from '@/api/client'
import { closeTeam, createTeam, getTeam, removeCrest, updateTeam, uploadCrest } from '@/api/teams'
import type { TeamCard, TeamInput } from '@/api/teams'
import ImageCropSheet from '@/components/ImageCropSheet'
import { TeamCrest } from '@/components/arena/TeamCrest'
import { CitySheet } from '@/components/teams/CitySheet'
import { ConfirmBox } from '@/components/teams/ConfirmBox'
import { darkEyebrow, darkNotice, groupLabel, teamButton } from '@/components/teams/styles'
import { MintBadge, TeamIdCard } from '@/components/teams/TeamIdCard'
import { DarkTopBar } from '@/components/teams/TeamsPlate'
import { normalizeTeamName, TEAM_NAME_MAX, TEAM_NAME_MIN } from '@/components/teams/teamView'
import type { TeamCardView } from '@/components/teams/teamView'
import { Button } from '@/components/ui/button'
import { feedbackVariants } from '@/components/ui/feedback'
import { Sheet } from '@/components/ui/sheet'
import { useSubmit } from '@/hooks/useSubmit'
import { cn } from '@/lib/utils'
import { cropImage, validateImageFile } from '@/utils/cropImage'
import { teamInitials } from '@/utils/teamInitials'

/** Brasão pendente: mantido, recortado para enviar ou marcado para remover (aplicado ao salvar). */
type CrestChange = { kind: 'keep' } | { kind: 'upload'; blob: Blob; url: string } | { kind: 'remove' }

const fieldLabel = 'mt-3.5 mb-1.5 block text-[10.5px] font-bold tracking-[0.06em] text-white/56 uppercase'
const darkInput = 'min-h-[46px] rounded-control border-white/18 bg-white/5 text-[14px] text-white placeholder:text-white/38 focus-visible:outline-mint'

/** Escudo tracejado da prévia antes de existir nome ou imagem (.escudo.ghost). */
function GhostCrest() {
  return <svg viewBox="0 0 40 44" className="h-[57px] w-[52px] flex-none text-white/33" aria-hidden="true">
    <path d="M20 2 L37 8 V21 C37 31 29 38 20 42 C11 38 3 31 3 21 V8 Z" fill="none" stroke="currentColor" strokeWidth={1.4} strokeDasharray="3 3" />
  </svg>
}

/**
 * Criar e editar time (F2): tela escura com a carteirinha mudando ao vivo no topo; brasão opcional (enviar, trocar ou
 * remover, com recorte quadrado), nome de 3 a 40 caracteres e cidade (do perfil de futebol, com "Trocar"). Quem cria
 * é o representante. Na edição, "Encerrar time" fica no fim, com confirmação.
 */
export default function TeamFormPage({ teamId, user, profiles, cities, onDone, onClosed, onBack, onExpired }: {
  /** Ausente: criar time. */
  teamId?: number
  user: User
  profiles: Profile[]
  cities: City[]
  /** Time criado ou salvo: volta a Meus times com ele no carrossel. */
  onDone: (team: TeamCard) => void
  /** Time encerrado. */
  onClosed: (team: TeamCard) => void
  onBack: () => void
  onExpired: () => void
}) {
  const football = profiles.find(profile => profile.sport === 'futebol')
  const [team, setTeam] = useState<TeamCard | null>(null)
  const [loadError, setLoadError] = useState('')
  const [name, setName] = useState('')
  const [cityId, setCityId] = useState<number | null>(teamId ? null : football?.city_id ?? null)
  const [crest, setCrest] = useState<CrestChange>({ kind: 'keep' })
  const [source, setSource] = useState('')
  const [cropError, setCropError] = useState('')
  const [cropping, setCropping] = useState(false)
  const [picking, setPicking] = useState(false)
  const [closing, setClosing] = useState(false)
  const [touched, setTouched] = useState(false)
  const save = useSubmit(onExpired)
  const close = useSubmit(onExpired)
  const editingId = team?.id ?? teamId
  const editing = editingId !== undefined

  useEffect(() => {
    if (!teamId) return
    let alive = true
    getTeam(teamId).then(value => { if (alive) { setTeam(value); setName(value.name); setCityId(value.city.id) } })
      .catch((cause: unknown) => {
        if (!alive) return
        if (cause instanceof ApiError && cause.status === 401) onExpired()
        setLoadError(cause instanceof Error ? cause.message : 'Não foi possível carregar o time.')
      })
    return () => { alive = false }
  }, [teamId, onExpired])
  // Libera as prévias locais (arquivo escolhido e recorte) quando trocam ou ao sair da tela.
  useEffect(() => () => { if (source) URL.revokeObjectURL(source) }, [source])
  const preview = crest.kind === 'upload' ? crest.url : ''
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const normalized = normalizeTeamName(name)
  const nameValid = normalized.length >= TEAM_NAME_MIN && normalized.length <= TEAM_NAME_MAX
  const city = cities.find(item => item.id === cityId) ?? (team && team.city.id === cityId ? team.city : null)
  const crestPath = crest.kind === 'keep' ? team?.crest_url ?? null : null
  const hasCrest = crest.kind === 'upload' || Boolean(crestPath)
  const changed = !team || normalized !== team.name || cityId !== team.city.id || crest.kind !== 'keep'
  const canSubmit = nameValid && city !== null && changed && !save.busy && (!teamId || team !== null)

  const view: TeamCardView = {
    name: normalized || 'Seu time',
    initials: teamInitials(normalized),
    city: city ?? { id: 0, name: 'Cidade a definir', state: '' },
    crest_url: crestPath,
    my_role: 'representante',
    member_count: team?.member_count ?? 1,
    roster_preview: team?.roster_preview ?? [{ user_id: user.id, first_name: user.name.trim().split(/\s+/)[0], avatar_url: user.avatar?.url ?? null, position: football?.position ?? null, is_representative: true }],
    formats: team?.formats ?? [],
  }

  function choose(file?: File) {
    setCropError('')
    if (!file) return
    const invalid = validateImageFile(file)
    if (invalid) { setCropError(invalid); return }
    setSource(URL.createObjectURL(file))
  }
  async function crop(area: Area) {
    setCropping(true); setCropError('')
    try {
      const blob = await cropImage(source, area, { maxWidth: 512, maxHeight: 512, quality: 0.9 })
      setCrest({ kind: 'upload', blob, url: URL.createObjectURL(blob) })
      setSource('')
    } catch (cause) {
      setCropError(cause instanceof Error ? cause.message : 'Não foi possível preparar o recorte.')
    } finally { setCropping(false) }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setTouched(true)
    if (!canSubmit || city === null) return
    let saved: TeamCard | null = team
    const result = await save.run(async () => {
      if (!saved) {
        saved = await createTeam({ name: normalized, city_id: city.id })
        setTeam(saved)
      } else {
        const changes: Partial<TeamInput> = {}
        if (normalized !== saved.name) changes.name = normalized
        if (city.id !== saved.city.id) changes.city_id = city.id
        if (Object.keys(changes).length) { saved = await updateTeam(saved.id, changes); setTeam(saved) }
      }
      try {
        if (crest.kind === 'upload') saved = await uploadCrest(saved.id, crest.blob)
        else if (crest.kind === 'remove') { await removeCrest(saved.id); saved = { ...saved, crest_url: null } }
      } catch (cause) {
        // O time já existe (ou foi salvo): a tela passa a editar esse time, com o brasão ainda pendente.
        const reason = cause instanceof Error ? cause.message : 'Tente novamente.'
        throw new ApiError(`${teamId ? 'Dados salvos' : 'Time criado'}, mas o brasão não foi salvo: ${reason}`, cause instanceof ApiError ? cause.status : 0)
      }
      return saved
    }, teamId ? 'Não foi possível salvar o time.' : 'Não foi possível criar o time.')
    if (result) onDone(result)
  }
  async function confirmClose() {
    if (!team) return
    const done = await close.run(async () => { await closeTeam(team.id); return true }, 'Não foi possível encerrar o time.')
    if (done) onClosed(team)
  }

  const title = editing ? 'Editar time' : 'Criar time'
  if (teamId && !team) {
    return <div className="min-h-full text-white">
      <DarkTopBar eyebrow="Meus times" title={title} onBack={onBack} icon="close" />
      <div className="px-4 pt-3">
        {loadError ? <p className={darkNotice({ tone: 'error' })} role="alert">{loadError}</p>
          : <p role="status" className="text-[12px] text-white/66">Carregando o time…</p>}
      </div>
    </div>
  }
  if (team && team.my_role !== 'representante') {
    return <div className="min-h-full text-white">
      <DarkTopBar eyebrow="Meus times" title={title} onBack={onBack} icon="close" />
      <p className={cn(darkNotice({ tone: 'error' }), 'mx-4')} role="alert">Só representantes podem editar o time.</p>
    </div>
  }

  return <div className="min-h-full text-white">
    <DarkTopBar eyebrow="Meus times" title={title} onBack={onBack} icon="close" />
    <form className="px-4 pb-4" onSubmit={event => void submit(event)} noValidate>
      <p className={cn(groupLabel, 'mt-[18px] mb-2 text-mint')} id="team-preview-label">Prévia da carteirinha</p>
      <div role="img" aria-labelledby="team-preview-label" aria-describedby="team-preview-text">
        <span id="team-preview-text" className="sr-only">{view.name}, {view.city.name}, você representa.</span>
        <div aria-hidden="true"><TeamIdCard team={view} highlight crestPreview={preview} actions={<MintBadge>Prévia</MintBadge>} /></div>
      </div>

      <div className="mt-3.5 flex items-center gap-3.5 rounded-card bg-white/5 p-3">
        {hasCrest || normalized ? <TeamCrest name={view.name} initials={view.initials} path={crestPath} previewSrc={preview} size="lg" decorative /> : <GhostCrest />}
        <div className="min-w-0 flex-1 text-[12.5px]">
          <b className="block">Brasão</b>
          <small className="mt-0.5 mb-2 text-[10.5px] text-white/56">Opcional. Sem imagem, usamos as iniciais.</small>
          <div className="flex flex-wrap gap-2 *:flex-[1_1_auto]">
            <label htmlFor="team-crest-file" className={cn(teamButton(), 'm-0 cursor-pointer has-[+input:focus-visible]:outline-3 has-[+input:focus-visible]:outline-offset-3 has-[+input:focus-visible]:outline-mint')}>
              <ImageUp aria-hidden="true" />{hasCrest ? 'Trocar imagem' : 'Enviar brasão'}
            </label>
            <input id="team-crest-file" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={save.busy}
              onChange={event => { choose(event.target.files?.[0]); event.target.value = '' }} />
            {hasCrest && <button type="button" className={teamButton({ tone: 'line' })} disabled={save.busy}
              onClick={() => setCrest(team?.crest_url ? { kind: 'remove' } : { kind: 'keep' })}><Trash2 aria-hidden="true" />Remover</button>}
          </div>
          <small className="mt-1.5 text-[10px] text-white/45">JPEG, PNG ou WebP · até 5 MiB · recorte quadrado</small>
        </div>
      </div>
      {cropError && !source && <p className={darkNotice({ tone: 'error' })} role="alert">{cropError}</p>}

      <label htmlFor="team-name" className={fieldLabel}>Nome do time</label>
      <input id="team-name" className={darkInput} value={name} maxLength={TEAM_NAME_MAX} autoComplete="off" placeholder="Ex.: Ferrugem FC"
        aria-describedby="team-name-hint" aria-invalid={touched && !nameValid} onChange={event => setName(event.target.value)} onBlur={() => setTouched(true)} />
      <small id="team-name-hint" className={cn('mt-1.5 text-[10.5px]', touched && !nameValid ? 'text-danger-soft' : 'text-white/56')}>
        {name.length}/{TEAM_NAME_MAX} · pelo menos {TEAM_NAME_MIN} letras
      </small>

      <span className={fieldLabel} id="team-city-label">Cidade</span>
      <div role="group" aria-labelledby="team-city-label" className="flex min-h-[46px] items-center gap-2 rounded-control bg-white/5 py-1 pr-1.5 pl-3 text-[13px]">
        <MapPin size={17} className="text-mint" aria-hidden="true" />
        <b className="min-w-0 flex-1 truncate">{city ? `${city.name} · ${city.state}` : 'Escolha a cidade do time'}</b>
        <button type="button" className="min-h-9 border-0 bg-transparent px-1.5 text-[11px] font-bold text-mint" onClick={() => setPicking(true)}
          aria-label={city ? 'Trocar cidade' : 'Escolher cidade'}>{city ? 'Trocar' : 'Escolher'}</button>
      </div>
      <small className="mt-1.5 text-[10.5px] text-white/56">
        {!editing && football && cityId === football.city_id ? 'Vem do seu perfil de futebol. ' : ''}O pareamento usa a cidade do time.
      </small>

      {!editing && <p className="mt-3.5 flex items-start gap-2 text-[11px] leading-[1.5] text-white/66">
        <Info size={15} className="mt-px flex-none text-mint" aria-hidden="true" />
        Você será o representante (braçadeira C). O time joga futsal, society e campo, com elo separado por formato.
      </p>}

      {save.error && <p className={darkNotice({ tone: 'error' })} role="alert">{save.error}</p>}
      <p role="status" aria-live="polite" className="sr-only">{save.busy ? (editing ? 'Salvando o time…' : 'Criando o time…') : ''}</p>
      <button type="submit" className={cn(teamButton({ size: 'block' }), 'mt-4')} disabled={!canSubmit}>
        <ShieldCheck aria-hidden="true" />{save.busy ? (editing ? 'Salvando…' : 'Criando…') : editing ? 'Salvar alterações' : 'Criar time'}
      </button>

      {teamId && team && <div className="mt-8 border-0 border-t border-solid border-white/10 pt-4">
        <p className={darkEyebrow}>Encerrar time</p>
        <p className="mt-1 text-[11px] leading-[1.5] text-white/56">O time sai de Meus times, da busca e do link. O histórico de partidas e o ranking continuam registrados.</p>
        <Button type="button" variant="glass-link" className="text-danger-soft" onClick={() => setClosing(true)}>Encerrar time</Button>
      </div>}
    </form>

    {source && <ImageCropSheet source={source} title="Ajustar brasão" description="Arraste a imagem e ajuste o zoom para escolher o recorte quadrado." aspect={1}
      confirmLabel="Usar imagem" busy={cropping} error={cropError} onCancel={() => { setSource(''); setCropError('') }} onConfirm={area => void crop(area)} />}
    {picking && <CitySheet cities={cities} selectedId={cityId} onClose={() => setPicking(false)} onSelect={item => { setCityId(item.id); setPicking(false) }} />}
    {closing && team && <Sheet title={`Encerrar ${team.name}`} onClose={() => { if (!close.busy) setClosing(false) }}>
      <ConfirmBox confirmLabel="Encerrar time" busy={close.busy} onConfirm={() => void confirmClose()} onCancel={() => setClosing(false)}>
        <b>Encerrar o {team.name}?</b><br />Os {team.member_count} {team.member_count === 1 ? 'atleta deixa' : 'atletas deixam'} o elenco e são avisados; convites, pedidos e o link deixam de valer.
        O histórico de partidas e o ranking continuam registrados. Não dá para desfazer.
      </ConfirmBox>
      {close.error && <p className={feedbackVariants()} role="alert">{close.error}</p>}
    </Sheet>}
  </div>
}
