import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, request } from '../src/api/client'
import type { OrganizerEventDetail } from '../src/api/events'
import EventManagePage from '../src/pages/EventManagePage'
import { draftDetail, eventDetail, fullChecklist, inDays, message, organizerEntry } from './events-fixtures'
import { findToast, queryToast, renderWithToaster } from './toast-utils'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

type Handler = (path: string, method: string | undefined, body: unknown) => unknown
function mockApi(detail: OrganizerEventDetail, extra: Handler = () => undefined) {
  vi.mocked(request).mockImplementation(async (path, method, body) => {
    const result = extra(path, method, body)
    if (result instanceof Error) throw result
    if (result !== undefined) return result as never
    if (path === `/organizer/events/${detail.id}` && !method) return detail as never
    if (path === `/events/${detail.id}/messages`) return { items: [], next_cursor: null } as never
    throw new Error(`rota inesperada ${method ?? 'GET'} ${path}`)
  })
}
function renderPage(eventId = 5) {
  const props = { onBack: vi.fn(), onEdit: vi.fn(), onReceipts: vi.fn(), onDeleted: vi.fn(), onExpired: vi.fn() }
  renderWithToaster(<EventManagePage eventId={eventId} {...props} />)
  return props
}
const agora = () => screen.getByRole('region', { name: (_, element) => element.getAttribute('data-slot') === 'next-action' })

beforeEach(() => { vi.mocked(request).mockReset() })
afterEach(cleanup)

