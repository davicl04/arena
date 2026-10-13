import { Text, View } from 'react-native'
import type { City, Sport } from '../../api/client'
import { EVENT_LIMITS } from '../../api/events'
import { eliminationCapacities, eventNoun, eventTypes, footballFormats, pixKeyType, pixKeyTypes, runDistances } from '../../data/arena'
import { colors } from '../../theme'
import { DateField } from '../arena/DateField'
import { TimeField } from '../arena/TimeField'
import { ActionButton, ChoicePills, CityField, FieldError, FieldLabel, FormField, Hint, sportChoices } from '../arena/controls'
import type { ChoiceOption } from '../arena/controls'
import { capacityError, closeDateMax, closesAt, parseCapacity } from './eventForm'
import type { EventForm, FormErrors, withCategory } from './eventForm'
import { CapacityStepper, Note, TierChips } from './WizardFields'
import { Icon } from '../Icon'

const { nameMax, venueMax, courseNotesMax, beneficiaryMax, pixKeyMax, copyPasteMax, instructionsMax, contactMax,
  roundRobinMin, roundRobinMax, raceMin, raceMax } = EVENT_LIMITS

/** Unidade das vagas: "times", "atletas" ou "corredores". */
export const unitFor = (sport: Sport | null) => (sport ? eventNoun[sport].entrants : 'vagas')

export interface StepProps {
  form: EventForm
  errors: FormErrors
  update: (change: Partial<EventForm>) => void
}
export type CategoryChange = Parameters<typeof withCategory>[1]

const dark = 'dark' as const

export function NameStep({ form, errors, update }: StepProps) {
  return <FormField surface={dark} label="Nome do evento" value={form.name} maxLength={nameMax} placeholder="Ex.: Copa Sudoeste Society" autoCapitalize="words"
    hint={`${form.name.length}/${nameMax} · pelo menos 3 letras. Aparece no cartaz.`} error={errors.name} style={{ fontSize: 18, fontWeight: '700' }}
    onChangeText={value => update({ name: value })} />
}

const sportOptions = sportChoices('dark')
const formatOptions: ChoiceOption<string>[] = footballFormats.map(format => ({ value: format.value, label: `${format.label} ${format.size}`, accessibilityLabel: `${format.label}, ${format.players} contra ${format.players}` }))
const typeOptions: ChoiceOption<string>[] = eventTypes.map(type => ({ value: type.value, label: type.label }))
const distanceOptions: ChoiceOption<number>[] = runDistances.map(distance => ({ value: distance.value, label: distance.label }))

export function SportStep({ form, errors, category }: Omit<StepProps, 'update'> & { category: (change: CategoryChange) => void }) {
  return <>
    <FieldLabel surface={dark}>Modalidade</FieldLabel>
    <ChoicePills tone={dark} label="Modalidade" options={sportOptions} value={form.sport} error={errors.sport} onChange={value => category({ sport: value })} />
    {form.sport === 'futebol' ? <>
      <FieldLabel surface={dark}>Formato</FieldLabel>
      <ChoicePills tone={dark} label="Formato" options={formatOptions} value={form.format} error={errors.format} onChange={value => category({ format: value as EventForm['format'] })} />
    </> : null}
    {form.sport === 'futebol' || form.sport === 'tenis' ? <>
      <FieldLabel surface={dark}>Tipo</FieldLabel>
      <ChoicePills tone={dark} label="Tipo" options={typeOptions} value={form.competitionType} error={errors.competitionType} onChange={value => category({ competitionType: value as EventForm['competitionType'] })} />
      <Note>{form.sport === 'tenis' ? 'Tênis em simples, um contra um. ' : ''}Na eliminação simples, as vagas são 4, 8 ou 16.</Note>
    </> : null}
    {form.sport === 'corrida' ? <>
      <FieldLabel surface={dark}>Distância</FieldLabel>
      <ChoicePills tone={dark} label="Distância" options={distanceOptions} value={form.distanceKm} error={errors.distanceKm} onChange={value => category({ distanceKm: value as EventForm['distanceKm'] })} />
      <Note>As distâncias do ranking da corrida. A prova não tem tipo.</Note>
    </> : null}
  </>
}

const accessOptions: ChoiceOption<string>[] = [{ value: 'aberto', label: 'Aberto a todos' }, { value: 'elos', label: 'Só alguns elos' }]

