import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, request } from '../api/client'
import type { MutualFollowersPage, SocialUser } from '../api/client'
import { toggleFollow } from '../api/social'
import type { FollowState } from '../api/social'
import { toast } from '../components/toast/toastStore'
import { mutualFollowersText } from '../utils/profile'
import { reportActionError } from './useSubmit'

/** Falha da leitura do perfil sem nenhum perfil aberto: a mensagem e o erro (para o `LoadError` reconhecer a falta de conexão). */
export interface OpenFailure { message: string; cause: unknown }

/**
 * Falha de uma leitura que não pode aparecer numa tela de erro (a Comunidade, ou o perfil já aberto): vira toast de erro,
 * exceto a sessão expirada (já tratada por `onExpired`) e a falta de conexão (a faixa de conexão cuida).
 */
export function toastReadFailure(failure: OpenFailure) {
  const { cause } = failure
  if (cause instanceof ApiError && (cause.status === 401 || cause.isConnection)) return
  toast.error(failure.message)
}

/**
 * Perfil de outro atleta aberto em tela cheia (Comunidade e a tela `user-profile`): a leitura do perfil com os seguidores
 * em comum, o vínculo (Seguir, Solicitar, Cancelar) e a contagem de publicações. O titular vem da sessão; `viewerId` só
 * evita buscar seguidores em comum do próprio perfil. `onFollowed` avisa a tela de origem do novo estado (a lista de
 * atletas da Comunidade mostra o mesmo vínculo).
 */
export function useVisitedProfile(viewerId: number, onExpired: () => void, onFollowed?: (id: number, state: FollowState) => void) {
  const [profile, setProfile] = useState<SocialUser | null>(null)
  const [mutualText, setMutualText] = useState<string | null>(null)
  // Valores lidos dentro de funções assíncronas: a referência evita que `open` mude a cada renderização.
  const live = useRef({ profile, onExpired, onFollowed })
  useEffect(() => { live.current = { profile, onExpired, onFollowed } })

  /**
   * Abre o perfil de `id`. Devolve a falha quando a leitura falha sem nenhum perfil aberto (quem chamou a mostra onde
   * quiser: erro de tela ou `toastReadFailure`); com um perfil já aberto (ex.: depois de seguir), a falha sai em toast.
   */
  const open = useCallback(async (id: number): Promise<OpenFailure | null> => {
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
      const failure: OpenFailure = { message: cause instanceof Error && cause.message ? cause.message : 'Perfil indisponível.', cause }
      if (live.current.profile) { toastReadFailure(failure); return null }
      return failure
    }
  }, [viewerId])

  /** Segue, solicita ou deixa de seguir e recarrega o perfil com o vínculo novo. */
  const follow = useCallback(async (person: SocialUser) => {
    try {
      const state = await toggleFollow(person)
      live.current.onFollowed?.(person.id, state)
      await open(person.id)
    } catch (cause) {
      reportActionError(cause, 'Não foi possível atualizar o vínculo.', live.current.onExpired)
    }
  }, [open])

  const close = useCallback(() => setProfile(null), [])
  /** Uma publicação do perfil foi excluída na grade: a contagem do cabeçalho acompanha. */
  const postRemoved = useCallback(() => setProfile(old => old ? { ...old, post_count: Math.max(0, old.post_count - 1) } : old), [])

  return { profile, mutualText, open, follow, close, postRemoved }
}
