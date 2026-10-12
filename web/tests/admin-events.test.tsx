import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminPaidEvents from '../src/components/admin/AdminPaidEvents'
import AdminRevokedEvents from '../src/components/admin/AdminRevokedEvents'
import AdminRefundDisputes from '../src/components/admin/AdminRefundDisputes'
import { apiError, mockApi, person } from './teams-fixtures'
import { adminEvent, dispute, fromNow, receipt } from './events-fixtures'

/* Filas da administração da etapa 2 (contrato 0003, seção 15): eventos pagos, organizador revogado e devoluções contestadas. */

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:comprovante')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('fila "Eventos pagos" (AD1)', () => {
  const copa = adminEvent({ id: 4, name: 'Copa Sudoeste Society', price_cents: 24000 })
  const relampago = adminEvent()
  const routes = (extra: Record<string, unknown> = {}) => ({
    'GET /admin/events?queue=em_aprovacao': { items: [copa, relampago], next_cursor: null },
    ...extra,
  })

  it('abre a folha com o cartaz, os dados e o Pix informado; aprova e publica', async () => {
    const api = mockApi(routes({ 'POST /admin/events/4/decision': { ...copa, state: 'publicado', phase: 'inscricoes_abertas' } }))
    const ui = userEvent.setup()
    render(<AdminPaidEvents onExpired={vi.fn()} />)
    const list = await screen.findByRole('list', { name: 'Eventos pagos para aprovar' })
    expect(within(list).getByRole('button', { name: /Copa Sudoeste Society.*Liga Sudoeste/ })).not.toBeNull()
    await ui.click(within(list).getByRole('button', { name: /Copa Sudoeste Society/ }))
    const sheet = screen.getByRole('dialog', { name: 'Evento pago' })
    expect(within(sheet).getByText('Enviado por Liga Sudoeste ontem')).not.toBeNull()
    expect(sheet.querySelector('[data-slot=event-poster]')?.textContent).toContain('Copa Sudoeste Society')
    expect(within(sheet).getByText('Arena Sudoeste — Brasília · DF')).not.toBeNull()
    expect(within(sheet).getByText('8 times')).not.toBeNull()
    const pixBox = within(sheet).getByRole('region', { name: 'Pix informado' })
    expect(pixBox.textContent).toContain('Chave (E-mail)copa@pix.com')
    expect(pixBox.textContent).toContain('Copia e ColaInformado')
    expect(within(pixBox).getByText('000201BR.GOV.BCB.PIX')).not.toBeNull()

    await ui.click(within(sheet).getByRole('button', { name: 'Aprovar e publicar' }))
    expect((await screen.findByRole('status')).textContent).toBe('Copa Sudoeste Society foi aprovado e publicado.')
    expect(api.find('POST', '/admin/events/4/decision')[0].body).toEqual({ decision: 'aprovar' })
    expect(within(screen.getByRole('list', { name: 'Eventos pagos para aprovar' })).queryByText('Copa Sudoeste Society')).toBeNull()
  })

  it('recusa com motivo (detalhe obrigatório em "Outro") e mostra o erro do servidor', async () => {
    const api = mockApi(routes({ 'POST /admin/events/5/decision': { ...relampago, state: 'rascunho' } }))
    const ui = userEvent.setup()
    render(<AdminPaidEvents onExpired={vi.fn()} />)
    await ui.click(await screen.findByRole('button', { name: /Torneio Relâmpago Society/ }))
    const sheet = screen.getByRole('dialog', { name: 'Evento pago' })
    await ui.click(within(sheet).getByRole('button', { name: 'Recusar' }))
    expect(within(sheet).getByText('O evento volta para rascunho com o motivo; o organizador corrige e reenvia.')).not.toBeNull()
    await ui.click(within(sheet).getByRole('button', { name: 'Recusar evento' }))
    expect(within(sheet).getByRole('alert').textContent).toBe('Escolha o motivo da recusa.')
    await ui.click(within(sheet).getByRole('button', { name: 'Outro' }))
    await ui.click(within(sheet).getByRole('button', { name: 'Recusar evento' }))
    expect(within(sheet).getByRole('alert').textContent).toBe('Descreva o motivo da recusa.')
    await ui.click(within(sheet).getByRole('button', { name: 'Preço ou datas inconsistentes' }))
    await ui.type(within(sheet).getByLabelText('Detalhe para o organizador (opcional)'), 'Inscrições fecham no dia do evento.')
    await ui.click(within(sheet).getByRole('button', { name: 'Recusar evento' }))
    expect((await screen.findByRole('status')).textContent).toBe('Torneio Relâmpago Society voltou para rascunho com o motivo.')
    expect(api.find('POST', '/admin/events/5/decision')[0].body).toEqual({
      decision: 'recusar', reason_code: 'preco_ou_datas', reason_detail: 'Inscrições fecham no dia do evento.' })

    cleanup()
    mockApi(routes({ 'POST /admin/events/4/decision': apiError(409, 'As datas deste evento já passaram. Recuse para o organizador corrigir.') }))
    render(<AdminPaidEvents onExpired={vi.fn()} />)
    await ui.click(await screen.findByRole('button', { name: /Copa Sudoeste Society/ }))
    await ui.click(screen.getByRole('button', { name: 'Aprovar e publicar' }))
    expect((await within(screen.getByRole('dialog')).findByRole('alert')).textContent).toBe('As datas deste evento já passaram. Recuse para o organizador corrigir.')
  })

  it('fila vazia e erro com nova tentativa', async () => {
    mockApi({ 'GET /admin/events?queue=em_aprovacao': { items: [], next_cursor: null } })
    render(<AdminPaidEvents onExpired={vi.fn()} />)
    expect(await screen.findByText('Nada para aprovar')).not.toBeNull()
    cleanup()
    mockApi({ 'GET /admin/events?queue=em_aprovacao': apiError(403, 'Acesso administrativo necessário.') })
    render(<AdminPaidEvents onExpired={vi.fn()} />)
    expect((await screen.findByRole('alert')).textContent).toContain('Acesso administrativo necessário.')
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).not.toBeNull()
  })
})

