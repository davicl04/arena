import { useId, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Info, SendHorizontal } from 'lucide-react'
import { sports } from '@/api/client'
import type { City, Sport } from '@/api/client'
import { ORGANIZER_LIMITS, organizerRequestInput, sendOrganizerRequest, validateOrganizerRequest } from '@/api/organizer'
import type { OrganizerRequest, OrganizerRequestDraft, OrganizerRequestErrors } from '@/api/organizer'
import SportIcon from '@/components/SportIcon'
import { useSubmit } from '@/hooks/useSubmit'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { feedbackVariants } from '@/components/ui/feedback'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { errorClass, hintClass, invalidClass, textareaClass } from './fieldStyles'

const fieldOrder: (keyof OrganizerRequestDraft)[] = ['display_name', 'city_id', 'sports', 'experience', 'contact', 'link', 'accept_terms']
const sportToggle = 'h-auto min-h-[38px] rounded-xl border border-solid border-line-strong bg-surface py-1 pr-3 pl-1.5 text-[11.5px] font-bold text-ink hover:bg-subtle data-pressed:border-forest data-pressed:bg-forest data-pressed:text-white data-pressed:hover:bg-forest data-pressed:hover:text-white data-pressed:[&_[data-slot=sport-icon]]:mix-blend-screen data-pressed:[&_[data-slot=sport-icon]]:[filter:grayscale(1)_invert(1)] focus-visible:ring-focus/60'

/** Campo com rótulo, dica e erro ligados por `aria-describedby`. */
function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: ReactNode; error?: string; children: ReactNode }) {
  return <div>
    <label htmlFor={id}>{label}</label>
    {children}
    {hint && !error && <p id={`${id}-hint`} className={hintClass}>{hint}</p>}
    {error && <p id={`${id}-error`} className={errorClass}>{error}</p>}
  </div>
}
const describedBy = (id: string, error?: string, hint = true) => error ? `${id}-error` : hint ? `${id}-hint` : undefined

/**
 * Formulário do pedido de organizador (P5): nome, cidade do catálogo, modalidades, experiência, contato, link
 * e aceite. Valida no cliente com as mesmas regras do servidor e mostra os campos recusados pela API; as outras falhas de envio saem como toast.
 */
