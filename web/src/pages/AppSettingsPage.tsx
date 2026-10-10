import { Bell, Info } from 'lucide-react'
import AdminReports from '../components/AdminReports'
import { appVersion } from '../data/arena'

export default function AppSettingsPage({ isAdmin, busy, onLogout, onExpired }: {
  isAdmin: boolean
  busy: boolean
  onLogout: () => void
  onExpired: () => void
}) {
  return <>
    <div className="list-group">
      <div className="list-row static">
        <span className="row-icon"><Bell size={17} /></span>
        <span className="row-label">Notificações</span>
        <span className="row-value">Em breve</span>
      </div>
      <div className="list-row static">
        <span className="row-icon"><Info size={17} /></span>
        <span className="row-label">Sobre o ARENA</span>
        <span className="row-value">Versão {appVersion}</span>
      </div>
    </div>
    {isAdmin && <AdminReports onExpired={onExpired} />}
    <button className="secondary full-width" disabled={busy} onClick={onLogout}>{busy ? 'Aguarde…' : 'Sair da conta'}</button>
  </>
}
