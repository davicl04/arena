import { useState } from 'react'
import { ShieldOff } from 'lucide-react'
import { request } from '../api/client'
import type { SocialUser } from '../api/client'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { feedbackVariants } from '@/components/ui/feedback'
import { LoadError } from '@/components/ui/load-error'
import { PersonList, PersonRow } from '@/components/ui/person-row'
import { usePagedList } from '../hooks/usePagedList'
import { reportActionError } from '../hooks/useSubmit'

export default function BlockedAccountsPage({ onExpired }: { onExpired: () => void }) {
  const list = usePagedList<SocialUser>('/me/blocks', onExpired)
  const [pending, setPending] = useState<number | null>(null)
  async function unblock(person: SocialUser) {
    setPending(person.id)
    try {
      await request<void>(`/users/${person.id}/block`, 'DELETE')
      list.setItems(old => old.filter(item => item.id !== person.id))
    } catch (cause) {
      reportActionError(cause, 'Não foi possível desbloquear a conta.', onExpired)
    } finally { setPending(null) }
  }
  return <section aria-label="Contas bloqueadas">
    <p className="text-[11px] leading-[1.6] text-ink-muted">Contas bloqueadas não veem seu perfil nem interagem com você.</p>
    {list.loading && <p role="status">Carregando contas bloqueadas…</p>}
    {list.error && <LoadError size="section" title="Não foi possível carregar as contas bloqueadas" text={list.error.message} cause={list.error} onRetry={list.reload} />}
    {!list.loading && !list.error && !list.items.length && <EmptyState Icon={ShieldOff} title="Nenhuma conta bloqueada" text="Quando você bloquear alguém, a conta aparecerá aqui." />}
    <PersonList>
      {list.items.map(person => <PersonRow key={person.id} person={person}
        actions={<Button variant="secondary" size="compact" disabled={pending !== null} onClick={() => void unblock(person)}>Desbloquear</Button>} />)}
    </PersonList>
    {list.moreError && <p className={feedbackVariants()} role="alert">{list.moreError}</p>}
    {list.hasMore && <Button variant="secondary" className="mt-[18px] w-full" disabled={list.busy} onClick={() => void list.loadMore()}>Carregar mais contas bloqueadas</Button>}
  </section>
}
