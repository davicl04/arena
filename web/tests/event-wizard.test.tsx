import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, request } from '../src/api/client'
import type { EventDraftInput, OrganizerEventDetail } from '../src/api/events'
import EventWizard from '../src/pages/EventWizard'
import { brasilia, draftDetail, fullChecklist } from './events-fixtures'

vi.mock('../src/api/client', async original => ({
  ...await original<typeof import('../src/api/client')>(),
  request: vi.fn(), apiUrl: (path: string) => path,
}))

type Handler = (path: string, method: string | undefined, body: unknown) => unknown
function mockApi(handler: Handler) {
  vi.mocked(request).mockImplementation(async (path, method, body) => {
    const result = handler(path, method, body)
    if (result instanceof Error) throw result
    if (result === undefined) throw new Error(`rota inesperada ${method ?? 'GET'} ${path}`)
    return result as never
  })
}
const calls = (method: string) => vi.mocked(request).mock.calls.filter(call => call[1] === method)
const question = () => screen.getByRole('heading', { level: 2, name: /\?$/ })

function renderWizard(props: Partial<Parameters<typeof EventWizard>[0]> = {}) {
  const handlers = { onClose: vi.fn(), onDone: vi.fn(), onExpired: vi.fn() }
  render(<EventWizard cities={[brasilia]} {...handlers} {...props} />)
  return handlers
}

