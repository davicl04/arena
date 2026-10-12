import { useEffect, useId, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { LogOut, Pencil, QrCode, ShieldPlus, UserPlus } from 'lucide-react'
import type { TeamCard } from '@/api/teams'
import { cn } from '@/lib/utils'
import { teamButton } from './styles'
import { TeamIdCard } from './TeamIdCard'

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Carrossel de carteirinhas (M3): uma C5 por time, deslizando na placa, e um último quadro tracejado "Criar time".
 * O cartão centralizado define o time selecionado (e o elenco mostrado abaixo). Teclado: setas, Home e End trocam de
 * cartão e levam o foco a ele; focar um botão de outro cartão também o seleciona. Os pontos abaixo levam a cada cartão.
 */
export function TeamCardCarousel({ teams, selectedId, onSelect, onCreate, onInvite, onLink, onEdit, onLeave }: {
  teams: TeamCard[]
  selectedId: number | null
  onSelect: (teamId: number) => void
  onCreate: () => void
  onInvite: (team: TeamCard) => void
  onLink: (team: TeamCard) => void
  onEdit: (team: TeamCard) => void
  onLeave: (team: TeamCard) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const hintId = useId()
  // Seleção que veio da própria rolagem: não precisa rolar de novo até o cartão.
  const fromScroll = useRef<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const selectedIndex = Math.max(0, teams.findIndex(team => team.id === selectedId))
  const slideCount = teams.length + 1

  function scrollToSlide(index: number, smooth: boolean) {
    const box = scroller.current
    const slide = box?.children[index] as HTMLElement | undefined
    if (!box || !slide) return
    box.scrollTo?.({ left: slide.offsetLeft + slide.offsetWidth / 2 - box.clientWidth / 2, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' })
  }
  useEffect(() => {
    const origin = fromScroll.current
    fromScroll.current = null
    if (selectedId !== null && origin === selectedId) return
    scrollToSlide(selectedIndex, origin !== null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, teams.length])
  useEffect(() => () => clearTimeout(timer.current), [])

  function onScroll() {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const box = scroller.current
      if (!box || !teams.length) return
      const middle = box.scrollLeft + box.clientWidth / 2
      let best = 0
      let distance = Infinity
      Array.from(box.children).forEach((child, index) => {
        const element = child as HTMLElement
        const gap = Math.abs(element.offsetLeft + element.offsetWidth / 2 - middle)
        if (gap < distance) { distance = gap; best = index }
      })
      // O quadro "Criar time" não troca o elenco mostrado.
      const team = teams[Math.min(best, teams.length - 1)]
      if (team.id !== selectedId) { fromScroll.current = team.id; onSelect(team.id) }
    }, 120)
  }
  function goTo(index: number) {
    const next = Math.min(Math.max(index, 0), slideCount - 1)
    if (next < teams.length && teams[next].id !== selectedId) { fromScroll.current = -1; onSelect(teams[next].id) }
    scrollToSlide(next, true)
    const slide = scroller.current?.children[next] as HTMLElement | undefined
    slide?.focus({ preventScroll: true })
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = Array.from(scroller.current?.children ?? []).findIndex(child => child.contains(document.activeElement))
    const from = current >= 0 ? current : selectedIndex
    const next = event.key === 'ArrowRight' ? from + 1 : event.key === 'ArrowLeft' ? from - 1
      : event.key === 'Home' ? 0 : event.key === 'End' ? slideCount - 1 : null
    if (next === null) return
    event.preventDefault()
    goTo(next)
  }

  return <section aria-roledescription="carrossel" aria-label="Seus times" aria-describedby={hintId}>
    <p id={hintId} className="sr-only">Use as setas para trocar de time. O elenco abaixo acompanha o cartão escolhido.</p>
    <div ref={scroller} onScroll={onScroll} onKeyDown={onKeyDown}
      className="relative flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pt-4 pb-1.5 scrollbar-hidden">
      {teams.map((team, index) => {
        const representative = team.my_role === 'representante'
        return <div key={team.id} role="group" aria-roledescription="carteirinha" aria-label={`${team.name}, ${index + 1} de ${teams.length}`}
          tabIndex={index === selectedIndex ? 0 : -1} onFocus={() => { if (team.id !== selectedId) { fromScroll.current = -1; onSelect(team.id) } }}
          className="w-[84%] flex-none snap-center rounded-[22px] outline-offset-2 focus-visible:outline-3 focus-visible:outline-mint">
          <TeamIdCard team={team} className="h-full" actions={representative ? <>
            <button type="button" className={cn(teamButton(), 'flex-1')} onClick={() => onInvite(team)}><UserPlus aria-hidden="true" />Convidar</button>
            <button type="button" className={cn(teamButton({ tone: 'line' }), 'w-[42px] flex-none px-0')} aria-label="Link e QR do time" onClick={() => onLink(team)}><QrCode aria-hidden="true" /></button>
            <button type="button" className={cn(teamButton({ tone: 'line' }), 'w-[42px] flex-none px-0')} aria-label="Editar time" onClick={() => onEdit(team)}><Pencil aria-hidden="true" /></button>
          </> : <button type="button" className={cn(teamButton({ tone: 'line' }), 'flex-1')} onClick={() => onLeave(team)}><LogOut aria-hidden="true" />Sair do time</button>} />
        </div>
      })}
      <button type="button" onClick={onCreate}
        className="grid min-h-[236px] w-[84%] flex-none snap-center content-center justify-items-center gap-2 rounded-[22px] border-[1.5px] border-dashed border-white/25 bg-transparent text-[13px] font-bold text-mint outline-offset-2 focus-visible:outline-mint">
        <ShieldPlus size={30} aria-hidden="true" />Criar time
      </button>
    </div>
    <div className="flex justify-center gap-0.5 pt-1 pb-3">
      {[...teams.map(team => team.name), 'Criar time'].map((name, index) => {
        const active = index === selectedIndex && index < teams.length
        return <button key={`${name}-${index}`} type="button" tabIndex={-1} aria-label={`Mostrar ${name}`} aria-current={active ? 'true' : undefined}
          className="grid h-6 min-w-4 place-items-center border-0 bg-transparent px-[3px]" onClick={() => goTo(index)}>
          <i className={cn('block h-1.5 rounded-[3px]', active ? 'w-[18px] bg-mint' : 'w-1.5 bg-white/22')} />
        </button>
      })}
    </div>
  </section>
}
