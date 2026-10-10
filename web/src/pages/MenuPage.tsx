import { Bell, Flag, Info, LogOut, Trophy, UserCog } from 'lucide-react'
import ListRow from '../components/ListRow'
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
    <h2 className="list-heading">Conta</h2>
    <div className="list-group">
      <ListRow Icon={UserCog} label="Editar perfil" onClick={onEditProfile} />
      <ListRow Icon={Trophy} label="Minhas modalidades" onClick={onSports} />
    </div>
    <h2 className="list-heading">App</h2>
    <div className="list-group">
      <ListRow Icon={Bell} label="Notificações" value={<span className="soon-badge">Em breve</span>} />
      <ListRow Icon={Info} label="Sobre o ARENA" value={`Versão ${appVersion}`} />
    </div>
    {isAdmin && <>
      <h2 className="list-heading">Moderação</h2>
      <div className="list-group">
        <ListRow Icon={Flag} label="Denúncias" onClick={onModeration} />
      </div>
    </>}
    <div className="list-group menu-exit">
      <ListRow Icon={LogOut} label={busy ? 'Aguarde…' : 'Sair da conta'} tone="danger" disabled={busy} onClick={onLogout} />
    </div>
  </>
}
