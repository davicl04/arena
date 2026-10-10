import { useState } from 'react'
import type { User } from '../api/client'
import { apiUrl } from '../api/client'

export default function Avatar({ user, className = '' }: { user: User; className?: string }) {
  const [failedId, setFailedId] = useState<string | null>(null)
  const initials = user.name.trim().split(/\s+/).slice(0, 2).map((name) => name[0]).join('').toUpperCase()
  return <div className={className} role="img" aria-label={`Foto de ${user.name}`}>
    {user.avatar && failedId !== user.avatar.id
      ? <img src={apiUrl(user.avatar.url)} alt="" onError={() => setFailedId(user.avatar?.id ?? null)} />
      : initials}
  </div>
}
