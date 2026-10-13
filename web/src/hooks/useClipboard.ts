import { useCallback, useEffect, useRef, useState } from 'react'

export type CopyStatus = 'idle' | 'copied' | 'failed'

/**
 * Copiar com `navigator.clipboard`. Guarda qual item foi copiado (`key`) para o botão trocar o ícone e a
 * mensagem em `aria-live`. O sucesso volta a `idle` depois de `resetMs`; a falha fica até a próxima tentativa,
 * para quem usa mostrar o texto selecionável (sem área de transferência, como em http na rede local).
 */
export function useClipboard(resetMs = 2500) {
  const [state, setState] = useState<{ status: CopyStatus; key: string | null }>({ status: 'idle', key: null })
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const copy = useCallback(async (key: string, text: string) => {
    window.clearTimeout(timer.current)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Área de transferência indisponível.')
      await navigator.clipboard.writeText(text)
    } catch {
      setState({ status: 'failed', key })
      return false
    }
    setState({ status: 'copied', key })
    timer.current = window.setTimeout(() => setState({ status: 'idle', key: null }), resetMs)
    return true
  }, [resetMs])
  return { ...state, copy }
}

/**
 * Seleciona o texto visível de um elemento (chave, contato) para copiar à mão quando a área de transferência
 * falha. Campos de texto usam o próprio `select()`.
 */
export function selectText(element: HTMLElement | null) {
  const selection = window.getSelection()
  if (!element || !selection) return
  const range = document.createRange()
  range.selectNodeContents(element)
  selection.removeAllRanges()
  selection.addRange(range)
}