beforeEach(() => {
  vi.mocked(request).mockReset()
  // Só o relógio: os temporizadores continuam reais para o Base UI e o user-event.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Criar evento (V4): uma pergunta por vez', () => {
  it('Enter avança, valida o passo, a seta volta e o foco vai para a pergunta', async () => {
    const user = userEvent.setup()
    renderWizard()
    expect(question().textContent).toBe('Qual é o nome do evento?')
    await waitFor(() => expect(document.activeElement).toBe(question()))
    expect(screen.getByText('Passo 1 de 5')).toBeTruthy()

    await user.click(screen.getByLabelText('Nome do evento'))
    await user.keyboard('{Enter}')
    expect(screen.getByText('Informe o nome do evento com 3 a 60 caracteres.')).toBeTruthy()
    expect(screen.getByLabelText('Nome do evento').getAttribute('aria-invalid')).toBe('true')

    await user.type(screen.getByLabelText('Nome do evento'), 'Desafio Saibro{Enter}')
    expect(question().textContent).toBe('Qual modalidade?')
    await waitFor(() => expect(document.activeElement).toBe(question()))

    await user.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(screen.getByText('Escolha a modalidade.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Tênis' }))
    expect(screen.queryByRole('group', { name: 'Formato' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Todos contra todos' }))
    await user.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(question().textContent).toBe('Quantas vagas e quem pode entrar?')
    expect(screen.getByText('De 3 a 20 atletas no todos contra todos.')).toBeTruthy()
    // Contador de vagas: começa no mínimo e respeita os limites.
    await user.click(screen.getByRole('button', { name: 'Mais vagas' }))
    expect((screen.getByRole('textbox', { name: 'Vagas' }) as HTMLInputElement).value).toBe('3')
    expect((screen.getByRole('button', { name: 'Menos vagas' }) as HTMLButtonElement).disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Mais vagas' }))
    await user.click(screen.getByRole('button', { name: 'Menos vagas' }))
    expect((screen.getByRole('textbox', { name: 'Vagas' }) as HTMLInputElement).value).toBe('3')
    await user.clear(screen.getByRole('textbox', { name: 'Vagas' }))
    await user.type(screen.getByRole('textbox', { name: 'Vagas' }), '2x5')
    await user.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(screen.getByText('No todos contra todos, as vagas vão de 3 a 20.')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Voltar ao passo anterior' }))
    expect(question().textContent).toBe('Qual modalidade?')
    expect(screen.getByRole('button', { name: 'Tênis' }).getAttribute('aria-pressed')).toBe('true')
    // A prévia do cartaz acompanha o que foi escolhido.
    expect(screen.getByRole('region', { name: 'Prévia do cartaz' }).textContent).toContain('Desafio Saibro')
  })

  it('vagas da eliminação em 4, 8 ou 16 e elos escolhidos', async () => {
    const user = userEvent.setup()
    mockApi((path, method, body) => path === '/organizer/events' && method === 'POST' ? draftDetail({ id: 9, ...(body as object) }) : undefined)
    renderWizard()
    await user.type(screen.getByLabelText('Nome do evento'), 'Copa Society{Enter}')
    await user.click(screen.getByRole('button', { name: 'Futebol' }))
    await user.click(screen.getByRole('button', { name: 'Society 7×7' }))
    await user.click(screen.getByRole('button', { name: 'Eliminação simples' }))
    await user.click(screen.getByRole('button', { name: /Próxima/ }))
    await user.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(screen.getByText('Informe as vagas.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '8 times' }))
    await user.click(screen.getByRole('button', { name: 'Só alguns elos' }))
    await user.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(screen.getByText('Escolha ao menos um elo ou deixe aberto a todos.')).toBeTruthy()
    expect(screen.getByText(/Vale o elo do time em Society/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Ouro/ }))
    await user.click(screen.getByRole('button', { name: /Prata/ }))
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    await screen.findByText(/Rascunho salvo/)
    const body = calls('POST')[0][2] as EventDraftInput
    expect(body).toMatchObject({ name: 'Copa Society', sport: 'futebol', format: 'society', competition_type: 'eliminacao_simples', capacity: 8, accepted_tiers: ['prata', 'ouro'] })
  })

  it('"Salvar rascunho" cria o rascunho e, depois, atualiza o mesmo evento', async () => {
    const user = userEvent.setup()
    mockApi((path, method, body) => {
      if (path === '/organizer/events' && method === 'POST') return draftDetail({ id: 9, ...(body as object) })
      if (path === '/organizer/events/9' && method === 'PATCH') return draftDetail({ id: 9, ...(body as object) })
      return undefined
    })
    renderWizard()
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    expect(screen.getByText('Informe o nome do evento com 3 a 60 caracteres.')).toBeTruthy()
    expect(request).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Nome do evento'), 'Liga Noturna')
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    expect(await screen.findByText(/Rascunho salvo/)).toBeTruthy()
    expect(calls('POST')[0][0]).toBe('/organizer/events')
    expect(calls('POST')[0][2]).toMatchObject({ name: 'Liga Noturna', sport: null, price_cents: null, accepted_tiers: null })

    await user.type(screen.getByLabelText('Nome do evento'), ' de Futsal')
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    await waitFor(() => expect(calls('PATCH')).toHaveLength(1))
    expect(calls('PATCH')[0][0]).toBe('/organizer/events/9')
    expect(calls('PATCH')[0][2]).toMatchObject({ name: 'Liga Noturna de Futsal' })
  })

  it('escolhe datas, cidade e local; sem hora, as inscrições fecham às 23:59; o gratuito publica', async () => {
    const user = userEvent.setup()
    let saved: OrganizerEventDetail = draftDetail()
    mockApi((path, method, body) => {
      if (path === '/organizer/events/9' && method === 'PATCH') { saved = { ...saved, ...(body as object), checklist: fullChecklist, can_submit: true }; return saved }
      if (path === '/organizer/events/9/submit') return { ...saved, state: 'publicado', phase: 'inscricoes_abertas' }
      if (path === '/organizer/events/9') return saved
      return undefined
    })
    const { onDone } = renderWizard({ eventId: 9 })
    // Abre no primeiro passo incompleto (datas e local).
    expect((await screen.findByRole('heading', { level: 2, name: 'Quando e onde?' })).textContent).toBe('Quando e onde?')
    expect(screen.getByRole('heading', { level: 1, name: 'Editar rascunho' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Data do evento: Escolher data' }))
    let calendar = await screen.findByRole('dialog', { name: 'Escolher data do evento' })
    await user.click(within(calendar).getByRole('button', { name: /30 de outubro de 2026/ }))
    fireEvent.change(screen.getByLabelText('Hora do início'), { target: { value: '09:00' } })
    await user.click(screen.getByRole('button', { name: 'Fim das inscrições: Escolher data' }))
    calendar = await screen.findByRole('dialog', { name: 'Escolher fim das inscrições' })
    await user.click(within(calendar).getByRole('button', { name: /28 de outubro de 2026/ }))
    expect(screen.getByText(/Sem hora, fecham às 23:59/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(screen.getByText('Escolha a cidade.')).toBeTruthy()
    expect(screen.getByText('Informe o local com 2 a 120 caracteres.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Escolher' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Cidade do evento' })).getByRole('button', { name: /Brasília/ }))
    await user.type(screen.getByLabelText('Local'), 'Clube do Saibro')
    await user.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(question().textContent).toBe('A inscrição é paga?')
    expect(screen.queryByRole('button', { name: 'Enviar para aprovação' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Gratuita' }))
    expect(screen.getByText(/Evento gratuito publica direto/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Publicar' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    const body = calls('PATCH')[0][2] as EventDraftInput
    expect(body).toMatchObject({ city_id: brasilia.id, venue: 'Clube do Saibro', price_cents: 0 })
    expect(body.starts_at).toBe(new Date(2026, 9, 30, 9, 0).toISOString())
    expect(body.registration_closes_at).toBe(new Date(2026, 9, 28, 23, 59).toISOString())
    expect(calls('POST').map(call => call[0])).toEqual(['/organizer/events/9/submit'])
    expect(onDone.mock.calls[0][0].state).toBe('publicado')
  })

  it('pago: pede valor e Pix, valida a chave e envia para aprovação', async () => {
    const user = userEvent.setup()
    const loaded = draftDetail({
      starts_at: new Date(2026, 9, 30, 9).toISOString(), registration_closes_at: new Date(2026, 9, 28, 23, 59).toISOString(), city: brasilia,
      venue: 'Clube do Saibro', price_cents: 6000, pix: { beneficiary: null, key_type: null, key: null, copy_paste: null, instructions: null },
    })
    mockApi((path, method, body) => {
      if (path === '/organizer/events/9' && method === 'PATCH') return { ...loaded, ...(body as object), can_submit: true }
      if (path === '/organizer/events/9/submit') return { ...loaded, state: 'em_aprovacao', phase: 'em_aprovacao' }
      if (path === '/organizer/events/9') return loaded
      return undefined
    })
    const { onDone } = renderWizard({ eventId: 9 })
    expect((await screen.findByRole('heading', { level: 2, name: 'A inscrição é paga?' })).textContent).toBeTruthy()
    expect((screen.getByLabelText('Valor por inscrito (R$)') as HTMLInputElement).value).toBe('60')
    expect(screen.getByText('Evento pago passa pela administração')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Enviar para aprovação' }))
    expect(screen.getByText('Informe o favorecido com 2 a 80 caracteres.')).toBeTruthy()
    expect(screen.getByText('Escolha o tipo de chave Pix.')).toBeTruthy()
    expect(request).not.toHaveBeenCalledWith('/organizer/events/9', 'PATCH', expect.anything())

    await user.type(screen.getByLabelText('Favorecido'), 'Rafa Nunes')
    await user.click(screen.getByRole('button', { name: 'CPF' }))
    expect(screen.getByLabelText('Chave Pix').getAttribute('placeholder')).toBe('000.000.000-00')
    await user.type(screen.getByLabelText('Chave Pix'), '111.111.111-11')
    await user.click(screen.getByRole('button', { name: 'Enviar para aprovação' }))
    expect(screen.getByText('Informe um CPF válido.')).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Chave Pix')))

    await user.click(screen.getByRole('button', { name: 'E-mail' }))
    await user.clear(screen.getByLabelText('Chave Pix'))
    await user.type(screen.getByLabelText('Chave Pix'), 'Liga@Example.com')
    await user.type(screen.getByLabelText('Pix Copia e Cola (opcional)'), '000201')
    await user.click(screen.getByRole('button', { name: 'Enviar para aprovação' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(calls('PATCH')[0][2]).toMatchObject({ price_cents: 6000, pix_beneficiary: 'Rafa Nunes', pix_key_type: 'email', pix_key: 'Liga@Example.com', pix_copy_paste: '000201' })
    expect(onDone.mock.calls[0][0].state).toBe('em_aprovacao')
  })

  it('erro da API volta ao passo e ao campo certos', async () => {
    const user = userEvent.setup()
    const loaded = draftDetail({ price_cents: 6000, pix: { beneficiary: 'Rafa', key_type: 'cpf', key: '123', copy_paste: null, instructions: null } })
    mockApi((path, method) => {
      if (path === '/organizer/events/9' && method === 'PATCH')
        return new ApiError('Revise os campos informados.', 422, [{ field: 'pix_key', message: 'Value error, Informe um CPF válido.' }])
      if (path === '/organizer/events/9') return loaded
      return undefined
    })
    renderWizard({ eventId: 9, initialStep: 1 })
    expect((await screen.findByRole('heading', { level: 2, name: 'Qual modalidade?' })).textContent).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    expect((await screen.findByRole('heading', { level: 2, name: 'A inscrição é paga?' })).textContent).toBeTruthy()
    expect(screen.getByText('Informe um CPF válido.')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('Revise o campo indicado.')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Chave Pix')))
  })

  it('checklist recusado no envio leva ao passo do item; conflito aparece como erro geral', async () => {
    const user = userEvent.setup()
    const loaded = draftDetail({
      starts_at: new Date(2026, 9, 30, 9).toISOString(), registration_closes_at: new Date(2026, 9, 28, 23, 59).toISOString(), city: brasilia,
      venue: 'Clube do Saibro', price_cents: 0,
    })
    let submit: ApiError = new ApiError('Complete o rascunho para publicar.', 422, [{ field: 'datas', message: 'O fim das inscrições já passou.' }])
    mockApi((path, method, body) => {
      if (path === '/organizer/events/9' && method === 'PATCH') return { ...loaded, ...(body as object) }
      if (path === '/organizer/events/9/submit') return submit
      if (path === '/organizer/events/9') return loaded
      return undefined
    })
    renderWizard({ eventId: 9 })
    await screen.findByRole('heading', { level: 2, name: 'A inscrição é paga?' })
    await user.click(screen.getByRole('button', { name: 'Publicar' }))
    expect((await screen.findByRole('heading', { level: 2, name: 'Quando e onde?' })).textContent).toBeTruthy()
    expect(screen.getByText('O fim das inscrições já passou.')).toBeTruthy()

    submit = new ApiError('Você precisa ser organizador para criar eventos.', 403)
    await user.click(screen.getByRole('button', { name: /Próxima/ }))
    await user.click(screen.getByRole('button', { name: 'Publicar' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Você precisa ser organizador para criar eventos.')
  })

  it('fechar com mudanças pergunta antes de sair; sem mudanças, fecha direto', async () => {
    const user = userEvent.setup()
    const { onClose } = renderWizard()
    await user.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await user.type(screen.getByLabelText('Nome do evento'), 'Copa')
    await user.click(screen.getByRole('button', { name: 'Fechar' }))
    const sheet = screen.getByRole('dialog', { name: 'Sair sem salvar?' })
    await user.click(within(sheet).getByRole('button', { name: 'Continuar editando' }))
    expect(screen.queryByRole('dialog', { name: 'Sair sem salvar?' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Fechar' }))
    await user.click(screen.getByRole('button', { name: 'Sair sem salvar' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('um evento que não é mais rascunho não abre no assistente', async () => {
    mockApi(path => path === '/organizer/events/9' ? draftDetail({ state: 'em_aprovacao', phase: 'em_aprovacao' }) : undefined)
    renderWizard({ eventId: 9 })
    expect((await screen.findByRole('alert')).textContent).toBe('Retire o evento da aprovação para editar.')
    cleanup()
    mockApi(() => new ApiError('Evento não encontrado.', 404))
    renderWizard({ eventId: 9 })
    expect((await screen.findByRole('alert')).textContent).toBe('Evento não encontrado.')
  })
})
