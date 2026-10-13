import { beforeEach, expect, it, vi } from 'vitest'
import { request } from '../src/api/client'
import { CAPTION_MAX, COMMENT_MAX, REPORT_DETAILS_MAX, REPORT_REASONS, blockUser, createComment, deleteComment, deletePost, sendReport, setLike, updateCaption } from '../src/api/social'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(),
}))

beforeEach(() => { vi.mocked(request).mockReset(); vi.mocked(request).mockResolvedValue(undefined as never) })

it('usa os caminhos, métodos e corpos dos endpoints sociais', async () => {
  await setLike(7, true)
  await setLike(7, false)
  await updateCaption(7, 'Nova legenda')
  await deletePost(7)
  await createComment(7, 'Boa!')
  await deleteComment(11)
  await blockUser(2)
  expect(vi.mocked(request).mock.calls).toEqual([
    ['/posts/7/like', 'PUT'],
    ['/posts/7/like', 'DELETE'],
    ['/posts/7', 'PATCH', { caption: 'Nova legenda' }],
    ['/posts/7', 'DELETE'],
    ['/posts/7/comments', 'POST', { body: 'Boa!' }],
    ['/comments/11', 'DELETE'],
    ['/users/2/block', 'PUT'],
  ])
})

it('envia detalhes da denúncia sem espaços extras e omite detalhes vazios', async () => {
  await sendReport({ target_type: 'comment', target_id: 11, reason: 'assedio', description: '  Ofensa no comentário  ' })
  await sendReport({ target_type: 'post', target_id: 7, reason: 'spam', description: '   ' })
  await sendReport({ target_type: 'user', target_id: 2, reason: 'outro' })
  expect(vi.mocked(request).mock.calls).toEqual([
    ['/reports', 'POST', { target_type: 'comment', target_id: 11, reason: 'assedio', description: 'Ofensa no comentário' }],
    ['/reports', 'POST', { target_type: 'post', target_id: 7, reason: 'spam' }],
    ['/reports', 'POST', { target_type: 'user', target_id: 2, reason: 'outro' }],
  ])
})

it('expõe os motivos aceitos pela API e os limites dos campos', () => {
  expect(REPORT_REASONS.map(reason => reason.value)).toEqual(['spam', 'assedio', 'conteudo_inadequado', 'outro'])
  expect([CAPTION_MAX, COMMENT_MAX, REPORT_DETAILS_MAX]).toEqual([2200, 1000, 1000])
})
