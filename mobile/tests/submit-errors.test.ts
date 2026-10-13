import React, { useEffect } from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/api/client'
import { connection } from '../src/api/connection'
import { actionErrorMessage, isStale, reportActionError, useSubmit } from '../src/hooks/useSubmit'
import { enableAct } from './support/native'
import { toastText, toasts } from './support/toast'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))

const onExpired = vi.fn()
beforeEach(() => { enableAct(); onExpired.mockReset() })

describe('reportActionError: a regra única dos erros de ação', () => {
  it('401 chama onExpired e não mostra toast nem aviso de conexão', () => {
    const report = reportActionError(new ApiError('Sessão expirada.', 401), 'Falhou.', onExpired)
    expect(report).toEqual({ kind: 'expired', message: 'Sessão expirada.', fields: [] })
    expect(onExpired).toHaveBeenCalledOnce()
    expect(toasts()).toEqual([])
    expect(connection.getState().status).toBe('online')
  })

  it.each([0, 502, 503, 504])('status %i é conexão: abre a folha de conexão e não mostra toast nem mensagem local', status => {
    const report = reportActionError(new ApiError('Sem conexão.', status), 'Falhou.', onExpired)
    expect(report.kind).toBe('connection')
    expect(toasts()).toEqual([])
    expect(connection.getState()).toMatchObject({ status: 'offline', sheetOpen: true })
    expect(onExpired).not.toHaveBeenCalled()
  })

  it('a mesma falha de conexão não faz a faixa tremer duas vezes', () => {
    const cause = new ApiError('Sem conexão.', 0)
    connection.lost({ mutating: true, cause })
    connection.dismissSheet()
    reportActionError(cause, 'Falhou.', onExpired)
    expect(connection.getState().nudge).toBe(0)
  })

  it('422 com campos e 409 com conflito de agenda ficam com o formulário: nada é mostrado', () => {
    const fields = [{ field: 'name', message: 'Informe o nome.' }]
    expect(reportActionError(new ApiError('Revise os campos.', 422, fields), 'Falhou.', onExpired)).toEqual({ kind: 'form', message: 'Revise os campos.', fields })
    expect(reportActionError(new ApiError('Conflito.', 409, [], { detail: 'Conflito.', conflict: { kind: 'quadra' } }), 'Falhou.', onExpired).kind).toBe('form')
    expect(toasts()).toEqual([])
  })

  it('404 e 409 (algo que outra pessoa já decidiu) viram aviso com a mensagem do servidor', () => {
    expect(reportActionError(new ApiError('A vaga acabou.', 409), 'Falhou.', onExpired).kind).toBe('stale')
    expect(reportActionError(new ApiError('Inscrição não encontrada.', 404), 'Falhou.', onExpired).kind).toBe('stale')
    expect(toasts().map(item => [item.tone, item.title])).toEqual([['warning', 'A vaga acabou.'], ['warning', 'Inscrição não encontrada.']])
    expect(isStale(new ApiError('x', 409))).toBe(true)
    expect(isStale(new ApiError('x', 500))).toBe(false)
    expect(isStale(new Error('x'))).toBe(false)
  })

  it.each([400, 403, 413, 422, 500])('status %i vira toast de erro com a mensagem do servidor (422 sem campos inclusive)', status => {
    const report = reportActionError(new ApiError('Não deu.', status), 'Falhou.', onExpired)
    expect(report.kind).toBe('error')
    expect(toasts()).toMatchObject([{ tone: 'error', title: 'Não deu.' }])
  })

  it('erro que não é da API usa a própria mensagem, e sem mensagem o texto de reserva', () => {
    reportActionError(new TypeError('Algo quebrou.'), 'Falhou.', onExpired)
    reportActionError(new Error(''), 'Texto de reserva.', onExpired)
    reportActionError('estranho', 'Outra reserva.', onExpired)
    expect(toasts().map(item => item.title)).toEqual(['Algo quebrou.', 'Texto de reserva.', 'Outra reserva.'])
    expect(actionErrorMessage(new ApiError('Do servidor.', 500), 'Reserva')).toBe('Do servidor.')
    expect(actionErrorMessage(undefined, 'Reserva')).toBe('Reserva')
  })
})

