import { beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from '../src/api/client'
import * as moderation from '../src/api/moderation'

vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(),
}))

beforeEach(() => { vi.mocked(request).mockReset().mockResolvedValue(undefined as never) })

describe('cliente da fila de denúncias', () => {
  it('usa os caminhos, métodos e corpos de /admin/reports', async () => {
    await moderation.decideReport(11, 'remove', '  Conteúdo ofensivo  ')
    await moderation.reactivateAccount(77, '  Revisão feita & aprovada ')
    expect(vi.mocked(request).mock.calls).toEqual([
      ['/admin/reports/11/decision', 'POST', { action: 'remove', justification: 'Conteúdo ofensivo' }],
      ['/admin/users/77/status?active=true&justification=Revis%C3%A3o%20feita%20%26%20aprovada', 'PUT', {}],
    ])
    expect(moderation.adminReportsPath('pending')).toBe('/admin/reports?status=pending')
    expect(moderation.adminReportsPath('resolved')).toBe('/admin/reports?status=resolved')
  })

  it('exige a justificação de ao menos 5 caracteres, sem contar espaços nas pontas', () => {
    expect(moderation.justificationError('')).toBe('Informe uma justificativa de pelo menos 5 caracteres.')
    expect(moderation.justificationError('  abc  ')).toBe(moderation.JUSTIFICATION_MESSAGE)
    expect(moderation.justificationError('  abcde ')).toBeNull()
    expect(moderation.JUSTIFICATION_LIMITS).toEqual({ min: 5, max: 1000 })
  })

  it('remover só vale para conteúdo e reativar só para a denúncia de uma conta', () => {
    const values = (target: string) => moderation.moderationActions(target).map(action => action.value)
    expect(values('post')).toEqual(['dismiss', 'remove', 'suspend'])
    expect(values('comment')).toEqual(['dismiss', 'remove', 'suspend'])
    expect(values('match_message')).toEqual(['dismiss', 'remove', 'suspend'])
    expect(moderation.moderationActions('match_message')[1].label).toBe('Remover mensagem')
    expect(moderation.moderationActions('comment')[1].label).toBe('Remover conteúdo')
    expect(values('user')).toEqual(['dismiss', 'suspend', 'reactivate'])
    expect(moderation.moderationActions('post').every(action => action.label && action.description)).toBe(true)
  })

  it('rotula o alvo e o motivo, inclusive os que a API ainda não trouxe', () => {
    expect(['post', 'comment', 'user', 'match_message'].map(moderation.reportTargetLabel)).toEqual(['Publicação', 'Comentário', 'Conta', 'Mensagem da partida'])
    expect(moderation.reportTargetLabel('story')).toBe('Conteúdo')
    expect(moderation.reportReasonLabel('assedio')).toBe('Assédio')
    expect(moderation.reportReasonLabel('conteudo_inadequado')).toBe('Conteúdo inadequado')
    expect(moderation.reportReasonLabel('discurso_de_odio')).toBe('discurso de odio')
  })

  it('a prévia mostra a legenda, o corpo da mensagem ou o aviso de conta privada', () => {
    expect(moderation.previewText({ caption: 'Foto do jogo' })).toBe('Foto do jogo')
    expect(moderation.previewText({ body: 'Mensagem do chat', author: 'Zeca' })).toBe('Mensagem do chat')
    expect(moderation.previewText({ name: 'Maria', social_public: false })).toBe('Conta privada')
    expect(moderation.previewText({ name: 'Maria', social_public: true })).toBe('')
  })

  it('a mensagem do chat já removida vem sem texto: a prévia avisa, e o contexto traz a partida', () => {
    expect(moderation.previewText({ body: null, removed: true, author: 'Cida' })).toBe('Mensagem já removida')
    expect(moderation.previewContext({ body: 'oi', match_id: 31, match: 'Ferrugem FC × Leões' })).toBe('Partida #31 · Ferrugem FC × Leões')
    expect(moderation.previewContext({ match_id: 31 })).toBe('Partida #31')
    expect(moderation.previewContext({ match: 'A × B' })).toBe('Partida · A × B')
    expect(moderation.previewContext({ caption: 'Foto' })).toBe('')
  })
})
