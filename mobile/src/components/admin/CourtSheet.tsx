import { useCallback, useState } from 'react'
import { Text, View } from 'react-native'
import { COURT_LIMITS, courtKindLabel, courtPublishError, courtRejectError, decideCourt } from '../../api/admin'
import type { AdminCourtSuggestion, CourtDecisionInput, MatchRef } from '../../api/admin'
import { ApiError } from '../../api/client'
import { getMatch } from '../../api/matches'
import type { CourtOut } from '../../api/matches'
import { footballFormat } from '../../data/arena'
import { useResource } from '../../hooks/useResource'
import { useSubmit } from '../../hooks/useSubmit'
import { useResolvedTheme, useThemeColors } from '../../hooks/useTheme'
import { formatDeadline } from '../../utils/format'
import { relativeTime } from '../../utils/relativeTime'
import { ActionButton, BusyStatus, ErrorText, FormField } from '../arena/controls'
import { Icon } from '../Icon'
import { ReasonPanel } from '../review/ReasonPanel'
import { ActionRow, InfoGrid } from '../review/ui'
import Sheet from '../Sheet'
import { matchTitle } from './adminMatchView'

const place = (court: CourtOut) => `${court.city.name} · ${court.city.state}`

/** "Partida #12 · Society · seg, 20 out · 16:00". */
function originText(match: MatchRef) {
  const format = match.format ? footballFormat[match.format].label : 'Tênis'
  const when = formatDeadline(match.starts_at)
  return `Partida #${match.id} · ${format}${when ? ` · ${when}` : ''}`
}

/** Partida de origem: os dados do `MatchRef` e, se a leitura da partida responder, os nomes dos lados. */
function OriginMatch({ match, onExpired }: { match: MatchRef; onExpired: () => void }) {
  const colors = useThemeColors()
  const load = useCallback(() => getMatch(match.id), [match.id])
  const sides = useResource(load, onExpired, { fallback: '' })
  return <View>
    {sides.data ? <Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '600' }}>{matchTitle(sides.data.sides)}</Text> : null}
    <Text style={{ color: colors['ink-muted'], fontSize: 12, fontWeight: '500' }}>{originText(match)}</Text>
  </View>
}

