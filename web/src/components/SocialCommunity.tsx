import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowDown, Images, Plus, Search, Users } from 'lucide-react'
import type { Post } from '../api/client'
import { usePagedList } from '../hooks/usePagedList'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { ArenaMark } from './Brand'
import CommunityFeed from './CommunityFeed'
import CommunityPeople from './CommunityPeople'
import { NotificationBell } from './notifications/NotificationBell'
import PostComposer from './PostComposer'
import { buttonVariants } from '@/components/ui/button-variants'
import { feedbackVariants } from '@/components/ui/feedback'
import { Tabs } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

const tabs = [
  { value: 'feed', label: 'Publicações', Icon: Images },
  { value: 'people', label: 'Atletas', Icon: Users },
] as const
type CommunityTab = (typeof tabs)[number]['value']
/** Altura da linha do título, que recolhe ao rolar para baixo (K2). */
const TITLE_ROW = 54

/**
 * Comunidade (F2 + K2): barra escura fixa com o Coliseu, título e nova publicação; abas Publicações | Atletas.
 * Ao rolar para baixo, o título recolhe e só as abas ficam. O feed atualiza ao ser puxado no topo (com um botão
 * visível só no foco, para o teclado). A rolagem é a do `main` do app, onde a seção é montada.
 */
export default function SocialCommunity({ viewerId, onOpenUser, onExpired, notificationCount = 0, onNotifications, composeOnOpen = false, onComposeStarted }: {
  viewerId: number
  onOpenUser: (id: number) => void
  onExpired: () => void
  /** Não lidas mais pedidos para seguir (resumo das notificações do ArenaPage): o número do sino. */
  notificationCount?: number
  /** Abre a tela de notificações; sem ele, a barra não mostra o sino. */
  onNotifications?: () => void
  /** Abre direto a nova publicação (quadro "Nova foto" do perfil). */
  composeOnOpen?: boolean
  /** Consome o pedido de abertura sem remontar a Comunidade. */
  onComposeStarted?: () => void
}) {
  const [tab, setTab] = useState<CommunityTab>('feed')
  const [composing, setComposing] = useState(composeOnOpen)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [tucked, setTucked] = useState(false)
  const [scroller, setScroller] = useState<HTMLElement | null>(null)
  const rootRef = useCallback((node: HTMLElement | null) => setScroller(node?.closest('main') ?? null), [])
  const feed = usePagedList<Post>('/posts', onExpired)
  const { pull, ready } = usePullToRefresh(scroller, feed.reload, tab === 'feed' && !feed.loading && !composing)

  useEffect(() => {
    if (composeOnOpen) onComposeStarted?.()
  }, [composeOnOpen, onComposeStarted])

  // Busca com espera curta enquanto se digita; Enter busca na hora.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300)
    return () => clearTimeout(timer)
  }, [query])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 4000)
    return () => clearTimeout(timer)
  }, [notice])
  useEffect(() => {
    if (!scroller) return
    let last = scroller.scrollTop
    const onScroll = () => {
      const y = scroller.scrollTop
      if (y < TITLE_ROW) setTucked(false)
      else if (Math.abs(y - last) > 6) setTucked(y > last)
      else return
      last = y
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', onScroll)
  }, [scroller])

  function changeTab(next: CommunityTab) {
    if (next === tab) {
      // Tocar em "Publicações" de novo só volta ao início.
      if (next === 'feed') scroller?.scrollTo?.({ top: 0, behavior: 'smooth' })
      return
    }
    setTab(next); setTucked(false); scroller?.scrollTo?.({ top: 0 })
  }
  function submitSearch(event: FormEvent) {
    event.preventDefault()
    setSearch(query.trim())
  }
  function published(post: Post) {
    feed.setItems(old => [post, ...old])
    setComposing(false); setTab('feed'); setNotice('Publicação compartilhada.')
    scroller?.scrollTo?.({ top: 0 })
  }

  return <section ref={rootRef} className="min-h-full" aria-label="Comunidade Arena">
    <div className={cn('sticky z-topbar bg-forest text-white shadow-[0_6px_18px_#0b221833] motion-safe:transition-[top] motion-safe:duration-200',
      tucked ? '-top-[54px]' : 'top-0')}>
      <div className="flex h-[54px] items-center gap-2.5 pr-2 pl-[18px]">
        <ArenaMark className="h-[22px] w-[30px] text-mint" />
        <h1 className="flex-1 text-[17px] text-white">Comunidade</h1>
        {onNotifications && <NotificationBell tone="dark" count={notificationCount} onOpen={onNotifications} />}
        <button type="button" className="grid size-[38px] place-items-center rounded-full border-0 bg-mint text-night" aria-label="Nova publicação"
          onClick={() => setComposing(true)}><Plus size={20} /></button>
      </div>
      <Tabs variant="dark" items={tabs} value={tab} onChange={changeTab} label="Comunidade" idPrefix="community-tab-" controls="community-panel" />
      {tab === 'people' && <form role="search" className="px-4 pt-1 pb-3" onSubmit={submitSearch}>
        <label className="sr-only" htmlFor="community-search">Buscar atletas por nome ou @</label>
        <div className="relative">
          <Search size={17} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#ffffffa6]" />
          <input id="community-search" type="search" autoComplete="off" maxLength={100} value={query} onChange={event => setQuery(event.target.value)}
            placeholder="Buscar atletas pelo nome ou @" className="min-h-11 border-[#ffffff2e] bg-[#ffffff14] py-2.5 pl-9 text-white placeholder:text-[#ffffff8c]" />
        </div>
      </form>}
    </div>

    <div id="community-panel" role="tabpanel" aria-labelledby={`community-tab-${tab}`}>
      {tab === 'feed' ? <>
        <button type="button" className={cn(buttonVariants({ variant: 'secondary', size: 'compact' }), 'sr-only focus:not-sr-only focus:mx-4 focus:mt-3')}
          onClick={feed.reload}>Atualizar feed</button>
        <div className="grid place-items-center overflow-hidden text-[10.5px] font-semibold text-brand" style={{ height: pull }} aria-hidden={pull === 0}>
          {pull > 0 && <span className="flex items-center gap-1.5"><ArrowDown size={16} className={cn('motion-safe:transition-transform', ready && 'rotate-180')} />
            {ready ? 'Solte para atualizar' : 'Puxe para atualizar'}</span>}
        </div>
        {notice && <p className={cn(feedbackVariants({ tone: 'success' }), 'mx-4 mt-3')} role="status">{notice}</p>}
        <CommunityFeed feed={feed} viewerId={viewerId} scroller={scroller} onOpenUser={onOpenUser} onExpired={onExpired}
          onCompose={() => setComposing(true)} onSearch={() => changeTab('people')} />
      </> : <CommunityPeople viewerId={viewerId} query={search} onOpenUser={onOpenUser} onExpired={onExpired} />}
    </div>
    {composing && <PostComposer onClose={() => setComposing(false)} onPublished={published} onExpired={onExpired} />}
  </section>
}
