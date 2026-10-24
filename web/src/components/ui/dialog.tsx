import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { iconButtonVariants } from "@/components/ui/button-variants"

/*
 * Dialog do shadcn/ui (Base UI, `base-nova`), adicionado pelo CLI para a etapa 3 (proposta em tela cheia e
 * cronômetro). Ajustes ARENA: `cn` de `@/lib/utils` (o CLI importou de um pacote `cn`); o botão de fechar usa
 * o `IconButton` do projeto com "Fechar" (o CLI trazia o Button do shadcn, que sobrescreveria o nosso);
 * fundo `scrim` e camadas `z-scrim`/`z-sheet` da folha; cartão branco com os raios ARENA no lugar de
 * `bg-popover`; e entrada suave só com movimento permitido, no lugar do tw-animate-css (não instalado).
 * Telas cheias passam o próprio visual em `className` (ex.: `inset-0 translate-none rounded-none bg-forest`).
 *
 * Moldura do app: no desktop o app é um painel de 390 px no meio da janela, e um Dialog preso à viewport o
 * escaparia. `DialogContainerProvider` (no painel do `ArenaPage`) diz onde o portal entra; com ele, o fundo e o
 * conteúdo passam de `fixed` a `absolute` e acompanham o painel (e a tela inteira no celular, onde o painel é a
 * tela). Sem o provedor, o Dialog continua no `body` e na viewport.
 */
const DialogContainerContext = React.createContext<HTMLElement | null>(null)

function DialogContainerProvider({ container, children }: { container: HTMLElement | null; children: React.ReactNode }) {
  return <DialogContainerContext.Provider value={container}>{children}</DialogContainerContext.Provider>
}

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  const container = React.useContext(DialogContainerContext)
  return <DialogPrimitive.Portal data-slot="dialog-portal" container={container ?? undefined} {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  const inFrame = React.useContext(DialogContainerContext) !== null
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "isolate z-scrim bg-scrim inset-0 motion-safe:data-open:animate-glass-in",
        inFrame ? "absolute" : "fixed",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  const inFrame = React.useContext(DialogContainerContext) !== null
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "top-1/2 left-1/2 z-sheet grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-card bg-sheet p-5 noite:inset-ring noite:inset-ring-surface-edge text-[12px] text-ink shadow-sheet outline-none sm:max-w-sm motion-safe:data-open:animate-glass-in",
          inFrame ? "absolute" : "fixed",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            aria-label="Fechar"
            className={cn(iconButtonVariants(), "absolute top-2 right-2")}
          >
            <X size={20} aria-hidden="true" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 pr-10", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("mt-1 flex gap-2 *:flex-1", className)}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="secondary" type="button" />}>
          Fechar
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-[17px] leading-tight wrap-anywhere", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-[11.5px] leading-normal text-ink-muted *:[a]:underline *:[a]:underline-offset-3",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContainerProvider,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
