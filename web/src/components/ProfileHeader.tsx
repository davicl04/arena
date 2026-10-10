import type { ReactNode } from 'react'
import { Pencil, Shield } from 'lucide-react'
import { apiUrl, sports } from '../api/client'
import type { Sport, SocialUser } from '../api/client'
import { cover as defaultCover, sportIcons } from '../data/arena'
import { SocialPhoto } from './SocialPostCard'

function MutualSummary({ items, total }: { items: SocialUser[]; total: number }) {
  const [first, second] = items
  if (!first || total < 1) return null
  if (total === 1) return <><b>{first.name}</b>, que você segue, também segue esta conta</>
  if (total === 2 && second) return <><b>{first.name}</b> e <b>{second.name}</b> que você segue também seguem esta conta</>
  return <><b>{first.name}</b>{second && <>, <b>{second.name}</b></>} e mais {total - (second ? 2 : 1)} que você segue também seguem esta conta</>
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
  return <>
    <div className="profile-cover" style={{ backgroundImage: `url("${coverUrl ? apiUrl(coverUrl) : defaultCover}")` }}>
      <span className="profile-cover-slot">{leading}</span>
      <span className="profile-cover-slot">{trailing}</span>
    </div>
    <section className="profile-intro" aria-label={mode === 'own' ? 'Seu perfil' : `Perfil de ${name}`}>
      <div className="avatar-wrap">
        <div className="avatar">{avatar}</div>
        {mode === 'own' && onEdit && <button type="button" className="avatar-edit" aria-label="Editar perfil" onClick={onEdit}><Pencil size={14} /></button>}
      </div>
      {actions && <div className="profile-intro-actions">{actions}</div>}
      <h1>{name}</h1>
      <p className="profile-handle">@{username}</p>
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
