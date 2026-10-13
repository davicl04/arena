/** Caminho do link do time (`{PUBLIC_WEB_URL}/entrar/{token}`); o token é base64url, validado pelo servidor. */
const JOIN_PATH = /^\/entrar\/([A-Za-z0-9_-]{1,128})\/?$/

/** Token do link do time no endereço atual, ou `null`. Leitura pura: limpar o endereço fica com `clearJoinPath`. */
export function joinTokenFrom(pathname: string): string | null {
  return JOIN_PATH.exec(pathname)?.[1] ?? null
}

/** Tira o token do endereço (sem recarregar), para ele não ficar no histórico nem ser compartilhado por engano. */
export function clearJoinPath(location: Pick<Location, 'pathname'> = window.location, history: Pick<History, 'replaceState'> = window.history) {
  if (location.pathname.startsWith('/entrar/')) history.replaceState(null, '', '/')
}
