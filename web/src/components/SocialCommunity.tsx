import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { ArrowDown, Images, Plus, Search, Users } from 'lucide-react'
import type { Post } from '../api/client'
import { useLayout } from '../hooks/useLayout'
import { usePagedList } from '../hooks/usePagedList'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { ArenaMark } from './Brand'
import CommunityFeed from './CommunityFeed'
import CommunityPeople from './CommunityPeople'
import { NotificationBell } from './notifications/NotificationBell'
import PostComposer from './PostComposer'
import { buttonVariants } from '@/components/ui/button-variants'
import { Tabs } from '@/components/ui/tabs'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

const tabs = [
  { value: 'feed', label: 'Publicações', Icon: Images },
  { value: 'people', label: 'Atletas', Icon: Users },
] as const
type CommunityTab = (typeof tabs)[number]['value']
/** Altura da linha do título, que recolhe ao rolar para baixo (K2). */
const TITLE_ROW = 54
/*
 * Tela larga (ticket 06 da web responsiva). A seção vai de ponta a ponta da área de conteúdo (`data-largura="total"`),
 * para a barra escura cobrir a largura toda, e centraliza o conteúdo interno em `measure`: no tablet, a coluna do feed
 * (35rem, as fotos não esticam); no computador, o feed e a coluna "Atletas" (20rem) lado a lado (`columns`).
 */
const measure = 'md:mx-auto md:w-full md:max-w-[39rem] md:px-8 lg:max-w-[61rem] lg:px-6'
const columns = 'grid grid-cols-[minmax(0,35rem)_20rem] items-start justify-between gap-x-[clamp(1.5rem,2.5vw,2.5rem)]'

