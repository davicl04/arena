import { Check, Info } from 'lucide-react'
import type { ToastState } from './useToast'

/*
 * Toast do Jogar (S1): pílula `forest` com o ícone menta, anunciada em `aria-live`. Fica dentro do painel do app (posição
 * absoluta, como a folha inferior), acima da navegação. A região viva existe sempre, para o leitor de tela anunciar a
 * mudança de texto; a pílula some sozinha depois de alguns segundos.
 */
export function ResultToast({ toast }: { toast: ToastState | null }) {
  const Icon = toast?.icon === 'info' ? Info : Check
  return (
    <div role="status" aria-live="polite" data-slot="result-toast" className="pointer-events-none absolute inset-x-0 bottom-[100px] z-50 flex justify-center px-4">
      {toast && (
        <div key={toast.id} className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full bg-forest py-2 pr-4 pl-2 text-[12px] font-semibold text-white shadow-[0_12px_30px_#0006] motion-safe:transition-[opacity,translate] motion-safe:duration-300 motion-safe:starting:translate-y-4 motion-safe:starting:opacity-0">
          <span className="grid size-7 flex-none place-items-center rounded-full bg-mint text-night"><Icon size={15} aria-hidden="true" /></span>
          <span className="min-w-0">{toast.text}</span>
        </div>
      )}
    </div>
  )
}
