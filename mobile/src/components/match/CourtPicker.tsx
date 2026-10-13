import { useEffect, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { ApiError } from '../../api/client'
import { connection } from '../../api/connection'
import { listCourts, suggestCourt } from '../../api/matches'
import type { CourtOut, MatchDetail } from '../../api/matches'
import { courtKindOf } from '../../data/match'
import { reportActionError } from '../../hooks/useSubmit'
import { colors } from '../../theme'
import { ActionButton, BusyStatus, ErrorText, FormField } from '../arena/controls'
import { LoadError } from '../arena/LoadError'
import { toast } from '../toast/toastStore'
import { Icon } from '../Icon'
import { DEFERRED_COURT_ID } from './termsRules'

/*
 * Quadra da proposta (RN07): busca no catálogo da cidade (`GET /courts`, com as sugestões em revisão desta partida
 * primeiro) ou "Sugerir outra quadra" (nome e endereço), que fica "em revisão" e vale só nesta partida.
 * O catálogo começa vazio: sem quadras publicadas, a sugestão é o caminho. A sugestão enviada (ou a existente que foi
 * escolhida) é confirmada em toast; a lista que não carregou é um `LoadError`; só a validação do nome e a recusa de campo
 * do servidor ficam no formulário da sugestão.
 *
 * Peça compartilhada: a folha "Propor condições" (amistoso) e a agenda do campeonato (organizador) usam este mesmo seletor.
 */

const SEARCH_DELAY_MS = 300
export { DEFERRED_COURT_ID }

/** O que o seletor lê da partida: o id (para as sugestões em revisão dela), a cidade e o tipo de quadra (esporte e formato). */
export type CourtPickerMatch = Pick<MatchDetail, 'id' | 'city' | 'sport' | 'format'>

export interface CourtPickerProps {
  /** A partida (ou, no campeonato, o recorte que a lista de partidas tem): a cidade e o tipo de quadra. */
  detail: CourtPickerMatch
  selected: CourtOut | null
  onSelect: (court: CourtOut) => void
  /** Mostra "Sugerir outra quadra" (`permissions.suggest_court`; o organizador sempre pode). */
  canSuggest: boolean
  onExpired: () => void
  /**
   * Campeonato: o organizador não usa `POST /courts/suggestions` (só os representantes); a sugestão vira uma quadra
   * provisória (`id` = `DEFERRED_COURT_ID`, 0) e segue no corpo do agendamento (`court_suggestion`).
   */
  deferSuggestion?: boolean
}

function CourtOption({ court, selected, onSelect }: { court: CourtOut; selected: boolean; onSelect: () => void }) {
  const note = court.provisional ? 'Em revisão · usada só nesta partida' : (court.address ?? 'Sem endereço informado')
  return <Pressable accessibilityRole="radio" accessibilityLabel={`${court.name}. ${note}`} accessibilityState={{ checked: selected, selected }} onPress={onSelect}
    style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 13, borderWidth: selected ? 1.5 : 1, borderColor: selected ? colors.brand : colors.line, backgroundColor: selected ? colors['success-bg'] : '#ffffff', paddingHorizontal: 10, paddingVertical: 8 }}>
    <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tile }}><Icon name="map-pin" size={16} color={colors.brand} /></View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 12.5, fontWeight: '700' }}>{court.name}</Text>
      <Text numberOfLines={1} style={{ color: colors['ink-muted'], fontSize: 10.5 }}>{note}</Text>
    </View>
    {court.provisional ? <Text style={{ borderRadius: 999, overflow: 'hidden', backgroundColor: colors['warning-bg'], color: colors.warning, paddingHorizontal: 8, paddingVertical: 3, fontSize: 9.5, fontWeight: '800' }}>Sugestão em revisão</Text> : null}
  </Pressable>
}

