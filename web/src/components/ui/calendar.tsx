import * as React from "react"
import {
  DayPicker,
  getDefaultClassNames,
  type DayButton,
  type Locale,
} from "react-day-picker"
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { iconButtonVariants } from "@/components/ui/button-variants"

/*
 * Calendar do shadcn/ui (`base-nova`), adicionado pelo CLI com `react-day-picker` (aprovado em 11/10/2026).
 * Ajustes ARENA: `cn` de `@/lib/utils` (o CLI importou de um pacote `cn`); setas com `iconButtonVariants`
 * e dias como botões próprios, porque o CLI dependia do Button do shadcn (variantes `ghost`/`icon`), que
 * sobrescreveria o nosso; visual do protótipo do Jogar (`.cal-pop`/`.day`): legenda "outubro de 2026",
 * iniciais dos dias da semana, dias de 36 px com raio 9, hoje com filete, escolhido em `brand` e passados
 * apagados. O idioma vem de `locale` (o Date Picker passa `ptBR` de `react-day-picker/locale`).
 */
const weekdayInitial = (date: Date, locale?: Partial<Locale>) =>
  new Intl.DateTimeFormat(locale?.code ?? "pt-BR", { weekday: "narrow" }).format(date)
/** "outubro de 2026", como no protótipo (o padrão do date-fns em pt-BR é "outubro 2026"). */
const monthCaption = (date: Date, locale?: Partial<Locale>) =>
  new Intl.DateTimeFormat(locale?.code ?? "pt-BR", { month: "long", year: "numeric" }).format(date)

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  locale,
  formatters,
  labels,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames()
  const navButton = cn(
    iconButtonVariants(),
    "size-8 text-ink select-none aria-disabled:cursor-default aria-disabled:opacity-35"
  )

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "group/calendar w-full [--cell-size:--spacing(9)]",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      locale={locale}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString(locale?.code, { month: "short" }),
        formatWeekdayName: (date) => weekdayInitial(date, locale),
        formatCaption: (date) => monthCaption(date, locale),
        ...formatters,
      }}
      labels={{ labelGrid: (date) => monthCaption(date, locale), ...labels }}
      classNames={{
        root: cn("w-full", defaultClassNames.root),
        months: cn("relative flex flex-col gap-4", defaultClassNames.months),
        month: cn("flex w-full flex-col gap-1", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
          defaultClassNames.nav
        ),
        button_previous: cn(navButton, defaultClassNames.button_previous),
        button_next: cn(navButton, defaultClassNames.button_next),
        month_caption: cn(
          "flex h-8 w-full items-center justify-center px-8",
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "flex h-8 w-full items-center justify-center gap-1.5 text-[12.5px] font-bold",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn("relative rounded-[9px]", defaultClassNames.dropdown_root),
        dropdown: cn("absolute inset-0 bg-white opacity-0", defaultClassNames.dropdown),
        caption_label: cn(
          "font-bold select-none",
          captionLayout === "label"
            ? "text-[12.5px]"
            : "flex items-center gap-1 rounded-[9px] text-[12.5px] [&>svg]:size-3.5 [&>svg]:text-ink-muted",
          defaultClassNames.caption_label
        ),
        month_grid: cn("w-full border-collapse", defaultClassNames.month_grid),
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "flex-1 py-1 text-[10px] font-bold text-ink-muted uppercase select-none",
          defaultClassNames.weekday
        ),
        week: cn("mt-0.5 flex w-full gap-0.5", defaultClassNames.week),
        week_number_header: cn("w-(--cell-size) select-none", defaultClassNames.week_number_header),
        week_number: cn("text-[10px] text-ink-muted select-none", defaultClassNames.week_number),
        day: cn(
          "group/day relative h-(--cell-size) flex-1 p-0 text-center select-none",
          defaultClassNames.day
        ),
        range_start: cn("rounded-l-[9px] bg-subtle", defaultClassNames.range_start),
        range_middle: cn("rounded-none bg-subtle", defaultClassNames.range_middle),
        range_end: cn("rounded-r-[9px] bg-subtle", defaultClassNames.range_end),
        today: cn("", defaultClassNames.today),
        outside: cn("", defaultClassNames.outside),
        disabled: cn("", defaultClassNames.disabled),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          )
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon className={cn("size-4", className)} {...props} />
            )
          }

          if (orientation === "right") {
            return (
              <ChevronRightIcon className={cn("size-4", className)} {...props} />
            )
          }

          return (
            <ChevronDownIcon className={cn("size-4", className)} {...props} />
          )
        },
        DayButton: ({ ...props }) => (
          <CalendarDayButton locale={locale} {...props} />
        ),
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-(--cell-size) items-center justify-center text-center">
                {children}
              </div>
            </td>
          )
        },
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  locale,
  ...props
}: React.ComponentProps<typeof DayButton> & { locale?: Partial<Locale> }) {
  const defaultClassNames = getDefaultClassNames()

  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <button
      ref={ref}
      type="button"
      data-slot="calendar-day"
      data-day={day.date.toLocaleDateString(locale?.code)}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      data-today={modifiers.today || undefined}
      data-outside={modifiers.outside || undefined}
      className={cn(
        "relative isolate z-10 flex size-full min-w-(--cell-size) items-center justify-center rounded-[9px] border-0 bg-transparent p-0 text-[12px] leading-none font-semibold text-ink tabular-nums hover:bg-subtle",
        "data-today:shadow-[inset_0_0_0_1px_var(--color-line-strong)] data-outside:text-ink-muted/60",
        "data-[selected-single=true]:bg-brand data-[selected-single=true]:text-on-brand data-[range-start=true]:bg-brand data-[range-start=true]:text-on-brand data-[range-end=true]:bg-brand data-[range-end=true]:text-on-brand data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-subtle",
        "disabled:cursor-default disabled:bg-transparent disabled:text-line-strong disabled:opacity-100",
        defaultClassNames.day,
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
