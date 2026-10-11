import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Eye, Globe, Info, Lock, X } from 'lucide-react'
import { cva } from 'class-variance-authority'
import { apiUrl, ApiError, request } from '../api/client'
import type { User, UsernameAvailability } from '../api/client'
import { cover as defaultCover } from '../data/arena'
import { useImageUpload } from '../hooks/useImageUpload'
import { useSubmit } from '../hooks/useSubmit'
import { USERNAME_PATTERN, usernameRules } from '../utils/username'
import { cn } from '@/lib/utils'
import { avatarPreviewVariants } from '@/components/ui/avatar-preview'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { feedbackVariants } from '@/components/ui/feedback'
import { Sheet, SheetActions } from '@/components/ui/sheet'
import Avatar from './Avatar'
import ImageCropSheet from './ImageCropSheet'

interface SheetProps {
  user: User
  onUser: (user: User) => void
  onExpired: () => void
  onClose: () => void
  onSaved: (message: string) => void
}

/* Rótulo com cara de botão que abre o seletor de arquivo; o anel de foco acompanha o campo oculto seguinte. */
const fileButton = cn(buttonVariants({ variant: 'primary' }), 'm-0 cursor-pointer has-[+input:focus-visible]:outline-3 has-[+input:focus-visible]:outline-offset-3 has-[+input:focus-visible]:outline-focus')
/* Aviso informativo (note) ou de atenção (warning) dentro da folha. */
const sheetNote = cva('mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[11px] leading-[1.5] [&>svg]:mt-px', {
  variants: { tone: { note: 'bg-app', warning: 'bg-warning-bg text-warning' } },
})

export function NameSheet({ user, onUser, onExpired, onClose, onSaved }: SheetProps) {
  const [name, setName] = useState(user.name)
  const { busy, error, run } = useSubmit(onExpired)
  const valid = name.trim().length >= 2 && name.trim().length <= 100
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid || busy) return
    const saved = await run(async () => { onUser(await request<User>('/me', 'PATCH', { name: name.trim() })); return true }, 'Não foi possível atualizar o nome.')
    if (saved) onSaved('Nome atualizado.')
  }
  return <Sheet title="Nome" description="Aparece no seu perfil e nas suas publicações." onClose={onClose}>
    <form onSubmit={event => void submit(event)}>
      <label htmlFor="edit-name">Nome completo</label>
      <input id="edit-name" data-autofocus value={name} onChange={event => setName(event.target.value)} maxLength={100} autoComplete="name" aria-invalid={!valid} />
      {!valid && <p className="mt-1.5 text-[11px] text-error">Informe ao menos 2 caracteres.</p>}
      {error && <p className={feedbackVariants()} role="alert">{error}</p>}
      <SheetActions>
        <Button variant="secondary" type="button" onClick={onClose}>Cancelar</Button>
        <Button disabled={!valid || busy}>{busy ? 'Salvando…' : 'Salvar'}</Button>
      </SheetActions>
    </form>
  </Sheet>
}

type Checked = { for: string; result?: UsernameAvailability; failed?: boolean }
const statusTone = { ok: 'text-brand', bad: 'text-error', wait: 'text-ink-muted' } as const
const ruleItem = 'flex items-center gap-[7px] text-[10.5px] text-ink-muted before:size-1.5 before:flex-none before:rounded-full before:bg-[#b9c0c6] data-[state=ok]:text-brand data-[state=ok]:before:bg-brand data-[state=bad]:text-error data-[state=bad]:before:bg-error'