export function CourtPicker({ detail, selected, onSelect, canSuggest, onExpired, deferSuggestion = false }: CourtPickerProps) {
  const kind = courtKindOf(detail)
  const [query, setQuery] = useState('')
  const [courts, setCourts] = useState<CourtOut[] | null>(null)
  const [failure, setFailure] = useState('')
  const [failureCause, setFailureCause] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)
  const [suggesting, setSuggesting] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [suggestError, setSuggestError] = useState('')

  useEffect(() => {
    let alive = true
    const timer = setTimeout(() => {
      listCourts({ cityId: detail.city.id, kind, q: query, matchId: detail.id }).then(page => {
        if (!alive) return
        setCourts(page.items)
        setFailure('')
        setFailureCause(null)
      }).catch((cause: unknown) => {
        if (!alive) return
        if (cause instanceof ApiError && cause.status === 401) onExpired()
        setFailure(cause instanceof Error && cause.message ? cause.message : 'Não foi possível carregar as quadras.')
        setFailureCause(cause)
        setCourts([])
      })
    }, query ? SEARCH_DELAY_MS : 0)
    return () => { alive = false; clearTimeout(timer) }
  }, [detail.city.id, detail.id, kind, query, onExpired, attempt])

  /* Se a lista falhou por conexão, lê de novo uma única vez quando ela volta (como `useResource`). */
  const connectionFailure = failureCause instanceof ApiError && failureCause.isConnection
  useEffect(() => {
    if (!connectionFailure) return
    return connection.onRestored(() => setAttempt(count => count + 1))
  }, [connectionFailure])

  function retry() {
    setFailure('')
    setFailureCause(null)
    setCourts(null)
    setAttempt(count => count + 1)
  }

  function finishSuggestion() {
    setSuggesting(false)
    setName('')
    setAddress('')
  }

  async function suggest() {
    if (busy) return
    const cleanName = name.trim()
    if (cleanName.length < 2 || cleanName.length > 80) {
      setSuggestError('O nome da quadra precisa ter de 2 a 80 caracteres.')
      return
    }
    if (deferSuggestion) {
      setSuggestError('')
      onSelect({ id: DEFERRED_COURT_ID, name: cleanName, address: address.trim() || null, kind: kind ?? 'society', city: detail.city, state: 'em_revisao', provisional: true })
      toast.info(`${cleanName} será sugerida ao agendar: fica em revisão e vale só nesta partida.`)
      finishSuggestion()
      return
    }
    setBusy(true)
    setSuggestError('')
    try {
      const result = await suggestCourt({ match_id: detail.id, name: cleanName, address: address.trim() || null })
      onSelect(result.court)
      if (result.existing) toast.info(`${result.court.name} já estava no catálogo ou nesta partida e foi selecionada.`)
      else toast.warning(`${result.court.name} foi sugerida.`, { description: 'Fica em revisão e vale só nesta partida até a aprovação da administração.' })
      finishSuggestion()
      setCourts(old => (old && !old.some(item => item.id === result.court.id) ? [result.court, ...old] : old))
    } catch (cause) {
      const report = reportActionError(cause, 'Não foi possível sugerir a quadra.', onExpired)
      if (report.kind === 'form') setSuggestError(report.message)
    } finally {
      setBusy(false)
    }
  }

  const list = courts ?? []
  const rest = selected ? list.filter(court => court.id !== selected.id) : list
  return <View testID="court-picker" style={{ marginTop: 14 }}>
    <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '600' }}>Quadra em {detail.city.name}</Text>
    <View accessibilityRole="radiogroup" accessibilityLabel={`Quadra em ${detail.city.name}`} style={{ marginTop: 6, gap: 6 }}>
      <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8, borderWidth: 1, borderColor: colors['line-strong'], backgroundColor: '#ffffff', paddingHorizontal: 12 }}>
        <Icon name="search" size={16} color={colors['ink-muted']} />
        <TextInput accessibilityLabel="Buscar quadra" value={query} onChangeText={setQuery} placeholder="Buscar quadra pelo nome" placeholderTextColor={colors.placeholder}
          autoCapitalize="none" autoCorrect={false} returnKeyType="search" style={{ flex: 1, minHeight: 46, padding: 0, color: colors.ink, fontSize: 14 }} />
      </View>
      {selected ? <CourtOption court={selected} selected onSelect={() => onSelect(selected)} /> : null}
      {courts === null ? <Text accessibilityLiveRegion="polite" style={{ color: colors['ink-muted'], fontSize: 11 }}>Buscando quadras…</Text> : null}
      {failure ? <LoadError size="section" title="Não foi possível carregar as quadras" text={failure} cause={failureCause} onRetry={retry} /> : null}
      {rest.map(court => <CourtOption key={court.id} court={court} selected={false} onSelect={() => onSelect(court)} />)}
      {courts !== null && !failure && rest.length === 0 && !selected
        ? <Text style={{ color: colors['ink-muted'], fontSize: 11.5, lineHeight: 17 }}>
          {query.trim() ? `Nenhuma quadra de ${detail.city.name} para “${query.trim()}”.` : `Ainda não há quadras publicadas em ${detail.city.name}.`}
          {canSuggest ? ' Sugira a quadra onde vocês vão jogar.' : ''}
        </Text> : null}
    </View>
    {canSuggest && !suggesting
      ? <Pressable accessibilityRole="button" accessibilityLabel="Sugerir outra quadra" accessibilityHint="Entra no catálogo depois da revisão" onPress={() => setSuggesting(true)}
        style={{ marginTop: 8, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 13, borderWidth: 1, borderStyle: 'dashed', borderColor: colors['line-strong'], backgroundColor: '#ffffff', paddingHorizontal: 10 }}>
        <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tile }}><Icon name="plus" size={16} color={colors.brand} /></View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '700' }}>Sugerir outra quadra</Text>
          <Text style={{ color: colors['ink-muted'], fontSize: 10.5 }}>Entra no catálogo depois da revisão</Text>
        </View>
      </Pressable> : null}
    {suggesting
      ? <View accessibilityLabel="Sugerir outra quadra" style={{ marginTop: 8, borderRadius: 13, borderWidth: 1, borderStyle: 'dashed', borderColor: colors['line-strong'], padding: 12 }}>
        <FormField label="Nome da quadra" value={name} onChangeText={setName} maxLength={80} placeholder="Ex.: Arena Sudoeste" editable={!busy} />
        <FormField label="Endereço (opcional)" value={address} onChangeText={setAddress} maxLength={160} placeholder="Rua, número e bairro" editable={!busy} />
        <Text style={{ marginTop: 6, color: colors['ink-muted'], fontSize: 10.5, lineHeight: 16 }}>A administração revisa a sugestão. Até lá, ela vale só para esta partida.</Text>
        {suggestError ? <ErrorText>{suggestError}</ErrorText> : null}
        <BusyStatus text={busy ? 'Enviando a sugestão da quadra…' : ''} />
        <View style={{ marginTop: 12, flexDirection: 'row', gap: 8 }}>
          <ActionButton tone="outline" title="Voltar" accessibilityLabel="Voltar da sugestão de quadra" grow disabled={busy} onPress={() => { setSuggesting(false); setSuggestError('') }} />
          <ActionButton tone="brand" title={busy ? 'Enviando…' : 'Sugerir quadra'} accessibilityLabel="Sugerir quadra" grow busy={busy} onPress={() => void suggest()} />
        </View>
      </View> : null}
  </View>
}
