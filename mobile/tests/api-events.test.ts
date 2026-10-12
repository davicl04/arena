import { beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from '../src/api/client'
import * as entries from '../src/api/entries'
import * as events from '../src/api/events'
import * as receipts from '../src/api/receipts'

vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(),
}))

beforeEach(() => { vi.mocked(request).mockReset().mockResolvedValue(undefined as never) })

const photo = { uri: 'file:///cache/comprovante.jpg', name: 'comprovante.jpg', type: 'image/jpeg', size: 2048 }
/** FormData do React Native em Node: registra as partes `{ uri, name, type }` em vez de convertê-las em texto. */
function recordFormData() {
  const parts: unknown[][] = []
  vi.stubGlobal('FormData', class { append(...args: unknown[]) { parts.push(args) } })
  return parts
}

describe('cliente dos eventos do organizador (contrato 0003, seções 13 e 14)', () => {
  it('usa os métodos, caminhos e corpos do contrato', async () => {
    await events.listOpenOrganizerEvents()
    await events.getOrganizerEvent(5)
    await events.createEvent({ name: 'Copa Sudoeste' })
    await events.updateEvent(5, { venue: 'Arena' })
    await events.deleteEvent(5)
    await events.submitEvent(5)
    await events.withdrawEvent(5)
    await events.cancelEvent(5, '  Chuva forte ')
    await events.postEventMessage(5, '  Portões abrem às 8 h ')
    expect(vi.mocked(request).mock.calls).toEqual([
      ['/organizer/events?scope=abertos'],
      ['/organizer/events/5'],
      ['/organizer/events', 'POST', { name: 'Copa Sudoeste' }],
      ['/organizer/events/5', 'PATCH', { venue: 'Arena' }],
      ['/organizer/events/5', 'DELETE'],
      ['/organizer/events/5/submit', 'POST', {}],
      ['/organizer/events/5/withdraw', 'POST', {}],
      ['/organizer/events/5/cancel', 'POST', { reason: 'Chuva forte' }],
      ['/events/5/messages', 'POST', { body: 'Portões abrem às 8 h' }],
    ])
  })

  it('expõe caminhos paginados, limites e a mensagem de campo sem o prefixo do Pydantic', () => {
    expect([events.organizerEventsPath('encerrados'), events.eventEntriesPath(5), events.eventEntriesPath(5, 'em_analise'), events.eventMessagesPath(5)])
      .toEqual(['/organizer/events?scope=encerrados', '/organizer/events/5/entries', '/organizer/events/5/entries?state=em_analise', '/events/5/messages'])
    expect(events.fieldMessage('Value error, Informe o local.')).toBe('Informe o local.')
    expect(events.fieldMessage('Informe o local.')).toBe('Informe o local.')
    expect(events.EVENT_LIMITS.paidCloseHours).toBe(12)
    expect(events.PUBLISHED_STATES).toContain('publicado')
  })
})