export function UsernameSheet({ user, onUser, onExpired, onClose, onSaved }: SheetProps) {
  const [value, setValue] = useState(user.username)
  const [checked, setChecked] = useState<Checked | null>(null)
  const { busy, error, run } = useSubmit(onExpired)
  const rules = usernameRules(value)
  const rulesOk = USERNAME_PATTERN.test(value)
  const same = value === user.username
  useEffect(() => {
    if (!rulesOk || value === user.username) return
    let alive = true
    const timer = setTimeout(() => {
      request<UsernameAvailability>(`/me/username-availability?u=${encodeURIComponent(value)}`)
        .then(result => { if (alive) setChecked({ for: value, result }) })
        .catch((cause: unknown) => {
          if (!alive) return
          if (cause instanceof ApiError && cause.status === 401) onExpired()
          setChecked({ for: value, failed: true })
        })
    }, 400)
    return () => { alive = false; clearTimeout(timer) }
  }, [value, rulesOk, user.username, onExpired])
  const answer = checked?.for === value ? checked : null
  const result = answer?.result
  let status: { tone: 'ok' | 'bad' | 'wait'; text: string } | null
  if (value && !rulesOk) status = { tone: 'bad', text: 'Formato inválido. Revise as regras abaixo.' }
  else if (same) status = { tone: 'wait', text: 'Este já é o seu nome de usuário.' }
  else if (!answer) status = rulesOk ? { tone: 'wait', text: 'Verificando disponibilidade…' } : null
  else if (answer.failed) status = { tone: 'wait', text: 'Não foi possível verificar agora. Você ainda pode tentar salvar.' }
  else if (result?.available) status = { tone: 'ok', text: `@${value} está disponível.` }
  else if (result?.reason === 'reserved') status = { tone: 'bad', text: 'Este nome de usuário é reservado.' }
  else if (result?.reason === 'invalid') status = { tone: 'bad', text: 'Formato inválido. Revise as regras abaixo.' }
  else status = { tone: 'bad', text: `@${value} já está em uso.` }
  const canSave = rulesOk && !same && Boolean(answer) && (answer?.failed || result?.available)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!canSave || busy) return
    const saved = await run(async () => {
      try { onUser(await request<User>('/me', 'PATCH', { username: value })); return true }
      catch (cause) {
        if (cause instanceof ApiError && cause.status === 409) setChecked({ for: value, result: { available: false, reason: 'taken', suggestions: [] } })
        throw cause
      }
    }, 'Não foi possível atualizar o nome de usuário.')
    if (saved) onSaved('Nome de usuário atualizado.')
  }
  return <Sheet title="Nome de usuário" description="Escolha como outras pessoas encontram você." onClose={onClose}>
    <form onSubmit={event => void submit(event)}>
      <label htmlFor="edit-username">Nome de usuário</label>
      {/* O campo interno parte da base global de input, sem borda nem fundo próprios: o contorno e o foco ficam no contêiner. */}
      <div data-slot="at-field" data-invalid={status?.tone === 'bad' ? '' : undefined}
        className="flex items-center rounded-field border border-solid border-field-border bg-white pl-[13px] focus-within:border-brand focus-within:shadow-[0_0_0_3px_#005a3622] data-invalid:border-error">
        <span className="text-[14px] font-bold text-ink-muted" aria-hidden="true">@</span>
        <input id="edit-username" className="border-0 bg-transparent pl-[3px] focus-visible:outline-none" data-autofocus value={value} maxLength={31} autoCapitalize="none" autoComplete="username" spellCheck={false}
          aria-describedby="username-status username-rules" aria-invalid={status?.tone === 'bad'}
          onChange={event => setValue(event.target.value.trim().replace(/^@/, '').toLowerCase())} />
      </div>
      <p id="username-status" className={cn('mt-2 flex min-h-5 items-center gap-1.5 text-[11px] font-semibold', statusTone[status?.tone ?? 'wait'])} aria-live="polite">
        {status?.tone === 'ok' && <Check size={14} />}{status?.tone === 'bad' && <X size={14} />}{status?.text}
      </p>
      {Boolean(result?.suggestions.length) && <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Sugestões de nome de usuário">
        {result?.suggestions.map(item => <button key={item} type="button" className="min-h-9 rounded-[18px] border border-solid border-line bg-app px-3 py-1.5 text-[11px] font-semibold wrap-anywhere"
          onClick={() => setValue(item)}>@{item}</button>)}
      </div>}
      <ul id="username-rules" className="mt-3 mb-0 grid list-none gap-[5px] p-0" aria-label="Regras do nome de usuário">
        {rules.map(rule => <li key={rule.label} className={ruleItem} data-state={value ? (rule.ok ? 'ok' : 'bad') : undefined}>{rule.label}</li>)}
      </ul>
      <p className={sheetNote({ tone: 'note' })}><Eye size={15} />Outras pessoas podem encontrar você pelo @ e vê-lo no seu perfil, mesmo com a conta privada.</p>
      {error && <p className={feedbackVariants()} role="alert">{error}</p>}
      <SheetActions>
        <Button variant="secondary" type="button" onClick={onClose}>Cancelar</Button>
        <Button disabled={!canSave || busy}>{busy ? 'Salvando…' : 'Salvar'}</Button>
      </SheetActions>
    </form>
  </Sheet>
}

