import { useState } from 'react'
import { AtSign, Camera, Globe, Image as ImageIcon, Lock, Mail, ShieldOff, User as UserIcon } from 'lucide-react'
import type { User } from '../api/client'
import Avatar from '../components/Avatar'
import ListRow from '../components/ListRow'
import { AvatarSheet, CoverSheet, NameSheet, UsernameSheet, VisibilitySheet } from '../components/EditSheets'

type Sheet = 'avatar' | 'cover' | 'name' | 'username' | 'visibility'

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
      <ListRow Icon={Camera} label="Foto" value={user.avatar ? 'Alterar' : 'Adicionar'} onClick={() => open('avatar')} />
      <ListRow Icon={ImageIcon} label="Foto de capa" value={user.cover ? 'Personalizada' : 'Padrão'} onClick={() => open('cover')} />
      <ListRow Icon={UserIcon} label="Nome" value={user.name} onClick={() => open('name')} />
      <ListRow Icon={AtSign} label="Nome de usuário" value={`@${user.username}`} onClick={() => open('username')} />
      <ListRow Icon={Mail} label="E-mail" value={user.email} />
    </div>
    <h2 className="list-heading">Privacidade</h2>
    <div className="list-group">
      <ListRow Icon={user.social_public ? Globe : Lock} label="Visibilidade da conta" value={user.social_public ? 'Pública' : 'Privada'} onClick={() => open('visibility')} />
      <ListRow Icon={ShieldOff} label="Contas bloqueadas" value="" onClick={openBlocked} />
    </div>
    {sheet === 'avatar' && <AvatarSheet {...props} />}
    {sheet === 'cover' && <CoverSheet {...props} />}
    {sheet === 'name' && <NameSheet {...props} />}
    {sheet === 'username' && <UsernameSheet {...props} />}
    {sheet === 'visibility' && <VisibilitySheet {...props} />}
  </>
}
