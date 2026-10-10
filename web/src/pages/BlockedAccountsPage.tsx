import { useState } from 'react'
import { ShieldOff } from 'lucide-react'
import { ApiError, request } from '../api/client'
import type { SocialUser } from '../api/client'
import EmptyState from '../components/EmptyState'
import PersonRow from '../components/PersonRow'
import { usePagedList } from '../hooks/usePagedList'

export default function BlockedAccountsPage({ onExpired }: { onExpired: () => void }) {
  const list = usePagedList<SocialUser>('/me/blocks', onExpired)
  const [pending, setPending] = useState<number | null>(null)
  const [error, setError] = useState('')
  async function unblock(person: SocialUser) {
    setPending(person.id); setError('')
    try {
      await request<void>(`/users/${person.id}/block`, 'DELETE')
      list.setItems(old => old.filter(item => item.id !== person.id))
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      setError(cause instanceof Error ? cause.message : 'Não foi possível desbloquear a conta.')
    } finally { setPending(null) }
  }
  return <section aria-label="Contas bloqueadas">
    <p className="muted">Contas bloqueadas não veem seu perfil nem interagem com você.</p>
    {list.loading && <p role="status">Carregando contas bloqueadas…</p>}
    {list.error && <div className="error" role="alert">{list.error.message} <button className="text-button" onClick={list.reload}>Tentar novamente</button></div>}
    {error && <p className="error" role="alert">{error}</p>}
    {!list.loading && !list.error && !list.items.length && <EmptyState Icon={ShieldOff} title="Nenhuma conta bloqueada" text="Quando você bloquear alguém, a conta aparecerá aqui." />}
    <div className="person-list">
      {list.items.map(person => <PersonRow key={person.id} person={person}
        actions={<button className="secondary compact" disabled={pending !== null} onClick={() => void unblock(person)}>Desbloquear</button>} />)}
    </div>
    {list.moreError && <p className="error" role="alert">{list.moreError}</p>}
    {list.hasMore && <button className="secondary full-width" disabled={list.busy} onClick={() => void list.loadMore()}>Carregar mais contas bloqueadas</button>}
  </section>
}