export function CapacityStep({ form, errors, update, onBack }: StepProps & { onBack: () => void }) {
  const unit = unitFor(form.sport)
  const elimination = form.competitionType === 'eliminacao_simples'
  const race = form.sport === 'corrida'
  const typed = race || form.competitionType !== null
  const tierHint = form.sport === 'futebol'
    ? `Vale o elo do time em ${footballFormats.find(format => format.value === form.format)?.label ?? 'cada formato'}.`
    : form.sport === 'tenis' ? 'Vale o elo do atleta no tênis.'
      : form.distanceKm ? `Vale o elo do corredor nos ${form.distanceKm} km.` : 'Vale o elo do corredor na distância da prova.'
  return <>
    <FieldLabel surface={dark}>Vagas</FieldLabel>
    {!typed ? <>
      <Hint surface={dark}>{capacityError(form)}</Hint>
      <View style={{ marginTop: 8 }}><ActionButton fit tone="line" title="Voltar à modalidade" onPress={onBack} /></View>
    </> : elimination
      ? <ChoicePills tone={dark} label="Vagas" value={parseCapacity(form.capacity)} error={errors.capacity} options={eliminationCapacities.map(value => ({ value: value as number, label: `${value} ${unit}` }))}
        onChange={value => update({ capacity: String(value) })} />
      : <>
        <CapacityStepper value={form.capacity} error={errors.capacity} min={race ? raceMin : roundRobinMin} max={race ? raceMax : roundRobinMax} step={race ? 10 : 1} unit={unit}
          onChange={value => update({ capacity: value })} />
        <Hint surface={dark}>{race ? `De ${raceMin} a ${raceMax} corredores.` : `De ${roundRobinMin} a ${roundRobinMax} ${unit} no todos contra todos.`}</Hint>
      </>}

    <FieldLabel surface={dark}>Quem pode se inscrever</FieldLabel>
    <ChoicePills tone={dark} label="Quem pode se inscrever" options={accessOptions} value={form.restricted ? 'elos' : 'aberto'} onChange={value => update({ restricted: value === 'elos' })} />
    {form.restricted
      ? <>
        <View style={{ marginTop: 8 }}><TierChips value={form.tiers} error={errors.tiers} onChange={value => update({ tiers: value })} /></View>
        <Note>{tierHint} Quem ainda está em classificação não entra em evento com elos escolhidos.</Note>
      </>
      : <Note>Quem ainda está em classificação só se inscreve em evento aberto a todos (RN18).</Note>}
  </>
}

export function WhenStep({ form, errors, update, cities }: StepProps & { cities: City[] }) {
  const close = closesAt(form)
  return <>
    <FieldLabel surface={dark}>Data e hora do evento</FieldLabel>
    <View style={{ gap: 8 }}>
      <DateField tone={dark} label="Data do evento" value={form.startDate} invalid={Boolean(errors.startDate)} onChange={value => update({ startDate: value })} />
      <FieldError error={errors.startDate} surface={dark} />
      <TimeField tone={dark} label="Hora do início" value={form.startTime} invalid={Boolean(errors.startTime)} onChange={value => update({ startTime: value })} />
      <FieldError error={errors.startTime} surface={dark} />
    </View>

    <FieldLabel surface={dark}>Inscrições até</FieldLabel>
    <View style={{ gap: 8 }}>
      <DateField tone={dark} label="Fim das inscrições" max={closeDateMax(form)} value={form.closeDate} invalid={Boolean(errors.closeDate)} onChange={value => update({ closeDate: value })} />
      <TimeField tone={dark} label="Hora do fim das inscrições (opcional)" placeholder="23:59" emptyStart="23:45" value={form.closeTime} onChange={value => update({ closeTime: value })} />
    </View>
    <Hint surface={dark}>
      {form.closeDate && !form.closeTime ? 'Sem hora, fecham às 23:59. ' : 'Hora opcional (sem ela, 23:59). '}
      {form.paid ? 'Inscrições pagas também fecham 12 h antes do início.' : close ? '' : 'Até o dia do evento.'}
    </Hint>
    <FieldError error={errors.closeDate} surface={dark} />

    <CityField surface={dark} label="Cidade" title="Cidade do evento" description="Os atletas veem a cidade no cartaz e no detalhe." cities={cities} value={form.cityId}
      placeholder="Escolha a cidade do evento" error={errors.cityId} onChange={city => update({ cityId: city.id })} />

    <FormField surface={dark} label="Local" value={form.venue} maxLength={venueMax} placeholder="Ex.: Arena Sudoeste, quadra 1"
      hint="Quadra, clube ou ponto de largada. A reserva do local é com você." error={errors.venue} onChangeText={value => update({ venue: value })} />

    {form.sport === 'corrida' ? <FormField surface={dark} label="Percurso (opcional)" value={form.courseNotes} maxLength={courseNotesMax} multiline placeholder="Largada, chegada e pontos de hidratação"
      hint={`${form.courseNotes.length}/${courseNotesMax}`} error={errors.courseNotes} onChangeText={value => update({ courseNotes: value })} /> : null}
  </>
}

