import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { cn } from "@/lib/utils"

/*
 * Popover do shadcn/ui (Base UI, `base-nova`), adicionado pelo CLI. Ajustes ARENA: `cn` de `@/lib/utils`
 * (o CLI importou de um pacote `cn`), cartão branco do protótipo (`.cal-pop`: raio 14, filete e sombra)
 * no lugar de `bg-popover`, que não existe nos tokens, e entrada suave só com movimento permitido, no lugar
 * das classes `animate-in`/`zoom-in` do tw-animate-css (não instalado). O Positioner fica acima da folha
 * (`z-sheet` = 41), para o Date Picker funcionar dentro de uma `Sheet`.
 */
function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "z-50 flex w-72 max-w-[calc(100vw-24px)] origin-(--transform-origin) flex-col gap-2.5 rounded-[14px] border border-solid border-line bg-sheet p-2.5 noite:border-surface-edge text-[12px] text-ink shadow-[0_12px_30px_#0000001f] outline-hidden motion-safe:data-open:animate-glass-in",
            className
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-0.5 text-[12px]", className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn("text-[13px] font-bold", className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn("text-ink-muted", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
}