describe('cliente do atleta (contrato 0002, seção 6)', () => {
  it('monta os caminhos da lista, das inscrições e dos inscritos', () => {
    expect(entries.eventsPath('futebol')).toBe('/events?sport=futebol')
    expect(entries.eventsPath('corrida', 12)).toBe('/events?sport=corrida&city_id=12')
    expect(entries.eventsPath('tenis', null)).toBe('/events?sport=tenis')
    expect(entries.myEntriesPath()).toBe('/me/entries?scope=ativas&limit=50')
    expect(entries.myEntriesPath('historico', 20)).toBe('/me/entries?scope=historico&limit=20')
    expect(entries.publicEntriesPath(5)).toBe('/events/5/entries')
  })

  it('inscreve, cancela, confirma e contesta a devolução', async () => {
    await entries.getEvent(5)
    await entries.getEntry(9)
    await entries.createEntry(5, 3)
    await entries.createEntry(5)
    await entries.cancelEntry(9)
    await entries.confirmRefund(9)
    await entries.contestRefund(9, 'Não recebi')
    expect(entries.CONTEST_LIMITS).toEqual({ min: 5, max: 500 })
    expect(vi.mocked(request).mock.calls).toEqual([
      ['/events/5'], ['/entries/9'],
      ['/events/5/entries', 'POST', { team_id: 3 }], ['/events/5/entries', 'POST', {}],
      ['/entries/9', 'DELETE'],
      ['/entries/9/refund-response', 'POST', { response: 'confirmar' }],
      ['/entries/9/refund-response', 'POST', { response: 'contestar', reason: 'Não recebi' }],
    ])
  })

  it('envia o comprovante do pagamento em multipart (arquivo do aparelho)', async () => {
    const parts = recordFormData()
    await entries.sendReceipt(9, photo)
    await entries.sendReceipt(9, { ...photo, name: '' })
    expect(vi.mocked(request).mock.calls.map(call => call.slice(0, 2))).toEqual([['/entries/9/receipt', 'PUT'], ['/entries/9/receipt', 'PUT']])
    expect(parts).toEqual([
      ['file', { uri: photo.uri, name: 'comprovante.jpg', type: 'image/jpeg' }],
      ['file', { uri: photo.uri, name: 'comprovante', type: 'image/jpeg' }],
    ])
    vi.unstubAllGlobals()
  })

  it('converte o Pix do evento no formato dos componentes, só com chave', () => {
    const base = { organizer: { display_name: 'Rafa Nunes', person: null }, contact: 'copa@example.com' }
    const pix = { beneficiary: null, key_type: 'email' as const, key: 'copa@example.com', copy_paste: '000201…', instructions: 'Envie em até 48 h.' }
    expect(entries.pixInfo({ ...base, pix })).toEqual({
      holder: 'Rafa Nunes', keyType: 'email', key: 'copa@example.com', copyPaste: '000201…', instructions: 'Envie em até 48 h.', contact: 'copa@example.com',
    })
    expect(entries.pixInfo({ ...base, pix: { ...pix, beneficiary: 'Rafael N. Souza' } })?.holder).toBe('Rafael N. Souza')
    expect(entries.pixInfo({ ...base, pix: { ...pix, key: null } })).toBeNull()
    expect(entries.pixInfo({ ...base, pix: { ...pix, key_type: null } })).toBeNull()
    expect(entries.pixInfo({ ...base, pix: null })).toBeNull()
  })
})

