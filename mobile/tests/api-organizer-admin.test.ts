import { beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from '../src/api/client'
import * as admin from '../src/api/admin'
import { getUnreadCount, markAllNotificationsRead, markNotificationRead, NOTIFICATIONS_PATH } from '../src/api/notifications'
import * as organizer from '../src/api/organizer'
import { getMyStandings } from '../src/api/play'

vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(),
}))

beforeEach(() => { vi.mocked(request).mockReset().mockResolvedValue(undefined as never) })

describe('cliente do organizador, da administração, das notificações e das posições', () => {
  it('usa os caminhos, métodos e corpos dos contratos 0002 e 0003', async () => {
    const input = { display_name: 'Liga', city_id: 7, sports: ['futebol' as const], contact: 'liga@x.com', accept_terms: true }
    await organizer.getOrganizerStatus()
    await organizer.sendOrganizerRequest(input)
    await organizer.cancelOrganizerRequest()
    await admin.getQueueCounts()
    await admin.decideOrganizerRequest(4, { decision: 'aprovar' })
    await admin.revokeOrganizer(9, '  Motivo da revogação ')
    await admin.decideEvent(3, { decision: 'aprovar' })
    await admin.decideRevocation(3, { decision: 'cancelar', reason: 'Organizador revogado' })
    await admin.decideRefund(12, 'devolvida', '  Comprovante conferido ')
    await getUnreadCount()
    await markNotificationRead(5)
    await markAllNotificationsRead()
    await getMyStandings()
    expect(vi.mocked(request).mock.calls).toEqual([
      ['/me/organizer-request'],
      ['/me/organizer-request', 'POST', input],
      ['/me/organizer-request', 'DELETE'],
      ['/admin/queue-counts'],
      ['/admin/organizer-requests/4/decision', 'POST', { decision: 'aprovar' }],
      ['/admin/organizers/9/revoke', 'POST', { reason: 'Motivo da revogação' }],
      ['/admin/events/3/decision', 'POST', { decision: 'aprovar' }],
      ['/admin/events/3/revocation-decision', 'POST', { decision: 'cancelar', reason: 'Organizador revogado' }],
      ['/admin/entries/12/refund-decision', 'POST', { decision: 'devolvida', reason: 'Comprovante conferido' }],
      ['/me/notifications/unread-count'],
      ['/me/notifications/5/read', 'PUT', {}],
      ['/me/notifications/read-all', 'PUT', {}],
      ['/me/standings'],
    ])
  })

  it('expõe os caminhos paginados das filas', () => {
    expect([admin.organizerRequestsPath('em_analise'), admin.organizerRequestsPath('decididos'), admin.ADMIN_ORGANIZERS_PATH, NOTIFICATIONS_PATH])
      .toEqual(['/admin/organizer-requests?state=em_analise', '/admin/organizer-requests?state=decididos', '/admin/organizers', '/me/notifications'])
    expect([admin.adminEventsPath('em_aprovacao'), admin.adminEventsPath('revogacao'), admin.REFUND_DISPUTES_PATH])
      .toEqual(['/admin/events?queue=em_aprovacao', '/admin/events?queue=revogacao', '/admin/refund-disputes'])
    expect(organizer.ORGANIZER_REFUSAL_REASONS.map(reason => reason.value)).toEqual(['contato_nao_funciona', 'pouca_informacao', 'pedido_repetido', 'outro'])
  })
})

