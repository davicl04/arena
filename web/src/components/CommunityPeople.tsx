import { useState } from 'react'
import { Search, SearchX, UserRoundPlus } from 'lucide-react'
import { ApiError, request } from '../api/client'
import type { SocialUser } from '../api/client'
import { usePagedList } from '../hooks/usePagedList'
import { SocialPhoto } from './SocialPhoto'
import { Button } from '@/components/ui/button'
import { feedbackVariants } from '@/components/ui/feedback'
import { PersonList, PersonRow } from '@/components/ui/person-row'
import { cn } from '@/lib/utils'

const section = 'mt-4 mb-1 text-[9.5px] font-bold tracking-[0.1em] text-ink-muted uppercase'

/**
 * Aba Atletas (G2). A busca fica na barra escura; aqui aparecem os resultados ou, antes de buscar,
 * a fileira de quem você segue e a dica.
 */
export default function CommunityPeople({ viewerId, query, onOpenUser, onExpired }: {
  viewerId: number
  query: string
  onOpenUser: (id: number) => void
  onExpired: () => void
}) {
  return <div className="px-5 pb-2">
    {query ? <SearchResults key={query} query={query} onOpenUser={onOpenUser} onExpired={onExpired} />
      : <Following viewerId={viewerId} onOpenUser={onOpenUser} onExpired={onExpired} />}
  </div>
}

function Following({ viewerId, onOpenUser, onExpired }: { viewerId: number; onOpenUser: (id: number) => void; onExpired: () => void }) {
  // Complementar: sem a lista (falha ou ninguém seguido), sobra só a dica. A rota devolve vínculos aprovados ({ user, state }).
  const list = usePagedList<{ user: SocialUser }>(`/users/${viewerId}/following`, onExpired)
  const items = list.items.map(item => item.user)
  const { hasMore } = list
  return <>
    {items.length > 0 && <>
      <h2 className={section}>Quem você segue · <b className="text-ink tabular-nums">{items.length}{hasMore ? '+' : ''}</b></h2>
      <ul className="-mx-5 flex gap-3.5 overflow-x-auto px-5 pt-1.5 pb-1 scrollbar-hidden" aria-label="Quem você segue">
        {items.map(person => <li key={person.id} className="shrink-0">
          <button type="button" className="grid w-[62px] justify-items-center gap-[5px] border-0 bg-transparent p-0 text-[10px] font-semibold text-ink"
            aria-label={`Abrir perfil de ${person.name}`} onClick={() => onOpenUser(person.id)}>
            <SocialPhoto path={person.avatar_url} name={person.name} size="ring" />
            <span className="max-w-full truncate" aria-hidden="true">{person.name.trim().split(/\s+/)[0]}</span>
          </button>
        </li>)}
      </ul>
    </>}
    <div className="grid justify-items-center gap-1.5 px-5 pt-8 pb-1.5 text-center text-[11.5px] leading-[1.5] text-ink-muted">
      <Search size={28} className="text-brand" />
      <b className="font-display text-[15px] text-ink">Encontre atletas</b>
      Busque pelo nome ou pelo @ no campo acima. Contas privadas recebem um pedido para seguir.
    </div>
  </>
}

function SearchResults({ query, onOpenUser, onExpired }: { query: string; onOpenUser: (id: number) => void; onExpired: () => void }) {
  const { items, loading, error, hasMore, busy, moreError, loadMore, setItems, reload } = usePagedList<SocialUser>(`/users?q=${encodeURIComponent(query)}`, onExpired)
  const [following, setFollowing] = useState<number | null>(null)
  const [failure, setFailure] = useState('')

  async function follow(person: SocialUser) {
    if (following !== null) return
    setFollowing(person.id); setFailure('')
    try {
      let next: SocialUser['follow_state'] = 'none'
      if (person.follow_state === 'pending' || person.follow_state === 'approved') await request<void>(`/users/${person.id}/follow`, 'DELETE')
      else next = (await request<{ state: 'approved' | 'pending' }>(`/users/${person.id}/follow`, 'PUT')).state
      setItems(old => old.map(item => item.id === person.id ? { ...item, follow_state: next } : item))
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      setFailure(cause instanceof Error && cause.message ? cause.message : 'Não foi possível atualizar.')
    } finally { setFollowing(null) }
  }

  if (loading) return <p className="py-6 text-center text-[11.5px] text-ink-muted" role="status">Buscando atletas…</p>
  if (error) return <div className={cn(feedbackVariants(), 'mt-4')} role="alert">{error.message}
    <Button type="button" variant="text" onClick={reload}>Tentar de novo</Button></div>
  if (items.length === 0) return <div className="grid justify-items-center gap-1.5 px-5 py-10 text-center text-[11.5px] leading-[1.5] text-ink-muted">
    <SearchX size={26} className="text-brand" />
    <b className="font-display text-[14px] text-ink">Nenhum atleta encontrado</b>
    Confira a grafia ou busque pelo @ exato.
  </div>
  return <>
    {failure && <p className={cn(feedbackVariants(), 'mt-3')} role="alert">{failure}</p>}
    <PersonList aria-label="Resultados da busca">{items.map(person => <PersonRow key={person.id} person={person} onOpen={onOpenUser}
      info={[person.social_public ? 'Conta pública' : 'Conta privada', person.follows_you && 'Segue você'].filter(Boolean).join(' · ')}
      actions={person.follow_state === 'self' ? undefined : person.follow_state === 'none'
        ? <Button type="button" size="compact" disabled={following !== null} onClick={() => void follow(person)}><UserRoundPlus size={16} />{person.social_public ? 'Seguir' : 'Solicitar'}</Button>
        : <Button type="button" variant="secondary" size="compact" disabled={following !== null} onClick={() => void follow(person)}>{person.follow_state === 'approved' ? 'Seguindo' : 'Solicitado'}</Button>} />)}
    </PersonList>
    {moreError && <p className={feedbackVariants()} role="alert">{moreError}</p>}
    {hasMore && <Button type="button" variant="secondary" className="mt-2 w-full" disabled={busy} onClick={() => void loadMore()}>{busy ? 'Carregando…' : 'Carregar mais atletas'}</Button>}
  </>
}