describe('gestão do evento (G3): cartão "Agora"', () => {
  it('rascunho incompleto: checklist com "Preencher" e "Publicar" desabilitado até completar', async () => {
    const user = userEvent.setup()
    mockApi(draftDetail())
    const props = renderPage(9)
    expect(await screen.findByRole('heading', { name: 'Complete o rascunho' })).toBeTruthy()
    expect(agora().textContent).toContain('Faltam 3 itens para publicar.')
    const checklist = screen.getByRole('list', { name: 'Checklist do rascunho' })
    expect(within(checklist).getAllByRole('listitem')).toHaveLength(6)
    expect(checklist.textContent).toContain('Datas: falta')
    const publish = screen.getByRole('button', { name: 'Publicar' }) as HTMLButtonElement
    expect(publish.disabled).toBe(true)
    expect(publish.getAttribute('aria-describedby')).toBe('now-submit-hint')
    await user.click(within(checklist).getByRole('button', { name: 'Preencher datas' }))
    expect(props.onEdit).toHaveBeenCalledWith(3)
    await user.click(within(checklist).getByRole('button', { name: 'Preencher inscrição e pix' }))
    expect(props.onEdit).toHaveBeenLastCalledWith(4)
    // Sem inscrições antes de publicar; tabela e partidas ainda não existem.
    expect(screen.getByText('0 de 8 · depois de publicar')).toBeTruthy()
    expect(screen.getByText('Tabela').closest('[aria-disabled]')).toBeTruthy()
    expect(screen.getAllByText('Depois das inscrições')).toHaveLength(2)
    expect(screen.queryByRole('heading', { name: /Avisos do evento/ })).toBeNull()
  })

  it('rascunho completo: publica o gratuito e passa a acompanhar as inscrições', async () => {
    const user = userEvent.setup()
    const ready = draftDetail({ checklist: fullChecklist, can_submit: true, price_cents: 0, next_action: { kind: 'publicar', count: null, deadline: null } })
    mockApi(ready, (path, method) => path === '/organizer/events/9/submit' && method === 'POST'
      ? { ...ready, state: 'publicado', phase: 'inscricoes_abertas', checklist: [], next_action: { kind: 'acompanhar_inscricoes', count: null, deadline: inDays(5) } }
      : undefined)
    renderPage(9)
    expect(await screen.findByRole('heading', { name: 'Pronto para publicar' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Publicar' }))
    expect((await findToast('Evento publicado: as inscrições estão abertas.')).closest('[data-tone]')?.getAttribute('data-tone')).toBe('success')
    expect(screen.getByRole('heading', { name: /Inscrições abertas até/ })).toBeTruthy()
    expect(request).toHaveBeenCalledWith('/organizer/events/9/submit', 'POST', {})
  })

  it('envio recusado pelo checklist mostra o erro e recarrega o rascunho', async () => {
    const user = userEvent.setup()
    const ready = draftDetail({ checklist: fullChecklist, can_submit: true, price_cents: 0, next_action: { kind: 'publicar', count: null, deadline: null } })
    let reloads = 0
    mockApi(ready, (path, method) => {
      if (path === '/organizer/events/9/submit') return new ApiError('Complete o rascunho para publicar.', 422, [{ field: 'datas', message: 'A data do evento já passou.' }])
      if (path === '/organizer/events/9' && !method && ++reloads > 1) return draftDetail()
      return undefined
    })
    renderPage(9)
    await user.click(await screen.findByRole('button', { name: 'Publicar' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Complete o rascunho para publicar.')
    expect(await screen.findByRole('heading', { name: 'Complete o rascunho' })).toBeTruthy()
  })

  it('envio com falha comum vira toast de erro (sem bloco na tela); conexão não mostra mensagem local', async () => {
    const user = userEvent.setup()
    const ready = draftDetail({ checklist: fullChecklist, can_submit: true, price_cents: 0, next_action: { kind: 'publicar', count: null, deadline: null } })
    let status = 500
    mockApi(ready, (path, method) => path === '/organizer/events/9/submit' && method === 'POST' ? new ApiError(status === 500 ? 'Falha ao publicar o evento.' : 'Sem conexão.', status) : undefined)
    renderPage(9)
    await user.click(await screen.findByRole('button', { name: 'Publicar' }))
    expect((await findToast('Falha ao publicar o evento.')).closest('[data-tone]')?.getAttribute('data-tone')).toBe('error')
    status = 503
    await user.click(await screen.findByRole('button', { name: 'Publicar' }))
    const submits = () => vi.mocked(request).mock.calls.filter(([path]) => path === '/organizer/events/9/submit').length
    await waitFor(() => expect(submits()).toBe(2))
    expect(queryToast('Sem conexão.')).toBeNull()
  })

  it('pago em aprovação: aguarda a administração e pode ser retirado', async () => {
    const user = userEvent.setup()
    const waiting = eventDetail({ state: 'em_aprovacao', phase: 'em_aprovacao', submitted_at: '2026-10-12T10:00:00Z', entries_count: 0, editable_fields: [],
      next_action: { kind: 'aguardar_aprovacao', count: null, deadline: null } })
    mockApi(waiting, (path, method) => path === '/organizer/events/5/withdraw' && method === 'POST'
      ? draftDetail({ id: 5, checklist: fullChecklist, can_submit: true, price_cents: 24000, next_action: { kind: 'publicar', count: null, deadline: null } })
      : undefined)
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Em aprovação pela administração' })).toBeTruthy()
    expect(agora().textContent).toContain('Enviado em 12 de out. de 2026.')
    expect(screen.queryByRole('button', { name: 'Cancelar evento' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Retirar da aprovação' }))
    expect(await findToast(/Evento retirado da aprovação/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Pronto para enviar à aprovação' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Enviar para aprovação' })).toBeTruthy()
  })

  it('recusado pela administração: motivo e "Corrigir e reenviar"', async () => {
    const user = userEvent.setup()
    mockApi(draftDetail({ id: 5, checklist: fullChecklist, can_submit: true, price_cents: 24000,
      refusal: { reason_code: 'pix_incompleto', reason_detail: 'Confira o favorecido.', reviewed_at: '2026-10-12T10:00:00Z' },
      next_action: { kind: 'corrigir_recusa', count: null, deadline: null } }))
    const props = renderPage()
    expect(await screen.findByRole('heading', { name: 'Recusado pela administração' })).toBeTruthy()
    expect(agora().textContent).toContain('Motivo: Dados do Pix incompletos · Confira o favorecido. Corrija')
    await user.click(screen.getByRole('button', { name: 'Corrigir e reenviar' }))
    expect(props.onEdit).toHaveBeenCalledWith(undefined)
  })

  it('comprovantes para analisar levam à tela de comprovantes', async () => {
    const user = userEvent.setup()
    mockApi(eventDetail({ pending: { receipts: 2, refunds_to_send: 0, refunds_awaiting: 0, refund_disputes: 0, total: 2 },
      next_action: { kind: 'analisar_comprovantes', count: 2, deadline: null } }))
    const props = renderPage()
    expect(await screen.findByRole('heading', { name: '2 comprovantes para analisar' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Analisar' }))
    await user.click(screen.getByRole('button', { name: /Comprovantes2 comprovantes para analisar/ }))
    expect(props.onReceipts).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['aguardar_revogacao', { revocation_pending: true, revocation_decision: 'pendente', editable_fields: [] }, 'A administração decide se o evento segue'],
    ['enviar_devolucoes', { state: 'cancelado', phase: 'cancelado', next_action: { kind: 'enviar_devolucoes', count: 1, deadline: null } }, '1 devolução para enviar'],
    ['aguardar_devolucoes', { state: 'cancelado', phase: 'cancelado', next_action: { kind: 'aguardar_devolucoes', count: 2, deadline: null } }, '2 devoluções aguardando os participantes'],
    ['aguardar_inicio', { phase: 'inscricoes_encerradas', next_action: { kind: 'aguardar_inicio', count: null, deadline: inDays(3) } }, 'Inscrições encerradas · começa'],
    ['nenhuma (cancelado)', { state: 'cancelado', phase: 'cancelado', cancel_reason: 'Chuva forte.', next_action: { kind: 'nenhuma', count: null, deadline: null } }, 'Evento cancelado'],
    ['nenhuma (encerrado)', { state: 'encerrado', phase: 'encerrado', next_action: { kind: 'nenhuma', count: null, deadline: null } }, 'Evento encerrado'],
  ] as [string, Partial<OrganizerEventDetail>, string][])('mostra "%s"', async (kind, overrides, title) => {
    const detail = eventDetail({ ...overrides, next_action: overrides.next_action ?? { kind: kind as 'aguardar_revogacao', count: null, deadline: null } })
    mockApi(detail)
    renderPage()
    expect((await screen.findByRole('heading', { name: new RegExp(title) })).tagName).toBe('H2')
    if (detail.revocation_pending) expect(screen.queryByRole('button', { name: 'Cancelar evento' })).toBeNull()
  })

  it('mostra o erro de carregamento e tenta de novo', async () => {
    const user = userEvent.setup()
    let fail = true
    vi.mocked(request).mockImplementation(async path => {
      if (fail) throw new ApiError('Evento não encontrado.', 404)
      if (path === '/organizer/events/5') return eventDetail() as never
      return { items: [], next_cursor: null } as never
    })
    renderPage()
    expect((await screen.findByRole('alert')).textContent).toContain('Evento não encontrado.')
    fail = false
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByRole('heading', { name: /Inscrições abertas até/ })).toBeTruthy()
  })
})

describe('gestão do evento (G3): seções e ações', () => {
  it('lista os inscritos com o estado e o comprovante em análise', async () => {
    const user = userEvent.setup()
    mockApi(eventDetail(), path => path === '/organizer/events/5/entries' ? { items: [
      organizerEntry(),
      organizerEntry({ id: 2, state: 'em_analise', subject: { kind: 'time', team: { id: 4, name: 'Leões do Cerrado', initials: 'LC', crest_url: null }, athlete: null },
        latest_payment: { id: 8, kind: 'pagamento', file_url: '/api/v1/receipts/8/file', file_type: 'imagem', size_bytes: 1000, uploaded_by: null, created_at: inDays(0),
          decision: null, reason_code: null, reason_detail: null, decided_at: null, participant_response: null, responded_at: null, contest_reason: null,
          auto_confirm_at: null, resolution: null, resolution_reason: null, resolved_at: null } }),
      organizerEntry({ id: 3, state: 'reservada', reserved_until: inDays(1), subject: { kind: 'time', team: { id: 6, name: 'Unidos FC', initials: 'UN', crest_url: null }, athlete: null } }),
    ], next_cursor: null } : undefined)
    const props = renderPage()
    await user.click(await screen.findByRole('button', { name: /Times inscritos/ }))
    const list = await screen.findByRole('list', { name: 'Inscrições do evento' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    expect(list.textContent).toContain('Comprovante em análise')
    expect(list.textContent).toContain('Reserva até')
    await user.click(within(list).getByRole('button', { name: 'Ver comprovante de Leões do Cerrado' }))
    expect(props.onReceipts).toHaveBeenCalled()
  })

  it('descreve recusas, devoluções e inscrições de atletas', async () => {
    const user = userEvent.setup()
    const athlete = (id: number, name: string) => ({ kind: 'atleta' as const, team: null, athlete: { id, name, username: name.toLowerCase(), avatar_url: null } })
    const refund = { id: 9, kind: 'devolucao' as const, file_url: '/api/v1/receipts/9/file', file_type: 'pdf' as const, size_bytes: 10, uploaded_by: null, created_at: inDays(0),
      decision: null, reason_code: null, reason_detail: null, decided_at: null, participant_response: null, responded_at: null, contest_reason: null,
      auto_confirm_at: inDays(7), resolution: null, resolution_reason: null, resolved_at: null }
    mockApi(eventDetail({ sport: 'tenis', format: null, competition_type: 'todos_contra_todos' }), path => path === '/organizer/events/5/entries' ? { items: [
      organizerEntry({ id: 1, state: 'rejeitada', reserved_until: inDays(1), subject: athlete(11, 'Caio Ramos') }),
      organizerEntry({ id: 2, state: 'devolucao_pendente', subject: athlete(12, 'Bia Torres') }),
      organizerEntry({ id: 3, state: 'devolucao_pendente', refund, subject: athlete(13, 'Lia Moraes') }),
      organizerEntry({ id: 4, state: 'devolucao_contestada', subject: athlete(14, 'Davi Lima') }),
      organizerEntry({ id: 5, state: 'expirada', subject: athlete(15, 'Ana Reis') }),
    ], next_cursor: 'mais' } : path === '/organizer/events/5/entries?cursor=mais' ? { items: [organizerEntry({ id: 6, subject: athlete(16, 'Rui Sá') })], next_cursor: null } : undefined)
    renderPage()
    await user.click(await screen.findByRole('button', { name: /^Inscritos/ }))
    const list = await screen.findByRole('list', { name: 'Inscrições do evento' })
    expect(list.textContent).toContain('Comprovante recusado')
    expect(list.textContent).toContain('Pode enviar outro até')
    expect(list.textContent).toContain('Envie o comprovante da devolução')
    expect(list.textContent).toContain('aguardando o participante')
    expect(list.textContent).toContain('A administração decide a devolução')
    expect(list.textContent).toContain('Reserva expirada')
    await user.click(screen.getByRole('button', { name: 'Carregar mais' }))
    expect(await within(list).findByText('Rui Sá')).toBeTruthy()
  })

  it('"Ver inscritos" abre a seção de inscritos', async () => {
    const user = userEvent.setup()
    mockApi(eventDetail(), path => path === '/organizer/events/5/entries' ? { items: [], next_cursor: null } : undefined)
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Ver inscritos' }))
    expect(await screen.findByText(/Nenhuma inscrição ainda/)).toBeTruthy()
  })

  it('cancela com motivo obrigatório e confirmação; as pagas viram "Devolução pendente"', async () => {
    const user = userEvent.setup()
    const published = eventDetail({ entries_by_state: { confirmada: 2, em_analise: 1, reservada: 1 } })
    let messages = [message()]
    mockApi(published, (path, method, body) => {
      if (path === '/organizer/events/5/cancel' && method === 'POST') {
        messages = [message({ id: 2, kind: 'evento_cancelado', body: (body as { reason: string }).reason }), ...messages]
        return eventDetail({ state: 'cancelado', phase: 'cancelado', cancel_reason: (body as { reason: string }).reason, editable_fields: [],
          pending: { receipts: 0, refunds_to_send: 3, refunds_awaiting: 0, refund_disputes: 0, total: 3 }, next_action: { kind: 'enviar_devolucoes', count: 3, deadline: null } })
      }
      if (path === '/events/5/messages') return { items: messages, next_cursor: null }
      return undefined
    })
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Cancelar evento' }))
    const sheet = screen.getByRole('dialog', { name: 'Cancelar evento' })
    expect(sheet.textContent).toContain('3 inscrições vão para Devolução pendente.')
    expect(sheet.textContent).toContain('1 inscrição é cancelada.')
    await waitFor(() => expect(document.activeElement).toBe(within(sheet).getByLabelText('Motivo do cancelamento')))
    await user.type(within(sheet).getByLabelText('Motivo do cancelamento'), 'Ok')
    await user.click(within(sheet).getByRole('button', { name: 'Continuar' }))
    expect(within(sheet).getByText('Descreva o motivo do cancelamento.')).toBeTruthy()
    expect(request).not.toHaveBeenCalledWith('/organizer/events/5/cancel', 'POST', expect.anything())

    await user.type(within(sheet).getByLabelText('Motivo do cancelamento'), ' — a quadra foi interditada.')
    await user.click(within(sheet).getByRole('button', { name: 'Continuar' }))
    expect(within(sheet).getByRole('group', { name: 'Confirmação' }).textContent).toContain('Não dá para desfazer.')
    await user.click(within(sheet).getByRole('button', { name: 'Voltar' }))
    await user.click(within(sheet).getByRole('button', { name: 'Continuar' }))
    await user.click(within(sheet).getByRole('button', { name: 'Cancelar evento' }))

    expect(await findToast(/Evento cancelado. Os inscritos foram avisados/)).toBeTruthy()
    expect(request).toHaveBeenCalledWith('/organizer/events/5/cancel', 'POST', { reason: 'Ok — a quadra foi interditada.' })
    expect(screen.getByRole('heading', { name: '3 devoluções para enviar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Devoluções3 para enviar/ })).toBeTruthy()
    // O aviso automático do cancelamento aparece em destaque no canal.
    const notices = await screen.findByRole('list', { name: 'Avisos publicados' })
    const automatic = within(notices).getAllByRole('listitem')[0]
    expect(automatic.getAttribute('data-kind')).toBe('evento_cancelado')
    expect(automatic.textContent).toContain('Evento cancelado')
    expect(screen.queryByRole('button', { name: 'Cancelar evento' })).toBeNull()
  })

  it('edita depois de publicado só os campos permitidos, enviando o que mudou', async () => {
    const user = userEvent.setup()
    const published = eventDetail()
    mockApi(published, (path, method, body) => path === '/organizer/events/5' && method === 'PATCH' ? { ...published, ...(body as object) } : undefined)
    renderPage()
    await user.click(await screen.findByRole('button', { name: /Dados do evento/ }))
    await user.click(screen.getByRole('button', { name: 'Editar local e contato' }))
    const sheet = screen.getByRole('dialog', { name: 'Editar dados do evento' })
    expect(within(sheet).queryByLabelText('Percurso (opcional)')).toBeNull()
    expect(within(sheet).getByLabelText('Instruções do Pix (opcional)')).toBeTruthy()
    await user.clear(within(sheet).getByLabelText('Local'))
    await user.type(within(sheet).getByLabelText('Local'), 'A')
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }))
    expect(within(sheet).getByText('Informe o local com 2 a 120 caracteres.')).toBeTruthy()
    await user.type(within(sheet).getByLabelText('Local'), 'rena Sudoeste, quadra 2')
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }))
    expect(await findToast('Dados do evento salvos.')).toBeTruthy()
    expect(request).toHaveBeenCalledWith('/organizer/events/5', 'PATCH', { venue: 'Arena Sudoeste, quadra 2' })
  })

  it('mostra o campo recusado pelo servidor na edição', async () => {
    const user = userEvent.setup()
    mockApi(eventDetail(), (path, method) => path === '/organizer/events/5' && method === 'PATCH'
      ? new ApiError('Revise os campos informados.', 422, [{ field: 'contact', message: 'Value error, Informe o contato com até 120 caracteres.' }]) : undefined)
    renderPage()
    await user.click(await screen.findByRole('button', { name: /Dados do evento/ }))
    await user.click(screen.getByRole('button', { name: 'Editar local e contato' }))
    const sheet = screen.getByRole('dialog', { name: 'Editar dados do evento' })
    await user.type(within(sheet).getByLabelText('Contato para dúvidas (opcional)'), ' (61) 9')
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }))
    expect(await within(sheet).findByText('Informe o contato com até 120 caracteres.')).toBeTruthy()
    expect(within(sheet).getByRole('alert').textContent).toBe('Revise os campos informados.')
  })

  it('mostra o Pix para receber e exclui o rascunho com confirmação', async () => {
    const user = userEvent.setup()
    mockApi(draftDetail({ price_cents: 6000, pix: { beneficiary: 'Rafa Nunes', key_type: 'cpf', key: '52998224725', copy_paste: '000201', instructions: null } }),
      (path, method) => path === '/organizer/events/9' && method === 'DELETE' ? 'ok' : undefined)
    const props = renderPage(9)
    await user.click(await screen.findByRole('button', { name: /Pagamento e Pix/ }))
    expect(screen.getByText('52998224725')).toBeTruthy()
    expect(screen.getByText('Cadastrado')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Editar inscrição e Pix' }))
    expect(props.onEdit).toHaveBeenCalledWith(4)
    await user.click(screen.getByRole('button', { name: 'Excluir rascunho' }))
    const sheet = screen.getByRole('dialog', { name: 'Excluir rascunho' })
    await user.click(within(sheet).getByRole('button', { name: 'Excluir rascunho' }))
    await waitFor(() => expect(props.onDeleted).toHaveBeenCalled())
    expect(request).toHaveBeenCalledWith('/organizer/events/9', 'DELETE')
  })

  it('mostra o bônus do tênis (RN16) e os dados do evento', async () => {
    const user = userEvent.setup()
    mockApi(eventDetail({ sport: 'tenis', format: null, competition_type: 'todos_contra_todos', accepted_tiers: null,
      tennis_bonus: { champion: 40, runner_up: 20, semifinalist: 10, min_entries: 4, applies: false } }))
    renderPage()
    await user.click(await screen.findByRole('button', { name: /Dados do evento/ }))
    expect(screen.getByText(/campeão \+40, vice \+20 e semifinalistas \+10/)).toBeTruthy()
    expect(screen.getAllByText('Aberto a todos').length).toBeGreaterThan(0)
    expect(screen.getByText('Tênis · Todos contra todos')).toBeTruthy()
  })
})