type Submit = ReturnType<typeof useSubmit>
let current!: Submit
function Probe() {
  const submit = useSubmit(onExpired)
  useEffect(() => { current = submit })
  return null
}
async function mount() {
  let tree!: ReturnType<typeof create>
  await act(async () => { tree = create(React.createElement(Probe)) })
  return tree
}

describe('useSubmit: ocupado, resultado e erro', () => {
  it('devolve o resultado, fica ocupado durante a ação e não deixa erro nem toast quando dá certo', async () => {
    await mount()
    let release!: () => void
    let result: unknown
    await act(async () => { void current.run(() => new Promise<string>(resolve => { release = () => resolve('ok') }), 'Falhou.').then(value => { result = value }) })
    expect(current.busy).toBe(true)
    await act(async () => { release() })
    expect(result).toBe('ok')
    expect(current.busy).toBe(false)
    expect(current.error).toBe('')
    expect(toasts()).toEqual([])
  })

  it('erro comum vira toast e deixa `error` vazio; a ação devolve undefined', async () => {
    await mount()
    let result: unknown = 'antes'
    await act(async () => { result = await current.run(() => Promise.reject(new ApiError('Placar inválido.', 400)), 'Falhou.') })
    expect(result).toBeUndefined()
    expect(current.error).toBe('')
    expect(current.busy).toBe(false)
    expect(toasts()).toMatchObject([{ tone: 'error', title: 'Placar inválido.' }])
  })

  it('422 com campos continua em `error` e `fields`, sem toast; a próxima tentativa limpa os dois', async () => {
    await mount()
    const fields = [{ field: 'name', message: 'Informe o nome.' }]
    await act(async () => { await current.run(() => Promise.reject(new ApiError('Revise os campos.', 422, fields)), 'Falhou.') })
    expect(current.error).toBe('Revise os campos.')
    expect(current.fields).toEqual(fields)
    expect(toasts()).toEqual([])
    await act(async () => { await current.run(() => Promise.resolve(1), 'Falhou.') })
    expect(current.error).toBe('')
    expect(current.fields).toEqual([])
  })

  it('401 chama onExpired sem toast; falha de conexão chama o aviso sem mensagem local', async () => {
    await mount()
    await act(async () => { await current.run(() => Promise.reject(new ApiError('Sessão expirada.', 401)), 'Falhou.') })
    expect(onExpired).toHaveBeenCalledOnce()
    await act(async () => { await current.run(() => Promise.reject(new ApiError('Sem conexão.', 0)), 'Falhou.') })
    expect(connection.getState().sheetOpen).toBe(true)
    expect(current.error).toBe('')
    expect(toasts()).toEqual([])
  })

  it('404/409 mostra o aviso antes de chamar onFailure; uma falha do onFailure não troca a mensagem', async () => {
    await mount()
    const order: string[] = []
    const onFailure = vi.fn(async () => { order.push(`falha com ${toastText()}`) })
    await act(async () => { await current.run(() => Promise.reject(new ApiError('A vaga acabou.', 409)), 'Falhou.', onFailure) })
    expect(order).toEqual(['falha com A vaga acabou.'])
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ status: 409 }))
    let result: unknown = 'antes'
    await act(async () => { result = await current.run(() => Promise.reject(new ApiError('Outra.', 404)), 'Falhou.', () => { throw new Error('releitura quebrou') }) })
    expect(result).toBeUndefined()
    expect(toasts().map(item => item.title)).toEqual(['A vaga acabou.', 'Outra.'])
    expect(current.busy).toBe(false)
  })

  it('`setError` limpa o erro do formulário', async () => {
    await mount()
    await act(async () => { await current.run(() => Promise.reject(new ApiError('Revise.', 422, [{ field: 'a', message: 'b' }])), 'Falhou.') })
    await act(async () => { current.setError('') })
    expect(current.error).toBe('')
  })
})
