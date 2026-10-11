import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Shield, UserCog } from 'lucide-react'
import { apiUrl, sports } from '../api/client'
import type { Sport, SocialUser } from '../api/client'
import { cover as defaultCover, sportIcons } from '../data/arena'
import { SocialPhoto } from './SocialPhoto'

function MutualSummary({ items, total }: { items: SocialUser[]; total: number }) {
  const [first, second] = items
  if (!first || total < 1) return null
  if (total === 1) return <><b>{first.name}</b>, que você segue, também segue esta conta</>
  if (total === 2 && second) return <><b>{first.name}</b> e <b>{second.name}</b> que você segue também seguem esta conta</>
  return <><b>{first.name}</b>{second && <>, <b>{second.name}</b></>} e mais {total - (second ? 2 : 1)} que você segue também seguem esta conta</>
}

/** Barra fixa do perfil: botões em círculos de vidro sobre a capa; condensada (fundo claro e @usuário) depois dela. */
export function ProfileTopbar({ leading, trailing, username, condensed = false }: {
  leading?: ReactNode
  trailing?: ReactNode
  username?: string
  condensed?: boolean
}) {
  return <div className={`profile-topbar ${condensed ? 'is-condensed' : ''}`}>
    <span className="profile-topbar-slot">{leading}</span>
    <span className="profile-topbar-title" aria-hidden="true">{username ? `@${username}` : ''}</span>
    <span className="profile-topbar-slot end">{trailing}</span>
  </div>
}

/** Capa, avatar, identidade e conexões — perfil próprio (`own`) ou de outra pessoa (`visitor`). */
export default function ProfileHeader({ mode, name, username, avatar, coverUrl, isPublic, followerCount, followingCount,
  sportList = [], mutual, leading, trailing, actions, onEdit, onFollowers, onFollowing, onMutual }: {
  mode: 'own' | 'visitor'
  name: string
  username: string
  avatar: ReactNode
  coverUrl: string | null
  isPublic: boolean
  followerCount: number | null
  followingCount: number | null
  sportList?: Sport[]
  mutual?: { items: SocialUser[]; total: number }
  leading?: ReactNode
  trailing?: ReactNode
  actions?: ReactNode
  onEdit?: () => void
  onFollowers: () => void
  onFollowing: () => void
  onMutual?: () => void
}) {
  const cover = useRef<HTMLDivElement>(null)
  const [condensed, setCondensed] = useState(false)
  useEffect(() => {
    const node = cover.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    // A capa "sai" quando passa por baixo da barra (56 px): a partir daí a barra condensa.
    const observer = new IntersectionObserver(([entry]) => setCondensed(!entry.isIntersecting),
      { root: node.closest('.screen'), rootMargin: '-56px 0px 0px 0px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return <>
    <ProfileTopbar leading={leading} trailing={trailing} username={username} condensed={condensed} />
    <div ref={cover} className="profile-cover" style={{ backgroundImage: `url("${coverUrl ? apiUrl(coverUrl) : defaultCover}")` }} />
    <section className="profile-intro" aria-label={mode === 'own' ? 'Seu perfil' : `Perfil de ${name}`}>
      <div className="avatar-wrap">
        <div className="avatar">{avatar}</div>
        {mode === 'own' && onEdit && <button type="button" className="avatar-edit" aria-label="Editar perfil" onClick={onEdit}><UserCog size={16} /></button>}
      </div>
      {actions && <div className="profile-intro-actions">{actions}</div>}
      <h1><span className="profile-at">@</span>{username}</h1>
      <p className="profile-name">{name}</p>
      {followerCount !== null && followingCount !== null && <div className="conn-line">
        <button type="button" onClick={onFollowers}><b>{followerCount}</b> <span>{followerCount === 1 ? 'seguidor' : 'seguidores'}</span></button>
        <span className="conn-sep" aria-hidden="true">·</span>
        <button type="button" onClick={onFollowing}><b>{followingCount}</b> <span>seguindo</span></button>
      </div>}
      {mode === 'visitor' && mutual && mutual.total > 0 && <button type="button" className="mutual" onClick={onMutual}>
        <span className="mutual-faces">{mutual.items.slice(0, 3).map(person => <SocialPhoto key={person.id} path={person.avatar_url} name={person.name} />)}</span>
        <span className="mutual-text"><MutualSummary items={mutual.items} total={mutual.total} /></span>
      </button>}
      <div className="profile-sports">
        {sportList.map(sport => {
          const Icon = sportIcons[sport]
          return <span className="sport-chip" key={sport}><Icon size={13} />{sports.find(s => s.value === sport)?.label}</span>
        })}
        {mode === 'own' && !sportList.length && <span className="muted">Adicione sua primeira modalidade</span>}
      </div>
      <p className="profile-counts"><Shield size={13} />Conta {isPublic ? 'pública' : 'privada'}</p>
    </section>
  </>
}