/**
 * Comunidade (F2 + K2): barra escura fixa com o Coliseu, título e nova publicação; abas Publicações | Atletas.
 * Ao rolar para baixo, o título recolhe e só as abas ficam. O feed atualiza ao ser puxado no topo (com um botão
 * visível só no foco, para o teclado). A rolagem é a do `main` do app, onde a seção é montada.
 * No computador não há abas: o feed fica numa coluna de leitura e "Atletas" (busca, alianças e resultados) ao lado,
 * presa sob a barra; a barra tem só a linha do título, que recolhe inteira.
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
  const layout = useLayout()
  const desktop = layout === 'computador'
  const wide = layout !== 'celular'
  const [tab, setTab] = useState<CommunityTab>('feed')
  const [composing, setComposing] = useState(composeOnOpen)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [tucked, setTucked] = useState(false)
  const [scroller, setScroller] = useState<HTMLElement | null>(null)
  const rootRef = useCallback((node: HTMLElement | null) => setScroller(node?.closest('main') ?? null), [])
  const searchInput = useRef<HTMLInputElement>(null)
  const feed = usePagedList<Post>('/posts', onExpired)
  const { pull, ready } = usePullToRefresh(scroller, feed.reload, (desktop || tab === 'feed') && !feed.loading && !composing)

  useEffect(() => {
    if (composeOnOpen) onComposeStarted?.()
  }, [composeOnOpen, onComposeStarted])

  // Busca com espera curta enquanto se digita; Enter busca na hora.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300)
    return () => clearTimeout(timer)
  }, [query])
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
    // No computador, "Atletas" já está ao lado: "Buscar atletas" (feed vazio) só leva ao campo de busca.
    if (desktop && next === 'people') { searchInput.current?.focus(); return }
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
    setComposing(false); setTab('feed'); toast.success('Publicação compartilhada.')
    scroller?.scrollTo?.({ top: 0 })
  }

  const searchForm = (light: boolean) => <form role="search" className={light ? 'mt-3 px-5' : cn('px-4 pt-1 pb-3', measure)} onSubmit={submitSearch}>
    <label className="sr-only" htmlFor="community-search">Buscar atletas por nome ou @</label>
    <div className="relative">
      <Search size={17} className={cn('pointer-events-none absolute top-1/2 left-3 -translate-y-1/2', light ? 'text-ink-muted' : 'text-[#ffffffa6]')} />
      <input ref={searchInput} id="community-search" type="search" autoComplete="off" maxLength={100} value={query} onChange={event => setQuery(event.target.value)}
        placeholder="Buscar atletas pelo nome ou @" className={light ? 'min-h-11 py-2.5 pl-9' : 'min-h-11 border-[#ffffff2e] bg-[#ffffff14] py-2.5 pl-9 text-white placeholder:text-[#ffffff8c]'} />
    </div>
  </form>
  const people = <CommunityPeople viewerId={viewerId} query={search} onOpenUser={onOpenUser} onExpired={onExpired} className={desktop ? 'pb-4' : 'md:px-0'} />
  const feedBlock = <>
    <button type="button" className={cn(buttonVariants({ variant: 'secondary', size: 'compact' }), 'sr-only focus:not-sr-only focus:mx-4 focus:mt-3 md:focus:mx-0 md:focus:mt-0 md:focus:mb-4')}
      onClick={feed.reload}>Atualizar feed</button>
    <div className="grid place-items-center overflow-hidden text-[10.5px] font-semibold text-brand" style={{ height: pull }} aria-hidden={pull === 0}>
      {pull > 0 && <span className="flex items-center gap-1.5"><ArrowDown size={16} className={cn('motion-safe:transition-transform', ready && 'rotate-180')} />
        {ready ? 'Solte para atualizar' : 'Puxe para atualizar'}</span>}
    </div>
    <CommunityFeed feed={feed} viewerId={viewerId} scroller={scroller} onOpenUser={onOpenUser} onExpired={onExpired}
      onCompose={() => setComposing(true)} onSearch={() => changeTab('people')} />
  </>

  return <section ref={rootRef} className="min-h-full" aria-label="Comunidade Arena" data-largura={wide ? 'total' : undefined}>
    <div className={cn('sticky z-topbar bg-forest text-white shadow-[0_6px_18px_#0b221833] motion-safe:transition-[top] motion-safe:duration-200',
      tucked ? '-top-[54px] lg:-top-[90px]' : 'top-0')}>
      <div className={cn('flex h-[54px] items-center gap-2.5 pr-2 pl-[18px] lg:h-16', measure)}>
        <ArenaMark className="h-[22px] w-[30px] text-mint lg:h-[26px] lg:w-9" />
        <h1 className="flex-1 text-[17px] text-white lg:text-[19px]">Comunidade</h1>
        {onNotifications && <NotificationBell tone="dark" count={notificationCount} onOpen={onNotifications} />}
        <button type="button" className="grid size-[38px] place-items-center rounded-full border-0 bg-mint text-night" aria-label="Nova publicação"
          onClick={() => setComposing(true)}><Plus size={20} /></button>
      </div>
      {!desktop && <>
        <Tabs variant="dark" items={tabs} value={tab} onChange={changeTab} label="Comunidade" idPrefix="community-tab-" controls="community-panel" className={measure} />
        {tab === 'people' && searchForm(false)}
      </>}
    </div>

    {desktop ? <div className={cn(measure, columns, 'pt-7')}>
      <div role="region" aria-label="Publicações" className="min-w-0">{feedBlock}</div>
      <CommunityAside tucked={tucked}>{searchForm(true)}{people}</CommunityAside>
    </div> : <div id="community-panel" role="tabpanel" aria-labelledby={`community-tab-${tab}`} className={cn(measure, 'md:pt-6')}>
      {tab === 'feed' ? feedBlock : people}
    </div>}
    {composing && <PostComposer onClose={() => setComposing(false)} onPublished={published} onExpired={onExpired} />}
  </section>
}

/**
 * Coluna "Atletas" do computador: cartão preso logo abaixo da barra (e ao topo quando ela recolhe), com rolagem própria
 * quando a lista passa da altura da janela. O gesto de puxar para atualizar é do feed: roda e toque dentro da coluna não
 * chegam ao `main`, para rolar a lista de volta ao topo não atualizar o feed.
 */
function CommunityAside({ tucked, children }: { tucked: boolean; children: ReactNode }) {
  const [node, setNode] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!node) return
    const stop = (event: Event) => event.stopPropagation()
    node.addEventListener('wheel', stop, { passive: true })
    node.addEventListener('touchstart', stop, { passive: true })
    return () => {
      node.removeEventListener('wheel', stop)
      node.removeEventListener('touchstart', stop)
    }
  }, [node])
  return <aside ref={setNode} aria-labelledby="community-people-title"
    className={cn('sticky max-h-[calc(100dvh-7.5rem)] overflow-y-auto rounded-card surface pt-5 shadow-card inset-ring inset-ring-surface-edge [scrollbar-width:thin] motion-safe:transition-[top] motion-safe:duration-200',
      tucked ? 'top-7' : 'top-[5.75rem]')}>
    <div className="px-5">
      <h2 id="community-people-title" className="flex items-center gap-2 text-[15px]"><Users size={18} className="text-brand" />Atletas</h2>
    </div>
    {children}
  </aside>
}
