import { afterEach, describe, expect, it, vi } from 'vitest'
import { CANCEL_REASON_MESSAGE, eventRefusalInput, reasonError, refusalError } from '../src/api/admin'
import {
  fetchReceiptFile, fileSize, receiptFileError, receiptRefusalError, receiptRefusalInput, receiptRefusalSentence, receiptRefusalText, subjectName,
} from '../src/api/receipts'
import { person } from './teams-fixtures'

/* Regras do cliente que espelham o servidor (contrato 0003, seções 14 a 16), sem tela. */

afterEach(() => { vi.unstubAllGlobals() })

describe('comprovantes: validações e textos', () => {
  it('aceita imagem (JPEG, PNG ou WebP) ou PDF de até 5 MiB, não vazio', () => {
    const file = (type: string, size: number) => ({ type, size })
    expect(receiptFileError(file('image/png', 10))).toBeNull()
    expect(receiptFileError(file('image/jpeg', 10))).toBeNull()
    expect(receiptFileError(file('image/webp', 10))).toBeNull()
    expect(receiptFileError(file('application/pdf', 5 * 1024 * 1024))).toBeNull()
    expect(receiptFileError(file('image/gif', 10))).toBe('Envie o comprovante como imagem (JPEG, PNG ou WebP) ou PDF.')
    expect(receiptFileError(file('', 10))).toBe('Envie o comprovante como imagem (JPEG, PNG ou WebP) ou PDF.')
    // Sem tipo informado pelo navegador, vale a extensão.
    expect(receiptFileError({ type: '', size: 10, name: 'comprovante.JPG' })).toBeNull()
    expect(receiptFileError(file('application/pdf', 5 * 1024 * 1024 + 1))).toBe('O arquivo excede o limite de 5 MiB.')
    expect(receiptFileError(file('image/png', 0))).toBe('O arquivo enviado está vazio.')
  })

  it('recusa do comprovante: motivo obrigatório, detalhe até 300 e obrigatório em "Outro"', () => {
    expect(receiptRefusalError(null, '')).toBe('Escolha o motivo da recusa.')
    expect(receiptRefusalError('valor_diferente', '')).toBeNull()
    expect(receiptRefusalError('outro', ' abc ')).toBe('Descreva o motivo da recusa.')
    expect(receiptRefusalError('outro', 'Pagamento de outra pessoa')).toBeNull()
    expect(receiptRefusalError('favorecido_errado', 'x'.repeat(301))).toBe('Use até 300 caracteres no detalhe.')
    expect(receiptRefusalInput('valor_diferente', '  ')).toEqual({ decision: 'recusar', reason_code: 'valor_diferente' })
    expect(receiptRefusalInput('outro', ' Detalhe ')).toEqual({ decision: 'recusar', reason_code: 'outro', reason_detail: 'Detalhe' })
  })

  it('descreve o motivo, o tamanho do arquivo e quem está inscrito', () => {
    expect(receiptRefusalText('fora_do_prazo', null)).toBe('Data fora do prazo')
    expect(receiptRefusalText('valor_diferente', 'Veio R$ 200')).toBe('Valor diferente · Veio R$ 200')
    expect(receiptRefusalText('outro', 'Sem nome')).toBe('Sem nome')
    expect(receiptRefusalText(null, null)).toBe('Motivo não informado')
    // Em frase: dois-pontos e sem a pontuação final do detalhe (o texto segue com ". Envie outro até…").
    expect(receiptRefusalSentence('valor_diferente', 'faltaram R$ 40.')).toBe('Valor diferente: faltaram R$ 40')
    expect(receiptRefusalSentence('outro', 'Sem nome!')).toBe('Sem nome')
    expect(receiptRefusalSentence('fora_do_prazo', '  ')).toBe('Data fora do prazo')
    expect(receiptRefusalSentence('desconhecido', null)).toBe('motivo não informado')
    expect(receiptRefusalSentence(null, 'Só o detalhe')).toBe('Só o detalhe')
    expect(fileSize(300)).toBe('1 KB')
    expect(fileSize(26_000)).toBe('25 KB')
    expect(fileSize(1.5 * 1024 * 1024)).toBe('1,5 MB')
    expect(subjectName({ kind: 'atleta', team: null, athlete: person(3, 'Tito Tenista') })).toBe('Tito Tenista')
    expect(subjectName({ kind: 'time', team: null, athlete: null })).toBe('Time')
    expect(subjectName({ kind: 'atleta', team: null, athlete: null })).toBe('Atleta')
  })
})

describe('administração: motivos', () => {
  it('recusa do evento com detalhe até 500 e motivos de 5 a 500 caracteres', () => {
    expect(refusalError('pix_incompleto', '')).toBeNull()
    expect(refusalError('outro', 'curto'.slice(0, 4))).toBe('Descreva o motivo da recusa.')
    expect(refusalError('preco_ou_datas', 'x'.repeat(501))).toBe('Use até 500 caracteres no detalhe.')
    expect(refusalError('valor_diferente', 'x'.repeat(301), 300)).toBe('Use até 300 caracteres no detalhe.')
    expect(eventRefusalInput('conteudo_inadequado', '')).toEqual({ decision: 'recusar', reason_code: 'conteudo_inadequado' })
    expect(eventRefusalInput('outro', ' Nome ofensivo ')).toEqual({ decision: 'recusar', reason_code: 'outro', reason_detail: 'Nome ofensivo' })
    expect(reasonError('  abc  ', CANCEL_REASON_MESSAGE)).toBe(CANCEL_REASON_MESSAGE)
    expect(reasonError('Motivo válido', CANCEL_REASON_MESSAGE)).toBeNull()
    expect(reasonError('x'.repeat(501), CANCEL_REASON_MESSAGE)).toBe(CANCEL_REASON_MESSAGE)
  })
})

describe('leitura do arquivo pela rota autorizada', () => {
  it('envia a sessão e devolve o arquivo; erros viram ApiError', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('png', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockRejectedValueOnce(new TypeError('rede'))
    vi.stubGlobal('fetch', fetch)
    const file = { file_url: '/api/v1/receipts/9/file' }
    expect(await (await fetchReceiptFile(file)).text()).toBe('png')
    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/api/v1/receipts/9/file', expect.objectContaining({ credentials: 'include' }))
    await expect(fetchReceiptFile(file)).rejects.toMatchObject({ status: 404, message: 'Não foi possível carregar o comprovante.' })
    await expect(fetchReceiptFile(file)).rejects.toMatchObject({ status: 401, message: 'Entre na sua conta para continuar.' })
    await expect(fetchReceiptFile(file)).rejects.toMatchObject({ status: 0 })
  })

  it('repassa o cancelamento sem transformar em erro de rede', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('cancelado', 'AbortError')))
    await expect(fetchReceiptFile({ file_url: '/api/v1/receipts/9/file' })).rejects.toMatchObject({ name: 'AbortError' })
  })
})
