import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ApiError } from '@/api/client'
import type { City, Position, Profile, ProfileInput, Sport } from '@/api/client'
import { cityLabel } from '@/api/cities'
import SportIcon from '@/components/SportIcon'
import { Button } from '@/components/ui/button'
import { feedbackVariants } from '@/components/ui/feedback'
import { Sheet } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { actionErrorMessage, reportActionError } from '@/hooks/useSubmit'
import { cn } from '@/lib/utils'
import { CityStep } from './CityStep'
import { RadioList } from './RadioList'
import { ReviewRow } from './ReviewRow'
import { finishLabel, positionChoices, positionLabel, profileSteps, sportLabel, stepTitle } from './profileSteps'

/**
 * Folha passo a passo de uma modalidade: futebol = Cidade → Posição → Revisão; tênis e corrida = Cidade → Revisão. Perfil
 * existente abre no passo 1 com os valores atuais; perfil novo começa sem cidade, sem posição e com a procura desligada. A
 * cada passo o foco vai para o título (a pergunta, com "Passo n de m" para leitores de tela). Concluir chama `onSave` (o
 * `PUT /me/sports-profiles/{sport}`) e entrega o perfil salvo a `onSaved`. O 422 fica na folha, no passo de revisão; os
 * demais erros seguem `reportActionError`. Fechar (X, fundo ou Esc) não salva nada; durante o envio, a folha não fecha.
 */
export function SportProfileSheet({ sport, profile, onSave, onSaved, onClose, onExpired }: {
  sport: Sport
  profile?: Profile
  onSave: (sport: Sport, input: ProfileInput) => Promise<Profile>
  onSaved: (profile: Profile, isNew: boolean) => void
  onClose: () => void
  onExpired: () => void
}) {
  const isNew = !profile
  const steps = profileSteps(sport)
  const [index, setIndex] = useState(0)
  const [city, setCity] = useState<City | null>(profile?.city ?? null)
  const [position, setPosition] = useState<Position | null>(profile?.position ?? null)
  const [looking, setLooking] = useState(profile?.looking_for ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ids = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const first = useRef(true)
  const step = steps[index]
  const title = stepTitle[step]

  // O primeiro passo recebe o foco pelo `data-autofocus` da folha; os seguintes, por aqui.
  useEffect(() => {
    if (first.current) { first.current = false; return }
    heading.current?.focus()
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
      const report = reportActionError(err, 'Não foi possível salvar o perfil. Tente novamente.', onExpired)
      if (report.kind === 'form') setError(report.message)
    }
  }

  return (
    <Sheet title={sportLabel(sport)} onClose={() => { if (!busy) onClose() }}
      icon={<span className="flex" style={{ '--sport-icon-color': 'var(--color-icon-tile-ink)' } as CSSProperties}><SportIcon sport={sport} size={24} mask /></span>}
      aside={<span className="text-[11.5px] text-ink-muted tabular-nums" aria-hidden="true">{index + 1} de {steps.length}</span>}>
      <div className="mt-1.5 mb-3.5 flex gap-[5px]" aria-hidden="true">
        {steps.map((item, position) => <i key={item} className={cn('block h-1 flex-1 rounded-[9px]', position <= index ? 'bg-brand' : 'bg-line')} />)}
      </div>
      <h3 ref={heading} tabIndex={-1} data-autofocus className="font-display text-[20px] leading-tight font-bold text-heading outline-none focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-focus">
        {title}<span className="sr-only"> Passo {index + 1} de {steps.length}.</span>
      </h3>

      {step === 'city' && <CityStep city={city} onChange={next => { setCity(next); setError('') }} />}
      {step === 'position' && <RadioList className="mt-3" label="Posição preferida" options={positionChoices} value={position} onChange={setPosition} />}
      {step === 'review' && <>
        <div className="surface mt-3 overflow-hidden rounded-card border border-solid border-surface-edge shadow-card">
          <ReviewRow first label="Cidade" value={city ? cityLabel(city) : 'A definir'} onChange={() => go(0)} />
          {sport === 'futebol' && <ReviewRow label="Posição" value={positionLabel(position)} onChange={() => go(steps.indexOf('position'))} />}
          <div className="flex min-h-14 items-center gap-3 border-t border-solid border-line px-3.5 py-2">
            <span className="min-w-0 flex-1">
              <b id={`${ids}-looking`} className="block text-[12px] text-heading">Procurando oportunidades</b>
              <small id={`${ids}-looking-hint`} className="block text-[10.5px] text-ink-muted">Aparece no seu perfil esportivo.</small>
            </span>
            <Switch size="lg" checked={looking} disabled={busy} onCheckedChange={setLooking}
              aria-labelledby={`${ids}-looking`} aria-describedby={`${ids}-looking-hint`} />
          </div>
        </div>
        {error && <p className={feedbackVariants()} role="alert">{error}</p>}
      </>}

      <div className="mt-[18px] flex gap-2">
        {index > 0 && <Button type="button" variant="secondary" className="px-[18px]" disabled={busy} onClick={() => go(index - 1)}>Voltar</Button>}
        {step === 'review'
          ? <Button type="button" className="flex-1" disabled={!city || busy} onClick={() => void finish()}>{busy ? 'Salvando…' : finishLabel(sport, isNew)}</Button>
          : <Button type="button" className="flex-1" disabled={step === 'city' && !city} onClick={() => go(index + 1)}>Continuar</Button>}
      </div>
    </Sheet>
  )
}
