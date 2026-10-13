import { useRef } from "react"
import type { ComponentProps, MouseEvent } from "react"
import { Clock } from "lucide-react"
import { cn } from "@/lib/utils"

/*
 * Campo de hora livre (`input type="time"`) no visual dos campos atuais, com o relógio à esquerda: horário
 * digitado, sem horários prontos (partidas do campeonato e condições da partida). O passo vem em minutos
 * (15 nas condições, 5 no agendamento). O foco aparece no contorno do campo inteiro. O ícone nativo do
 * seletor fica oculto para não repetir o relógio; tocar no relógio ou na borda abre o seletor do navegador.
 */
const tones = {
  light: "border-field-border bg-white text-ink [&_[data-icon]]:text-brand",
  dark: "border-white/18 bg-white/5 text-white [color-scheme:dark] [&_[data-icon]]:text-mint",
}

export interface TimeFieldProps
  extends Omit<ComponentProps<"input">, "type" | "value" | "onChange" | "step" | "size" | "ref"> {
  /** Horário "HH:MM" (vazio sem escolha). */
  value: string
  onChange: (value: string) => void
  /** Passo do seletor nativo, em minutos (padrão 15). */
  stepMinutes?: number
  tone?: keyof typeof tones
  invalid?: boolean
  /** Classes do contorno do campo; as do `input` vão em `inputClassName`. */
  className?: string
  inputClassName?: string
}

export function TimeField({
  value,
  onChange,
  stepMinutes = 15,
  tone = "light",
  invalid = false,
  className,
  inputClassName,
  ...props
}: TimeFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  function openPicker(event: MouseEvent<HTMLDivElement>) {
    const input = inputRef.current
    if (!input || event.target === input || input.disabled || input.readOnly) return
    input.focus()
    try {
      input.showPicker()
    } catch {
      // Sem `showPicker` (navegadores antigos) ou sem gesto do usuário: o campo continua digitável.
    }
  }
  return (
    <div
      data-slot="time-field"
      data-invalid={invalid || undefined}
      onClick={openPicker}
      className={cn(
        "flex min-h-12 w-full min-w-0 cursor-text items-center gap-2.5 rounded-field border border-solid px-3 focus-within:outline-3 focus-within:outline-offset-3 focus-within:outline-focus data-invalid:border-error",
        tones[tone],
        className,
      )}
    >
      <Clock data-icon size={17} aria-hidden="true" />
      <input
        ref={inputRef}
        type="time"
        step={Math.max(1, Math.round(stepMinutes * 60))}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid || undefined}
        className={cn(
          "min-h-0 min-w-0 flex-1 rounded-none border-0 bg-transparent p-0 text-[13px] font-semibold text-inherit tabular-nums focus-visible:outline-none [&::-webkit-calendar-picker-indicator]:hidden",
          inputClassName,
        )}
        {...props}
      />
    </div>
  )
}
