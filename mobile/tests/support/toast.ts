import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import { toastStore } from '../../src/components/toast/toastStore'
import type { ToastTone } from '../../src/components/toast/toastStore'
import { ToastViewport } from '../../src/components/toast/ToastViewport'
import type { ToastPlacement } from '../../src/components/toast/ToastViewport'

/*
 * Auxiliares dos testes de toast. Os toasts saem pelo `toast` global (components/toast/toastStore.ts) e a loja guarda a lista;
 * o `<ToastViewport>` só desenha. O isolamento entre testes vem de tests/support/setup.ts (`toastStore.reset()` e
 * `connection.reset()` depois de cada teste).
 *
 *   // Conferir o que foi avisado, sem desenhar nada (a maioria dos testes de tela e de fluxo):
 *   expect(toastText()).toContain('Perfil salvo.')             // título ou descrição de qualquer toast na loja
 *   expect(toasts().map(item => item.tone)).toEqual(['error'])  // tom: success | info | warning | error
 *   expect(toastText()).not.toContain('Não foi possível')       // ausência
 *
 *   // Desenhar o viewport junto (acessibilidade, ação, X, anúncio): `placement="screen"` é a tela de entrada, sem navegação.
 *   const tree = await renderWithToasts(React.createElement(MeuComponente))
 *   const card = findToast(tree, 'Perfil salvo.')               // o cartão (testID "toast-<tom>") que contém o texto
 *   await act(async () => { toastStore.dismiss() })
 *
 * Um toast dentro de uma folha (`Sheet`, `ActionSheet`, `Modal`) aparece sozinho na árvore: a folha monta o próprio viewport.
 * Toasts disparados com nenhum viewport montado ficam só na loja (e somem no fim do tempo, como sempre).
 */

export interface ToastView { id: string; tone: ToastTone; title: string; description?: string; actionLabel?: string; ending: boolean }

/** Os toasts da loja agora, do mais antigo ao mais novo (os que estão saindo incluídos). */
export function toasts(): ToastView[] {
  return toastStore.getState().toasts.map(item => ({ id: item.id, tone: item.tone, title: item.title, description: item.description, actionLabel: item.action?.label, ending: item.ending }))
}

/** Título e descrição de todos os toasts da loja, num só texto, para `toContain`. */
export function toastText(): string {
  return toasts().map(item => [item.title, item.description].filter(Boolean).join(' ')).join(' | ')
}

const rendered: ReactTestRenderer[] = []
/**
 * Desenha `element` com um `ToastViewport` ao lado (por padrão `placement="screen"`). Os viewports montados formam uma pilha
 * (a ordem de montagem): chame `unmountToastTrees()` no `afterEach` do arquivo, ou um viewport esquecido de outro teste volta a
 * ser o ativo quando o do teste atual sai.
 */
export async function renderWithToasts(element: React.ReactElement, placement: ToastPlacement = 'screen'): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(React.createElement(React.Fragment, null, element, React.createElement(ToastViewport, { placement }))) })
  rendered.push(tree)
  return tree
}
/** Desmonta as árvores criadas por `renderWithToasts` (e as de `track`). */
export async function unmountToastTrees(): Promise<void> {
  await act(async () => { rendered.splice(0).forEach(tree => tree.unmount()) })
}
/** Registra uma árvore criada à mão para `unmountToastTrees`. */
export function track(tree: ReactTestRenderer): ReactTestRenderer {
  rendered.push(tree)
  return tree
}

const strings = (value: unknown): string[] => Array.isArray(value) ? value.flatMap(strings) : typeof value === 'string' || typeof value === 'number' ? [String(value)] : []
/** Textos (`<Text>`) de um pedaço da árvore. */
export const textWithin = (node: ReactTestInstance) => node.findAllByType('Text' as never).map(entry => strings(entry.props.children).join('')).join(' | ')

/** Os cartões de toast desenhados na árvore (testID "toast-<tom>"). */
export function toastCards(tree: ReactTestRenderer): ReactTestInstance[] {
  return tree.root.findAll(node => typeof node.type === 'string' && /^toast-(success|info|warning|error)$/.test(String(node.props.testID)))
}

/** O cartão que contém o texto; `undefined` se não está na tela. */
export function findToast(tree: ReactTestRenderer, text: string): ReactTestInstance | undefined {
  return toastCards(tree).find(card => textWithin(card).includes(text))
}
