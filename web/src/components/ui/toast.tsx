/* A API imperativa (`toast`, `toastManager`) mora junto dos componentes para que haja um só ponto de importação. */
/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Toast } from '@base-ui/react/toast'
import { Check, Info, X } from 'lucide-react'

/*
 * Toast ARENA ("Vidro do Coliseu", cartão "Anel"): resultado passageiro de uma ação, no `app-frame`, acima da navegação
 * inferior. Base: Toast do Base UI (`Provider`, `Portal`, `Viewport`, `Root`, `Title`, `Description`, `Action`, `Close`),
 * que cuida dos temporizadores (pausa com ponteiro, foco e janela sem foco), da pilha, do arrasto e da região viva
 * (`Viewport` = `role="region"` + `aria-live`; o erro usa `priority: 'high'`, anunciado na hora). Os estilos ficam em
 * `ui.css` (bloco "Toast"). Chame de qualquer lugar (componente, hook, cliente da API):
 *
 *   toast.success('Perfil salvo.')
 *   toast.warning('Vaga reservada.', { description: 'Envie o comprovante.', action: { label: 'Enviar', onClick } })
 *   toast.error(mensagemDoServidor)      // fica até ser fechado
 *
 * Só um `<Toaster>` precisa estar montado (ArenaPage e AuthPage). Sem ele, a chamada não faz nada.
 */
export type ToastTone = 'success' | 'info' | 'warning' | 'error'
export interface ToastAction { label: string; onClick: () => void }
export interface ToastOptions {
  description?: string
  /** No máximo uma ação, em pílula na cor do tom. */
  action?: ToastAction
  /** Repetir o id atualiza o toast que já está na tela (e renova o tempo) em vez de empilhar outro. */
  id?: string
}

/** Tempo de exibição por tom, em ms. `0` = fica até ser fechado (o erro). Único lugar que define as durações. */
export const TOAST_DURATION: Record<ToastTone, number> = { success: 4000, info: 5000, warning: 7000, error: 0 }
/** Máximo de toasts no baralho; os mais antigos saem de vista (não são descartados). */
export const TOAST_LIMIT = 4

export const toastManager = Toast.createToastManager()

function show(tone: ToastTone, title: string, options: ToastOptions = {}): string {
  return toastManager.add({
    id: options.id,
    title,
    description: options.description,
    type: tone,
    timeout: TOAST_DURATION[tone],
    priority: tone === 'error' ? 'high' : 'low',
    actionProps: options.action ? { children: options.action.label, onClick: options.action.onClick } : undefined,
  })
}

/** Chamadas tipadas; cada uma devolve o id do toast. */
export const toast = {
  success: (title: string, options?: ToastOptions) => show('success', title, options),
  info: (title: string, options?: ToastOptions) => show('info', title, options),
  warning: (title: string, options?: ToastOptions) => show('warning', title, options),
  error: (title: string, options?: ToastOptions) => show('error', title, options),
  /** Fecha um toast pelo id, ou todos sem argumento. */
  dismiss: (id?: string) => toastManager.close(id),
}

const isTone = (value: string | undefined): value is ToastTone => value === 'success' || value === 'info' || value === 'warning' || value === 'error'