const paidOptions: ChoiceOption<string>[] = [{ value: 'gratuita', label: 'Gratuita' }, { value: 'paga', label: 'Paga' }]
const keyTypeOptions: ChoiceOption<string>[] = pixKeyTypes.map(type => ({ value: type.value, label: type.label }))

export function PriceStep({ form, errors, update }: StepProps) {
  const paid = form.paid === true
  const keyInfo = form.pixKeyType ? pixKeyType[form.pixKeyType] : null
  return <>
    <FieldLabel surface={dark}>Inscrição</FieldLabel>
    <ChoicePills tone={dark} label="Inscrição" options={paidOptions} value={form.paid === null ? null : paid ? 'paga' : 'gratuita'} error={errors.paid} onChange={value => update({ paid: value === 'paga' })} />
    {paid ? <>
      <FormField surface={dark} label={`Valor por ${form.sport === 'futebol' ? 'time' : 'inscrito'} (R$)`} value={form.price} maxLength={12} placeholder="0,00" keyboardType="decimal-pad"
        hint="De R$ 1,00 a R$ 10.000,00." error={errors.price} onChangeText={value => update({ price: value })} />
      <View accessibilityLabel="Pix para receber" style={{ marginTop: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.03)', padding: 14, borderWidth: 1.5, borderColor: colors.mint }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="qr-code" size={18} color={colors.mint} />
          <Text accessibilityRole="header" style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>Pix para receber</Text>
        </View>
        <FormField surface={dark} label="Favorecido" value={form.pixBeneficiary} maxLength={beneficiaryMax} placeholder="Nome de quem recebe" error={errors.pixBeneficiary}
          onChangeText={value => update({ pixBeneficiary: value })} />
        <FieldLabel surface={dark}>Tipo de chave</FieldLabel>
        <ChoicePills tone={dark} label="Tipo de chave Pix" options={keyTypeOptions} value={form.pixKeyType} error={errors.pixKeyType} onChange={value => update({ pixKeyType: value as EventForm['pixKeyType'] })} />
        <FormField surface={dark} label="Chave Pix" value={form.pixKey} maxLength={pixKeyMax} placeholder={keyInfo?.placeholder ?? 'Escolha o tipo de chave'} keyboardType={keyInfo?.keyboard ?? 'default'}
          autoCapitalize="none" autoCorrect={false} error={errors.pixKey} style={{ fontFamily: 'monospace', fontSize: 14 }} onChangeText={value => update({ pixKey: value })} />
        <FormField surface={dark} label="Pix Copia e Cola (opcional)" value={form.pixCopyPaste} maxLength={copyPasteMax} multiline autoCapitalize="none" autoCorrect={false} placeholder="Cole o código gerado no app do seu banco"
          hint="Facilita para quem paga: o código já leva valor e favorecido." error={errors.pixCopyPaste} style={{ fontFamily: 'monospace', fontSize: 12, minHeight: 72 }} onChangeText={value => update({ pixCopyPaste: value })} />
        <FormField surface={dark} label="Instruções (opcional)" value={form.pixInstructions} maxLength={instructionsMax} multiline placeholder="Ex.: envie o comprovante em até 48 h, com o nome do time na descrição do Pix."
          error={errors.pixInstructions} style={{ minHeight: 72 }} onChangeText={value => update({ pixInstructions: value })} />
        <Note icon="lock">Só aparece para quem está logado. O Arena não recebe pagamentos: só registra os comprovantes.</Note>
      </View>
    </> : null}
    <FormField surface={dark} label="Contato para dúvidas (opcional)" value={form.contact} maxLength={contactMax} placeholder="WhatsApp ou e-mail" error={errors.contact}
      onChangeText={value => update({ contact: value })} />
    {paid
      ? <View style={{ marginTop: 14, flexDirection: 'row', gap: 12, borderRadius: 14, backgroundColor: colors['warning-bg'], padding: 12 }}>
        <Icon name="hourglass" size={20} color={colors.warning} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '700' }}>Evento pago passa pela administração</Text>
          <Text style={{ marginTop: 2, color: colors['ink-muted'], fontSize: 10.5, lineHeight: 15 }}>Depois de enviar, ele fica “Em aprovação” até a conferência e só então abre as inscrições.</Text>
        </View>
      </View>
      : form.paid === false ? <Note>Evento gratuito publica direto: as inscrições abrem na hora.</Note> : null}
  </>
}
