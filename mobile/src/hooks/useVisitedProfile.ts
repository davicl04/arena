import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, request } from '../api/client'
import type { MutualFollowersPage, SocialUser } from '../api/client'
import { toggleFollow } from '../api/social'
import type { FollowState } from '../api/social'
import { mutualFollowersText } from '../utils/profile'

/**
 * Perfil de outro atleta aberto em tela cheia (Comunidade e a tela `user-profile`): a leitura do perfil com os seguidores
 * em comum, o vínculo (Seguir, Solicitar, Cancelar) e a contagem de publicações. O titular vem da sessão; `viewerId` só
 * evita buscar seguidores em comum do próprio perfil. `onFollowed` avisa a tela de origem do novo estado (a lista de
 * atletas da Comunidade mostra o mesmo vínculo).
 */
export function useVisitedProfile(viewerId: number, onExpired: () => void, onFollowed?: (id: number, state: FollowState) => void) {
  const [profile, setProfile] = useState<SocialUser | null>(null)
  const [error, setError] = useState('')
  const [mutualText, setMutualText] = useState<string | null>(null)
  // Valores lidos dentro de funções assíncronas: a referência evita que `open` mude a cada renderização.
  const live = useRef({ profile, onExpired, onFollowed })
  useEffect(() => { live.current = { profile, onExpired, onFollowed } })

  /**
   * Abre o perfil de `id`. Devolve a mensagem quando a leitura falha sem nenhum perfil aberto (quem chamou a mostra onde
   * quiser); com um perfil já aberto (ex.: depois de seguir), o erro aparece nele.
   */
  const open = useCallback(async (id: number): Promise<string | null> => {
    setError('')
    try {
      const person = await request<SocialUser>(`/users/${id}`)
      if (person.id !== viewerId) {
        // Seguidores em comum são complementares: uma falha aqui não impede de ver o perfil.
        try { const mutual = await request<MutualFollowersPage>(`/users/${id}/mutual-followers?limit=2`); setMutualText(mutualFollowersText(mutual.items ?? [], mutual.total ?? 0)) }
        catch (cause) { setMutualText(null); if (cause instanceof ApiError && cause.status === 401) live.current.onExpired() }
      } else setMutualText(null)
      setProfile(person)
      return null
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) live.current.onExpired()
      const message = cause instanceof Error ? cause.message : 'Perfil indisponível.'
      if (live.current.profile) { setError(message); return null }
      return message
    }
  }, [viewerId])

  /** Segue, solicita ou deixa de seguir e recarrega o perfil com o vínculo novo. */
  const follow = useCallback(async (person: SocialUser) => {
    setError('')
    try {
      const state = await toggleFollow(person)
      live.current.onFollowed?.(person.id, state)
      await open(person.id)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) live.current.onExpired()
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o vínculo.')
    }
  }, [open])

  const close = useCallback(() => setProfile(null), [])
  /** Uma publicação do perfil foi excluída na grade: a contagem do cabeçalho acompanha. */
  const postRemoved = useCallback(() => setProfile(old => old ? { ...old, post_count: Math.max(0, old.post_count - 1) } : old), [])

  return { profile, error, mutualText, open, follow, close, postRemoved }
}
