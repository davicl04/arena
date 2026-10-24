import { useRef, useState } from "react"
import type { KeyboardEvent } from "react"
import { ptBR } from "react-day-picker/locale"
import type { Matcher } from "react-day-picker"
import { CalendarDays, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatShortDate } from "@/utils/format"
import { fromDateKey, startOfToday, toDateKey } from "@/utils/dateKey"
import { Calendar } from "./calendar"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"

/*
 * Date Picker composto do shadcn (Popover + Calendar), como na documentação de Base UI
 * (https://ui.shadcn.com/docs/components/base/date-picker), em pt-BR. O botão tem o visual dos campos atuais
 * (`tone="dark"` para as telas escuras, como o Criar evento V4) e mostra "sáb, 25 out".
 * O valor é o dia do calendário local ("2026-10-25"); para a API, combine com a hora em `combineDateTime`.
 * Teclado: Enter/Espaço abre, as setas andam pelos dias, Enter escolhe e Esc fecha sem fechar a folha em volta.
 */
const triggerTones = {
  light:
    "border-field-border bg-field text-ink data-popup-open:border-brand data-popup-open:shadow-[inset_0_0_0_1px_var(--color-brand)] [&_[data-icon=lead]]:text-brand [&_[data-icon=trail]]:text-ink-muted",
  dark:
    "border-white/18 bg-white/5 text-white data-popup-open:border-mint data-popup-open:shadow-[inset_0_0_0_1px_var(--color-mint)] [&_[data-icon=lead]]:text-mint [&_[data-icon=trail]]:text-white/60",
}

export interface DatePickerProps {
  /** Dia escolhido no calendário local ("2026-10-25"); vazio sem escolha. */
  value: string | null | undefined
  onChange: (value: string) => void
  /** Nome do campo, igual ao rótulo visível (ex.: "Data"). O botão anuncia "Data: sáb, 25 out". */
  label: string
  /** Id do botão, para o `<label htmlFor>` visível. */
  id?: string
  placeholder?: string
  /** Desabilita os dias antes de hoje (e o mês anterior ao atual). */
  disablePast?: boolean
  /** Primeiro e último dia permitidos ("2026-10-25"). */
  min?: string
  max?: string
  disabled?: boolean
  invalid?: boolean
  tone?: keyof typeof triggerTones
  "aria-describedby"?: string
  className?: string
}

export function DatePicker({
  value,
  onChange,
  label,
  id,
  placeholder = "Escolher data",
  disablePast = false,
  min,
  max,
  disabled = false,
  invalid = false,
  tone = "light",
  "aria-describedby": describedBy,
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const popupRef = useRef<HTMLDivElement>(null)
  const selected = fromDateKey(value)
  const today = startOfToday()
  const minDate = fromDateKey(min)
  const first = disablePast && (!minDate || minDate < today) ? today : minDate
  const last = fromDateKey(max)
  const blocked: Matcher[] = []
  if (first) blocked.push({ before: first })
  if (last) blocked.push({ after: last })
  const text = selected ? formatShortDate(selected) : placeholder

  function onPopupKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Esc fecha só o calendário: sem isso, a folha (Sheet) em volta também receberia a tecla.
    if (event.key !== "Escape") return
    event.stopPropagation()
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        aria-label={`${label}: ${text}`}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        data-slot="date-picker"
        className={cn(
          "flex min-h-12 w-full min-w-0 items-center gap-2.5 rounded-field border border-solid px-3 text-left text-[13px] font-semibold aria-invalid:border-error",
          triggerTones[tone],
          className,
        )}
      >
        <CalendarDays data-icon="lead" size={17} aria-hidden="true" />
        <span className={cn("min-w-0 flex-1 truncate", !selected && "font-normal opacity-75")}>
          {text}
        </span>
        <ChevronDown data-icon="trail" size={16} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        ref={popupRef}
        align="start"
        aria-label={`Escolher ${label.toLowerCase()}`}
        className="w-75"
        initialFocus={() =>
          popupRef.current?.querySelector<HTMLElement>('[data-slot="calendar-day"][tabindex="0"]') ?? true
        }
        onKeyDown={onPopupKeyDown}
      >
        <Calendar
          mode="single"
          required
          locale={ptBR}
          selected={selected}
          defaultMonth={selected ?? first ?? today}
          startMonth={first}
          endMonth={last}
          disabled={blocked}
          onSelect={(date: Date | undefined) => {
            if (!date) return
            onChange(toDateKey(date))
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
