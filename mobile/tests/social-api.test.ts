import { beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from '../src/api/client'
import { CAPTION_MAX, COMMENT_MAX, REPORT_DETAILS_MAX, REPORT_REASONS, blockUser, createComment, deleteComment, deletePost, sendReport, setLike, toggleFollow, updateCaption } from '../src/api/social'

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
})
