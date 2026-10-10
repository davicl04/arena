import { useState } from 'react'
import type { ReactNode } from 'react'
import { AtSign, Camera, ChevronRight, Globe, Image as ImageIcon, Lock, Mail, ShieldOff, User as UserIcon } from 'lucide-react'
import type { User } from '../api/client'
import Avatar from '../components/Avatar'
import { AvatarSheet, CoverSheet, NameSheet, UsernameSheet, VisibilitySheet } from '../components/EditSheets'

type Sheet = 'avatar' | 'cover' | 'name' | 'username' | 'visibility'

function Row({ Icon, label, value, onClick }: { Icon: typeof Camera; label: string; value: ReactNode; onClick?: () => void }) {
  const content = <>
    <span className="row-icon"><Icon size={17} /></span>
    <span className="row-label">{label}</span>
    <span className="row-value">{value}</span>
    {onClick && <ChevronRight size={16} className="row-chevron" />}
  </>
  return onClick
    ? <button type="button" className="list-row" onClick={onClick}>{content}</button>
    : <div className="list-row static">{content}</div>
}

export default function EditProfilePage({ user, onUser, onExpired, openBlocked }: {
  user: User
  onUser: (user: User) => void
  onExpired: () => void
  openBlocked: () => void
}) {
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [message, setMessage] = useState('')
  const close = () => setSheet(null)
  const props = { user, onUser, onExpired, onClose: close, onSaved: (text: string) => { setMessage(text); close() } }
  const open = (next: Sheet) => { setMessage(''); setSheet(next) }
  return <>
    <section className="identity-card" aria-label="Sua identidade">
      <Avatar key={user.avatar?.id ?? 'initials'} user={user} className="avatar-preview" />
      <div>
        <b>{user.name}</b>
        <span>@{user.username}</span>
        <p className="profile-counts">{user.social_public ? <Globe size={13} /> : <Lock size={13} />}Conta {user.social_public ? 'pública' : 'privada'}</p>
      </div>
    </section>
    {message && <p className="success" role="status">{message}</p>}
    <h2 className="list-heading">Perfil</h2>
    <div className="list-group">
      <Row Icon={Camera} label="Foto" value={user.avatar ? 'Alterar' : 'Adicionar'} onClick={() => open('avatar')} />
      <Row Icon={ImageIcon} label="Foto de capa" value={user.cover ? 'Personalizada' : 'Padrão'} onClick={() => open('cover')} />
      <Row Icon={UserIcon} label="Nome" value={user.name} onClick={() => open('name')} />
      <Row Icon={AtSign} label="Nome de usuário" value={`@${user.username}`} onClick={() => open('username')} />
      <Row Icon={Mail} label="E-mail" value={user.email} />
    </div>
    <h2 className="list-heading">Privacidade</h2>
    <div className="list-group">
      <Row Icon={user.social_public ? Globe : Lock} label="Visibilidade da conta" value={user.social_public ? 'Pública' : 'Privada'} onClick={() => open('visibility')} />
      <Row Icon={ShieldOff} label="Contas bloqueadas" value="" onClick={openBlocked} />
    </div>
    {sheet === 'avatar' && <AvatarSheet {...props} />}
    {sheet === 'cover' && <CoverSheet {...props} />}
    {sheet === 'name' && <NameSheet {...props} />}
    {sheet === 'username' && <UsernameSheet {...props} />}
    {sheet === 'visibility' && <VisibilitySheet {...props} />}
  </>
}
