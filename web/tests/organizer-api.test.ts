import { beforeEach, expect, it, vi } from 'vitest'
import { request } from '../src/api/client'
import { ADMIN_ORGANIZERS_PATH, decideOrganizerRequest, getQueueCounts, organizerRequestsPath, revokeOrganizer } from '../src/api/admin'
import { getUnreadCount, markAllNotificationsRead, markNotificationRead, NOTIFICATIONS_PATH } from '../src/api/notifications'
import { cancelOrganizerRequest, getOrganizerStatus, ORGANIZER_REFUSAL_REASONS, sendOrganizerRequest } from '../src/api/organizer'
import { getMyStandings } from '../src/api/play'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(),
}))

beforeEach(() => { vi.mocked(request).mockReset(); vi.mocked(request).mockResolvedValue(undefined as never) })

it('usa os caminhos, métodos e corpos dos contratos 0002 e 0003', async () => {
  const input = { display_name: 'Liga', city_id: 7, sports: ['futebol' as const], contact: 'liga@x.com', accept_terms: true }
  await getOrganizerStatus()
  await sendOrganizerRequest(input)
  await cancelOrganizerRequest()
  await getQueueCounts()
  await decideOrganizerRequest(4, { decision: 'aprovar' })
  await revokeOrganizer(9, '  Motivo da revogação ')
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
    ['/me/notifications/unread-count'],
    ['/me/notifications/5/read', 'PUT', {}],
    ['/me/notifications/read-all', 'PUT', {}],
    ['/me/standings'],
  ])
  expect([organizerRequestsPath('em_analise'), organizerRequestsPath('decididos'), ADMIN_ORGANIZERS_PATH, NOTIFICATIONS_PATH])
    .toEqual(['/admin/organizer-requests?state=em_analise', '/admin/organizer-requests?state=decididos', '/admin/organizers', '/me/notifications'])
  expect(ORGANIZER_REFUSAL_REASONS.map(reason => reason.value)).toEqual(['contato_nao_funciona', 'pouca_informacao', 'pedido_repetido', 'outro'])
})
