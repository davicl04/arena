import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { ApiError } from '../api/client'
import type { City, Profile, UploadFile } from '../api/client'
import { closeTeam, createTeam, getTeam, removeCrest, updateTeam, uploadCrest } from '../api/teams'
import type { TeamCard, TeamInput } from '../api/teams'
import { TeamCrest } from '../components/arena/TeamCrest'
import { GroupLabel, TeamIdCard } from '../components/teams/TeamIdCard'
import { ActionSheet } from '../components/arena/ActionSheet'
import { DarkEyebrow, DarkScreen, DarkTopBar } from '../components/arena/TeamsPlate'
import { normalizeTeamName, TEAM_NAME_MAX, TEAM_NAME_MIN } from '../components/teams/teamView'
import type { TeamCardView } from '../components/teams/teamView'
import { ActionButton, CitySheet, ConfirmBox, Notice } from '../components/arena/controls'
import { LoadError } from '../components/arena/LoadError'
import { TeamTokenContext, onDark } from '../components/teams/ui'
import { loadPlaces } from '../hooks/useCities'
import { useSessionToken } from '../hooks/useSessionToken'
import { useSubmit } from '../hooks/useSubmit'
import type { ScreenProps } from '../navigation/screens'
import { colors } from '../theme'
import { teamInitials } from '../utils/teamInitials'
import { showTeams } from './teamsNavigation'
import { Icon } from '../components/Icon'

/** Brasão pendente: mantido, escolhido na galeria já recortado em 1:1 (enviado ao salvar) ou marcado para remover. */
type CrestChange = { kind: 'keep' } | { kind: 'upload'; file: UploadFile } | { kind: 'remove' }

/** Tipos de imagem aceitos pelo servidor para o brasão. */
const CREST_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const CREST_TYPE_ERROR = 'Use uma imagem JPEG, PNG ou WebP.'

/** Falha de um carregamento: a mensagem e a causa (para o `LoadError` reconhecer a falta de conexão). */
interface LoadFailure { message: string; cause: unknown }
const failure = (cause: unknown, fallback: string): LoadFailure => ({ message: cause instanceof Error && cause.message ? cause.message : fallback, cause })