/** Aviso de possível duplicidade: quadras publicadas parecidas na mesma cidade e tipo. */
function DuplicateWarning({ duplicates }: { duplicates: CourtOut[] }) {
  const colors = useThemeColors()
  return <View accessibilityLabel="Possível duplicidade" style={{ marginTop: 12, borderRadius: 12, backgroundColor: colors['warning-bg'], padding: 12 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Icon name="triangle-alert" size={16} color={colors.warning} /></View>
      <Text accessibilityRole="header" style={{ color: colors.warning, fontSize: 12, fontWeight: '700' }}>Possível duplicidade</Text>
    </View>
    <Text style={{ marginTop: 4, color: colors.warning, fontSize: 11.5, lineHeight: 17 }}>Já há quadras parecidas publicadas nesta cidade. Se for o mesmo lugar, rejeite apontando a quadra do catálogo.</Text>
    <View style={{ marginTop: 6, gap: 4 }}>
      {duplicates.map(court => <Text key={court.id} selectable style={{ color: colors.warning, fontSize: 11.5, fontWeight: '600' }}>{court.name}{court.address ? ` · ${court.address}` : ''}</Text>)}
    </View>
  </View>
}

/** Valor da escolha "Não é duplicada" do motivo da recusa. */
const NO_DUPLICATE = 'nenhuma'

/**
 * Folha da sugestão de quadra: dados, aviso de duplicidade e a decisão. Publicar (com a correção opcional de nome e
 * endereço) ou rejeitar com motivo, ou apontando a quadra duplicada do catálogo (o motivo passa a ser opcional). Uma
 * sugestão já decidida em outro lugar (404 ou 409 "já foi decidida") fecha a folha e avisa a fila por `onStale`.
 */
export function CourtSheet({ item, onClose, onDecided, onStale, onExpired }: {
  item: AdminCourtSuggestion
  onClose: () => void
  onDecided: (message: string) => void
  /** A sugestão já foi decidida em outro lugar (409/404): a fila recarrega e a folha fecha. */
  onStale: (message: string) => void
  onExpired: () => void
}) {
  const colors = useThemeColors()
  const dark = useResolvedTheme() === 'dark'
  const { court, suggested_by: by, origin_match: origin, possible_duplicates: duplicates } = item
  const [mode, setMode] = useState<'publish' | 'reject' | null>(null)
  const [name, setName] = useState(court.name)
  const [address, setAddress] = useState(court.address ?? '')
  const [duplicateId, setDuplicateId] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [attempted, setAttempted] = useState(false)
  const { busy, error, setError, run } = useSubmit(onExpired)
  const publishProblems = attempted ? courtPublishError(name, address) : {}
  const rejectProblem = attempted ? courtRejectError(reason, duplicateId !== null) : null
  const chosen = duplicates.find(other => other.id === duplicateId)

  async function decide(input: CourtDecisionInput, fallback: string) {
    let stale = ''
    const decided = await run(async () => {
      try { return await decideCourt(court.id, input) } catch (cause) {
        // 404 e "já foi decidida" são sugestão fora da fila; o 409 de nome repetido fica na folha (rejeitar como duplicada).
        if (cause instanceof ApiError && (cause.status === 404 || (cause.status === 409 && /já foi decidida/i.test(cause.message)))) stale = cause.message
        throw cause
      }
    }, fallback)
    if (!decided && stale) onStale(stale)
    return decided
  }
  async function publish() {
    setAttempted(true)
    if (Object.keys(courtPublishError(name, address)).length) return
    const input: CourtDecisionInput = { decision: 'publicar' }
    if (name.trim() !== court.name) input.name = name.trim()
    if (address.trim() !== (court.address ?? '')) input.address = address.trim() || null
    const decided = await decide(input, 'Não foi possível publicar a quadra.')
    if (decided) onDecided(`${decided.court.name} entrou no catálogo de ${decided.court.city.name}.`)
  }
  async function reject() {
    setAttempted(true)
    if (courtRejectError(reason, duplicateId !== null)) return
    const input: CourtDecisionInput = { decision: 'rejeitar' }
    if (reason.trim()) input.reason = reason.trim()
    if (duplicateId !== null) input.duplicate_of_id = duplicateId
    const decided = await decide(input, 'Não foi possível rejeitar a sugestão.')
    if (decided) onDecided(chosen ? `${court.name} rejeitada como duplicada de ${chosen.name}.` : `Sugestão ${court.name} rejeitada.`)
  }
  const back = () => { setMode(null); setAttempted(false); setError('') }
  // Rejeitar como duplicada: "Não é duplicada" volta ao motivo obrigatório (as pílulas não se desmarcam ao tocar de novo).
  const duplicateOptions = duplicates.length
    ? [{ value: NO_DUPLICATE, label: 'Não é duplicada' }, ...duplicates.map(other => ({ value: String(other.id), label: `Duplicada: ${other.name}` }))]
    : undefined

  return <Sheet title="Sugestão de quadra" onClose={onClose}>
    <Text style={{ color: colors['ink-muted'], fontSize: 12, marginBottom: 4 }}>{court.name} · {place(court)}</Text>
    <InfoGrid items={[
      ['Nome', court.name],
      ['Endereço', court.address ?? '—'],
      ['Cidade', place(court)],
      ['Tipo', courtKindLabel[court.kind]],
      ['Sugerida por', by ? `${by.name} · ${relativeTime(item.created_at)}` : `Conta removida · ${relativeTime(item.created_at)}`],
      ['Partida de origem', origin ? <OriginMatch match={origin} onExpired={onExpired} /> : '—'],
    ]} />
    {duplicates.length > 0 ? <DuplicateWarning duplicates={duplicates} /> : null}

    {mode === null ? <ActionRow>
      <ActionButton icon="check" title="Publicar" disabled={busy} onPress={() => { setMode('publish'); setError('') }} grow />
      <ActionButton icon="x" tone="outline" title="Rejeitar" disabled={busy} onPress={() => { setMode('reject'); setError('') }} grow />
    </ActionRow> : null}

    {mode === 'publish' ? <View accessibilityLabel="Publicar no catálogo" style={{ marginTop: 14, gap: 4, borderRadius: 16, borderWidth: 1.5, borderColor: (dark ? 'rgba(143,224,180,0.45)' : 'rgba(0,90,54,0.4)'), padding: 14 }}>
      <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 14, fontWeight: '700' }}>Publicar no catálogo</Text>
      <FormField label="Nome da quadra" value={name} onChangeText={setName} maxLength={COURT_LIMITS.nameMax} error={publishProblems.name} editable={!busy} />
      <FormField label="Endereço (opcional)" value={address} onChangeText={setAddress} maxLength={COURT_LIMITS.addressMax} error={publishProblems.address} editable={!busy} />
      <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ marginTop: 1 }}><Icon name="info" size={15} color={colors.brand} /></View>
        <Text style={{ flex: 1, color: colors['ink-muted'], fontSize: 11, lineHeight: 16 }}>
          A quadra entra no catálogo de {court.city.name} para qualquer partida. Corrija o nome ou o endereço, se precisar; quem sugeriu é avisado.
        </Text>
      </View>
      <ActionRow>
        <ActionButton tone="outline" title="Voltar" disabled={busy} onPress={back} grow />
        <ActionButton title={busy ? 'Publicando…' : 'Publicar quadra'} accessibilityLabel="Publicar quadra" busy={busy} onPress={() => void publish()} grow />
      </ActionRow>
    </View> : null}

    {mode === 'reject' ? <ReasonPanel title="Rejeitar sugestão" max={COURT_LIMITS.reasonMax}
      options={duplicateOptions} option={duplicateId === null ? NO_DUPLICATE : String(duplicateId)}
      onOption={value => setDuplicateId(value === NO_DUPLICATE ? null : Number(value))}
      textLabel={`Motivo da recusa ${duplicateId === null ? '(obrigatório)' : '(opcional)'}`} text={reason} onText={setReason}
      error={rejectProblem}
      note={chosen
        ? `As partidas que usavam esta sugestão passam a usar ${chosen.name}, do catálogo, sem novo aceite.`
        : 'Quem sugeriu vê o motivo nas notificações. A partida segue com a quadra combinada, marcada como "Sugestão recusada".'}
      confirmLabel="Rejeitar sugestão" busyLabel="Rejeitando…" busy={busy} onConfirm={() => void reject()} onCancel={back} /> : null}
    {error ? <ErrorText>{error}</ErrorText> : null}
    <BusyStatus text={busy ? 'Registrando a decisão…' : ''} />
  </Sheet>
}