/** Ponto de exclamação do aviso (a biblioteca de ícones não tem um sozinho). */
function Bang({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v9" /><path d="M12 19h.01" />
  </svg>
}

function Glyph({ tone }: { tone: ToastTone }): ReactNode {
  if (tone === 'success') return <Check size={15} strokeWidth={2.6} aria-hidden="true" />
  if (tone === 'error') return <X size={15} strokeWidth={2.6} aria-hidden="true" />
  if (tone === 'warning') return <Bang size={15} />
  return <Info size={15} strokeWidth={2.6} aria-hidden="true" />
}

/** Janela com foco? O Base UI pausa os temporizadores quando ela perde o foco; o anel acompanha. */
function useWindowFocused(): boolean {
  const [focused, setFocused] = useState(true)
  useEffect(() => {
    const blur = (event: Event) => { if (event.target === window) setFocused(false) }
    const focus = (event: Event) => { if (event.target === window) setFocused(true) }
    window.addEventListener('blur', blur, true)
    window.addEventListener('focus', focus, true)
    return () => { window.removeEventListener('blur', blur, true); window.removeEventListener('focus', focus, true) }
  }, [])
  return focused
}

/** Anel de 36 px: trilha no tom a 18% e arco que esvazia durante a duração (cheio e parado no erro). */
function Ring({ duration, restartKey, children }: { duration: number; restartKey: number; children: ReactNode }) {
  return <span data-slot="toast-ring" className="relative grid size-9 flex-none place-items-center text-(--tone)">
    <svg viewBox="0 0 36 36" width="36" height="36" fill="none" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true" className="absolute inset-0">
      <circle cx="18" cy="18" r="16" style={{ stroke: 'color-mix(in srgb, var(--tone) 18%, transparent)' }} />
      <circle key={restartKey} cx="18" cy="18" r="16" stroke="currentColor" className="toast-ring-arc" data-timed={duration > 0 ? '' : undefined}
        style={duration > 0 ? { ['--toast-duration' as string]: `${duration}ms` } : undefined} />
    </svg>
    {children}
  </span>
}

export interface ToastCardProps {
  toast: Toast.Root.ToastObject
  /** Atrás de outro toast, com o baralho fechado: o conteúdo fica oculto. */
  behind?: boolean
}

/** Cartão "Anel": glifo dentro do anel, título, descrição, ação e X. Precisa estar dentro de `Toast.Provider`. */
export function ToastCard({ toast: item, behind = false }: ToastCardProps) {
  const tone: ToastTone = isTone(item.type) ? item.type : 'info'
  const windowFocused = useWindowFocused()
  // `role="group"` no lugar do `dialog` do Base UI: o toast não é um diálogo, e a lista de diálogos (e `getByRole('dialog')`) fica só com folhas e diálogos de verdade.
  return <Toast.Root toast={item} role="group" swipeDirection="down" data-tone={tone} data-behind={behind ? '' : undefined} data-blurred={windowFocused ? undefined : ''}
    className="toast-root">
    <div className="relative h-full overflow-clip rounded-panel border border-solid border-toast-line bg-toast text-white shadow-toast backdrop-blur-[16px] backdrop-saturate-[1.3]">
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-4 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--tone),transparent)]" />
      <span aria-hidden="true" className="pointer-events-none absolute -right-4 -bottom-4 h-[84px] w-[150px] bg-(--tone) opacity-[0.09] mask-[url(/images/brand/coliseum.svg)] mask-contain mask-center mask-no-repeat" />
      <div className="toast-body relative flex items-start gap-3 py-3 pr-2 pl-3">
        <Ring duration={TOAST_DURATION[tone]} restartKey={item.updateKey ?? 0}><Glyph tone={tone} /></Ring>
        <div className="min-w-0 flex-1 pt-px">
          <Toast.Title className="m-0 font-display text-[13.5px] leading-[1.35] font-semibold wrap-anywhere text-white" />
          {item.description ? <Toast.Description className="m-0 mt-0.5 text-[12px] leading-[1.45] wrap-anywhere text-white/[0.69]" /> : null}
          {item.actionProps ? <Toast.Action className="mt-2 min-h-7 rounded-full border-0 bg-(--tone) px-3 py-1.5 text-[11.5px] leading-none font-bold text-night focus-visible:outline-white" /> : null}
        </div>
        <Toast.Close aria-label="Fechar aviso" aria-hidden={behind}
          className="grid size-7 flex-none place-items-center rounded-full border-0 bg-transparent text-white/60 hover:bg-white/10 hover:text-white focus-visible:outline-(--tone)">
          <X size={15} strokeWidth={2.4} aria-hidden="true" />
        </Toast.Close>
      </div>
    </div>
  </Toast.Root>
}

function ToastList() {
  const { toasts } = Toast.useToastManager()
  const visible = toasts.filter(item => item.transitionStatus !== 'ending')
  return <>{toasts.map(item => <ToastCard key={item.id} toast={item} behind={visible.indexOf(item) > 0} />)}</>
}

/**
 * Provedor, portal e viewport dos toasts. `container` é o `app-frame` (passe o estado do `ref`: `null` espera o painel
 * existir). Sem `container`, o viewport fica fixo na janela (tela de entrada), a 16 px da base. `docked` (padrão: só
 * com `container`) deixa o toast acima da navegação inferior (86 px); `--connection-dock` (faixa de conexão) soma à
 * distância da base.
 */
export function Toaster({ container, docked }: { container?: HTMLElement | null; docked?: boolean }) {
  const inFrame = container !== undefined
  const aboveNav = docked ?? inFrame
  return <Toast.Provider toastManager={toastManager} limit={TOAST_LIMIT}>
    <Toast.Portal container={container}>
      <Toast.Viewport aria-label="Avisos" data-floating={inFrame ? undefined : ''} className="toast-viewport"
        style={{ ['--toast-bottom' as string]: aboveNav ? 'calc(86px + env(safe-area-inset-bottom))' : 'calc(16px + env(safe-area-inset-bottom))' }}>
        <ToastList />
      </Toast.Viewport>
    </Toast.Portal>
  </Toast.Provider>
}
