import { render, screen, within } from '@testing-library/react'
import type { RenderOptions, RenderResult } from '@testing-library/react'
import type { ReactElement } from 'react'
import { Toaster } from '../src/components/ui/toast'

/*
 * Auxiliares dos testes de toast (components/ui/toast.tsx). Os toasts saem pelo `toast` global e aparecem na região
 * "Avisos" (o `Toast.Viewport` do Base UI, `role="region"` com `aria-live`) que o `<Toaster>` monta.
 *
 *   renderWithToaster(<MeuComponente />)           // componente sem Toaster próprio (cartões, folhas, hooks na tela)
 *   render(<ArenaPage … />)                        // ArenaPage e AuthPage já montam o Toaster: NÃO use o auxiliar nelas
 *
 *   expect(await findToast('Perfil salvo.')).toBeTruthy()     // texto do título ou da descrição, só dentro da região
 *   expect(queryToast(/Não foi possível/)).toBeNull()         // ausência (síncrono)
 *   const alert = (await findToast('Falhou')).closest('[data-tone]')   // data-tone: success | info | warning | error
 *
 * O isolamento entre testes vem de `tests/setup.ts` (`toast.dismiss()` e `connection.reset()` depois de cada teste) e do
 * `cleanup` do Testing Library, que desmonta o Toaster. Toasts disparados com nenhum Toaster montado se perdem.
 */
export function renderWithToaster(ui: ReactElement, options?: RenderOptions): RenderResult {
  return render(<>{ui}<Toaster /></>, options)
}

/** A região viva dos toasts (o viewport do Base UI). */
export function toastRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'Avisos' })
}

/** Procura o texto (título ou descrição) dentro da região dos toasts; espera até aparecer. */
export function findToast(text: string | RegExp): Promise<HTMLElement> {
  return within(toastRegion()).findByText(text)
}

/** O texto na região dos toasts, ou `null` se não está lá (ou se a região nem existe). */
export function queryToast(text: string | RegExp): HTMLElement | null {
  const region = screen.queryByRole('region', { name: 'Avisos' })
  return region ? within(region).queryByText(text) : null
}
