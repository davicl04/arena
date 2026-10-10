import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Eye, Globe, Info, Lock, X } from 'lucide-react'
import { apiUrl, ApiError, request } from '../api/client'
import type { User, UsernameAvailability } from '../api/client'
import { cover as defaultCover } from '../data/arena'
import { useImageUpload } from '../hooks/useImageUpload'
import { useSubmit } from '../hooks/useSubmit'
import { USERNAME_PATTERN, usernameRules } from '../utils/username'
import Avatar from './Avatar'
import BottomSheet from './BottomSheet'
import ImageCropSheet from './ImageCropSheet'

interface SheetProps {
  user: User
  onUser: (user: User) => void
  onExpired: () => void
  onClose: () => void
  onSaved: (message: string) => void
}

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
  return <BottomSheet title="Nome" description="Aparece no seu perfil e nas suas publicações." onClose={onClose}>
    <form onSubmit={event => void submit(event)}>
      <label htmlFor="edit-name">Nome completo</label>
      <input id="edit-name" data-autofocus value={name} onChange={event => setName(event.target.value)} maxLength={100} autoComplete="name" aria-invalid={!valid} />
      {!valid && <p className="field-hint bad">Informe ao menos 2 caracteres.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button className="secondary" type="button" onClick={onClose}>Cancelar</button>
        <button className="primary" disabled={!valid || busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </form>
  </BottomSheet>
}

type Checked = { for: string; result?: UsernameAvailability; failed?: boolean }

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
  return <BottomSheet title="Nome de usuário" description="Escolha como outras pessoas encontram você." onClose={onClose}>
    <form onSubmit={event => void submit(event)}>
      <label htmlFor="edit-username">Nome de usuário</label>
      <div className={`at-field ${status?.tone === 'bad' ? 'bad' : ''}`}>
        <span aria-hidden="true">@</span>
        <input id="edit-username" data-autofocus value={value} maxLength={31} autoCapitalize="none" autoComplete="username" spellCheck={false}
          aria-describedby="username-status username-rules" aria-invalid={status?.tone === 'bad'}
          onChange={event => setValue(event.target.value.trim().replace(/^@/, '').toLowerCase())} />
      </div>
      <p id="username-status" className={`username-status ${status?.tone ?? ''}`} aria-live="polite">
        {status?.tone === 'ok' && <Check size={14} />}{status?.tone === 'bad' && <X size={14} />}{status?.text}
      </p>
      {Boolean(result?.suggestions.length) && <div className="suggestions" aria-label="Sugestões de nome de usuário">
        {result?.suggestions.map(item => <button key={item} type="button" onClick={() => setValue(item)}>@{item}</button>)}
      </div>}
      <ul id="username-rules" className="username-rules" aria-label="Regras do nome de usuário">
        {rules.map(rule => <li key={rule.label} className={value ? (rule.ok ? 'ok' : 'bad') : ''}>{rule.label}</li>)}
      </ul>
      <p className="sheet-note"><Eye size={15} />Outras pessoas podem encontrar você pelo @ e vê-lo no seu perfil, mesmo com a conta privada.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button className="secondary" type="button" onClick={onClose}>Cancelar</button>
        <button className="primary" disabled={!canSave || busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </form>
  </BottomSheet>
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
  return <BottomSheet title="Foto de perfil" description="JPEG, PNG ou WebP · até 5 MiB · recorte circular" onClose={onClose}>
    <div className="sheet-preview"><Avatar key={user.avatar?.id ?? 'initials'} user={user} className="avatar-preview" /></div>
    <div className="sheet-buttons">
      <label className="primary file-button" htmlFor="avatar-file">{user.avatar ? 'Trocar foto' : 'Adicionar foto'}</label>
      <input id="avatar-file" className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
        onChange={event => { upload.choose(event.target.files?.[0]); event.target.value = '' }} />
      {user.avatar && <button className="secondary" type="button" disabled={busy} onClick={() => void remove()}>Remover foto</button>}
    </div>
    {(upload.error || removal.error) && <p className="error" role="alert">{upload.error || removal.error}</p>}
  </BottomSheet>
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
  return <BottomSheet title="Foto de capa" description="JPEG, PNG ou WebP · até 5 MiB · recorte largo 5:2" onClose={onClose}>
    <div className="cover-preview" role="img" aria-label={user.cover ? 'Prévia da sua capa' : 'Prévia da capa padrão'}
      style={{ backgroundImage: `url("${user.cover ? apiUrl(user.cover.url) : defaultCover}")` }} />
    <div className="sheet-buttons">
      <label className="primary file-button" htmlFor="cover-file">{user.cover ? 'Trocar capa' : 'Enviar capa'}</label>
      <input id="cover-file" className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
        onChange={event => { upload.choose(event.target.files?.[0]); event.target.value = '' }} />
      {user.cover && <button className="secondary" type="button" disabled={busy} onClick={() => void restore()}>Usar capa padrão</button>}
    </div>
    {(upload.error || removal.error) && <p className="error" role="alert">{upload.error || removal.error}</p>}
  </BottomSheet>
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

export function VisibilitySheet({ user, onUser, onExpired, onClose, onSaved }: SheetProps) {
  const [pick, setPick] = useState(user.social_public)
  const { busy, error, run } = useSubmit(onExpired)
  const changed = pick !== user.social_public
  async function save() {
    const next = await run(async () => (await request<{ social_public: boolean }>('/me/privacy', 'PUT', { social_public: pick })).social_public,
      'Não foi possível atualizar a privacidade.')
    if (next !== undefined) { onUser({ ...user, social_public: next }); onSaved(`Conta ${next ? 'pública' : 'privada'}.`) }
  }
  return <BottomSheet title="Visibilidade da conta" description="Defina quem acompanha suas publicações e conexões." onClose={onClose}>
    <div className="visibility-options" role="radiogroup" aria-label="Visibilidade da conta">
      <button type="button" role="radio" aria-checked={!pick} onClick={() => setPick(false)}>
        <span className="visibility-icon"><Lock size={22} /></span><b>Privada</b><small>Você aprova quem segue</small>
      </button>
      <button type="button" role="radio" aria-checked={pick} onClick={() => setPick(true)}>
        <span className="visibility-icon"><Globe size={22} /></span><b>Pública</b><small>Aberta a todos conectados</small>
      </button>
    </div>
    <div className="visibility-facts">
      <h3>Com a conta {pick ? 'pública' : 'privada'}</h3>
      <ul>{visibilityFacts[pick ? 'public' : 'private'].map(([ok, text]) => <li key={text}>
        {ok ? <Check size={14} aria-label="Visível" /> : <Lock size={14} aria-label="Restrito" />}<span>{text}</span></li>)}</ul>
    </div>
    {changed && <p className="sheet-warning" role="note"><Info size={16} />{pick
      ? 'As solicitações pendentes para seguir você serão aprovadas automaticamente.'
      : 'Quem já segue você continua seguindo. Novos seguidores vão precisar da sua aprovação.'}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="form-actions">
      <button className="secondary" type="button" onClick={onClose}>Cancelar</button>
      <button className="primary" type="button" disabled={!changed || busy} onClick={() => void save()}>
        {busy ? 'Salvando…' : changed ? (pick ? 'Tornar pública' : 'Tornar privada') : 'Salvar'}</button>
    </div>
  </BottomSheet>
}