const fieldLabel = { marginTop: 14, marginBottom: 6, color: 'rgba(255,255,255,0.56)', fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' } as const

/** Escudo tracejado da prévia antes de existir nome ou imagem (.escudo.ghost). */
function GhostCrest() {
  return <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
    <Svg width={52} height={57} viewBox="0 0 40 44">
      <Path d="M20 2 L37 8 V21 C37 31 29 38 20 42 C11 38 3 31 3 21 V8 Z" fill="none" stroke="rgba(255,255,255,0.33)" strokeWidth={1.4} strokeDasharray="3 3" />
    </Svg>
  </View>
}

/**
 * Criar e editar time (F2): tela escura com a carteirinha mudando ao vivo no topo; brasão opcional (escolher, trocar ou
 * remover, com o recorte quadrado do editor nativo da galeria), nome de 3 a 40 caracteres e cidade (do perfil de futebol,
 * com "Trocar"). Quem cria é o representante. Na edição, "Encerrar time" fica no fim, com confirmação.
 */
export default function TeamFormScreen({ user, navigation, onExpired, params }: ScreenProps<'team-form'>) {
  const teamId = params?.teamId
  const token = useSessionToken()
  const [data, setData] = useState<{ profiles: Profile[]; cities: City[] } | null>(null)
  const [dataError, setDataError] = useState<LoadFailure | null>(null)
  const [dataAttempt, setDataAttempt] = useState(0)
  const [team, setTeam] = useState<TeamCard | null>(null)
  const [loadError, setLoadError] = useState<LoadFailure | null>(null)
  const [teamAttempt, setTeamAttempt] = useState(0)
  const [name, setName] = useState('')
  const [cityId, setCityId] = useState<number | null>(null)
  const [crest, setCrest] = useState<CrestChange>({ kind: 'keep' })
  const [cropError, setCropError] = useState('')
  const [picking, setPicking] = useState(false)
  const [choosingCity, setChoosingCity] = useState(false)
  const [closing, setClosing] = useState(false)
  const [touched, setTouched] = useState(false)
  const pickLock = useRef(false)
  const cityTouched = useRef(false)
  const save = useSubmit(onExpired)
  const close = useSubmit(onExpired)
  const editingId = team?.id ?? teamId
  const editing = editingId !== undefined
  const profiles = data?.profiles ?? []
  const cities = data?.cities ?? []
  const football = profiles.find(profile => profile.sport === 'futebol')

  useEffect(() => {
    let alive = true
    loadPlaces().then(([nextProfiles, nextCities]) => { if (alive) { setData({ profiles: nextProfiles, cities: nextCities }); setDataError(null) } })
      .catch((cause: unknown) => {
        if (!alive) return
        if (cause instanceof ApiError && cause.status === 401) onExpired()
        setDataError(failure(cause, 'Não foi possível carregar as cidades.'))
      })
    return () => { alive = false }
  }, [dataAttempt, onExpired])
  useEffect(() => {
    if (!teamId) return
    let alive = true
    getTeam(teamId).then(value => { if (alive) { setTeam(value); setName(value.name); setCityId(value.city.id); setLoadError(null) } })
      .catch((cause: unknown) => {
        if (!alive) return
        if (cause instanceof ApiError && cause.status === 401) onExpired()
        setLoadError(failure(cause, 'Não foi possível carregar o time.'))
      })
    return () => { alive = false }
  }, [teamId, teamAttempt, onExpired])
  // Criar: a cidade do perfil de futebol vem sugerida, a menos que a pessoa já tenha escolhido outra.
  const footballCityId = football?.city_id ?? null
  useEffect(() => {
    if (!teamId && footballCityId !== null && !cityTouched.current) setCityId(footballCityId)
  }, [teamId, footballCityId])

  const normalized = normalizeTeamName(name)
  const nameValid = normalized.length >= TEAM_NAME_MIN && normalized.length <= TEAM_NAME_MAX
  const city = cities.find(item => item.id === cityId) ?? (team && team.city.id === cityId ? team.city : null)
  const crestPath = crest.kind === 'keep' ? team?.crest_url ?? null : null
  const preview = crest.kind === 'upload' ? crest.file.uri : ''
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

  async function chooseCrest() {
    if (pickLock.current || save.busy) return
    pickLock.current = true
    setPicking(true); setCropError('')
    try {
      // O seletor de fotos (expo-image-picker) só é carregado quando a pessoa escolhe o brasão.
      const { pickSquarePhoto } = await import('../components/PostComposer')
      const asset = await pickSquarePhoto()
      if (!asset) return
      const type = asset.mimeType ?? 'image/jpeg'
      if (!CREST_TYPES.includes(type)) { setCropError(CREST_TYPE_ERROR); return }
      setCrest({ kind: 'upload', file: { uri: asset.uri, name: asset.fileName ?? 'brasao.jpg', type, size: asset.fileSize } })
    } catch (cause) {
      // Validação do arquivo (tamanho, tipo) e falha do seletor ficam junto do campo do brasão.
      setCropError(cause instanceof Error && cause.message ? cause.message : 'Não foi possível abrir as fotos.')
    } finally { pickLock.current = false; setPicking(false) }
  }

  async function submit() {
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
        if (crest.kind === 'upload') saved = await uploadCrest(saved.id, crest.file)
        else if (crest.kind === 'remove') { await removeCrest(saved.id); saved = { ...saved, crest_url: null } }
      } catch (cause) {
        // O time já existe (ou foi salvo): a tela passa a editar esse time, com o brasão ainda pendente. Sem conexão, o aviso
        // de conexão cuida (a falha segue como está); nos demais casos o toast de erro explica o que foi salvo.
        if (cause instanceof ApiError && cause.isConnection) throw cause
        const reason = cause instanceof Error ? cause.message : 'Tente novamente.'
        throw new ApiError(`${teamId ? 'Dados salvos' : 'Time criado'}, mas o brasão não foi salvo: ${reason}`, cause instanceof ApiError ? cause.status : 500)
      }
      return saved
    }, teamId ? 'Não foi possível salvar o time.' : 'Não foi possível criar o time.')
    if (result) showTeams(navigation, result.id)
  }
  async function confirmClose() {
    if (!team) return
    const done = await close.run(async () => { await closeTeam(team.id); return true }, 'Não foi possível encerrar o time.')
    if (done) showTeams(navigation)
  }

  const topBar = <DarkTopBar eyebrow="Meus times" title={teamId ? 'Editar time' : 'Criar time'} icon="close" onBack={navigation.back} />
  if (teamId && !team) {
    return <DarkScreen>
      {topBar}
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        {loadError ? <LoadError size="screen" tone="dark" title="Não foi possível carregar o time" text={loadError.message} cause={loadError.cause} onRetry={() => { setLoadError(null); setTeamAttempt(n => n + 1) }} />
          : <Text accessibilityLiveRegion="polite" style={{ marginTop: 6, color: onDark.soft, fontSize: 12 }}>Carregando o time…</Text>}
      </View>
    </DarkScreen>
  }
  if (team && team.my_role !== 'representante') {
    return <DarkScreen>
      {topBar}
      <View style={{ paddingHorizontal: 16, paddingTop: 4 }}><Notice surface="dark" tone="error">Só representantes podem editar o time.</Notice></View>
    </DarkScreen>
  }

  return <TeamTokenContext.Provider value={token}>
    <DarkScreen>
      {topBar}
      <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 }}>
        <GroupLabel>Prévia da carteirinha</GroupLabel>
        <View accessible accessibilityRole="image" accessibilityLabel={`Prévia da carteirinha: ${view.name}, ${view.city.name}, você representa.`}>
          <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <TeamIdCard team={view} highlight crestPreview={preview} actions={<View style={{ borderRadius: 999, backgroundColor: 'rgba(143,224,180,0.15)', paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: colors.mint, fontSize: 9.5, fontWeight: '700' }}>Prévia</Text></View>} />
          </View>
        </View>

        <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, backgroundColor: onDark.card, padding: 12 }}>
          {hasCrest || normalized
            ? <TeamCrest name={view.name} initials={view.initials} path={crestPath} previewUri={preview || null} size="lg" decorative token={token} />
            : <GhostCrest />}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '800' }}>Brasão</Text>
            <Text style={{ marginTop: 2, marginBottom: 8, color: 'rgba(255,255,255,0.56)', fontSize: 10.5, lineHeight: 15 }}>Opcional. Sem imagem, usamos as iniciais.</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <ActionButton tone="mint" size="sm" icon="image-up" title={picking ? 'Abrindo…' : hasCrest ? 'Trocar imagem' : 'Enviar brasão'} accessibilityLabel={hasCrest ? 'Trocar imagem do brasão' : 'Enviar brasão'} accessibilityHint="Abre a galeria com recorte quadrado" disabled={save.busy || picking} onPress={() => void chooseCrest()} fit />
              {hasCrest ? <ActionButton size="sm" tone="line" icon="trash" title="Remover" accessibilityLabel="Remover brasão" disabled={save.busy} onPress={() => setCrest(team?.crest_url ? { kind: 'remove' } : { kind: 'keep' })} fit /> : null}
            </View>
            <Text style={{ marginTop: 6, color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>JPEG, PNG ou WebP · até 5 MiB · recorte quadrado</Text>
          </View>
        </View>
        {cropError ? <Notice surface="dark" tone="error">{cropError}</Notice> : null}

        <Text style={fieldLabel}>Nome do time</Text>
        <TextInput accessibilityLabel="Nome do time" accessibilityHint={`De ${TEAM_NAME_MIN} a ${TEAM_NAME_MAX} caracteres`} value={name} onChangeText={setName} onBlur={() => setTouched(true)} maxLength={TEAM_NAME_MAX} autoComplete="off" autoCorrect={false}
          placeholder="Ex.: Ferrugem FC" placeholderTextColor="rgba(255,255,255,0.38)" editable={!save.busy}
          style={{ minHeight: 48, borderRadius: 8, borderWidth: 1, borderColor: touched && !nameValid ? colors['danger-soft'] : 'rgba(255,255,255,0.18)', backgroundColor: onDark.card, paddingHorizontal: 12, color: '#ffffff', fontSize: 15 }} />
        <Text style={{ marginTop: 6, color: touched && !nameValid ? colors['danger-soft'] : 'rgba(255,255,255,0.56)', fontSize: 10.5 }}>{name.length}/{TEAM_NAME_MAX} · pelo menos {TEAM_NAME_MIN} letras</Text>

        <Text style={fieldLabel}>Cidade</Text>
        <View accessibilityLabel={city ? `Cidade: ${city.name}, ${city.state}` : 'Cidade ainda não escolhida'} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8, backgroundColor: onDark.card, paddingLeft: 12, paddingRight: 4 }}>
          <Icon name="map-pin" size={17} color={colors.mint} />
          <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: '#ffffff', fontSize: 13.5, fontWeight: '700' }}>{city ? `${city.name} · ${city.state}` : 'Escolha a cidade do time'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={city ? 'Trocar cidade' : 'Escolher cidade'} accessibilityState={{ disabled: !data }} disabled={!data} onPress={() => setChoosingCity(true)}
            style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 8, opacity: data ? 1 : 0.5 }}>
            <Text style={{ color: colors.mint, fontSize: 12, fontWeight: '700' }}>{city ? 'Trocar' : 'Escolher'}</Text>
          </Pressable>
        </View>
        {dataError ? <LoadError size="section" tone="dark" title="Não foi possível carregar as cidades" text={dataError.message} cause={dataError.cause} onRetry={() => { setDataError(null); setDataAttempt(n => n + 1) }} /> : null}
        <Text style={{ marginTop: 6, color: 'rgba(255,255,255,0.56)', fontSize: 10.5, lineHeight: 15 }}>
          {!editing && football && cityId === football.city_id ? 'Vem do seu perfil de futebol. ' : ''}O pareamento usa a cidade do time.
        </Text>

        {!editing ? <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <View style={{ marginTop: 1 }}><Icon name="info" size={15} color={colors.mint} /></View>
          <Text style={{ flex: 1, color: onDark.soft, fontSize: 11, lineHeight: 17 }}>Você será o representante (braçadeira C). O time joga futsal, society e campo, com elo separado por formato.</Text>
        </View> : null}

        {save.error ? <Notice surface="dark" tone="error">{save.error}</Notice> : null}
        <Text accessibilityLiveRegion="polite" style={save.busy ? { marginTop: 8, color: onDark.soft, fontSize: 11.5 } : { height: 0 }}>{save.busy ? (editing ? 'Salvando o time…' : 'Criando o time…') : ''}</Text>
        <View style={{ marginTop: 16 }}>
          <ActionButton tone="mint" block icon="shield-check" disabled={!canSubmit} onPress={() => void submit()} title={save.busy ? (editing ? 'Salvando…' : 'Criando…') : editing ? 'Salvar alterações' : 'Criar time'} />
        </View>

        {teamId && team ? <View style={{ marginTop: 32, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 16 }}>
          <DarkEyebrow>Encerrar time</DarkEyebrow>
          <Text style={{ marginTop: 4, color: 'rgba(255,255,255,0.56)', fontSize: 11, lineHeight: 17 }}>O time sai de Meus times, da busca e do link. O histórico de partidas e o ranking continuam registrados.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Encerrar time" onPress={() => setClosing(true)} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: colors['danger-soft'], fontSize: 12.5, fontWeight: '700' }}>Encerrar time</Text>
          </Pressable>
        </View> : null}
      </ScrollView>

      {choosingCity ? <CitySheet title="Cidade do time" description="O pareamento de partidas usa a cidade do time." cities={cities} selectedId={cityId} onClose={() => setChoosingCity(false)} onSelect={item => { cityTouched.current = true; setCityId(item.id); setChoosingCity(false) }} /> : null}
      {closing && team ? <ActionSheet title={`Encerrar ${team.name}`} locked={close.busy} onClose={() => setClosing(false)}>
        <ConfirmBox title={`Encerrar o ${team.name}?`} confirmLabel="Encerrar time" busy={close.busy} onConfirm={() => void confirmClose()} onCancel={() => setClosing(false)}>
          Os {team.member_count} {team.member_count === 1 ? 'atleta deixa' : 'atletas deixam'} o elenco e são avisados; convites, pedidos e o link deixam de valer.
          O histórico de partidas e o ranking continuam registrados. Não dá para desfazer.
        </ConfirmBox>
      </ActionSheet> : null}
    </DarkScreen>
  </TeamTokenContext.Provider>
}
