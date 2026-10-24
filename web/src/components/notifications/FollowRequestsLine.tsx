import { ChevronRight } from 'lucide-react'
import type { SocialUser } from '@/api/client'
import { SocialPhoto } from '@/components/SocialPhoto'

/** "Bruna Alves", "Bruna Alves e Diego Souza" ou "Bruna Alves, Diego Souza e mais 3". */
function followRequestNames(people: readonly SocialUser[], total: number): string {
  const names = people.slice(0, 2).map(person => person.name)
  if (names.length === 0) return ''
  if (total <= 2 || names.length < 2) return names.length === 2 ? `${names[0]} e ${names[1]}` : names[0]
  return `${names[0]}, ${names[1]} e mais ${total - 2}`
}

/**
 * Linha-resumo dos pedidos para seguir, no topo de *Tudo*: até 3 fotos empilhadas, a contagem e os primeiros nomes.
 * Abre a tela "Pedidos para seguir", onde se aprova e recusa.
 */
export function FollowRequestsLine({ people, count, onOpen }: { people: readonly SocialUser[]; count: number; onOpen: () => void }) {
  const names = followRequestNames(people, count)
  return <button type="button" data-slot="follow-requests-line" onClick={onOpen}
    className="flex min-h-[58px] w-full items-center gap-2.5 rounded-2xl border-0 bg-surface px-3 py-[11px] text-left text-inherit enabled:hover:bg-hover">
    <span aria-hidden="true" className="flex flex-none">
      {people.slice(0, 3).map(person => <SocialPhoto key={person.id} path={person.avatar_url} name={person.name} size="face" className="border-white" />)}
    </span>
    <span className="min-w-0 flex-1">
      <b className="block text-[12px] text-forest">{count} {count === 1 ? 'pedido para seguir' : 'pedidos para seguir'}</b>
      {names && <small className="mt-0.5 block truncate text-[10.5px] text-ink-muted">{names}</small>}
    </span>
    <ChevronRight size={17} className="flex-none text-ink-muted" aria-hidden="true" />
  </button>
}
