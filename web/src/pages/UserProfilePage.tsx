import { useEffect, useState } from 'react'
import { ArrowLeft, CalendarDays, Ellipsis, Shield } from 'lucide-react'
import { ApiError, request } from '../api/client'
import type { MutualFollowersPage, SocialUser } from '../api/client'
import AccountActions from '../components/AccountActions'
import EmptyState from '../components/EmptyState'
import ProfileGallery from '../components/ProfileGallery'
import ProfileHeader, { ProfileTopbar } from '../components/ProfileHeader'
import ProfileTabs from '../components/ProfileTabs'
import type { ProfileTab } from '../components/ProfileTabs'
import { SocialPhoto } from '../components/SocialPhoto'
import type { ConnectionsTab } from '../data/arena'

const closedListNotice = 'Esta conta é privada. Só quem a segue vê seguidores e contas seguidas.'

export default function UserProfilePage({ userId, ownUserId, onBack, onOpenConnections, onExpired }: {
  userId: number
  ownUserId: number
  onBack: () => void
  onOpenConnections: (userId: number, tab: ConnectionsTab, mutual?: boolean) => void
  onExpired: () => void
}) {
  const [person, setPerson] = useState<SocialUser | null>(null)
  const [loadError, setLoadError] = useState('')
  const [mutual, setMutual] = useState<{ items: SocialUser[]; total: number } | null>(null)
  const [version, setVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState<ProfileTab>('Fotos')
  const [actionsOpen, setActionsOpen] = useState(false)

  useEffect(() => {
    let alive = true
    request<SocialUser>(`/users/${userId}`)
      .then(value => { if (alive) { setPerson(value); setLoadError('') } })
      .catch((cause: unknown) => {
        if (!alive) return
        if (cause instanceof ApiError && cause.status === 401) onExpired()
        setLoadError(cause instanceof Error ? cause.message : 'Não foi possível carregar este perfil.')
      })
    request<MutualFollowersPage>(`/users/${userId}/mutual-followers?limit=3`)
      .then(page => { if (alive) setMutual({ items: page.items, total: page.total }) })
      .catch(() => { /* Seguidores em comum são complementares. */ })
    return () => { alive = false }
  }, [userId, version, onExpired])

  function fail(cause: unknown, fallback: string) {
    if (cause instanceof ApiError && cause.status === 401) onExpired()
    setError(cause instanceof Error && cause.message ? cause.message : fallback)
  }

  async function follow() {
    if (!person) return
    setBusy(true); setError(''); setNotice('')
    try {
      if (person.follow_state === 'pending' || person.follow_state === 'approved') await request<void>(`/users/${person.id}/follow`, 'DELETE')
      else await request(`/users/${person.id}/follow`, 'PUT')
      setVersion(n => n + 1)
    } catch (cause) { fail(cause, 'Não foi possível atualizar o vínculo.') } finally { setBusy(false) }
  }

  const back = <button className="icon-btn" aria-label="Voltar" onClick={onBack}><ArrowLeft size={21} /></button>
  if (!person) {
    return <>
      <ProfileTopbar leading={back} />
      <div className="profile-cover" />
      {loadError
        ? <div className="error" role="alert">{loadError}</div>
        : <p role="status">Carregando perfil…</p>}
    </>
  }

  const canView = person.social_public || person.follow_state === 'approved' || person.id === ownUserId
  const openList = (tab: ConnectionsTab) => {
    if (canView) onOpenConnections(person.id, tab)
    else setNotice(closedListNotice)
  }
  const followLabel = person.follow_state === 'approved' ? 'Deixar de seguir'
    : person.follow_state === 'pending' ? 'Cancelar solicitação'
      : person.social_public ? 'Seguir' : 'Solicitar'
  return <>
    <ProfileHeader
      mode="visitor"
      name={person.name}
      username={person.username}
      avatar={<SocialPhoto path={person.avatar_url} name={person.name} />}
      coverUrl={person.cover_url}
      isPublic={person.social_public}
      followerCount={person.follower_count}
      followingCount={person.following_count}
      mutual={mutual ?? undefined}
      leading={back}
      trailing={person.id !== ownUserId && <button type="button" className="icon-btn" aria-label="Ações da conta" aria-haspopup="dialog"
        aria-expanded={actionsOpen} onClick={() => { setNotice(''); setActionsOpen(true) }}><Ellipsis size={21} /></button>}
      actions={person.id !== ownUserId && <button className={person.follow_state === 'none' ? 'primary' : 'secondary'} disabled={busy} onClick={() => void follow()}>{followLabel}</button>}
      onFollowers={() => openList('followers')}
      onFollowing={() => openList('following')}
      onMutual={() => onOpenConnections(person.id, 'followers', true)}
    />
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="success" role="status">{notice}</p>}
    {canView
      ? <>
        <ProfileTabs value={tab} onChange={setTab} />
        <div id="profile-content" className="profile-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {tab === 'Fotos'
            ? <ProfileGallery userId={person.id} username={person.username} ownerName={person.name} viewerId={ownUserId} own={false} onExpired={onExpired} />
            : <EmptyState Icon={CalendarDays} title="História em campo" text="Quando as partidas estiverem disponíveis, os resultados desta conta ficam registrados aqui." />}
        </div>
      </>
      : <p className="social-private"><Shield size={20} /> Esta conta é privada. Solicite acesso para ver as publicações.</p>}
    {actionsOpen && <AccountActions person={person} onClose={() => setActionsOpen(false)} onBlocked={onBack} onExpired={onExpired}
      onReported={() => { setActionsOpen(false); setNotice('Denúncia enviada para análise.') }} />}
  </>
}
