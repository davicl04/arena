/**
 * Envio de `FormData` (upload de arquivo) com a mesma forma do `fetch`. Desde o SDK 58, o `fetch` global é o `expo/fetch`,
 * que não aceita a parte de arquivo do React Native (`{ uri, name, type }`) e falha com "Unsupported FormDataPart
 * implementation" antes de sair do aparelho. O `XMLHttpRequest` do React Native lê essa parte do disco e monta o multipart
 * (com o boundary no `Content-Type`). Só os uploads passam por aqui; o resto segue no `fetch`.
 */
export function formFetch(url: string, init: { method: string; headers: Record<string, string>; body: FormData; signal: AbortSignal }): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const abort = () => xhr.abort()
    const done = () => init.signal.removeEventListener('abort', abort)
    xhr.open(init.method, url)
    for (const [name, value] of Object.entries(init.headers)) xhr.setRequestHeader(name, value)
    xhr.onload = () => {
      done()
      // Sem corpo nos estados que não têm (204, 205 e 304), como o `Response` exige.
      const empty = xhr.status === 204 || xhr.status === 205 || xhr.status === 304
      resolve(new Response(empty ? null : xhr.responseText, { status: xhr.status }))
    }
    xhr.onerror = () => { done(); reject(new TypeError('Network request failed')) }
    xhr.ontimeout = xhr.onerror
    const aborted = () => { done(); reject(new Error('Aborted')) }
    xhr.onabort = aborted
    if (init.signal.aborted) { aborted(); return }
    init.signal.addEventListener('abort', abort)
    xhr.send(init.body)
  })
}
