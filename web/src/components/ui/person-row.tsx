import type { ComponentProps, ReactNode } from 'react'
import type { SocialUser } from '@/api/client'
import { SocialPhoto } from '@/components/SocialPhoto'
import { cn } from '@/lib/utils'

/*
 * Linha compacta de pessoa (.person-row, .person-main, .person-text, .person-handle, .person-info,
 * .person-actions): foto (SocialPhoto, 42 px), nome, @, informação extra e ações rápidas.
 */
export function PersonRow({ person, info, actions, onOpen, className }: {
  person: SocialUser
  info?: string
  actions?: ReactNode
  onOpen?: (id: number) => void
  className?: string
}) {
  const body = <>
    <SocialPhoto path={person.avatar_url} name={person.name} />
    <span className="grid min-w-0 gap-px">
      <b className="text-[12.5px] wrap-anywhere">{person.name}</b>
      <small className="text-[10.5px] wrap-anywhere text-brand">@{person.username}</small>
      {info && <small className="text-[10.5px] text-ink-muted">{info}</small>}
    </span>
  </>
  const main = 'flex min-w-0 flex-1 items-center gap-3 border-0 bg-transparent p-0 text-left text-inherit'
  return <div data-slot="person-row" className={cn('flex items-center justify-between gap-2.5 py-2.5 [&+&]:border-t [&+&]:border-line', className)}>
    {onOpen
      ? <button type="button" data-slot="person-main" className={main} aria-label={`Abrir perfil de ${person.name}`} onClick={() => onOpen(person.id)}>{body}</button>
      : <div data-slot="person-main" className={main}>{body}</div>}
    {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
  </div>
}

/** Lista de linhas de pessoa (.person-list). */
export function PersonList({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="person-list" className={cn('mt-2 mb-3 grid', className)} {...props} />
}
