import { useEffect, useState } from 'react'
import { ArrowLeft, Ellipsis, Shield } from 'lucide-react'
import { ApiError, request } from '../api/client'
import type { MutualFollowersPage, SocialUser } from '../api/client'
import { connection } from '../api/connection'
import { reportActionError } from '../hooks/useSubmit'
import AccountActions from '../components/AccountActions'
import { Button, IconButton } from '@/components/ui/button'
import { MatchTimeline } from '@/components/profile-matches/MatchTimeline'
import { LoadError } from '@/components/ui/load-error'
import { toast } from '@/components/ui/toast'
import ProfileGallery from '../components/ProfileGallery'
import ProfileHeader, { ProfileCover, ProfileTopbar } from '../components/ProfileHeader'
import ProfileTabs, { ProfilePanel } from '../components/ProfileTabs'
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
  const [loadFailure, setLoadFailure] = useState<{ message: string; cause: unknown } | null>(null)
  const [mutual, setMutual] = useState<{ items: SocialUser[]; total: number } | null>(null)
  const [version, setVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<ProfileTab>('Fotos')
  const [actionsOpen, setActionsOpen] = useState(false)

  useEffect(() => {
    let alive = true
    request<SocialUser>(`/users/${userId}`)
      .then(value => { if (alive) { setPerson(value); setLoadFailure(null) } })
      .catch((cause: unknown) => {
        if (!alive) return
        if (cause instanceof ApiError && cause.status === 401) onExpired()
        setLoadFailure({ message: cause instanceof Error && cause.message ? cause.message : 'Não foi possível carregar este perfil.', cause })
      })
    request<MutualFollowersPage>(`/users/${userId}/mutual-followers?limit=3`)
      .then(page => { if (alive) setMutual({ items: page.items, total: page.total }) })
      .catch(() => { /* Seguidores em comum são complementares. */ })
    return () => { alive = false }
  }, [userId, version, onExpired])

  // Falha por conexão: relê o perfil uma única vez quando a conexão volta (as demais esperam o "Tentar novamente").
  const loadLost = loadFailure?.cause instanceof ApiError && loadFailure.cause.isConnection
  useEffect(() => {
    if (!loadLost) return
    return connection.onRestored(() => { setLoadFailure(null); setVersion(n => n + 1) })
  }, [loadLost])

  async function follow() {
    if (!person) return
    setBusy(true)
    try {
      if (person.follow_state === 'pending' || person.follow_state === 'approved') await request<void>(`/users/${person.id}/follow`, 'DELETE')
      else await request(`/users/${person.id}/follow`, 'PUT')
      setVersion(n => n + 1)
    } catch (cause) { reportActionError(cause, 'Não foi possível atualizar o vínculo.', onExpired) } finally { setBusy(false) }
  }

  const back = <IconButton tone="cover" aria-label="Voltar" onClick={onBack}><ArrowLeft size={21} /></IconButton>
  if (!person) {
    return <>
      <ProfileTopbar leading={back} />
      <ProfileCover />
      {loadFailure
        ? <LoadError size="screen" title="Não foi possível carregar este perfil" text={loadFailure.message} cause={loadFailure.cause}
          onRetry={() => { setLoadFailure(null); setVersion(n => n + 1) }} />
        : <p role="status">Carregando perfil…</p>}
    </>
  }

  const canView = person.social_public || person.follow_state === 'approved' || person.id === ownUserId
  const openList = (tab: ConnectionsTab) => {
    if (canView) onOpenConnections(person.id, tab)
    else toast.info(closedListNotice)
  }
  const followLabel = person.follow_state === 'approved' ? 'Deixar de seguir'
    : person.follow_state === 'pending' ? 'Cancelar solicitação'
      : person.social_public ? 'Seguir' : 'Solicitar'
  return <>
    <ProfileHeader
      mode="visitor"
      name={person.name}
      username={person.username}
      avatar={<SocialPhoto path={person.avatar_url} name={person.name} size="fill" />}
      coverUrl={person.cover_url}
      isPublic={person.social_public}
      followerCount={person.follower_count}
      followingCount={person.following_count}
      mutual={mutual ?? undefined}
      leading={back}
      trailing={person.id !== ownUserId && <IconButton type="button" tone="cover" aria-label="Ações da conta" aria-haspopup="dialog"
        aria-expanded={actionsOpen} onClick={() => setActionsOpen(true)}><Ellipsis size={21} /></IconButton>}
      actions={person.id !== ownUserId && <Button variant={person.follow_state === 'none' ? 'primary' : 'secondary'} className="min-h-[37px] px-4 py-2 text-[11px]"
        disabled={busy} onClick={() => void follow()}>{followLabel}</Button>}
      onFollowers={() => openList('followers')}
      onFollowing={() => openList('following')}
      onMutual={() => onOpenConnections(person.id, 'followers', true)}
    />
    {canView
      ? <>
        <ProfileTabs value={tab} onChange={setTab} />
        <ProfilePanel tab={tab}>
          {tab === 'Fotos'
            ? <ProfileGallery userId={person.id} username={person.username} ownerName={person.name} viewerId={ownUserId} own={false} onExpired={onExpired} />
            : <MatchTimeline userId={person.id} own={false} onExpired={onExpired} />}
        </ProfilePanel>
      </>
      : <p className="flex items-center justify-center gap-2 px-2 py-5 text-center text-[12px] leading-[1.6] text-ink-muted"><Shield size={20} /> Esta conta é privada. Solicite acesso para ver as publicações.</p>}
    {actionsOpen && <AccountActions person={person} onClose={() => setActionsOpen(false)} onBlocked={onBack} onExpired={onExpired}
      onReported={() => { setActionsOpen(false); toast.success('Denúncia enviada para análise.') }} />}
  </>
}
