import { useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { ApiError } from '../../api/client'
import type { City } from '../../api/client'
import { fieldMessage } from '../../api/events'
import { ORGANIZER_LIMITS, organizerRequestInput, sendOrganizerRequest, validateOrganizerRequest } from '../../api/organizer'
import type { OrganizerRequest, OrganizerRequestDraft, OrganizerRequestErrors } from '../../api/organizer'
import { colors } from '../../theme'
import { ActionButton, CheckRow, CityField, FieldLabel, FormField, MultiPills, Notice, sportChoices } from '../arena/controls'

/** Campos do pedido que a API devolve no `422` (`display_name`, `city_id`…), na ordem da tela. */
const FIELD_NAMES: (keyof OrganizerRequestDraft)[] = ['display_name', 'city_id', 'sports', 'experience', 'contact', 'link', 'accept_terms']

/** Erros do servidor por campo: da lista `fields` do `422` e, sem ela, das mensagens que citam um campo. */
export function serverFieldErrors(cause: unknown): OrganizerRequestErrors {
  if (!(cause instanceof ApiError) || cause.status !== 422) return {}
  const errors: OrganizerRequestErrors = {}
  for (const item of cause.fields) {
    const name = FIELD_NAMES.find(field => field === item.field.split('.')[0])
    if (name && !errors[name]) errors[name] = fieldMessage(item.message)
  }
  if (!cause.fields.length) {
    if (/aceite/i.test(cause.message)) errors.accept_terms = cause.message
    else if (/cidade/i.test(cause.message)) errors.city_id = cause.message
  }
  return errors
}

const sportOptions = sportChoices('light')

/**
 * Formulário do pedido de organizador (P5): nome, cidade do catálogo, modalidades, experiência, contato, link e aceite.
 * Valida no cliente com as mesmas regras do servidor, mostra os erros da API no campo certo (`ApiError.fields`) e anuncia o
 * envio.
 */
export function OrganizerRequestForm({ cities, defaultCityId, onSent, onExpired }: {
  cities: City[]
  defaultCityId: number | null
  onSent: (request: OrganizerRequest) => void
  onExpired: () => void
}) {
  const [draft, setDraft] = useState<OrganizerRequestDraft>({
    display_name: '', city_id: defaultCityId, sports: [], experience: '', contact: '', link: '', accept_terms: false,
  })
  const [attempted, setAttempted] = useState(false)
  const [serverErrors, setServerErrors] = useState<OrganizerRequestErrors>({})
  const [busy, setBusy] = useState(false)
  const [general, setGeneral] = useState('')
  const cityIds = useMemo(() => (cities.length ? new Set(cities.map(city => city.id)) : undefined), [cities])
  const errors: OrganizerRequestErrors = { ...(attempted ? validateOrganizerRequest(draft, cityIds) : {}), ...serverErrors }
  const invalid = Object.keys(errors).length > 0
  const update = (patch: Partial<OrganizerRequestDraft>) => {
    setDraft(old => ({ ...old, ...patch }))
    setServerErrors(old => {
      const next = { ...old }
      for (const key of Object.keys(patch) as (keyof OrganizerRequestDraft)[]) delete next[key]
      return next
    })
    setGeneral('')
  }

  async function submit() {
    if (busy) return
    setAttempted(true)
    setGeneral('')
    if (Object.keys(validateOrganizerRequest(draft, cityIds)).length) return
    setBusy(true)
    try {
      onSent(await sendOrganizerRequest(organizerRequestInput(draft)))
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      const mapped = serverFieldErrors(cause)
      setServerErrors(mapped)
      setGeneral(Object.keys(mapped).length ? '' : cause instanceof Error && cause.message ? cause.message : 'Não foi possível enviar o pedido.')
    } finally {
      setBusy(false)
    }
  }

  return <View accessibilityLabel="Pedido de organizador">
    <View style={{ borderRadius: 16, backgroundColor: '#ffffff', paddingHorizontal: 14, paddingBottom: 16, paddingTop: 2 }}>
      <FormField label="Nome do organizador" hint="Você ou a entidade que organiza, como aparecerá nos eventos." value={draft.display_name} maxLength={ORGANIZER_LIMITS.nameMax}
        error={errors.display_name} onChangeText={value => update({ display_name: value })} />
      <CityField label="Cidade" title="Cidade do organizador" description="Onde você pretende organizar." cities={cities} value={draft.city_id} error={errors.city_id}
        onChange={city => update({ city_id: city.id })} />
      <FieldLabel>O que você quer organizar</FieldLabel>
      <MultiPills label="O que você quer organizar" options={sportOptions} values={draft.sports} error={errors.sports} onChange={value => update({ sports: value })} />
      <FormField label="Experiência (opcional)" hint={`Conte rapidamente o que você já organizou. ${draft.experience.length}/${ORGANIZER_LIMITS.experienceMax}`} value={draft.experience}
        multiline maxLength={ORGANIZER_LIMITS.experienceMax} error={errors.experience} onChangeText={value => update({ experience: value })} />
      <FormField label="Contato" hint="Telefone, e-mail ou perfil para a administração falar com você." value={draft.contact} maxLength={ORGANIZER_LIMITS.contactMax}
        error={errors.contact} onChangeText={value => update({ contact: value })} />
      <FormField label="Link (opcional)" hint="Site ou perfil público, com o endereço completo (https://…)" value={draft.link} maxLength={ORGANIZER_LIMITS.linkMax}
        placeholder="https://" keyboardType="url" autoCapitalize="none" autoCorrect={false} error={errors.link} onChangeText={value => update({ link: value })} />
    </View>
    <CheckRow checked={draft.accept_terms} label="Aceito as responsabilidades do organizador" error={errors.accept_terms} onChange={value => update({ accept_terms: value })}>
      Entendo que o pagamento das inscrições é feito fora do Arena, que analiso os comprovantes e resolvo as divergências dos meus eventos, e que eventos pagos passam pela administração.
    </CheckRow>
    {invalid ? <Notice>Revise os campos destacados.</Notice> : null}
    {!invalid && general ? <Notice>{general}</Notice> : null}
    {busy ? <Text accessibilityLiveRegion="polite" style={{ marginTop: 10, color: colors['ink-muted'], fontSize: 12 }}>Enviando pedido…</Text> : null}
    <View style={{ marginTop: 14 }}><ActionButton block icon="send" title={busy ? 'Enviando…' : 'Enviar pedido'} accessibilityLabel="Enviar pedido" busy={busy} onPress={() => void submit()} /></View>
    <Text style={{ marginTop: 14, color: colors['ink-muted'], fontSize: 11, lineHeight: 17 }}>A administração do Arena analisa o pedido. A resposta chega nas notificações.</Text>
  </View>
}
