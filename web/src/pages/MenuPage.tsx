import { Bell, Flag, Info, LogOut, Trophy, UserCog } from 'lucide-react'
import { ListGroup, ListHeading, ListRow } from '@/components/ui/list-row'
import { appVersion } from '../data/arena'

/** Menu do perfil (hambúrguer): atalhos da conta, informações do app, moderação e saída. */
export default function MenuPage({ isAdmin, busy, onEditProfile, onSports, onModeration, onLogout }: {
  isAdmin: boolean
  busy: boolean
  onEditProfile: () => void
  onSports: () => void
  onModeration: () => void
  onLogout: () => void
}) {
  return <>
    <ListHeading>Conta</ListHeading>
    <ListGroup>
      <ListRow Icon={UserCog} label="Editar perfil" onClick={onEditProfile} />
      <ListRow Icon={Trophy} label="Minhas modalidades" onClick={onSports} />
    </ListGroup>
    <ListHeading>App</ListHeading>
    <ListGroup>
      <ListRow Icon={Bell} label="Notificações" value={<span className="rounded-full bg-[#4950571a] px-2 py-[3px] text-[9px] font-bold">Em breve</span>} />
      <ListRow Icon={Info} label="Sobre o ARENA" value={`Versão ${appVersion}`} />
    </ListGroup>
    {isAdmin && <>
      <ListHeading>Moderação</ListHeading>
      <ListGroup>
        <ListRow Icon={Flag} label="Denúncias" onClick={onModeration} />
      </ListGroup>
    </>}
    <ListGroup className="mt-5">
      <ListRow Icon={LogOut} label={busy ? 'Aguarde…' : 'Sair da conta'} tone="danger" disabled={busy} onClick={onLogout} />
    </ListGroup>
  </>
}