describe('comprovantes e devoluções (contrato 0003, seções 14 a 16)', () => {
  it('usa as rotas do A2 e da devolução', async () => {
    const parts = recordFormData()
    await receipts.getReceiptsEvent(5)
    await receipts.decideReceipt(11, { decision: 'aprovar' })
    await receipts.sendRefundReceipt(9, photo)
    await receipts.sendRefundReceipt(9, { ...photo, name: '' })
    await receipts.getEntryReceipts(9)
    expect(receipts.eventReceiptsPath(5, 'para_analisar')).toBe('/organizer/events/5/receipts?tab=para_analisar')
    expect(vi.mocked(request).mock.calls.map(call => call.slice(0, 3).filter(part => !(part instanceof FormData)))).toEqual([
      ['/organizer/events/5'],
      ['/receipts/11/decision', 'POST', { decision: 'aprovar' }],
      ['/entries/9/refund-receipt', 'PUT'],
      ['/entries/9/refund-receipt', 'PUT'],
      ['/entries/9/receipts'],
    ])
    expect(parts.map(part => (part[1] as { name: string }).name)).toEqual(['comprovante.jpg', 'devolucao'])
    vi.unstubAllGlobals()
  })

  it('aceita imagem (JPEG, PNG ou WebP) ou PDF de até 5 MiB, não vazio', () => {
    const file = (type: string | null, size?: number | null) => ({ type, size })
    expect(receipts.receiptFileError(file('image/png', 10))).toBeNull()
    expect(receipts.receiptFileError(file('image/jpeg', 10))).toBeNull()
    expect(receipts.receiptFileError(file('image/webp', 10))).toBeNull()
    expect(receipts.receiptFileError(file('application/pdf', 5 * 1024 * 1024))).toBeNull()
    expect(receipts.receiptFileError(file('image/gif', 10))).toBe('Envie o comprovante como imagem (JPEG, PNG ou WebP) ou PDF.')
    expect(receipts.receiptFileError(file('', 10))).toBe('Envie o comprovante como imagem (JPEG, PNG ou WebP) ou PDF.')
    expect(receipts.receiptFileError(file(null, 10))).toBe('Envie o comprovante como imagem (JPEG, PNG ou WebP) ou PDF.')
    // Sem tipo informado pelo seletor, vale a extensão; sem tamanho, a conferência fica com o servidor.
    expect(receipts.receiptFileError({ type: '', size: 10, name: 'comprovante.JPG' })).toBeNull()
    expect(receipts.receiptFileError({ type: undefined, name: 'comprovante.pdf' })).toBeNull()
    expect(receipts.receiptFileError(file('application/pdf', 5 * 1024 * 1024 + 1))).toBe('O arquivo excede o limite de 5 MiB.')
    expect(receipts.receiptFileError(file('image/png', 0))).toBe('O arquivo enviado está vazio.')
    expect(receipts.RECEIPT_ACCEPT).toEqual(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
  })

  it('recusa do comprovante: motivo obrigatório, detalhe até 300 e obrigatório em "Outro"', () => {
    expect(receipts.receiptRefusalError(null, '')).toBe('Escolha o motivo da recusa.')
    expect(receipts.receiptRefusalError('valor_diferente', '')).toBeNull()
    expect(receipts.receiptRefusalError('outro', ' abc ')).toBe('Descreva o motivo da recusa.')
    expect(receipts.receiptRefusalError('outro', 'Pagamento de outra pessoa')).toBeNull()
    expect(receipts.receiptRefusalError('favorecido_errado', 'x'.repeat(301))).toBe('Use até 300 caracteres no detalhe.')
    expect(receipts.receiptRefusalInput('valor_diferente', '  ')).toEqual({ decision: 'recusar', reason_code: 'valor_diferente' })
    expect(receipts.receiptRefusalInput('outro', ' Detalhe ')).toEqual({ decision: 'recusar', reason_code: 'outro', reason_detail: 'Detalhe' })
  })

  it('descreve o motivo, o tamanho do arquivo e quem está inscrito', () => {
    expect(receipts.receiptRefusalText('fora_do_prazo', null)).toBe('Data fora do prazo')
    expect(receipts.receiptRefusalText('valor_diferente', 'Veio R$ 200')).toBe('Valor diferente · Veio R$ 200')
    expect(receipts.receiptRefusalText('outro', 'Sem nome')).toBe('Sem nome')
    expect(receipts.receiptRefusalText(null, null)).toBe('Motivo não informado')
    expect(receipts.receiptRefusalSentence('valor_diferente', 'faltaram R$ 40.')).toBe('Valor diferente: faltaram R$ 40')
    expect(receipts.receiptRefusalSentence('outro', 'Sem nome!')).toBe('Sem nome')
    expect(receipts.receiptRefusalSentence('fora_do_prazo', '  ')).toBe('Data fora do prazo')
    expect(receipts.receiptRefusalSentence('desconhecido', null)).toBe('motivo não informado')
    expect(receipts.receiptRefusalSentence(null, 'Só o detalhe')).toBe('Só o detalhe')
    expect(receipts.fileSize(300)).toBe('1 KB')
    expect(receipts.fileSize(26_000)).toBe('25 KB')
    expect(receipts.fileSize(1.5 * 1024 * 1024)).toBe('1,5 MB')
    const person = { id: 3, name: 'Tito Tenista', username: 'tito', avatar_url: null }
    expect(receipts.subjectName({ kind: 'atleta', team: null, athlete: person })).toBe('Tito Tenista')
    expect(receipts.subjectName({ kind: 'time', team: null, athlete: null })).toBe('Time')
    expect(receipts.subjectName({ kind: 'atleta', team: null, athlete: null })).toBe('Atleta')
  })

  it('lê a imagem do comprovante pela rota autorizada, com o Bearer da sessão no header', () => {
    const file = { file_url: '/api/v1/receipts/9/file' }
    expect(receipts.receiptFileHref(file)).toBe('http://10.0.2.2:8000/api/v1/receipts/9/file')
    expect(receipts.receiptImageSource(file, 'test-only-token')).toEqual({
      uri: 'http://10.0.2.2:8000/api/v1/receipts/9/file', headers: { Authorization: 'Bearer test-only-token' },
    })
  })

  it('não monta fonte nem Bearer para um file_url que não é caminho da API', () => {
    for (const file_url of ['@evil.example/x', '.evil.example/x', '//evil.example/x', 'https://evil.example/receipts/9/file']) {
      expect(receipts.receiptImageSource({ file_url }, 'test-only-token'), file_url).toBeNull()
    }
  })
})
