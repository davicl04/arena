import { useEffect, useRef, useState } from 'react'
import type { ReactNode, Ref } from 'react'
import { Shield, UserCog } from 'lucide-react'
import { apiUrl, sports } from '../api/client'
import type { Sport, SocialUser } from '../api/client'
import { cover as defaultCover, sportIcons } from '../data/arena'
import { ChipLabel } from '@/components/ui/chip'
import { SocialPhoto } from './SocialPhoto'

function MutualSummary({ items, total }: { items: SocialUser[]; total: number }) {
  const [first, second] = items
  if (!first || total < 1) return null
  if (total === 1) return <><b>{first.name}</b>, que você segue, também segue esta conta</>
  if (total === 2 && second) return <><b>{first.name}</b> e <b>{second.name}</b> que você segue também seguem esta conta</>
  return <><b>{first.name}</b>{second && <>, <b>{second.name}</b></>} e mais {total - (second ? 2 : 1)} que você segue também seguem esta conta</>
}

/* Transição da barra e do título ao condensar (só sem preferência por movimento reduzido). */
const topbarMotion = 'motion-safe:transition-[background-color,border-color,opacity] motion-safe:duration-200 motion-safe:ease-[ease]'

/**
 * Barra fixa do perfil: botões em círculos de vidro sobre a capa; condensada (fundo claro e @usuário) depois dela.
 * Os botões usam `IconButton tone="cover"`, que reage a `group/topbar` + `data-condensed`.
 */
export function ProfileTopbar({ leading, trailing, username, condensed = false }: {
  leading?: ReactNode
  trailing?: ReactNode
  username?: string
  condensed?: boolean
}) {
  return <div data-condensed={condensed ? 'true' : 'false'}
    className={`group/topbar sticky top-0 z-topbar -mx-5 -mb-14 flex h-14 items-center gap-2 border-b border-transparent px-3 py-1.5 data-[condensed=true]:border-line data-[condensed=true]:bg-nav data-[condensed=true]:backdrop-blur-[14px] ${topbarMotion}`}>
    <span className="flex min-w-11 items-center">{leading}</span>
    <span className={`min-w-0 flex-1 truncate text-center font-display text-[15px] font-bold text-ink opacity-0 group-data-[condensed=true]/topbar:opacity-100 ${topbarMotion}`} aria-hidden="true">{username ? `@${username}` : ''}</span>
    <span className="flex min-w-11 items-center justify-end">{trailing}</span>
  </div>
}

/** Capa do perfil com degradê escuro no topo; a imagem (valor dinâmico) vem de `url`. */
export function ProfileCover({ url, ref }: { url?: string; ref?: Ref<HTMLDivElement> }) {
  return <div ref={ref}
    className="relative -mx-5 h-[158px] overflow-hidden rounded-b-card bg-(--color-cover) bg-cover bg-position-[center_38%] before:absolute before:inset-0 before:bg-[linear-gradient(#0006,transparent_55%)]"
    style={url ? { backgroundImage: `url("${url}")` } : undefined} />
}

const connButton = 'min-h-8 rounded-[6px] border-0 bg-transparent px-0.5 py-1 text-[12px] text-ink-muted [&_b]:text-ink [&_b]:tabular-nums hover:[&_span]:underline'

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
  const cover = useRef<HTMLDivElement>(null)
  const [condensed, setCondensed] = useState(false)
  useEffect(() => {
    const node = cover.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    // A capa "sai" quando passa por baixo da barra (56 px): a partir daí a barra condensa.
    const observer = new IntersectionObserver(([entry]) => setCondensed(!entry.isIntersecting),
      { root: node.closest('main'), rootMargin: '-56px 0px 0px 0px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return <>
    <ProfileTopbar leading={leading} trailing={trailing} username={username} condensed={condensed} />
    <ProfileCover ref={cover} url={coverUrl ? apiUrl(coverUrl) : defaultCover} />
    <section className="relative pt-11" aria-label={mode === 'own' ? 'Seu perfil' : `Perfil de ${name}`}>
      <div className="absolute -top-[42px] left-0 size-[88px]">
        {/* A foto de visitante chega como <SocialPhoto size="fill" />, que ocupa o quadro inteiro. */}
        <div data-slot="profile-avatar"
          className="grid size-[88px] place-items-center overflow-hidden rounded-full border-4 border-solid border-white noite:border-app bg-app text-[22px] font-extrabold text-ink shadow-[0_2px_8px_#0001] noite:shadow-none [&_img]:size-full [&_img]:object-cover">{avatar}</div>
        {mode === 'own' && onEdit && <button type="button" aria-label="Editar perfil" onClick={onEdit}
          className="absolute -right-1 bottom-0.5 grid size-9 place-items-center rounded-full border-[3px] border-solid border-app bg-brand p-0 text-on-brand hover:bg-brand-hover"><UserCog size={16} /></button>}
      </div>
      {actions && <div className="mb-1 flex justify-end">{actions}</div>}
      <h1 className="mt-[13px] text-[21px] wrap-anywhere"><span className="text-brand">@</span>{username}</h1>
      <p className="mt-[3px] mb-1 text-[12px] font-medium wrap-anywhere text-ink-muted">{name}</p>
      {followerCount !== null && followingCount !== null && <div className="mt-0.5 mb-2 flex flex-wrap items-center gap-x-1 gap-y-0.5">
        <button type="button" className={connButton} onClick={onFollowers}><b>{followerCount}</b> <span>{followerCount === 1 ? 'seguidor' : 'seguidores'}</span></button>
        <span className="text-ink-muted" aria-hidden="true">·</span>
        <button type="button" className={connButton} onClick={onFollowing}><b>{followingCount}</b> <span>seguindo</span></button>
      </div>}
      {mode === 'visitor' && mutual && mutual.total > 0 && <button type="button" onClick={onMutual}
        className="group mb-2 flex min-h-11 w-full items-center gap-2.5 rounded-xl border-0 bg-transparent px-0 py-1 text-left">
        <span data-slot="mutual-faces" className="flex shrink-0">{mutual.items.slice(0, 3).map(person => <SocialPhoto key={person.id} path={person.avatar_url} name={person.name} size="face" />)}</span>
        <span className="min-w-0 flex-1 text-[11px] leading-[1.45] text-ink group-hover:underline [&_b]:wrap-anywhere"><MutualSummary items={mutual.items} total={mutual.total} /></span>
      </button>}
      <div className="flex flex-wrap gap-1.5 empty:hidden">
        {sportList.map(sport => {
          const Icon = sportIcons[sport]
          return <ChipLabel size="sm" active key={sport}><Icon size={13} />{sports.find(s => s.value === sport)?.label}</ChipLabel>
        })}
        {mode === 'own' && !sportList.length && <span className="text-[11px] leading-[1.6] text-ink-muted">Adicione sua primeira modalidade</span>}
      </div>
      <p className="my-4 flex items-center gap-[5px] text-[10px] wrap-anywhere text-ink-muted"><Shield size={13} />Conta {isPublic ? 'pública' : 'privada'}</p>
    </section>
  </>
}
