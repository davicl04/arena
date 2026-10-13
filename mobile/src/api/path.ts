/**
 * Caminho relativo à API: começa com `/` e não com `//`. Qualquer outra forma (`@host/x`, `.host/x`, `//host/x`, URL
 * absoluta) pode desviar o endereço quando anexada à base e levaria o Bearer da sessão a outro servidor.
 */
export const isApiPath = (path: string): boolean => path.startsWith('/') && !path.startsWith('//')