export function AvatarSheet({ user, onUser, onExpired, onClose, onSaved }: SheetProps) {
  const upload = useImageUpload({ path: '/me/avatar', fallbackName: 'foto-perfil.webp', quality: 0.92, failure: 'Não foi possível salvar a foto.',
    onUser, onExpired, onSaved: () => onSaved('Foto de perfil atualizada.') })
  const removal = useSubmit(onExpired)
  async function remove() {
    const removed = await removal.run(async () => { await request<void>('/me/avatar', 'DELETE'); onUser({ ...user, avatar: null }); return true }, 'Não foi possível remover a foto.')
    if (removed) onSaved('Foto de perfil removida.')
  }
  const busy = upload.busy || removal.busy
  if (upload.source) {
    return <ImageCropSheet source={upload.source} title="Ajustar foto" description="Arraste a imagem e ajuste o zoom para escolher o recorte circular." aspect={1} round
      confirmLabel="Salvar foto" busy={upload.busy} error={upload.error} onCancel={upload.cancel} onConfirm={area => void upload.save(area)} />
  }
  return <Sheet title="Foto de perfil" description="JPEG, PNG ou WebP · até 5 MiB · recorte circular" onClose={onClose}>
    <div className="grid place-items-center py-2"><Avatar key={user.avatar?.id ?? 'initials'} user={user} className={avatarPreviewVariants({ size: 'lg' })} /></div>
    <div className="grid gap-2">
      <label className={fileButton} htmlFor="avatar-file">{user.avatar ? 'Trocar foto' : 'Adicionar foto'}</label>
      <input id="avatar-file" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
        onChange={event => { upload.choose(event.target.files?.[0]); event.target.value = '' }} />
      {user.avatar && <Button variant="secondary" type="button" disabled={busy} onClick={() => void remove()}>Remover foto</Button>}
    </div>
    {(upload.error || removal.error) && <p className={feedbackVariants()} role="alert">{upload.error || removal.error}</p>}
  </Sheet>
}

export function CoverSheet({ user, onUser, onExpired, onClose, onSaved }: SheetProps) {
  const upload = useImageUpload({ path: '/me/cover', fallbackName: 'foto-capa.webp', maxWidth: 1500, maxHeight: 600, quality: 0.88,
    failure: 'Não foi possível salvar a capa.', onUser, onExpired, onSaved: () => onSaved('Foto de capa atualizada.') })
  const removal = useSubmit(onExpired)
  async function restore() {
    const done = await removal.run(async () => { await request<void>('/me/cover', 'DELETE'); onUser({ ...user, cover: null }); return true }, 'Não foi possível voltar à capa padrão.')
    if (done) onSaved('Capa padrão restaurada.')
  }
  const busy = upload.busy || removal.busy
  if (upload.source) {
    return <ImageCropSheet source={upload.source} title="Ajustar capa" description="Arraste a imagem e ajuste o zoom para escolher o recorte largo (5:2)." aspect={5 / 2}
      confirmLabel="Salvar capa" busy={upload.busy} error={upload.error} onCancel={upload.cancel} onConfirm={area => void upload.save(area)} />
  }
  return <Sheet title="Foto de capa" description="JPEG, PNG ou WebP · até 5 MiB · recorte largo 5:2" onClose={onClose}>
    <div className="aspect-[5/2] w-full rounded-[14px] bg-(--color-cover) bg-cover bg-center" role="img" aria-label={user.cover ? 'Prévia da sua capa' : 'Prévia da capa padrão'}
      style={{ backgroundImage: `url("${user.cover ? apiUrl(user.cover.url) : defaultCover}")` }} />
    <div className="grid gap-2">
      <label className={fileButton} htmlFor="cover-file">{user.cover ? 'Trocar capa' : 'Enviar capa'}</label>
      <input id="cover-file" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
        onChange={event => { upload.choose(event.target.files?.[0]); event.target.value = '' }} />
      {user.cover && <Button variant="secondary" type="button" disabled={busy} onClick={() => void restore()}>Usar capa padrão</Button>}
    </div>
    {(upload.error || removal.error) && <p className={feedbackVariants()} role="alert">{upload.error || removal.error}</p>}
  </Sheet>
}

