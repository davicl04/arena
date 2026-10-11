import { useState } from 'react'
import { ShieldOff } from 'lucide-react'
import { ApiError, request } from '../api/client'
import type { SocialUser } from '../api/client'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { feedbackVariants } from '@/components/ui/feedback'
import { PersonList, PersonRow } from '@/components/ui/person-row'
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
    <p className="text-[11px] leading-[1.6] text-ink-muted">Contas bloqueadas não veem seu perfil nem interagem com você.</p>
    {list.loading && <p role="status">Carregando contas bloqueadas…</p>}
    {list.error && <div className={feedbackVariants()} role="alert">{list.error.message} <Button variant="text" onClick={list.reload}>Tentar novamente</Button></div>}
    {error && <p className={feedbackVariants()} role="alert">{error}</p>}
    {!list.loading && !list.error && !list.items.length && <EmptyState Icon={ShieldOff} title="Nenhuma conta bloqueada" text="Quando você bloquear alguém, a conta aparecerá aqui." />}
    <PersonList>
      {list.items.map(person => <PersonRow key={person.id} person={person}
        actions={<Button variant="secondary" size="compact" disabled={pending !== null} onClick={() => void unblock(person)}>Desbloquear</Button>} />)}
    </PersonList>
    {list.moreError && <p className={feedbackVariants()} role="alert">{list.moreError}</p>}
    {list.hasMore && <Button variant="secondary" className="mt-[18px] w-full" disabled={list.busy} onClick={() => void list.loadMore()}>Carregar mais contas bloqueadas</Button>}
  </section>
}
