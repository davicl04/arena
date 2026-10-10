import { useEffect, useState } from 'react'
import { request } from '../api/client'
import type { Page, SocialUser } from '../api/client'

type FollowRequest = { user: SocialUser; state: string }
type ListKind = 'requests' | 'blocks' | 'followers' | 'following'

export default function SocialSettings({ userId, onExpired, onPrivacyChange }: { userId: number; onExpired: () => void; onPrivacyChange?: (socialPublic: boolean) => void }) {
  const [isPublic, setIsPublic] = useState(false)
  const [requests, setRequests] = useState<FollowRequest[]>([])
  const [blocks, setBlocks] = useState<SocialUser[]>([])
  const [followers, setFollowers] = useState<SocialUser[]>([])
  const [following, setFollowing] = useState<SocialUser[]>([])
  const [showFollowers, setShowFollowers] = useState(false)
  const [showFollowing, setShowFollowing] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [cursors, setCursors] = useState<Record<ListKind, string | null>>({ requests: null, blocks: null, followers: null, following: null })
  useEffect(() => {
    let alive = true
    Promise.all([
      request<{ social_public: boolean }>('/me/privacy'),
      request<Page<FollowRequest>>('/me/follow-requests'),
      request<Page<SocialUser>>('/me/blocks'),
    ]).then(([privacy, pending, blocked]) => {
      if (!alive) return
      setIsPublic(privacy.social_public); setRequests(pending.items); setBlocks(blocked.items)
      onPrivacyChange?.(privacy.social_public)
      setCursors(old => ({ ...old, requests: pending.next_cursor, blocks: blocked.next_cursor }))
    }).catch(err => {
      if (!alive) return
      if (err && typeof err === 'object' && 'status' in err && err.status === 401) onExpired()
      setError(err instanceof Error ? err.message : 'Não foi possível carregar a privacidade social.')
    }).finally(() => { if (alive) setReady(true) })
    return () => { alive = false }
  }, [onExpired, onPrivacyChange])

  async function togglePrivacy() {
    if (!isPublic && !window.confirm('Ao tornar sua conta pública, suas publicações ficarão visíveis para todas as pessoas conectadas. Solicitações pendentes serão aprovadas. Continuar?')) return
    setBusy(true); setError('')
    try {
      const result = await request<{ social_public: boolean }>('/me/privacy', 'PUT', { social_public: !isPublic })
      setIsPublic(result.social_public)
      onPrivacyChange?.(result.social_public)
      if (result.social_public) { setRequests([]); setCursors(old => ({ ...old, requests: null })) }
    } catch (err) {
      if (err && typeof err === 'object' && 'status' in err && err.status === 401) onExpired()
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar a privacidade.')
    } finally { setBusy(false) }
  }

  async function resolve(followerId: number, approve: boolean) {
    setBusy(true)
    try {
      await request(`/me/follow-requests/${followerId}?approve=${approve}`, 'PUT')
      setRequests(old => old.filter(item => item.user.id !== followerId))
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível responder à solicitação.') }
    finally { setBusy(false) }
  }

  async function unblock(id: number) {
    setBusy(true)
    try { await request<void>(`/users/${id}/block`, 'DELETE'); setBlocks(old => old.filter(person => person.id !== id)) }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível desbloquear a conta.') }
    finally { setBusy(false) }
  }

  async function toggleRelations(which: 'followers' | 'following') {
    const visible = which === 'followers' ? showFollowers : showFollowing
    if (which === 'followers') setShowFollowers(!visible); else setShowFollowing(!visible)
    if (visible) return
    try {
      const page = await request<Page<{ user: SocialUser }>>(`/users/${userId}/${which}`)
      if (which === 'followers') setFollowers(page.items.map(item => item.user)); else setFollowing(page.items.map(item => item.user))
      setCursors(old => ({ ...old, [which]: page.next_cursor }))
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar as conexões.') }
  }

  async function removeRelation(id: number, which: 'followers' | 'following') {
    try {
      if (which === 'followers') {
        await request<void>(`/me/followers/${id}`, 'DELETE')
        setFollowers(old => old.filter(item => item.id !== id))
      } else {
        await request<void>(`/users/${id}/follow`, 'DELETE')
        setFollowing(old => old.filter(item => item.id !== id))
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível atualizar a conexão.') }
  }

  async function loadMore(which: ListKind) {
    const cursor = cursors[which]
    if (!cursor || busy) return
    setBusy(true); setError('')
    try {
      const path = which === 'requests' ? '/me/follow-requests' : which === 'blocks' ? '/me/blocks' : `/users/${userId}/${which}`
      if (which === 'blocks') {
        const page = await request<Page<SocialUser>>(`${path}?cursor=${encodeURIComponent(cursor)}`)
        setBlocks(old => [...old, ...page.items]); setCursors(old => ({ ...old, blocks: page.next_cursor }))
      } else {
        const page = await request<Page<FollowRequest>>(`${path}?cursor=${encodeURIComponent(cursor)}`)
        if (which === 'requests') setRequests(old => [...old, ...page.items])
        else if (which === 'followers') setFollowers(old => [...old, ...page.items.map(item => item.user)])
        else setFollowing(old => [...old, ...page.items.map(item => item.user)])
        setCursors(old => ({ ...old, [which]: page.next_cursor }))
      }
    } catch (err) {
      if (err && typeof err === 'object' && 'status' in err && err.status === 401) onExpired()
      setError(err instanceof Error ? err.message : 'Não foi possível carregar mais conexões.')
    } finally { setBusy(false) }
  }

  function more(which: ListKind, label: string) {
    return cursors[which] && <button className="secondary full-width" disabled={busy} onClick={() => void loadMore(which)}>Carregar mais {label}</button>
  }

  return <section className="social-settings" aria-labelledby="social-settings-title">
    <h2 id="social-settings-title">Privacidade social</h2>
    {error && <p className="error" role="alert">{error}</p>}
    {!ready ? <p role="status">Carregando configurações sociais…</p> : <>
      <div className="social-privacy-control"><span><b>Conta {isPublic ? 'pública' : 'privada'}</b><small>{isPublic ? 'Pessoas conectadas podem ver suas publicações.' : 'Só seguidores aprovados podem ver suas publicações.'}</small></span><button className={isPublic ? 'secondary' : 'primary'} disabled={busy} onClick={() => void togglePrivacy()}>{isPublic ? 'Tornar privada' : 'Tornar pública'}</button></div>
      <h3>Solicitações para seguir <span className="social-count-badge">{requests.length}</span></h3>
      {requests.length ? requests.map(item => <div className="social-setting-person" key={item.user.id}><span>{item.user.name}</span><div><button className="primary" disabled={busy} onClick={() => void resolve(item.user.id, true)}>Aprovar</button><button className="secondary" disabled={busy} onClick={() => void resolve(item.user.id, false)}>Recusar</button></div></div>) : <p className="muted">Nenhuma solicitação pendente.</p>}
      {more('requests', 'solicitações')}
      <h3>Contas bloqueadas</h3>
      {blocks.length ? blocks.map(person => <div className="social-setting-person" key={person.id}><span>{person.name}</span><button className="secondary" disabled={busy} onClick={() => void unblock(person.id)}>Desbloquear</button></div>) : <p className="muted">Nenhuma conta bloqueada.</p>}
      {more('blocks', 'contas bloqueadas')}
      <div className="social-relationship-toggles"><button className="text-button" onClick={() => void toggleRelations('followers')}>{showFollowers ? 'Ocultar seguidores' : 'Gerenciar seguidores'}</button><button className="text-button" onClick={() => void toggleRelations('following')}>{showFollowing ? 'Ocultar seguindo' : 'Gerenciar contas seguidas'}</button></div>
      {showFollowers && <div><h3>Seguidores aprovados</h3>{followers.length ? followers.map(person => <div className="social-setting-person" key={person.id}><span>{person.name}</span><button className="secondary" disabled={busy} onClick={() => void removeRelation(person.id, 'followers')}>Remover</button></div>) : <p className="muted">Nenhum seguidor.</p>}{more('followers', 'seguidores')}</div>}
      {showFollowing && <div><h3>Contas que você segue</h3>{following.length ? following.map(person => <div className="social-setting-person" key={person.id}><span>{person.name}</span><button className="secondary" disabled={busy} onClick={() => void removeRelation(person.id, 'following')}>Deixar de seguir</button></div>) : <p className="muted">Você ainda não segue ninguém.</p>}{more('following', 'contas seguidas')}</div>}
    </>}
  </section>
}
