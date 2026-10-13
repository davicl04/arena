import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminCourtSuggestions from '../src/components/admin/AdminCourtSuggestions'
import AdminWalkoverDisputes from '../src/components/admin/AdminWalkoverDisputes'
import { apiError, mockApi, reply } from './teams-fixtures'
import { chatLine, court, dispute, disputeMatch, ferrugem, fromNow, rafa, suggestion, tigres } from './admin-match-fixtures'
import { findToast, renderWithToaster } from './toast-utils'

/* Filas da administração da etapa 3 (0002-jogar, seções 10.4 e 10.7): quadras sugeridas e W.O. contestados. */

beforeEach(() => { Element.prototype.scrollTo = () => {} })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const page = <T,>(items: T[]) => ({ items, next_cursor: null })
/** Primeira linha da fila "Para analisar" (a sugestão mais antiga). */
const firstRow = async () => (await within(await screen.findByRole('list', { name: 'Sugestões para analisar' })).findAllByRole('button'))[0]
const decided = (overrides = {}) => suggestion({ court: court({ state: 'publicada', provisional: false }), reviewed_at: fromNow(-1), ...overrides })

describe('fila "Sugestões de quadra"', () => {
  const arenaSul = suggestion()
  const parecida = court({ id: 30, name: 'Arena Sul Society', address: 'SGAS 910', state: 'publicada', provisional: false })
  const duplicada = suggestion({ court: court({ id: 42, name: 'Arena Sul Society' }), possible_duplicates: [parecida] })
  const routes = (extra: Record<string, unknown> = {}) => ({
    'GET /admin/court-suggestions?state=em_revisao': page([arenaSul, duplicada]),
    'GET /matches/12': { sides: [ferrugem, tigres] },
    ...extra,
  })

  it('lista nome, endereço, cidade, quem sugeriu e a partida de origem, com o aviso de duplicidade', async () => {
    mockApi(routes())
    renderWithToaster(<AdminCourtSuggestions onExpired={vi.fn()} />)
    const list = await screen.findByRole('list', { name: 'Sugestões para analisar' })
    const [first, second] = within(list).getAllByRole('button')
    expect(first.textContent).toContain('Arena Sul')
    expect(first.textContent).toContain('SGAS 910, Asa Sul')
    expect(first.textContent).toContain('Society · Brasília · DF')
    expect(first.textContent).toContain('Sugerida por Rafa Nunes há 3 horas · partida #12')
    expect(first.textContent).not.toContain('Possível duplicidade')
    expect(second.textContent).toContain('Possível duplicidade')
    expect(screen.getByRole('tab', { name: 'Para analisar' }).getAttribute('aria-selected')).toBe('true')
  })

  it('a folha mostra a partida de origem com os lados e a quadra parecida do catálogo', async () => {
    mockApi(routes())
    const ui = userEvent.setup()
    renderWithToaster(<AdminCourtSuggestions onExpired={vi.fn()} />)
    await ui.click(await screen.findByRole('button', { name: /Arena Sul Society/ }))
    const sheet = screen.getByRole('dialog', { name: 'Sugestão de quadra' })
    expect(await within(sheet).findByText('Ferrugem FC × Tigres do Lago')).not.toBeNull()
    expect(within(sheet).getByText(/Partida #12 · Society/)).not.toBeNull()
    const warning = within(sheet).getByRole('region', { name: 'Possível duplicidade' })
    expect(warning.textContent).toContain('Arena Sul Society · SGAS 910')
    expect(within(sheet).getByRole('button', { name: 'Publicar' })).not.toBeNull()
    expect(within(sheet).getByRole('button', { name: 'Rejeitar' })).not.toBeNull()
  })

  it('publica sem correções: o corpo leva só a decisão, e a fila perde o item', async () => {
    const api = mockApi(routes({ 'POST /admin/court-suggestions/41/decision': decided() }))
    const ui = userEvent.setup()
    renderWithToaster(<AdminCourtSuggestions onExpired={vi.fn()} />)
    await ui.click(await firstRow())
    const sheet = screen.getByRole('dialog', { name: 'Sugestão de quadra' })
    await ui.click(within(sheet).getByRole('button', { name: 'Publicar' }))
    expect((within(sheet).getByLabelText('Nome da quadra') as HTMLInputElement).value).toBe('Arena Sul')
    await ui.click(within(sheet).getByRole('button', { name: 'Publicar quadra' }))
    expect((await findToast('Arena Sul entrou no catálogo de Brasília.')).closest('[data-tone]')?.getAttribute('data-tone')).toBe('success')
    expect(api.find('POST', '/admin/court-suggestions/41/decision')[0].body).toEqual({ decision: 'publicar' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(screen.getByRole('list', { name: 'Sugestões para analisar' })).getAllByRole('button')).toHaveLength(1)
  })

  it('publica com nome e endereço corrigidos e recusa o nome vazio no cliente', async () => {
    const api = mockApi(routes({ 'POST /admin/court-suggestions/41/decision': decided({ court: court({ name: 'Arena Sul Society' }) }) }))
    const ui = userEvent.setup()
    renderWithToaster(<AdminCourtSuggestions onExpired={vi.fn()} />)
    await ui.click(await firstRow())
    const sheet = screen.getByRole('dialog', { name: 'Sugestão de quadra' })
    await ui.click(within(sheet).getByRole('button', { name: 'Publicar' }))
    const name = within(sheet).getByLabelText('Nome da quadra')
    await ui.clear(name)
    await ui.click(within(sheet).getByRole('button', { name: 'Publicar quadra' }))
    expect(within(sheet).getByRole('alert').textContent).toBe('O nome da quadra precisa ter de 2 a 80 caracteres.')
    expect(api.find('POST', '/admin/court-suggestions/41/decision')).toHaveLength(0)
    await ui.type(name, 'Arena Sul Society')
    const address = within(sheet).getByLabelText('Endereço (opcional)')
    await ui.clear(address)
    await ui.click(within(sheet).getByRole('button', { name: 'Publicar quadra' }))
    await findToast(/entrou no catálogo/)
    expect(api.find('POST', '/admin/court-suggestions/41/decision')[0].body).toEqual({ decision: 'publicar', name: 'Arena Sul Society', address: null })
  })

  it('rejeita com motivo obrigatório (5 a 300 caracteres)', async () => {
    const api = mockApi(routes({ 'POST /admin/court-suggestions/41/decision': decided({ court: court({ state: 'rejeitada' }) }) }))
    const ui = userEvent.setup()
    renderWithToaster(<AdminCourtSuggestions onExpired={vi.fn()} />)
    await ui.click(await firstRow())
    const sheet = screen.getByRole('dialog', { name: 'Sugestão de quadra' })
    await ui.click(within(sheet).getByRole('button', { name: 'Rejeitar' }))
    expect(within(sheet).getByText(/marcada como "Sugestão recusada"/)).not.toBeNull()
    await ui.click(within(sheet).getByRole('button', { name: 'Rejeitar sugestão' }))
    expect(within(sheet).getByRole('alert').textContent).toBe('Descreva o motivo da recusa, de 5 a 300 caracteres.')
    expect(api.find('POST', '/admin/court-suggestions/41/decision')).toHaveLength(0)
    await ui.type(within(sheet).getByLabelText('Motivo da recusa (obrigatório)'), 'O endereço não existe.')
    await ui.click(within(sheet).getByRole('button', { name: 'Rejeitar sugestão' }))
    expect((await findToast('Sugestão Arena Sul rejeitada.')).closest('[data-tone]')?.getAttribute('data-tone')).toBe('success')
    expect(api.find('POST', '/admin/court-suggestions/41/decision')[0].body).toEqual({ decision: 'rejeitar', reason: 'O endereço não existe.' })
  })

  it('rejeita como duplicada: a quadra do catálogo dispensa o motivo e pode ser desfeita', async () => {
    const api = mockApi(routes({ 'POST /admin/court-suggestions/42/decision': decided({ court: court({ id: 42, state: 'rejeitada' }), duplicate_of: parecida }) }))
    const ui = userEvent.setup()
    renderWithToaster(<AdminCourtSuggestions onExpired={vi.fn()} />)
    await ui.click(await screen.findByRole('button', { name: /Arena Sul Society/ }))
    const sheet = screen.getByRole('dialog', { name: 'Sugestão de quadra' })
    await ui.click(within(sheet).getByRole('button', { name: 'Rejeitar' }))
    const chip = within(sheet).getByRole('button', { name: 'Duplicada: Arena Sul Society' })
    await ui.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    expect(within(sheet).getByLabelText('Motivo da recusa (opcional)')).not.toBeNull()
    expect(within(sheet).getByText(/passam a usar Arena Sul Society, do catálogo, sem novo aceite/)).not.toBeNull()
    await ui.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    await ui.click(chip)
    await ui.click(within(sheet).getByRole('button', { name: 'Rejeitar sugestão' }))
    expect((await findToast('Arena Sul Society rejeitada como duplicada de Arena Sul Society.')).closest('[data-tone]')?.getAttribute('data-tone')).toBe('success')
    expect(api.find('POST', '/admin/court-suggestions/42/decision')[0].body).toEqual({ decision: 'rejeitar', duplicate_of_id: 30 })
  })

  it('o nome repetido no catálogo (409) fica na folha, para rejeitar como duplicada', async () => {
    mockApi(routes({ 'POST /admin/court-suggestions/42/decision': apiError(409, 'Já existe uma quadra publicada com este nome nesta cidade. Rejeite como duplicada.') }))
    const ui = userEvent.setup()
    renderWithToaster(<AdminCourtSuggestions onExpired={vi.fn()} />)
    await ui.click(await screen.findByRole('button', { name: /Arena Sul Society/ }))
    const sheet = screen.getByRole('dialog', { name: 'Sugestão de quadra' })
    await ui.click(within(sheet).getByRole('button', { name: 'Publicar' }))
    await ui.click(within(sheet).getByRole('button', { name: 'Publicar quadra' }))
    expect(await findToast(/Rejeite como duplicada/)).toBeTruthy()
    expect(screen.getByRole('dialog', { name: 'Sugestão de quadra' })).not.toBeNull()
  })

  it('sugestão já decidida (409) fecha a folha e recarrega a fila', async () => {
    let calls = 0
    const api = mockApi(routes({
      'GET /admin/court-suggestions?state=em_revisao': () => page(calls++ === 0 ? [arenaSul] : []),
      'POST /admin/court-suggestions/41/decision': apiError(409, 'Esta sugestão já foi decidida.'),
    }))
    const ui = userEvent.setup()
    renderWithToaster(<AdminCourtSuggestions onExpired={vi.fn()} />)
    await ui.click(await screen.findByRole('button', { name: /Arena Sul/ }))
    const sheet = screen.getByRole('dialog', { name: 'Sugestão de quadra' })
    await ui.click(within(sheet).getByRole('button', { name: 'Publicar' }))
    await ui.click(within(sheet).getByRole('button', { name: 'Publicar quadra' }))
    expect((await findToast('Esta sugestão já foi decidida.')).closest('[data-tone]')?.getAttribute('data-tone')).toBe('warning')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await screen.findByText('Nada para analisar')).not.toBeNull()
    expect(api.find('GET', '/admin/court-suggestions?state=em_revisao')).toHaveLength(2)
  })

  it('expira a sessão no 401', async () => {
    mockApi(routes({ 'POST /admin/court-suggestions/41/decision': reply(401, { detail: 'Sessão expirada.' }) }))
    const onExpired = vi.fn()
    const ui = userEvent.setup()
    renderWithToaster(<AdminCourtSuggestions onExpired={onExpired} />)
    await ui.click(await firstRow())
    await ui.click(screen.getByRole('button', { name: 'Publicar' }))
    await ui.click(screen.getByRole('button', { name: 'Publicar quadra' }))
    await waitFor(() => expect(onExpired).toHaveBeenCalled())
  })

  it('abas com o teclado: Decididas mostra publicadas e rejeitadas, só para leitura', async () => {
    mockApi(routes({
      'GET /admin/court-suggestions?state=decididas': page([
        decided({ court: court({ id: 50, name: 'Quadra do Lago', state: 'publicada', provisional: false }) }),
        decided({ court: court({ id: 51, name: 'Campinho', state: 'rejeitada' }), review_reason: 'Endereço inexistente.' }),
        decided({ court: court({ id: 52, name: 'Arena Sul 2', state: 'rejeitada' }), duplicate_of: parecida }),
      ]),
    }))
    const ui = userEvent.setup()
    renderWithToaster(<AdminCourtSuggestions onExpired={vi.fn()} />)
    await screen.findByRole('list', { name: 'Sugestões para analisar' })
    const first = screen.getByRole('tab', { name: 'Para analisar' })
    first.focus()
    await ui.keyboard('{ArrowRight}')
    const second = screen.getByRole('tab', { name: 'Decididas' })
    expect(second.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(second)
    const list = await screen.findByRole('list', { name: 'Sugestões decididas' })
    expect(within(list).queryAllByRole('button')).toHaveLength(0)
    const [lago, campinho, duplicate] = within(list).getAllByRole('listitem')
    expect(lago.textContent).toContain('Publicada')
    expect(campinho.textContent).toContain('Rejeitada')
    expect(campinho.textContent).toContain('Endereço inexistente.')
    expect(duplicate.textContent).toContain('Duplicada de Arena Sul Society')
  })

  it('estados vazios e erro com nova tentativa', async () => {
    let ok = false
    mockApi({ 'GET /admin/court-suggestions?state=em_revisao': () => ok ? page([]) : apiError(500, 'Falha ao carregar.') })
    const ui = userEvent.setup()
    renderWithToaster(<AdminCourtSuggestions onExpired={vi.fn()} />)
    expect((await screen.findByRole('alert')).textContent).toContain('Falha ao carregar.')
    ok = true
    await ui.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('Nada para analisar')).not.toBeNull()
  })
})

describe('fila "W.O. contestados"', () => {
  const item = dispute()
  const chat = {
    items: [
      chatLine(1, { kind: 'evento', event_type: 'partida_agendada', body: 'Partida agendada na quadra Quadra do Lago.', author: null, side: null }),
      chatLine(2, { body: 'Estamos chegando, o portão está fechado.', created_at: fromNow(-6) }),
      chatLine(3, { author: rafa, side: 'a', body: 'Esperamos 20 minutos.' }),
      chatLine(4, { body: null, removed: true }),
      chatLine(5, { kind: 'evento', event_type: 'wo_registrado', body: 'Ferrugem FC registrou o W.O.', author: null, side: 'a' }),
    ],
    has_more: true, last_id: 5,
  }
  const routes = (extra: Record<string, unknown> = {}) => ({
    'GET /admin/walkover-disputes': page([item]),
    'GET /matches/12/messages?limit=12': chat,
    ...extra,
  })

  it('lista a partida, quem registrou e quem contestou', async () => {
    mockApi(routes())
    renderWithToaster(<AdminWalkoverDisputes onExpired={vi.fn()} />)
    const list = await screen.findByRole('list', { name: 'W.O. para decidir' })
    const row = within(list).getByRole('button', { name: /Ferrugem FC × Tigres do Lago/ })
    expect(row.textContent).toContain('Society')
    expect(row.textContent).toContain('Registrado por Rafa Nunes · contestado por Caio Ramos há 2 horas')
    expect(row.textContent).toContain('Aguarda decisão')
  })

  it('a folha mostra os dois lados, o motivo e o trecho do chat', async () => {
    const api = mockApi(routes())
    const ui = userEvent.setup()
    renderWithToaster(<AdminWalkoverDisputes onExpired={vi.fn()} />)
    await ui.click(await screen.findByRole('button', { name: /Ferrugem FC × Tigres do Lago/ }))
    const sheet = screen.getByRole('dialog', { name: 'W.O. contestado' })
    expect(within(sheet).getByText('Quadra do Lago')).not.toBeNull()
    expect(within(sheet).getByText('Tigres do Lago', { selector: 'dd' })).not.toBeNull()
    const registered = within(sheet).getByRole('region', { name: 'Registrou o W.O.' })
    expect(registered.textContent).toContain('Rafa Nunes')
    expect(registered.textContent).toContain('Ferrugem FC · compareceu')
    const contested = within(sheet).getByRole('region', { name: 'Contestou' })
    expect(contested.textContent).toContain('Caio Ramos')
    expect(contested.textContent).toContain('Tigres do Lago · lado ausente')
    expect(contested.textContent).toContain('Chegamos às 19h, mas o portão estava fechado.')
    const messages = await within(sheet).findByRole('list', { name: 'Mensagens do chat' })
    expect(within(messages).getByText('Partida agendada na quadra Quadra do Lago.')).not.toBeNull()
    expect(within(messages).getByText('Estamos chegando, o portão está fechado.')).not.toBeNull()
    expect(within(messages).getByText('Esperamos 20 minutos.')).not.toBeNull()
    expect(within(messages).getByText('Mensagem removida')).not.toBeNull()
    expect(within(sheet).getByText('Mostrando as últimas 5 mensagens.')).not.toBeNull()
    expect(api.find('GET', '/matches/12/messages?limit=12')).toHaveLength(1)
  })

  it('mantém o W.O. com a justificativa obrigatória', async () => {
    const api = mockApi(routes({ 'POST /admin/matches/12/walkover-decision': { ...item, walkover: { ...item.walkover, decision: 'mantido' } } }))
    const ui = userEvent.setup()
    renderWithToaster(<AdminWalkoverDisputes onExpired={vi.fn()} />)
    await ui.click(await screen.findByRole('button', { name: /Ferrugem FC × Tigres do Lago/ }))
    const sheet = screen.getByRole('dialog', { name: 'W.O. contestado' })
    await ui.click(within(sheet).getByRole('button', { name: 'Manter o W.O.' }))
    expect(within(sheet).getByText('Vale 3 × 0 para Ferrugem FC: a partida é encerrada e o ranking é recalculado.')).not.toBeNull()
    await ui.click(within(sheet).getAllByRole('button', { name: 'Manter o W.O.' })[0])
    expect(within(sheet).getByRole('alert').textContent).toBe('Descreva a decisão, de 5 a 500 caracteres.')
    expect(api.find('POST', '/admin/matches/12/walkover-decision')).toHaveLength(0)
    await ui.type(within(sheet).getByLabelText('Justificativa da decisão (os dois lados veem)'), ' O portão estava aberto, vale o registro. ')
    await ui.click(within(sheet).getAllByRole('button', { name: 'Manter o W.O.' })[0])
    expect((await findToast('W.O. mantido: vitória de Ferrugem FC por 3 × 0.')).closest('[data-tone]')?.getAttribute('data-tone')).toBe('success')
    expect(api.find('POST', '/admin/matches/12/walkover-decision')[0].body).toEqual({ decision: 'manter', reason: 'O portão estava aberto, vale o registro.' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('Nenhum W.O. contestado')).not.toBeNull()
  })

  it('anula o W.O. e a partida fica sem resultado', async () => {
    const api = mockApi(routes({ 'POST /admin/matches/12/walkover-decision': { ...item, walkover: { ...item.walkover, decision: 'anulado' } } }))
    const ui = userEvent.setup()
    renderWithToaster(<AdminWalkoverDisputes onExpired={vi.fn()} />)
    await ui.click(await screen.findByRole('button', { name: /Ferrugem FC × Tigres do Lago/ }))
    const sheet = screen.getByRole('dialog', { name: 'W.O. contestado' })
    await ui.click(within(sheet).getByRole('button', { name: 'Anular' }))
    expect(within(sheet).getByText(/A partida fica sem resultado e ninguém pontua/)).not.toBeNull()
    await ui.type(within(sheet).getByRole('textbox'), 'Os dois lados estavam no local.')
    await ui.click(within(sheet).getByRole('button', { name: 'Anular o W.O.' }))
    expect((await findToast('W.O. anulado: Ferrugem FC × Tigres do Lago ficou sem resultado.')).closest('[data-tone]')?.getAttribute('data-tone')).toBe('success')
    expect(api.find('POST', '/admin/matches/12/walkover-decision')[0].body).toEqual({ decision: 'anular', reason: 'Os dois lados estavam no local.' })
  })

  it('no tênis o placar do W.O. é 6-0 6-0 e o lado é o atleta', async () => {
    const athlete = (side: 'a' | 'b', name: string, id: number) => ({ side, kind: 'atleta' as const, team: null, athlete: { id, name, username: name.toLowerCase(), avatar_url: null } })
    const tennis = dispute({ match: disputeMatch({ id: 15, sport: 'tenis', format: null, sides: [athlete('a', 'Ana', 3), athlete('b', 'Bia', 4)] }) })
    mockApi({ 'GET /admin/walkover-disputes': page([tennis]), 'GET /matches/15/messages?limit=12': { items: [], has_more: false, last_id: null } })
    const ui = userEvent.setup()
    renderWithToaster(<AdminWalkoverDisputes onExpired={vi.fn()} />)
    await ui.click(await screen.findByRole('button', { name: /Ana × Bia/ }))
    const sheet = screen.getByRole('dialog', { name: 'W.O. contestado' })
    expect(await within(sheet).findByText('Nenhuma mensagem no chat.')).not.toBeNull()
    await ui.click(within(sheet).getByRole('button', { name: 'Manter o W.O.' }))
    expect(within(sheet).getByText('Vale 6-0 6-0 para Ana: a partida é encerrada e o ranking é recalculado.')).not.toBeNull()
  })

  it('o chat com erro não impede a decisão e permite tentar de novo', async () => {
    let ok = false
    mockApi(routes({ 'GET /matches/12/messages?limit=12': () => ok ? chat : apiError(403, 'O chat abre quando os dois lados aceitam a proposta.') }))
    const ui = userEvent.setup()
    renderWithToaster(<AdminWalkoverDisputes onExpired={vi.fn()} />)
    await ui.click(await screen.findByRole('button', { name: /Ferrugem FC × Tigres do Lago/ }))
    const sheet = screen.getByRole('dialog', { name: 'W.O. contestado' })
    expect((await within(sheet).findByText(/O chat abre quando os dois lados aceitam/)).closest('[data-slot="load-error"]')?.getAttribute('role')).toBe('alert')
    expect(within(sheet).getByRole('button', { name: 'Manter o W.O.' })).not.toBeNull()
    ok = true
    await ui.click(within(sheet).getByRole('button', { name: 'Tentar novamente' }))
    expect(await within(sheet).findByRole('list', { name: 'Mensagens do chat' })).not.toBeNull()
  })

  it('W.O. que não aguarda mais decisão (409) fecha a folha e recarrega a fila', async () => {
    let calls = 0
    const api = mockApi(routes({
      'GET /admin/walkover-disputes': () => page(calls++ === 0 ? [item] : []),
      'POST /admin/matches/12/walkover-decision': apiError(409, 'Este W.O. não aguarda decisão.'),
    }))
    const ui = userEvent.setup()
    renderWithToaster(<AdminWalkoverDisputes onExpired={vi.fn()} />)
    await ui.click(await screen.findByRole('button', { name: /Ferrugem FC × Tigres do Lago/ }))
    const sheet = screen.getByRole('dialog', { name: 'W.O. contestado' })
    await ui.click(within(sheet).getByRole('button', { name: 'Anular' }))
    await ui.type(within(sheet).getByRole('textbox'), 'Decisão repetida.')
    await ui.click(within(sheet).getByRole('button', { name: 'Anular o W.O.' }))
    expect((await findToast('Este W.O. não aguarda decisão.')).closest('[data-tone]')?.getAttribute('data-tone')).toBe('warning')
    expect(await screen.findByText('Nenhum W.O. contestado')).not.toBeNull()
    expect(api.find('GET', '/admin/walkover-disputes')).toHaveLength(2)
  })

  it('fila vazia mostra o estado vazio', async () => {
    mockApi({ 'GET /admin/walkover-disputes': page([]) })
    renderWithToaster(<AdminWalkoverDisputes onExpired={vi.fn()} />)
    expect(await screen.findByText('Nenhum W.O. contestado')).not.toBeNull()
  })
})
