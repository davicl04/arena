import { useEffect, useRef } from 'react'
import { connection, useConnection } from '@/api/connection'
import type { ConnectionState } from '@/api/connection'
import { Sheet, SheetActions } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useNow } from '@/hooks/useNow'
import { cn } from '@/lib/utils'

/*
 * Aviso de conexão do app inteiro (plano de toasts, A3): a faixa presa acima da navegação inferior enquanto a ARENA não
 * responde, e a folha "Sem conexão" quando a pessoa tenta uma ação (`connection.attempted`). A folha só abre uma vez:
 * "Continuar sem conexão" a dispensa e, daí em diante, uma nova tentativa só faz a faixa tremer. Quando a conexão volta, a
 * faixa vira "Conexão restabelecida" por alguns segundos. Monte dentro do `app-frame` (a folha e a faixa são absolutas
 * nele) e passe o próprio `frame`: o componente define `--connection-dock` nele para o toast subir junto com a faixa.
 * Não aparece na tela de entrada, que tem o próprio "Tentar conexão novamente".
 */
const DOCK_HEIGHT = '52px'

function Dot({ restored = false }: { restored?: boolean }) {
  return <span aria-hidden="true" className={cn('size-2.5 flex-none rounded-full', restored ? 'bg-mint' : 'bg-warning-soft motion-safe:animate-pulse-dot')} />
}

/** "Nova tentativa em N s." (ou "Tentando agora…"), acompanhando o relógio. O componente que usa monta quando o aviso liga, então o relógio nasce atual. */
function useRetryText({ nextRetryAt, checking, status }: ConnectionState): string {
  const now = useNow(1000, status === 'offline' && nextRetryAt !== null)
  if (checking) return 'Tentando agora…'
  const seconds = nextRetryAt === null ? 0 : Math.max(0, Math.ceil((nextRetryAt - now) / 1000))
  return `Nova tentativa em ${seconds}\u00a0s.`
}

function Strip({ state }: { state: ConnectionState }) {
  const offline = state.status === 'offline'
  const retry = useRetryText(state)
  const node = useRef<HTMLDivElement>(null)
  // Ação tentada com a folha dispensada: a faixa treme (sem animação com movimento reduzido).
  useEffect(() => {
    const strip = node.current
    if (!strip || state.nudge === 0 || typeof strip.animate !== 'function') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    strip.animate(
      [{ translate: '0 0' }, { translate: '-7px 0' }, { translate: '6px 0' }, { translate: '-4px 0' }, { translate: '3px 0' }, { translate: '0 0' }],
      { duration: 420, easing: 'ease-in-out' },
    )
  }, [state.nudge])
  return <div ref={node} data-slot="connection-strip" data-state={state.status} data-nudged={state.nudge} role="status"
    className={cn('absolute inset-x-0 bottom-[82px] z-connection flex h-[52px] items-center gap-3 rounded-t-card border-0 border-t border-solid bg-glass-strong px-4 text-white backdrop-blur-[16px] backdrop-saturate-[1.3] app-narrow:bottom-[calc(82px+env(safe-area-inset-bottom))]',
      offline ? 'border-t-warning-soft/[0.33]' : 'border-t-mint/[0.33]')}>
    <Dot restored={!offline} />
    {offline ? <>
      <span className="min-w-0 flex-1">
        <b className="block truncate font-display text-[12.5px] font-semibold">Sem conexão com a ARENA</b>
        <small className="block truncate text-[10.5px] text-white/65">{retry}</small>
      </span>
      <button type="button" onClick={() => connection.retryNow()} disabled={state.checking}
        className="min-h-8 flex-none rounded-full border border-solid border-white/35 bg-transparent px-3 text-[11px] font-bold text-white hover:bg-white/10 focus-visible:outline-mint">
        Tentar agora
      </button>
    </> : <b className="font-display text-[12.5px] font-semibold">Conexão restabelecida</b>}
  </div>
}

function OfflineSheet({ state }: { state: ConnectionState }) {
  const retry = useRetryText(state)
  return <Sheet tone="dark" title="Sem conexão com a ARENA" eyebrow={<span className="inline-flex items-center gap-1.5"><Dot />Offline</span>}
    description={`Suas ações não chegam ao servidor agora. ${retry}`} onClose={() => connection.dismissSheet()}>
    <span aria-hidden="true" className="pointer-events-none absolute right-0 bottom-0 h-[120px] w-[214px] bg-warning-soft opacity-[0.08] mask-[url(/images/brand/coliseum.svg)] mask-contain mask-right-bottom mask-no-repeat" />
    <SheetActions className="relative mt-3 flex-col">
      <Button type="button" variant="glass" data-autofocus disabled={state.checking} onClick={() => connection.retryNow()}>Tentar agora</Button>
      <Button type="button" variant="glass-secondary" onClick={() => connection.dismissSheet()}>Continuar sem conexão</Button>
    </SheetActions>
  </Sheet>
}

export function ConnectionNotice({ frame }: { frame?: HTMLElement | null }) {
  const state = useConnection()
  const visible = state.status !== 'online'
  useEffect(() => connection.listenToWindow(), [])
  useEffect(() => {
    if (!frame) return
    frame.style.setProperty('--connection-dock', visible ? DOCK_HEIGHT : '0px')
    return () => { frame.style.removeProperty('--connection-dock') }
  }, [frame, visible])
  return <>
    {visible && <Strip state={state} />}
    {state.sheetOpen && state.status === 'offline' && <OfflineSheet state={state} />}
  </>
}