describe('pedido de organizador: textos e validação (contrato 0003, seção 6)', () => {
  const draft: organizer.OrganizerRequestDraft = {
    display_name: 'Liga Candanga', city_id: 7, sports: ['corrida', 'futebol'], experience: '', contact: 'liga@example.com', link: '', accept_terms: true,
  }

  it('escreve o motivo da recusa, a frase e as modalidades', () => {
    expect(organizer.refusalText('pouca_informacao', 'Falta o link')).toBe('Pouca informação · Falta o link')
    expect(organizer.refusalText('outro', 'Sem nome')).toBe('Sem nome')
    expect(organizer.refusalText('pedido_repetido')).toBe('Pedido repetido')
    expect(organizer.refusalText(null, null)).toBe('Motivo não informado')
    expect(organizer.refusalText(null, 'Só o detalhe')).toBe('Só o detalhe')
    expect(organizer.sentence('Sem contato.')).toBe('Sem contato.')
    expect(organizer.sentence(' Sem contato ')).toBe('Sem contato.')
    expect(organizer.sportNames(['corrida', 'futebol'])).toBe('Futebol, Corrida')
  })

  it('aceita o rascunho válido e aponta cada campo inválido', () => {
    expect(organizer.validateOrganizerRequest(draft, new Set([7]))).toEqual({})
    expect(organizer.validateOrganizerRequest(draft)).toEqual({})
    const errors = organizer.validateOrganizerRequest({ ...draft, display_name: 'Li', city_id: 9, contact: 'a@b', link: 'ftp://x', experience: 'x'.repeat(1001), accept_terms: false, sports: [] }, new Set([7]))
    expect(Object.keys(errors).sort()).toEqual(['accept_terms', 'city_id', 'contact', 'display_name', 'experience', 'link', 'sports'])
    expect(organizer.validateOrganizerRequest({ ...draft, city_id: null }).city_id).toBeDefined()
    expect(organizer.validateOrganizerRequest({ ...draft, link: `https://${'a'.repeat(300)}.com` }).link).toBeDefined()
    expect(organizer.validateOrganizerRequest({ ...draft, link: 'https://liga.example.com/pagina' }).link).toBeUndefined()
  })

  it('monta o corpo do pedido: textos aparados, opcionais nulos e modalidades na ordem do catálogo', () => {
    expect(organizer.organizerRequestInput({ ...draft, display_name: ' Liga Candanga ', experience: '  ', link: ' https://liga.example.com ' })).toEqual({
      display_name: 'Liga Candanga', city_id: 7, sports: ['futebol', 'corrida'], experience: null, contact: 'liga@example.com', link: 'https://liga.example.com', accept_terms: true,
    })
    expect(organizer.organizerRequestInput({ ...draft, city_id: null, experience: ' Dez anos ' })).toMatchObject({ city_id: 0, experience: 'Dez anos', link: null })
  })
})

describe('administração: motivos', () => {
  it('recusa do pedido e do evento: motivo obrigatório, detalhe até 500 e obrigatório em "Outro"', () => {
    expect(admin.refusalError(null, '')).toBe('Escolha o motivo da recusa.')
    expect(admin.refusalError('pix_incompleto', '')).toBeNull()
    expect(admin.refusalError('outro', 'abc')).toBe('Descreva o motivo da recusa.')
    expect(admin.refusalError('preco_ou_datas', 'x'.repeat(501))).toBe('Use até 500 caracteres no detalhe.')
    expect(admin.refusalError('valor_diferente', 'x'.repeat(301), 300)).toBe('Use até 300 caracteres no detalhe.')
    expect(admin.refusalInput('pouca_informacao', '  ')).toEqual({ decision: 'recusar', reason_code: 'pouca_informacao' })
    expect(admin.refusalInput('outro', ' Detalhe ')).toEqual({ decision: 'recusar', reason_code: 'outro', reason_detail: 'Detalhe' })
    expect(admin.eventRefusalInput('conteudo_inadequado', '')).toEqual({ decision: 'recusar', reason_code: 'conteudo_inadequado' })
    expect(admin.eventRefusalInput('outro', ' Nome ofensivo ')).toEqual({ decision: 'recusar', reason_code: 'outro', reason_detail: 'Nome ofensivo' })
  })

  it('revogação e demais motivos de 5 a 500 caracteres', () => {
    expect(admin.revokeError('abcd')).toContain('5 a 500')
    expect(admin.revokeError('Motivo válido')).toBeNull()
    expect(admin.revokeError('x'.repeat(501))).not.toBeNull()
    expect(admin.reasonError('  abc  ', admin.CANCEL_REASON_MESSAGE)).toBe(admin.CANCEL_REASON_MESSAGE)
    expect(admin.reasonError('Motivo válido', admin.REFUND_REASON_MESSAGE)).toBeNull()
    expect(admin.reasonError('x'.repeat(501), admin.CANCEL_REASON_MESSAGE)).toBe(admin.CANCEL_REASON_MESSAGE)
  })
})