export function OrganizerRequestForm({ cities, defaultCityId, onSent, onExpired }: {
  cities: City[]
  defaultCityId: number | null
  onSent: (request: OrganizerRequest) => void
  onExpired: () => void
}) {
  const id = useId()
  const fid = (name: keyof OrganizerRequestDraft) => `${id}-${name}`
  const [draft, setDraft] = useState<OrganizerRequestDraft>({
    display_name: '', city_id: defaultCityId, sports: [], experience: '', contact: '', link: '', accept_terms: false,
  })
  const [attempted, setAttempted] = useState(false)
  const { busy, error, run } = useSubmit(onExpired)
  const cityIds = useMemo(() => (cities.length ? new Set(cities.map(city => city.id)) : undefined), [cities])
  const errors: OrganizerRequestErrors = attempted ? validateOrganizerRequest(draft, cityIds) : {}
  const invalid = Object.keys(errors).length > 0
  const update = (patch: Partial<OrganizerRequestDraft>) => setDraft(old => ({ ...old, ...patch }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setAttempted(true)
    const found = validateOrganizerRequest(draft, cityIds)
    const first = fieldOrder.find(name => found[name])
    if (first) {
      const field = document.getElementById(fid(first))
      const target = first === 'sports' ? field?.querySelector('button') : field
      target?.focus()
      return
    }
    const sent = await run(() => sendOrganizerRequest(organizerRequestInput(draft)), 'Não foi possível enviar o pedido.')
    if (sent) onSent(sent)
  }

  return <form noValidate onSubmit={event => void submit(event)} aria-label="Pedido de organizador">
    <Card className="px-3.5 pt-1 pb-4">
      <Field id={fid('display_name')} label="Nome do organizador" hint="Você ou a entidade que organiza, como aparecerá nos eventos." error={errors.display_name}>
        <input id={fid('display_name')} className={invalidClass} value={draft.display_name} maxLength={ORGANIZER_LIMITS.nameMax} autoComplete="organization"
          aria-invalid={Boolean(errors.display_name)} aria-describedby={describedBy(fid('display_name'), errors.display_name)}
          onChange={event => update({ display_name: event.target.value })} />
      </Field>
      <Field id={fid('city_id')} label="Cidade" hint="Onde você pretende organizar." error={errors.city_id}>
        <select id={fid('city_id')} className={invalidClass} value={draft.city_id ?? ''} aria-invalid={Boolean(errors.city_id)}
          aria-describedby={describedBy(fid('city_id'), errors.city_id)} onChange={event => update({ city_id: Number(event.target.value) || null })}>
          <option value="" disabled>Selecione uma cidade</option>
          {cities.map(city => <option key={city.id} value={city.id}>{city.name} · {city.state}</option>)}
        </select>
      </Field>
      <div>
        <span id={`${fid('sports')}-label`} className="mt-[18px] mb-2 block text-[12px] font-semibold">O que você quer organizar</span>
        <ToggleGroup multiple id={fid('sports')} aria-labelledby={`${fid('sports')}-label`} aria-describedby={describedBy(fid('sports'), errors.sports, false)}
          value={draft.sports} onValueChange={value => update({ sports: value as Sport[] })} className="w-full flex-wrap gap-1.5">
          {sports.map(sport => <ToggleGroupItem key={sport.value} value={sport.value} className={sportToggle}>
            <SportIcon sport={sport.value} size={22} />{sport.label}
          </ToggleGroupItem>)}
        </ToggleGroup>
        {errors.sports && <p id={`${fid('sports')}-error`} className={errorClass}>{errors.sports}</p>}
      </div>
      <Field id={fid('experience')} label="Experiência (opcional)" error={errors.experience}
        hint={`Conte rapidamente o que você já organizou. ${draft.experience.length}/${ORGANIZER_LIMITS.experienceMax}`}>
        <textarea id={fid('experience')} className={textareaClass} rows={3} value={draft.experience} maxLength={ORGANIZER_LIMITS.experienceMax}
          aria-invalid={Boolean(errors.experience)} aria-describedby={describedBy(fid('experience'), errors.experience)}
          onChange={event => update({ experience: event.target.value })} />
      </Field>
      <Field id={fid('contact')} label="Contato" hint="Telefone, e-mail ou perfil para a administração falar com você." error={errors.contact}>
        <input id={fid('contact')} className={invalidClass} value={draft.contact} maxLength={ORGANIZER_LIMITS.contactMax}
          aria-invalid={Boolean(errors.contact)} aria-describedby={describedBy(fid('contact'), errors.contact)}
          onChange={event => update({ contact: event.target.value })} />
      </Field>
      <Field id={fid('link')} label="Link (opcional)" hint="Site ou perfil público, com o endereço completo (https://…)" error={errors.link}>
        <input id={fid('link')} type="url" inputMode="url" className={invalidClass} value={draft.link} maxLength={ORGANIZER_LIMITS.linkMax} placeholder="https://"
          aria-invalid={Boolean(errors.link)} aria-describedby={describedBy(fid('link'), errors.link)}
          onChange={event => update({ link: event.target.value })} />
      </Field>
    </Card>
    <label htmlFor={fid('accept_terms')} className={cn('mt-3.5 mb-0 flex items-start gap-2.5 surface rounded-[14px] border border-solid p-3 text-[11.5px] leading-[1.5] font-normal',
      errors.accept_terms ? 'border-error' : 'border-line')}>
      <input id={fid('accept_terms')} type="checkbox" className="mt-0.5 size-[18px] shrink-0 accent-brand" checked={draft.accept_terms}
        aria-invalid={Boolean(errors.accept_terms)} aria-describedby={describedBy(fid('accept_terms'), errors.accept_terms, false)}
        onChange={event => update({ accept_terms: event.target.checked })} />
      <span>Entendo que o pagamento das inscrições é feito fora do Arena, que analiso os comprovantes e resolvo as divergências dos meus eventos, e que eventos pagos passam pela administração.</span>
    </label>
    {errors.accept_terms && <p id={`${fid('accept_terms')}-error`} className={errorClass}>{errors.accept_terms}</p>}
    <div id={`${id}-status`}>
      {invalid && <p className={feedbackVariants()} role="alert">Revise os campos destacados.</p>}
      {!invalid && error && <p className={feedbackVariants()} role="alert">{error}</p>}
      {busy && <p className="sr-only" role="status">Enviando pedido…</p>}
    </div>
    <Button type="submit" className="mt-3.5 w-full" disabled={busy}><SendHorizontal size={17} aria-hidden="true" />{busy ? 'Enviando…' : 'Enviar pedido'}</Button>
    <p className="mt-3.5 flex items-start gap-2 text-[11px] leading-[1.5] text-ink-muted"><Info size={15} className="mt-px flex-none text-brand" aria-hidden="true" />
      A administração do Arena analisa o pedido. A resposta chega nas notificações.</p>
  </form>
}
