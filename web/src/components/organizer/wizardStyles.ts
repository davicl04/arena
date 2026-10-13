/* Classes da tela escura do Criar evento (V4, `.flow.dark`): rótulo `.sf-l`, campos de vidro, dica e erro. Foco em menta. */

export const darkLabel = 'mt-4 mb-1.5 block text-[10px] font-extrabold tracking-[0.08em] text-white/62 uppercase'
export const darkInput = 'min-h-[46px] rounded-control border-white/18 bg-white/5 text-[15px] text-white placeholder:text-white/40 focus-visible:outline-mint aria-invalid:border-danger-soft'
export const darkTextarea = 'block w-full min-w-0 resize-y rounded-control border border-solid border-white/18 bg-white/5 px-[13px] py-3 text-[14px] leading-[1.5] text-white placeholder:text-white/40 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-mint aria-invalid:border-danger-soft'
export const darkHint = 'mt-1.5 text-[10.5px] leading-[1.5] text-white/62'
export const darkError = 'mt-1.5 text-[11px] leading-[1.5] font-semibold text-danger-soft'

/** `aria-describedby` do campo: a dica e, com erro, a mensagem. */
export const describedBy = (id: string, error?: string, hint = true) =>
  [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined
