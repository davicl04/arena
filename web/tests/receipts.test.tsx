import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReceiptsPage from '../src/pages/ReceiptsPage'
import { apiError, mockApi } from './teams-fixtures'
import { entry, fromNow, receipt, receiptsEvent, review } from './events-fixtures'

/*
 * Comprovantes do evento (A2) e devoluções do organizador, com a API simulada pelo `fetch`. O arquivo do comprovante é
 * lido pela rota autorizada com a sessão (`credentials: 'include'`) e exibido por um endereço `blob:`.
 */

const ferrugem = entry(1, 'Ferrugem FC')
const leoes = entry(2, 'Leões do Cerrado', { registered_by: null })
const image = receipt(101)
const pdf = receipt(102, { file_type: 'pdf', size_bytes: 26_000 })
const PENDING = 'GET /organizer/events/1/receipts?tab=para_analisar'

function renderPage(onExpired = vi.fn()) {
  render(<ReceiptsPage eventId={1} onBack={vi.fn()} onExpired={onExpired} />)
  return onExpired
}
const routes = (extra: Record<string, unknown> = {}) => ({
  'GET /organizer/events/1': receiptsEvent(),
  [PENDING]: { items: [review(image, ferrugem), review(pdf, leoes)], next_cursor: null },
  'GET /receipts/101/file': { imagem: true },
  ...extra,
})

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:comprovante')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('comprovantes do evento (A2)', () => {
  it('lista com a miniatura da imagem pela rota autorizada e o PDF com "Abrir PDF"', async () => {
    const api = mockApi(routes())
    renderPage()
    const list = await screen.findByRole('list', { name: 'Comprovantes para analisar' })
    expect(screen.getByRole('heading', { name: 'Comprovantes' })).not.toBeNull()
    expect(screen.getByText(/2 comprovantes para analisar · inscrições até/)).not.toBeNull()
    expect(screen.getByRole('tab', { name: 'Para analisar (2)' }).getAttribute('aria-selected')).toBe('true')

    const thumb = await within(list).findByRole('img', { name: 'Miniatura do comprovante de Ferrugem FC' })
    expect(thumb.getAttribute('src')).toBe('blob:comprovante')
    const fileCall = api.fetch.mock.calls.find(([url]) => String(url).endsWith('/api/v1/receipts/101/file'))
    expect(fileCall?.[1]).toMatchObject({ credentials: 'include' })

    const open = within(list).getByRole('link', { name: 'Abrir PDF do comprovante de Leões do Cerrado (nova aba)' })
    expect(open.getAttribute('href')).toBe('http://localhost:8000/api/v1/receipts/102/file')
    expect(open.getAttribute('target')).toBe('_blank')
    expect(open.getAttribute('rel')).toContain('noopener')
    // O PDF não é lido pela página: abre numa nova aba pela mesma rota.
    expect(api.find('GET', '/receipts/102/file')).toHaveLength(0)
  })

  it('aprova o comprovante, tira da fila e atualiza os contadores', async () => {
    const api = mockApi(routes({
      'POST /receipts/101/decision': review({ ...image, decision: 'aprovado', decided_at: fromNow(0) }, { ...ferrugem, state: 'confirmada' }),
    }))
    const ui = userEvent.setup()
    renderPage()
    const list = await screen.findByRole('list', { name: 'Comprovantes para analisar' })
    await ui.click(within(list).getByRole('button', { name: /Ferrugem FC/ }))
    const sheet = screen.getByRole('dialog', { name: 'Ferrugem FC' })
    expect(within(sheet).getByText('Enviado há 3 horas · Imagem')).not.toBeNull()
    const expected = within(sheet).getByRole('region', { name: 'Esperado' })
    expect(expected.textContent).toMatch(/R\$\s240,00/)
    expect(expected.textContent).toContain('Olga Organizadora')
    expect(expected.textContent).toContain('Chave (e-mail)copa@pix.com')
    expect(await within(sheet).findByRole('img', { name: 'Comprovante enviado por Ferrugem FC' })).not.toBeNull()
    expect(within(sheet).getByRole('link', { name: /Abrir a imagem em tamanho real/ }).getAttribute('target')).toBe('_blank')

    await ui.click(within(sheet).getByRole('button', { name: 'Aprovar' }))
    expect((await screen.findByRole('status')).textContent).toBe('Inscrição de Ferrugem FC confirmada.')
    expect(api.find('POST', '/receipts/101/decision')[0].body).toEqual({ decision: 'aprovar' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(within(screen.getByRole('list', { name: 'Comprovantes para analisar' })).queryByText('Ferrugem FC')).toBeNull()
    await waitFor(() => expect(api.find('GET', '/organizer/events/1')).toHaveLength(2))
  })

  it('recusa só com o motivo; em "Outro", exige o detalhe', async () => {
    const api = mockApi(routes({
      'POST /receipts/102/decision': review({ ...pdf, decision: 'recusado', reason_code: 'outro' }, { ...leoes, state: 'rejeitada' }),
    }))
    const ui = userEvent.setup()
    renderPage()
    const list = await screen.findByRole('list', { name: 'Comprovantes para analisar' })
    await ui.click(within(list).getByRole('button', { name: /Leões do Cerrado/ }))
    const sheet = screen.getByRole('dialog', { name: 'Leões do Cerrado' })
    expect(within(sheet).getByText('Comprovante em PDF')).not.toBeNull()
    expect(within(sheet).getByRole('link', { name: /Abrir PDF: Comprovante enviado por Leões do Cerrado/ }).getAttribute('href'))
      .toBe('http://localhost:8000/api/v1/receipts/102/file')

    await ui.click(within(sheet).getByRole('button', { name: 'Recusar' }))
    expect(within(sheet).getByText(/O time vê o motivo e pode enviar outro comprovante até/)).not.toBeNull()
    const confirm = () => within(sheet).getAllByRole('button', { name: 'Recusar' }).at(-1)!
    await ui.click(confirm())
    expect(within(sheet).getByRole('alert').textContent).toBe('Escolha o motivo da recusa.')
    await ui.click(within(sheet).getByRole('button', { name: 'Outro' }))
    await ui.click(confirm())
    expect(within(sheet).getByRole('alert').textContent).toBe('Descreva o motivo da recusa.')
    expect(api.find('POST', '/receipts/102/decision')).toHaveLength(0)

    await ui.type(within(sheet).getByLabelText('Detalhe para o time (obrigatório)'), '  Pagamento em nome de outra pessoa  ')
    await ui.click(confirm())
    expect((await screen.findByRole('status')).textContent).toBe('Comprovante de Leões do Cerrado recusado.')
    expect(api.find('POST', '/receipts/102/decision')[0].body).toEqual({ decision: 'recusar', reason_code: 'outro', reason_detail: 'Pagamento em nome de outra pessoa' })
  })

  it('mostra o erro do servidor na folha (comprovante já decidido)', async () => {
    mockApi(routes({ 'POST /receipts/101/decision': apiError(409, 'Este comprovante já foi decidido.') }))
    const ui = userEvent.setup()
    renderPage()
    const list = await screen.findByRole('list', { name: 'Comprovantes para analisar' })
    await ui.click(within(list).getByRole('button', { name: /Ferrugem FC/ }))
    const sheet = screen.getByRole('dialog', { name: 'Ferrugem FC' })
    await ui.click(within(sheet).getByRole('button', { name: 'Aprovar' }))
    expect((await within(sheet).findByRole('alert')).textContent).toBe('Este comprovante já foi decidido.')
    expect(screen.getByRole('dialog', { name: 'Ferrugem FC' })).not.toBeNull()
  })

  it('na 2ª tentativa, mostra o histórico de recusas da inscrição', async () => {
    const refused = receipt(100, { file_type: 'pdf', decision: 'recusado', reason_code: 'valor_diferente', reason_detail: 'Veio R$ 200,00', decided_at: fromNow(-20), created_at: fromNow(-30) })
    mockApi(routes({ [PENDING]: { items: [review(receipt(103, { created_at: fromNow(-1) }), leoes, 2, [refused])], next_cursor: null } }))
    const ui = userEvent.setup()
    renderPage()
    const list = await screen.findByRole('list', { name: 'Comprovantes para analisar' })
    expect(within(list).getByText('2ª tentativa')).not.toBeNull()
    await ui.click(within(list).getByRole('button', { name: /Leões do Cerrado/ }))
    const sheet = screen.getByRole('dialog', { name: 'Leões do Cerrado' })
    expect(within(sheet).getByText('Enviado há 1 hora · Imagem · 2ª tentativa')).not.toBeNull()
    const history = within(sheet).getByRole('region', { name: 'Recusas anteriores' })
    expect(within(history).getByText('Valor diferente · Veio R$ 200,00')).not.toBeNull()
    expect(within(history).getByRole('link', { name: /Ver o envio recusado de Leões do Cerrado/ }).getAttribute('href'))
      .toBe('http://localhost:8000/api/v1/receipts/100/file')
  })

  it('decididos: a folha mostra a decisão, sem Aprovar | Recusar', async () => {
    mockApi(routes({
      'GET /organizer/events/1/receipts?tab=decididos': { items: [
        review({ ...image, decision: 'recusado', reason_code: 'comprovante_ilegivel', decided_at: fromNow(-2) }, { ...ferrugem, state: 'rejeitada' }),
      ], next_cursor: null },
    }))
    const ui = userEvent.setup()
    renderPage()
    await screen.findByRole('list', { name: 'Comprovantes para analisar' })
    await ui.click(screen.getByRole('tab', { name: 'Decididos' }))
    const list = await screen.findByRole('list', { name: 'Comprovantes decididos' })
    expect(within(list).getByText('Recusado')).not.toBeNull()
    await ui.click(within(list).getByRole('button', { name: /Ferrugem FC/ }))
    const sheet = screen.getByRole('dialog', { name: 'Ferrugem FC' })
    expect(within(sheet).getByText(/Recusado em/)).not.toBeNull()
    expect(within(sheet).getByText('Motivo: Comprovante ilegível')).not.toBeNull()
    expect(within(sheet).queryByRole('button', { name: 'Aprovar' })).toBeNull()
  })

  it('sem comprovantes, mostra o estado vazio; erro ao carregar o evento oferece nova tentativa', async () => {
    mockApi({ 'GET /organizer/events/1': apiError(404, 'Evento não encontrado.') })
    renderPage()
    expect((await screen.findByRole('alert')).textContent).toContain('Evento não encontrado.')
    cleanup()
    mockApi(routes({ [PENDING]: { items: [], next_cursor: null } }))
    renderPage()
    expect(await screen.findByText('Nada para analisar', { selector: 'h2' })).not.toBeNull()
  })

  it('com a revogação pendente, a análise fica em espera', async () => {
    mockApi(routes({ 'GET /organizer/events/1': receiptsEvent({ revocation_pending: true, revocation_decision: 'pendente' }) }))
    const ui = userEvent.setup()
    renderPage()
    const list = await screen.findByRole('list', { name: 'Comprovantes para analisar' })
    expect(screen.getByText(/A administração está decidindo se o evento segue/)).not.toBeNull()
    await ui.click(within(list).getByRole('button', { name: /Ferrugem FC/ }))
    const sheet = screen.getByRole('dialog', { name: 'Ferrugem FC' })
    expect(within(sheet).getByText(/A análise fica em espera até a decisão/)).not.toBeNull()
    expect(within(sheet).queryByRole('button', { name: 'Aprovar' })).toBeNull()
  })

  it('a sessão expirada ao ler o arquivo chama onExpired', async () => {
    mockApi(routes({ 'GET /receipts/101/file': apiError(401, 'Entre na sua conta para continuar.') }))
    const onExpired = renderPage()
    await screen.findByRole('list', { name: 'Comprovantes para analisar' })
    await waitFor(() => expect(onExpired).toHaveBeenCalled())
    expect(screen.getByLabelText('Miniatura indisponível')).not.toBeNull()
  })
})

describe('devoluções do evento cancelado', () => {
  const cancelled = receiptsEvent({ state: 'cancelado', phase: 'cancelado', cancelled_at: fromNow(-1), cancel_reason: 'Quadra indisponível',
    pending: { receipts: 0, refunds_to_send: 1, refunds_awaiting: 0, refund_disputes: 1, total: 1 } })
  const toSend = entry(1, 'Ferrugem FC', { state: 'devolucao_pendente' })
  const contested = entry(2, 'Leões do Cerrado', { state: 'devolucao_contestada', refund: receipt(201, { kind: 'devolucao', file_type: 'pdf',
    participant_response: 'contestada', responded_at: fromNow(-2), contest_reason: 'O Pix não chegou.' }) })
  const automatic = entry(3, 'Unidos do Guará', { state: 'devolvida', refund: receipt(202, { kind: 'devolucao', file_type: 'pdf', participant_response: 'automatica' }) })
  const refundRoutes = (extra: Record<string, unknown> = {}) => ({
    'GET /organizer/events/1': cancelled,
    'GET /organizer/events/1/entries?state=devolucao_pendente': { items: [toSend], next_cursor: null },
    'GET /organizer/events/1/entries?state=devolucao_contestada': { items: [contested], next_cursor: null },
    'GET /organizer/events/1/entries?state=devolvida': { items: [automatic], next_cursor: null },
    ...extra,
  })
  const findRow = async (group: string, name: string) => within(await screen.findByRole('region', { name: group })).findByRole('listitem', { name })
  const picker = (container: HTMLElement, entryId: number) => container.querySelector<HTMLInputElement>(`input[type=file][data-entry="${entryId}"]`)!

  it('abre em Devoluções com a situação de cada inscrição', async () => {
    mockApi(refundRoutes())
    renderPage()
    expect((await screen.findByRole('tab', { name: 'Devoluções (1)' })).getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByRole('tab', { name: /Para analisar/ })).toBeNull()
    expect(screen.getByText('Evento cancelado · 1 devolução para enviar · 1 contestada')).not.toBeNull()
    const pending = await findRow('Para enviar e aguardando', 'Ferrugem FC')
    expect(within(pending).getByText('Enviar devolução')).not.toBeNull()
    expect(within(pending).getByText('Faça o Pix de R$ 240,00 para o participante e anexe o comprovante.')).not.toBeNull()
    const contestedRow = await findRow('Contestadas', 'Leões do Cerrado')
    expect(within(contestedRow).getByText(/“O Pix não chegou.”. A administração decide./)).not.toBeNull()
    expect(within(contestedRow).queryByRole('button', { name: /Anexar/ })).toBeNull()
    expect(within(contestedRow).getByRole('link', { name: /Ver o comprovante da devolução de Leões do Cerrado/ })).not.toBeNull()
    const done = await findRow('Concluídas', 'Unidos do Guará')
    expect(within(done).getByText('Considerada recebida após 7 dias sem resposta.')).not.toBeNull()
  })

  it('anexa o comprovante da devolução, com a validação do arquivo no cliente', async () => {
    const sent = { ...toSend, refund: receipt(203, { kind: 'devolucao', uploaded_by: null, created_at: fromNow(0), auto_confirm_at: fromNow(168) }) }
    const api = mockApi(refundRoutes({ 'PUT /entries/1/refund-receipt': sent }))
    // Sem filtrar pelo `accept`, para conferir a validação do próprio cliente.
    const ui = userEvent.setup({ applyAccept: false })
    const { container } = render(<ReceiptsPage eventId={1} onBack={vi.fn()} onExpired={vi.fn()} />)
    const row = await findRow('Para enviar e aguardando', 'Ferrugem FC')
    const input = picker(container, 1)
    expect(input.accept).toBe('image/jpeg,image/png,image/webp,application/pdf')

    await ui.upload(input, new File(['texto'], 'nota.txt', { type: 'text/plain' }))
    expect((await within(row).findByRole('alert')).textContent).toBe('Envie o comprovante como imagem (JPEG, PNG ou WebP) ou PDF.')
    await ui.upload(input, new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'grande.pdf', { type: 'application/pdf' }))
    expect((await within(row).findByRole('alert')).textContent).toBe('O arquivo excede o limite de 5 MiB.')
    await ui.upload(input, new File([], 'vazio.png', { type: 'image/png' }))
    expect((await within(row).findByRole('alert')).textContent).toBe('O arquivo enviado está vazio.')
    expect(api.find('PUT', '/entries/1/refund-receipt')).toHaveLength(0)

    const click = vi.spyOn(input, 'click')
    await ui.click(within(row).getByRole('button', { name: 'Anexar comprovante' }))
    expect(click).toHaveBeenCalled()
    await ui.upload(input, new File(['png'], 'devolucao.png', { type: 'image/png' }))
    expect((await screen.findByRole('status')).textContent).toBe('Devolução de Ferrugem FC enviada. O participante confirma o recebimento.')
    const call = api.find('PUT', '/entries/1/refund-receipt')[0]
    expect(call.body).toBeInstanceOf(FormData)
    expect(((call.body as FormData).get('file') as File).name).toBe('devolucao.png')
    const updated = within(screen.getByRole('region', { name: 'Para enviar e aguardando' })).getByRole('listitem', { name: 'Ferrugem FC' })
    expect(within(updated).getByText('Aguardando o participante')).not.toBeNull()
    expect(within(updated).getByText(/Sem resposta até .*, conta como recebida./)).not.toBeNull()
    expect(within(updated).queryByRole('button', { name: /Anexar/ })).toBeNull()
  })

  it('mostra o erro do servidor no envio e o pedido de outro comprovante da administração', async () => {
    const reopened = entry(4, 'Ferrugem FC', { state: 'devolucao_pendente', refund: receipt(204, { kind: 'devolucao', participant_response: 'contestada',
      resolution: 'pendente', resolution_reason: 'Falta a conta de destino.' }) })
    mockApi(refundRoutes({
      'GET /organizer/events/1/entries?state=devolucao_pendente': { items: [reopened], next_cursor: null },
      'PUT /entries/4/refund-receipt': apiError(409, 'A devolução já foi enviada; aguarde a resposta do participante.'),
    }))
    const ui = userEvent.setup()
    const { container } = render(<ReceiptsPage eventId={1} onBack={vi.fn()} onExpired={vi.fn()} />)
    const row = await findRow('Para enviar e aguardando', 'Ferrugem FC')
    expect(within(row).getByText('Outro comprovante')).not.toBeNull()
    expect(within(row).getByText('A administração pediu outro comprovante: Falta a conta de destino.')).not.toBeNull()
    expect(within(row).getByRole('button', { name: 'Anexar outro comprovante' })).not.toBeNull()
    await ui.upload(picker(container, 4), new File(['%PDF-'], 'devolucao.pdf', { type: 'application/pdf' }))
    expect((await within(row).findByRole('alert')).textContent).toBe('A devolução já foi enviada; aguarde a resposta do participante.')
  })
})
