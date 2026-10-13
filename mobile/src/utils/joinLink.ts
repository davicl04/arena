/**
 * Link do time. O servidor gera `{PUBLIC_WEB_URL}/entrar/{token}` (base64url, validado lá); no aparelho, o mesmo caminho
 * chega por `arena://entrar/{token}` (esquema do `app.json`) ou pelo endereço http(s) compartilhado. O token fica só em
 * memória até a pessoa entrar: não vai a log, armazenamento ou parâmetros de tela persistidos.
 */
const JOIN_LINK = /^(?:arena:\/\/\/?|https?:\/\/[^/?#\s]+\/)entrar\/([A-Za-z0-9_-]{1,128})\/?(?:[?#].*)?$/i

/** Token do link do time num endereço recebido pelo sistema, ou `null` para qualquer outro endereço. */
export function joinTokenFromUrl(url: string | null | undefined): string | null {
  return url ? (JOIN_LINK.exec(url.trim())?.[1] ?? null) : null
}
