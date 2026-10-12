import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { teamButton } from './styles'

/**
 * Confirmação de ação destrutiva dentro de uma folha (.confirm): pergunta, explicação e [ação | Cancelar].
 * Recebe o foco ao aparecer, para a pergunta ser lida antes dos botões.
 */
export function ConfirmBox({ children, confirmLabel, busy, onConfirm, onCancel }: {
  children: ReactNode
  confirmLabel: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  return <div ref={ref} tabIndex={-1} role="group" aria-label="Confirmação"
    className="mt-3.5 rounded-[14px] bg-[#fff0f2] p-[13px] text-[12px] leading-[1.5] text-ink outline-none">
    {children}
    <div className="mt-2.5 flex gap-2 *:flex-1">
      <button type="button" className={teamButton({ tone: 'danger' })} disabled={busy} onClick={onConfirm}>{busy ? 'Aguarde…' : confirmLabel}</button>
      <button type="button" className={teamButton({ tone: 'outline' })} disabled={busy} onClick={onCancel}>Cancelar</button>
    </div>
  </div>
}
