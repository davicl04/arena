import { useState } from 'react'
import { AtSign, Camera, Globe, Image as ImageIcon, Lock, Mail, ShieldOff, User as UserIcon } from 'lucide-react'
import type { User } from '../api/client'
import Avatar from '../components/Avatar'
import { avatarPreviewVariants } from '@/components/ui/avatar-preview'
import { toast } from '@/components/ui/toast'
import { ListGroup, ListHeading, ListRow } from '@/components/ui/list-row'
import { AvatarSheet, CoverSheet, NameSheet, UsernameSheet, VisibilitySheet } from '../components/EditSheets'

type Sheet = 'avatar' | 'cover' | 'name' | 'username' | 'visibility'

export default function EditProfilePage({ user, onUser, onExpired, openBlocked }: {
  user: User
  onUser: (user: User) => void
  onExpired: () => void
  openBlocked: () => void
}) {
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const close = () => setSheet(null)
  const props = { user, onUser, onExpired, onClose: close, onSaved: (text: string) => { toast.success(text); close() } }
  const open = (next: Sheet) => setSheet(next)
  return <>
    <section className="flex items-center gap-3.5 rounded-card bg-white p-4" aria-label="Sua identidade">
      <Avatar key={user.avatar?.id ?? 'initials'} user={user} className={avatarPreviewVariants()} />
      <div className="grid min-w-0 gap-0.5">
        <b className="text-[15px] wrap-anywhere">{user.name}</b>
        <span className="text-[12px] font-semibold wrap-anywhere text-brand">@{user.username}</span>
        <p className="mt-1.5 flex items-center gap-[5px] text-[10px] text-ink-muted">{user.social_public ? <Globe size={13} /> : <Lock size={13} />}Conta {user.social_public ? 'pública' : 'privada'}</p>
      </div>
    </section>
    <ListHeading>Perfil</ListHeading>
    <ListGroup>
      <ListRow Icon={Camera} label="Foto" value={user.avatar ? 'Alterar' : 'Adicionar'} onClick={() => open('avatar')} />
      <ListRow Icon={ImageIcon} label="Foto de capa" value={user.cover ? 'Personalizada' : 'Padrão'} onClick={() => open('cover')} />
      <ListRow Icon={UserIcon} label="Nome" value={user.name} onClick={() => open('name')} />
      <ListRow Icon={AtSign} label="Nome de usuário" value={`@${user.username}`} onClick={() => open('username')} />
      <ListRow Icon={Mail} label="E-mail" value={user.email} />
    </ListGroup>
    <ListHeading>Privacidade</ListHeading>
    <ListGroup>
      <ListRow Icon={user.social_public ? Globe : Lock} label="Visibilidade da conta" value={user.social_public ? 'Pública' : 'Privada'} onClick={() => open('visibility')} />
      <ListRow Icon={ShieldOff} label="Contas bloqueadas" value="" onClick={openBlocked} />
    </ListGroup>
    {sheet === 'avatar' && <AvatarSheet {...props} />}
    {sheet === 'cover' && <CoverSheet {...props} />}
    {sheet === 'name' && <NameSheet {...props} />}
    {sheet === 'username' && <UsernameSheet {...props} />}
    {sheet === 'visibility' && <VisibilitySheet {...props} />}
  </>
}
