import { beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from '../src/api/client'
import { APPROVE_ALL_MAX_ROUNDS, CAPTION_MAX, COMMENT_MAX, REPORT_DETAILS_MAX, REPORT_REASONS, approveAllFollowRequests, blockUser, createComment, deleteComment, deletePost, sendReport, setLike, toggleFollow, updateCaption } from '../src/api/social'

vi.mock('../src/api/client', () => ({ request: vi.fn() }))

describe('api/social (mobile)', () => {
  beforeEach(() => { vi.mocked(request).mockReset().mockResolvedValue(undefined as never) })

  it('usa os mesmos limites e motivos da web', () => {
    expect([CAPTION_MAX, COMMENT_MAX, REPORT_DETAILS_MAX]).toEqual([2200, 1000, 1000])
    expect(REPORT_REASONS.map(reason => reason.value)).toEqual(['spam', 'assedio', 'conteudo_inadequado', 'outro'])
  })

  it('chama os endpoints de curtida, legenda, exclusão, comentários e bloqueio', async () => {
    await setLike(7, true); await setLike(7, false)
    await updateCaption(7, 'Nova legenda')
    await deletePost(7)
    await createComment(7, 'Boa!')
    await deleteComment(11)
    await blockUser(2)
    expect(vi.mocked(request).mock.calls).toEqual([
      ['/posts/7/like', 'PUT'], ['/posts/7/like', 'DELETE'], ['/posts/7', 'PATCH', { caption: 'Nova legenda' }], ['/posts/7', 'DELETE'],
      ['/posts/7/comments', 'POST', { body: 'Boa!' }], ['/comments/11', 'DELETE'], ['/users/2/block', 'PUT'],
    ])
  })

  it('envia a denúncia com detalhes aparados e omite detalhes vazios', async () => {
    await sendReport({ target_type: 'comment', target_id: 3, reason: 'assedio', description: '  ofensa  ' })
    await sendReport({ target_type: 'user', target_id: 2, reason: 'spam', description: '   ' })
    expect(request).toHaveBeenNthCalledWith(1, '/reports', 'POST', { target_type: 'comment', target_id: 3, reason: 'assedio', description: 'ofensa' })
    expect(request).toHaveBeenNthCalledWith(2, '/reports', 'POST', { target_type: 'user', target_id: 2, reason: 'spam' })
  })

  it('alterna o vínculo: aprovado ou pendente deixa de seguir (DELETE); sem vínculo segue (PUT) com o estado devolvido', async () => {
    const person = { id: 2, social_public: true }
    await expect(toggleFollow({ ...person, follow_state: 'approved' })).resolves.toBe('none')
    await expect(toggleFollow({ ...person, follow_state: 'pending' })).resolves.toBe('none')
    expect(vi.mocked(request).mock.calls).toEqual([['/users/2/follow', 'DELETE'], ['/users/2/follow', 'DELETE']])
    vi.mocked(request).mockReset().mockResolvedValueOnce({ state: 'pending' } as never)
    await expect(toggleFollow({ ...person, follow_state: 'none' })).resolves.toBe('pending')
    expect(request).toHaveBeenLastCalledWith('/users/2/follow', 'PUT')
  })

  it('sem resposta do PUT, o estado vem da visibilidade da conta', async () => {
    await expect(toggleFollow({ id: 2, social_public: true, follow_state: 'none' })).resolves.toBe('approved')
    await expect(toggleFollow({ id: 3, social_public: false, follow_state: 'none' })).resolves.toBe('pending')
  })

  describe('approveAllFollowRequests: aprova a fila em rodadas, sem laço infinito', () => {
    const who = (id: number) => ({ user: { id } })
    const approvals = () => vi.mocked(request).mock.calls.filter(([path]) => String(path).includes('approve=true')).map(([path]) => path)

    it('lê a primeira página de novo a cada rodada até a fila esvaziar e devolve true', async () => {
      let queue = [1, 2, 3]
      vi.mocked(request).mockImplementation(async (path: string) => {
        if (path === '/me/follow-requests') return { items: queue.slice(0, 2).map(who), next_cursor: null } as never
        queue = queue.filter(id => `/me/follow-requests/${id}?approve=true` !== path)
        return undefined as never
      })
      const approved: number[] = []
      await expect(approveAllFollowRequests(id => approved.push(id))).resolves.toBe(true)
      expect(approved).toEqual([1, 2, 3])
      expect(approvals()).toEqual(['/me/follow-requests/1?approve=true', '/me/follow-requests/2?approve=true', '/me/follow-requests/3?approve=true'])
    })

    it('fila vazia de saída: não aprova ninguém e devolve true', async () => {
      vi.mocked(request).mockResolvedValue({ items: [], next_cursor: null } as never)
      await expect(approveAllFollowRequests(() => { throw new Error('ninguém a aprovar') })).resolves.toBe(true)
      expect(request).toHaveBeenCalledTimes(1)
    })

    it('para quando a rodada traz os mesmos pedidos da anterior (a aprovação não os tirou da fila) e devolve false', async () => {
      vi.mocked(request).mockImplementation(async (path: string) => (path === '/me/follow-requests' ? { items: [who(1), who(2)], next_cursor: null } : undefined) as never)
      const approved: number[] = []
      await expect(approveAllFollowRequests(id => approved.push(id))).resolves.toBe(false)
      // Uma rodada aprovou os dois; a segunda leu os mesmos e parou, sem repetir as aprovações.
      expect(approved).toEqual([1, 2])
      expect(vi.mocked(request).mock.calls.filter(([path]) => path === '/me/follow-requests')).toHaveLength(2)
    })

    it('para no teto de rodadas quando a fila não para de crescer e devolve false', async () => {
      let next = 0
      vi.mocked(request).mockImplementation(async (path: string) => (path === '/me/follow-requests' ? { items: [who(++next)], next_cursor: null } : undefined) as never)
      await expect(approveAllFollowRequests(() => undefined)).resolves.toBe(false)
      expect(approvals()).toHaveLength(APPROVE_ALL_MAX_ROUNDS)
      expect(APPROVE_ALL_MAX_ROUNDS).toBe(500)
    })

    it('uma falha da API sobe para quem chamou, com o que já foi aprovado informado', async () => {
      vi.mocked(request).mockImplementation(async (path: string) => {
        if (path === '/me/follow-requests') return { items: [who(1), who(2)], next_cursor: null } as never
        if (path.startsWith('/me/follow-requests/2')) throw new Error('Falha na aprovação')
        return undefined as never
      })
      const approved: number[] = []
      await expect(approveAllFollowRequests(id => approved.push(id))).rejects.toThrow('Falha na aprovação')
      expect(approved).toEqual([1])
    })
  })
})
