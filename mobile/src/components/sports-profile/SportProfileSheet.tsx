import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, findNodeHandle, Text, View } from 'react-native'
import { ApiError } from '../../api/client'
import type { City, Position, Profile, ProfileInput, Sport } from '../../api/client'
import { cityLabel } from '../../api/cities'
import { useCityLocation } from '../../hooks/useCityLocation'
import { actionErrorMessage, reportActionError } from '../../hooks/useSubmit'
import { useThemeColors } from '../../hooks/useTheme'
import { announce } from '../../utils/announce'
import { ActionSheet } from '../arena/ActionSheet'
import { ActionButton, ErrorText, SwitchRow, TextAction } from '../arena/controls'
import { SportIcon } from '../arena/SportIcon'
import { LocationCityStep } from './LocationCityStep'
import { PositionStep } from './PositionStep'
import { finishLabel, positionLabel, profileSteps, sportLabel, stepTitle } from './profileSteps'

/** Linha da revisão: rótulo, valor e "Alterar", que volta ao passo. */
function ReviewRow({ label, value, onChange, first = false }: { label: string; value: string; onChange: () => void; first?: boolean }) {
  const c = useThemeColors()
  return <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 8, ...(first ? {} : { borderTopWidth: 1, borderTopColor: c.line }) }}>
    <Text style={{ color: c['ink-muted'], fontSize: 13 }}>{label}</Text>
    <Text numberOfLines={2} style={{ flex: 1, minWidth: 0, textAlign: 'right', color: c.heading, fontSize: 13, fontWeight: '700' }}>{value}</Text>
    <TextAction title="Alterar" accessibilityLabel={`Alterar ${label.toLowerCase()}`} onPress={onChange} />
  </View>
}

/**
 * Folha passo a passo de uma modalidade (a mesma da web): futebol = Cidade → Posição → Revisão; tênis e corrida = Cidade →
 * Revisão. Perfil existente abre no passo 1 com os valores atuais; perfil novo começa sem cidade, sem posição e com a
 * procura desligada. Concluir chama `onSave` (o `PUT /me/sports-profiles/{sport}`) e entrega o perfil salvo a `onSaved`.
 * O 422 fica na folha, no passo de revisão; os demais erros seguem `reportActionError`. Fechar (X, fundo ou voltar do
 * Android) não salva nada. A cada passo (inclusive ao abrir, em "Alterar" e em "Voltar"), o foco de acessibilidade vai
 * para o título do passo. A localização (`useCityLocation`) vive na folha, não no passo: a sugestão e o estado da permissão
 * sobrevivem a "Voltar" e "Alterar". Perfil novo com a permissão já concedida recebe a sugestão ao abrir (sem trocar uma
 * cidade escolhida antes da resposta); perfil existente só troca a cidade salva por um toque em "Usar minha localização".
 */
export function SportProfileSheet({ sport, profile, onSave, onSaved, onClose, onExpired }: {
  sport: Sport
  profile?: Profile
  onSave: (sport: Sport, input: ProfileInput) => Promise<Profile>
  onSaved: (profile: Profile, isNew: boolean) => void
  onClose: () => void
  onExpired: () => void
}) {
  const c = useThemeColors()
  const isNew = !profile
  const steps = profileSteps(sport)
  const [index, setIndex] = useState(0)
  const [city, setCity] = useState<City | null>(profile?.city ?? null)
  const [position, setPosition] = useState<Position | null>(profile?.position ?? null)
  const [looking, setLooking] = useState(profile?.looking_for ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const location = useCityLocation({ auto: isNew, onExpired, onSuggested: (next, requested) => {
    setCity(current => (requested || !current ? next : current))
    setError('')
  } })
  const step = steps[index]
  const title = stepTitle[step]
  const progress = `${index + 1} de ${steps.length}`
  const titleRef = useRef<Text>(null)
  useEffect(() => { announce(`${title}. Passo ${progress}`) }, [title, progress])
  // A folha só existe montada enquanto está aberta: o efeito roda ao abrir e a cada troca de passo.
  useEffect(() => {
    const node = findNodeHandle(titleRef.current)
    if (node) AccessibilityInfo.setAccessibilityFocus(node)
  }, [index])

  function go(next: number) { setError(''); setIndex(next) }
  async function finish() {
    if (!city || busy) return
    setBusy(true); setError('')
    try {
      const saved = await onSave(sport, { city_id: city.id, position: sport === 'futebol' ? position : null, looking_for: looking })
      setBusy(false)
      onSaved(saved, isNew)
    } catch (err) {
      setBusy(false)
      if (err instanceof ApiError && err.status === 422) { setError(actionErrorMessage(err, 'Revise os dados do perfil.')); return }
      const report = reportActionError(err, 'Tente novamente.', onExpired)
      if (report.kind === 'form') setError(report.message)
    }
  }

  return <ActionSheet title={sportLabel(sport)} onClose={onClose} locked={busy}
    icon={<SportIcon sport={sport} size={24} />}
    aside={<Text style={{ color: c['ink-muted'], fontSize: 11.5 }}>{progress}</Text>}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', gap: 5, marginTop: 6, marginBottom: 14 }}>
      {steps.map((item, position) => <View key={item} testID={position <= index ? 'profile-step-done' : 'profile-step-todo'}
        style={{ flex: 1, height: 4, borderRadius: 9, backgroundColor: position <= index ? c.brand : c.line }} />)}
    </View>
    <Text ref={titleRef} accessibilityRole="header" accessibilityLabel={`${title} Passo ${progress}.`} accessibilityLiveRegion="polite"
      style={{ color: c.heading, fontSize: 20, fontWeight: '800' }}>{title}</Text>

    {step === 'city' ? <LocationCityStep city={city} location={location} onExpired={onExpired} onChange={next => { setCity(next); setError('') }} /> : null}
    {step === 'position' ? <PositionStep value={position} onChange={setPosition} /> : null}
    {step === 'review' ? <View style={{ marginTop: 12, overflow: 'hidden', borderRadius: 16, borderWidth: 1, borderColor: c['surface-edge'], backgroundColor: c.surface }}>
      <ReviewRow first label="Cidade" value={city ? cityLabel(city) : 'A definir'} onChange={() => go(0)} />
      {sport === 'futebol' ? <ReviewRow label="Posição" value={positionLabel(position)} onChange={() => go(steps.indexOf('position'))} /> : null}
      <View style={{ paddingHorizontal: 14 }}>
        <SwitchRow separated label="Procurando oportunidades" hint="Aparece no seu perfil esportivo." checked={looking} disabled={busy} onChange={setLooking} />
      </View>
    </View> : null}
    {step === 'review' && error ? <ErrorText>{error}</ErrorText> : null}

    <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
      {index > 0 ? <ActionButton tone="outline" fit title="Voltar" disabled={busy} onPress={() => go(index - 1)} /> : null}
      {step === 'review'
        ? <View style={{ flexGrow: 2, flexShrink: 1, flexBasis: 0, flexDirection: 'row' }}><ActionButton title={finishLabel(sport, isNew)} busy={busy} disabled={!city} onPress={() => void finish()} /></View>
        : <View style={{ flexGrow: 2, flexShrink: 1, flexBasis: 0, flexDirection: 'row' }}><ActionButton title="Continuar" disabled={step === 'city' && !city} onPress={() => go(index + 1)} /></View>}
    </View>
  </ActionSheet>
}
