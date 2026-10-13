import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../src/api/client'
import { connection } from '../src/api/connection'
import { reportActionError, useSubmit } from '../src/hooks/useSubmit'
import { findToast, queryToast, renderWithToaster } from './toast-utils'

afterEach(cleanup)

const fields = [{ field: 'name', message: 'Informe o nome.' }]

describe('reportActionError', () => {
  it('401: chama onExpired e não mostra toast nem aviso de conexão', async () => {
    renderWithToaster(<div />)
    const onExpired = vi.fn()
    const report = reportActionError(new ApiError('Sua sessão expirou.', 401), 'Falhou.', onExpired)
    expect(report).toEqual({ kind: 'expired', message: 'Sua sessão expirou.', fields: [] })
    expect(onExpired).toHaveBeenCalledTimes(1)
    expect(queryToast('Sua sessão expirou.')).toBeNull()
    expect(connection.getState().status).toBe('online')
  })

  it.each([0, 502, 503, 504])('status %s: aviso de conexão (folha), sem toast nem mensagem local', status => {
    renderWithToaster(<div />)
    const report = reportActionError(new ApiError('Serviço indisponível.', status), 'Falhou.', vi.fn())
    expect(report.kind).toBe('connection')
    expect(connection.getState()).toMatchObject({ status: 'offline', sheetOpen: true })
    expect(queryToast('Serviço indisponível.')).toBeNull()
  })

  it('422 com campos: devolve os campos ao formulário, sem toast', () => {
    renderWithToaster(<div />)
    const report = reportActionError(new ApiError('Revise os campos.', 422, fields), 'Falhou.', vi.fn())
    expect(report).toEqual({ kind: 'form', message: 'Revise os campos.', fields })
    expect(queryToast('Revise os campos.')).toBeNull()
  })

  it('o conflito de agenda (409 com conflict) fica com o formulário, sem toast', () => {
    renderWithToaster(<div />)
    const cause = new ApiError('A quadra já tem o J3.', 409, [], { detail: 'A quadra já tem o J3.', conflict: { kind: 'quadra' } })
    expect(reportActionError(cause, 'Falhou.', vi.fn()).kind).toBe('form')
    expect(queryToast('A quadra já tem o J3.')).toBeNull()
  })

  it.each([404, 409])('%s sem conflito: aviso (estado velho) com a mensagem do servidor', async status => {
    renderWithToaster(<div />)
    const report = reportActionError(new ApiError('O resultado já foi definido.', status), 'Falhou.', vi.fn())
    expect(report.kind).toBe('stale')
    expect((await findToast('O resultado já foi definido.')).closest('[data-tone]')?.getAttribute('data-tone')).toBe('warning')
  })

  it.each([400, 403, 413, 422, 500])('%s: toast de erro com a mensagem do servidor', async status => {
    renderWithToaster(<div />)
    const report = reportActionError(new ApiError('Recusado pelo servidor.', status), 'Falhou.', vi.fn())
    expect(report).toEqual({ kind: 'error', message: 'Recusado pelo servidor.', fields: [] })
    expect((await findToast('Recusado pelo servidor.')).closest('[data-tone]')?.getAttribute('data-tone')).toBe('error')
  })

  it('erro sem mensagem usa o texto de reserva', async () => {
    renderWithToaster(<div />)
    reportActionError(new Error(''), 'Não foi possível salvar.', vi.fn())
    reportActionError('estranho', 'Não foi possível enviar.', vi.fn())
    expect(await findToast('Não foi possível salvar.')).toBeTruthy()
    expect(await findToast('Não foi possível enviar.')).toBeTruthy()
  })
})

function Form({ action, onExpired = vi.fn(), onFailure }: { action: () => Promise<unknown>; onExpired?: () => void; onFailure?: (cause: unknown) => void }) {
  const submit = useSubmit(onExpired)
  return <div>
    <button onClick={() => void submit.run(action, 'Não foi possível concluir.', onFailure)}>Enviar</button>
    <output aria-label="ocupado">{String(submit.busy)}</output>
    <output aria-label="erro">{submit.error}</output>
    <output aria-label="campos">{submit.fields.map(item => item.field).join(',')}</output>
  </div>
}
const text = (label: string) => screen.getByLabelText(label).textContent

describe('useSubmit', () => {
  it('sucesso devolve o resultado, ocupa durante a ação e deixa erro e campos vazios', async () => {
    renderWithToaster(<Form action={async () => 'ok'} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Enviar' }))
    expect(text('ocupado')).toBe('false')
    expect(text('erro')).toBe('')
  })

  it('erro de ação vira toast e o error fica vazio', async () => {
    renderWithToaster(<Form action={async () => { throw new ApiError('Placar recusado.', 400) }} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Enviar' }))
    expect(await findToast('Placar recusado.')).toBeTruthy()
    expect(text('erro')).toBe('')
  })

  it('422 com campos continua em error e fields, para o formulário distribuir', async () => {
    renderWithToaster(<Form action={async () => { throw new ApiError('Revise os campos.', 422, fields) }} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Enviar' }))
    expect(text('erro')).toBe('Revise os campos.')
    expect(text('campos')).toBe('name')
    expect(queryToast('Revise os campos.')).toBeNull()
    // Uma nova tentativa limpa o que sobrou da anterior.
    await userEvent.setup().click(screen.getByRole('button', { name: 'Enviar' }))
    expect(text('erro')).toBe('Revise os campos.')
  })

  it('401 chama onExpired, sem toast e sem mensagem', async () => {
    const onExpired = vi.fn()
    renderWithToaster(<Form onExpired={onExpired} action={async () => { throw new ApiError('Sua sessão expirou.', 401) }} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Enviar' }))
    expect(onExpired).toHaveBeenCalledTimes(1)
    expect(queryToast('Sua sessão expirou.')).toBeNull()
    expect(text('erro')).toBe('')
  })

  it('falha de conexão aciona o aviso de conexão, sem mensagem local', async () => {
    renderWithToaster(<Form action={async () => { throw new ApiError('Não foi possível conectar ao Arena.', 0) }} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Enviar' }))
    expect(connection.getState()).toMatchObject({ status: 'offline', sheetOpen: true })
    expect(text('erro')).toBe('')
    expect(queryToast('Não foi possível conectar ao Arena.')).toBeNull()
  })

  it('404/409 mostra o aviso e chama onFailure para reler os dados; uma falha da releitura não troca a mensagem', async () => {
    const onFailure = vi.fn(async () => { throw new Error('releitura falhou') })
    renderWithToaster(<Form onFailure={onFailure} action={async () => { throw new ApiError('Esta partida já foi decidida.', 409) }} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Enviar' }))
    expect(await findToast('Esta partida já foi decidida.')).toBeTruthy()
    expect(onFailure).toHaveBeenCalledTimes(1)
    expect(text('erro')).toBe('')
    expect(text('ocupado')).toBe('false')
  })

  it('erros que o toast anuncia na hora: prioridade alta fica na região fora da fila polida', async () => {
    renderWithToaster(<Form action={async () => { throw new ApiError('Recusado.', 500) }} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Enviar' }))
    await findToast('Recusado.')
    await act(async () => undefined)
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Recusado.')
  })
})
