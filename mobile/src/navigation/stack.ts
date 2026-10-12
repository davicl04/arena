import { isRootScreen, makeEntry } from './routes'
import type { Entry, ParamsArg, ScreenName, ScreenParams } from './routes'

/*
 * Operações puras da pilha de navegação (a mesma lógica de `go`, `back` e `show` do `ArenaPage` da web). A pilha nunca fica
 * vazia: a primeira entrada é a raiz (uma aba) e as demais empilham sobre ela.
 */
export type Stack = readonly Entry[]

export const initialStack = (): Stack => [makeEntry('home')]
export const currentOf = (stack: Stack): Entry => stack[stack.length - 1]
export const rootOf = (stack: Stack): ScreenName => stack[0].screen

/** Abas zeram a pilha; as demais telas empilham sobre a atual. */
export function push(stack: Stack, entry: Entry): Stack {
  return isRootScreen(entry.screen) ? [entry] : [...stack, entry]
}

/** Volta uma tela; na raiz de uma aba que não é o Início, volta ao Início. */
export function pop(stack: Stack): Stack {
  return stack.length > 1 ? stack.slice(0, -1) : initialStack()
}

/** Há para onde voltar? Só o Início, sozinho na pilha, não tem: ali o botão do aparelho sai do app. */
export const canGoBack = (stack: Stack): boolean => stack.length > 1 || rootOf(stack) !== 'home'

/** Troca os parâmetros da tela atual (ex.: time selecionado no carrossel), sem empilhar. */
export function patchCurrent<S extends ScreenName>(stack: Stack, screen: S, patch: Partial<NonNullable<ScreenParams[S]>>): Stack {
  const current = currentOf(stack)
  if (current.screen !== screen) return stack
  const params = { ...(current.params as object | undefined), ...patch } as ScreenParams[S]
  return [...stack.slice(0, -1), makeEntry(screen, ...([params] as unknown as ParamsArg<S>))]
}

/**
 * Sai da tela atual para `entry`: se a tela logo abaixo na pilha for a mesma (e `same` concordar), a substitui; senão
 * empilha no lugar da atual. É o "voltar para Meus times depois de Criar time" da web.
 */
export function replaceTop(stack: Stack, entry: Entry, same: (below: Entry) => boolean = below => below.screen === entry.screen): Stack {
  if (isRootScreen(entry.screen)) return [entry]
  const rest = stack.slice(0, -1)
  const below = rest[rest.length - 1]
  // A raiz nunca é substituída: sozinha na pilha, a entrada nova só empilha.
  if (!below) return push(stack, entry)
  return same(below) ? [...rest.slice(0, -1), entry] : [...rest, entry]
}
