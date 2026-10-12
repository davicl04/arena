import { useCallback, useEffect, useState } from 'react'
import { Linking } from 'react-native'
import { joinTokenFromUrl } from '../utils/joinLink'

/**
 * Link do time recebido pelo sistema: `arena://entrar/{token}` ou `http(s)://…/entrar/{token}`, na abertura do app
 * (`Linking.getInitialURL`) ou com o app aberto (evento `url`). O token fica só em memória até a pessoa entrar
 * (inclusive depois do login ou do cadastro): `consume` o apaga quando a tela de entrada abre, e `restore` o devolve se a
 * sessão expirar com ela ainda aberta. Nada vai a log, armazenamento ou parâmetros persistidos.
 */
export function useJoinLink() {
  const [joinToken, setJoinToken] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    Linking.getInitialURL().then(url => {
      const token = joinTokenFromUrl(url)
      if (alive && token) setJoinToken(token)
    }).catch(() => undefined)
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const token = joinTokenFromUrl(url)
      if (token) setJoinToken(token)
    })
    return () => { alive = false; subscription.remove() }
  }, [])
  const consume = useCallback(() => setJoinToken(null), [])
  return { joinToken, consume, restore: setJoinToken }
}