describe('fila "Eventos de organizador revogado"', () => {
  const revoked = (id: number, name: string, extra = {}) => adminEvent({
    id, name, state: 'publicado', phase: 'inscricoes_abertas', revocation_pending: true, revocation_decision: 'pendente', price_cents: 8000,
    organizer: { organizer_id: 9, display_name: 'Clube do Lago', user: person(6, 'Otávio Organizador'), active: false },
    entries_by_state: { confirmada: 2, em_analise: 1 },
    pending: { receipts: 1, refunds_to_send: 0, refunds_awaiting: 0, refund_disputes: 0, total: 1 }, ...extra })
  const open = revoked(7, 'Open do Lago')
  const desafio = revoked(8, 'Desafio do Lago', { price_cents: 0, entries_by_state: {}, pending: { receipts: 0, refunds_to_send: 0, refunds_awaiting: 0, refund_disputes: 0, total: 0 } })
  const routes = (extra: Record<string, unknown> = {}) => ({
    'GET /admin/events?queue=revogacao': { items: [open, desafio], next_cursor: null },
    ...extra,
  })

  it('mostra o que está em jogo e segue com o evento depois de confirmar', async () => {
    const api = mockApi(routes({ 'POST /admin/events/8/revocation-decision': { ...desafio, revocation_pending: false, revocation_decision: 'seguir' } }))
    const ui = userEvent.setup()
    render(<AdminRevokedEvents onExpired={vi.fn()} />)
    const list = await screen.findByRole('list', { name: 'Eventos aguardando decisão' })
    expect(within(list).getByText('1 pendência')).not.toBeNull()
    await ui.click(within(list).getByRole('button', { name: /Open do Lago/ }))
    let sheet = screen.getByRole('dialog', { name: 'Organizador revogado' })
    expect(within(sheet).getByText('Permissão revogada')).not.toBeNull()
    // O cartaz mostra o que o servidor já faz: as inscrições estão suspensas até a decisão.
    expect(sheet.querySelector('[data-slot=event-poster]')?.textContent).toContain('Inscrições suspensas')
    const stake = within(sheet).getByRole('region', { name: 'Inscrições' })
    expect(within(stake).getByText('2 · Confirmada')).not.toBeNull()
    expect(within(stake).getByText('1 · Comprovante em análise')).not.toBeNull()
    expect(stake.textContent).toContain('Pendências: 1 comprovante para analisar.')
    await ui.click(within(sheet).getByRole('button', { name: 'Fechar' }))

    await ui.click(within(list).getByRole('button', { name: /Desafio do Lago/ }))
    sheet = screen.getByRole('dialog', { name: 'Organizador revogado' })
    expect(within(sheet).getByText('Nenhuma inscrição ainda.')).not.toBeNull()
    await ui.click(within(sheet).getByRole('button', { name: 'Seguir evento' }))
    expect(within(sheet).getByText(/O organizador continua gerindo este evento/)).not.toBeNull()
    await ui.click(within(sheet).getByRole('button', { name: 'Confirmar' }))
    expect((await screen.findByRole('status')).textContent).toBe('Desafio do Lago segue com o organizador.')
    expect(api.find('POST', '/admin/events/8/revocation-decision')[0].body).toEqual({ decision: 'seguir' })
  })

  it('cancela com devolução exigindo o motivo', async () => {
    const api = mockApi(routes({ 'POST /admin/events/7/revocation-decision': { ...open, state: 'cancelado', revocation_decision: 'cancelado' } }))
    const ui = userEvent.setup()
    render(<AdminRevokedEvents onExpired={vi.fn()} />)
    await ui.click(await screen.findByRole('button', { name: /Open do Lago/ }))
    const sheet = screen.getByRole('dialog', { name: 'Organizador revogado' })
    await ui.click(within(sheet).getByRole('button', { name: 'Cancelar evento' }))
    expect(within(sheet).getByText(/3 inscrições pagas viram devolução pendente/)).not.toBeNull()
    await ui.click(within(sheet).getByRole('button', { name: 'Cancelar evento' }))
    expect(within(sheet).getByRole('alert').textContent).toBe('Descreva o motivo do cancelamento, de 5 a 500 caracteres.')
    expect(api.find('POST', '/admin/events/7/revocation-decision')).toHaveLength(0)
    await ui.type(within(sheet).getByLabelText('Motivo do cancelamento (aparece aos inscritos)'), ' Organizador sem permissão. ')
    await ui.click(within(sheet).getByRole('button', { name: 'Cancelar evento' }))
    expect((await screen.findByRole('status')).textContent).toBe('Open do Lago foi cancelado. O organizador envia as devoluções.')
    expect(api.find('POST', '/admin/events/7/revocation-decision')[0].body).toEqual({ decision: 'cancelar', reason: 'Organizador sem permissão.' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('fila "Devoluções contestadas"', () => {
  const item = dispute()
  const payment = receipt(300, { decision: 'aprovado', decided_at: fromNow(-60), created_at: fromNow(-70) })
  const routes = (extra: Record<string, unknown> = {}) => ({
    'GET /admin/refund-disputes': { items: [item], next_cursor: null },
    'GET /entries/7/receipts': { items: [payment, item.entry.refund] },
    'GET /receipts/301/file': { imagem: true },
    ...extra,
  })

  it('mostra os dois lados e o histórico; pede outro comprovante com o motivo', async () => {
    const api = mockApi(routes({ 'POST /admin/entries/7/refund-decision': item }))
    const ui = userEvent.setup()
    render(<AdminRefundDisputes onExpired={vi.fn()} />)
    const list = await screen.findByRole('list', { name: 'Devoluções para decidir' })
    await ui.click(within(list).getByRole('button', { name: /Ferrugem FC.*Copa Sudoeste Society/ }))
    const sheet = screen.getByRole('dialog', { name: 'Devolução contestada' })
    expect(within(sheet).getByText('O Pix não chegou na conta do time.')).not.toBeNull()
    expect(await within(sheet).findByRole('img', { name: 'Comprovante da devolução enviado por Olga Organizadora' })).not.toBeNull()
    const history = await within(sheet).findByRole('region', { name: 'Histórico da inscrição' })
    expect(await within(history).findByText('Pagamento aprovado')).not.toBeNull()
    expect(within(history).queryByText('Devolução contestada')).toBeNull()

    await ui.click(within(sheet).getByRole('button', { name: 'Pedir outro' }))
    await ui.click(within(sheet).getByRole('button', { name: 'Registrar decisão' }))
    expect(within(sheet).getByRole('alert').textContent).toBe('Descreva a decisão, de 5 a 500 caracteres.')
    await ui.type(within(sheet).getByLabelText('Motivo da decisão (o organizador e o participante veem)'), 'Falta a conta de destino.')
    await ui.click(within(sheet).getByRole('button', { name: 'Registrar decisão' }))
    expect((await screen.findByRole('status')).textContent).toBe('Olga Organizadora vai enviar outro comprovante para Ferrugem FC.')
    expect(api.find('POST', '/admin/entries/7/refund-decision')[0].body).toEqual({ decision: 'pendente', reason: 'Falta a conta de destino.' })
    expect(screen.getByText('Nenhuma devolução contestada')).not.toBeNull()
  })

  it('considera a devolução feita e mostra o erro do servidor', async () => {
    const api = mockApi(routes({ 'POST /admin/entries/7/refund-decision': apiError(409, 'Esta devolução não está contestada.') }))
    const ui = userEvent.setup()
    render(<AdminRefundDisputes onExpired={vi.fn()} />)
    await ui.click(await screen.findByRole('button', { name: /Ferrugem FC/ }))
    const sheet = screen.getByRole('dialog', { name: 'Devolução contestada' })
    await ui.click(within(sheet).getByRole('button', { name: 'Devolução feita' }))
    expect(within(sheet).getByText('A inscrição fica como devolvida e o caso é encerrado.')).not.toBeNull()
    await ui.type(within(sheet).getByRole('textbox'), 'Comprovante com a conta do time.')
    await ui.click(within(sheet).getByRole('button', { name: 'Registrar decisão' }))
    expect((await within(sheet).findByText('Esta devolução não está contestada.')).getAttribute('role')).toBe('alert')
    expect(api.find('POST', '/admin/entries/7/refund-decision')[0].body).toEqual({ decision: 'devolvida', reason: 'Comprovante com a conta do time.' })
  })
})