const visibilityFacts = {
  private: [
    [true, 'Nome, @, foto de perfil, capa e número de seguidores continuam visíveis'],
    [false, 'Publicações e listas de seguidores: só para seguidores aprovados'],
    [false, 'Para seguir você, é preciso pedir e você aprovar'],
  ],
  public: [
    [true, 'Qualquer pessoa conectada vê suas publicações'],
    [true, 'Listas de seguidores e seguindo abertas a todos'],
    [true, 'Qualquer pessoa pode seguir você sem pedir'],
  ],
} as const

/* Opção de visibilidade (radio): selecionada com borda verde, fundo claro e ícone preenchido. */
const visibilityOption = 'group grid min-h-[118px] content-center justify-items-center gap-1.5 rounded-panel border-[1.5px] border-solid border-line bg-white px-2 py-3 text-center aria-checked:border-brand aria-checked:bg-[#f4f9f6] aria-checked:shadow-[0_0_0_3px_#005a3612]'
const visibilityIcon = 'grid size-12 place-items-center rounded-full bg-app group-aria-checked:bg-brand group-aria-checked:text-white'
const visibilityHint = 'text-[10.5px] leading-[1.35] text-ink-muted'

export function VisibilitySheet({ user, onUser, onExpired, onClose, onSaved }: SheetProps) {
  const [pick, setPick] = useState(user.social_public)
  const { busy, error, run } = useSubmit(onExpired)
  const changed = pick !== user.social_public
  async function save() {
    const next = await run(async () => (await request<{ social_public: boolean }>('/me/privacy', 'PUT', { social_public: pick })).social_public,
      'Não foi possível atualizar a privacidade.')
    if (next !== undefined) { onUser({ ...user, social_public: next }); onSaved(`Conta ${next ? 'pública' : 'privada'}.`) }
  }
  return <Sheet title="Visibilidade da conta" description="Defina quem acompanha suas publicações e conexões." onClose={onClose}>
    <div className="mt-2.5 grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Visibilidade da conta">
      <button type="button" role="radio" className={visibilityOption} aria-checked={!pick} onClick={() => setPick(false)}>
        <span className={visibilityIcon}><Lock size={22} /></span><b className="text-[14px]">Privada</b><small className={visibilityHint}>Você aprova quem segue</small>
      </button>
      <button type="button" role="radio" className={visibilityOption} aria-checked={pick} onClick={() => setPick(true)}>
        <span className={visibilityIcon}><Globe size={22} /></span><b className="text-[14px]">Pública</b><small className={visibilityHint}>Aberta a todos conectados</small>
      </button>
    </div>
    <div className="mt-3 rounded-[14px] bg-subtle px-3.5 py-[13px]">
      <h3 className="mb-2 text-[11.5px]">Com a conta {pick ? 'pública' : 'privada'}</h3>
      <ul className="m-0 grid list-none gap-[7px] p-0">{visibilityFacts[pick ? 'public' : 'private'].map(([ok, text]) => <li key={text} className="flex items-start gap-2 text-[11px] leading-[1.45]">
        {ok ? <Check size={14} aria-label="Visível" className="mt-px text-brand" /> : <Lock size={14} aria-label="Restrito" className="mt-px text-ink-muted" />}<span>{text}</span></li>)}</ul>
    </div>
    {changed && <p className={sheetNote({ tone: 'warning' })} role="note"><Info size={16} />{pick
      ? 'As solicitações pendentes para seguir você serão aprovadas automaticamente.'
      : 'Quem já segue você continua seguindo. Novos seguidores vão precisar da sua aprovação.'}</p>}
    {error && <p className={feedbackVariants()} role="alert">{error}</p>}
    <SheetActions>
      <Button variant="secondary" type="button" onClick={onClose}>Cancelar</Button>
      <Button type="button" disabled={!changed || busy} onClick={() => void save()}>
        {busy ? 'Salvando…' : changed ? (pick ? 'Tornar pública' : 'Tornar privada') : 'Salvar'}</Button>
    </SheetActions>
  </Sheet>
}
