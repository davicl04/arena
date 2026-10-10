import type { ReactNode } from 'react'
import type { SocialUser } from '../api/client'
import { SocialPhoto } from './SocialPostCard'

/** Linha compacta de pessoa: foto, nome, @, informação extra e ações rápidas. */
export default function PersonRow({ person, info, actions, onOpen }: {
  person: SocialUser
  info?: string
  actions?: ReactNode
  onOpen?: (id: number) => void
}) {
  const body = <>
    <SocialPhoto path={person.avatar_url} name={person.name} />
    <span className="person-text">
      <b>{person.name}</b>
      <small className="person-handle">@{person.username}</small>
      {info && <small className="person-info">{info}</small>}
    </span>
  </>
  return <div className="person-row">
    {onOpen
      ? <button type="button" className="person-main" aria-label={`Abrir perfil de ${person.name}`} onClick={() => onOpen(person.id)}>{body}</button>
      : <div className="person-main">{body}</div>}
    {actions && <div className="person-actions">{actions}</div>}
  </div>
}
