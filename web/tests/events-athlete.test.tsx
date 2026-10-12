import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { City, Profile } from '../src/api/client'
import { receiptFileError } from '../src/api/receipts'
import type { EventDetail, MyEntry } from '../src/api/entries'
import { entryCta, isLocked } from '../src/components/events/entryCta'
import { reservationDeadline } from '../src/components/events/eventText'
import EventPage from '../src/pages/EventPage'
import EventsPage from '../src/pages/EventsPage'
import { apiError, brasilia, mockApi } from './teams-fixtures'
import type { Call } from './teams-fixtures'
import { HOUR, card, confirmedEntry, detail, ferrugem, fromNow, lions, myEntry, myReceipt, withEntry } from './events-fixtures'

/*
 * Campeonatos e provas do atleta (0002, seção 6): lista E2, detalhe D2 com as abas, inscrição gratuita e paga
 * (reserva, Pix, comprovante, recusa e reenvio, expiração), desistência e resposta à devolução. O `fetch` é simulado
 * pelas rotas do contrato.
 */

const tennis: Profile = { id: 2, sport: 'tenis', city_id: brasilia.id, position: null, looking_for: false, is_public: false, level: null }
const football: Profile = { ...tennis, id: 1, sport: 'futebol', position: 'atacante' }
const cities: City[] = [brasilia]
const page = (items: unknown[], next: string | null = null) => ({ items, next_cursor: next })

function renderEvent(props: Partial<{ onTeams: () => void; onManage: (id: number) => void }> = {}) {
  const onTeams = props.onTeams ?? vi.fn()
  const onManage = props.onManage ?? vi.fn()
  render(<div className="relative"><EventPage eventId={1} onTeams={onTeams} onManage={onManage} onExpired={vi.fn()} /></div>)
  return { onTeams, onManage }
}
/** Detalhe e inscrição que mudam com as ações (o servidor devolve o novo estado). */
function stateful(initial: EventDetail, mine: MyEntry | null) {
  const state = { detail: initial, entry: mine }
  const set = (next: MyEntry) => { state.entry = next; state.detail = withEntry(state.detail, next); return next }
  return { state, set }
}
const bar = () => document.querySelector<HTMLElement>('[data-slot="entry-bar"]')
const dialog = () => screen.getByRole('dialog')

/** Área de transferência simulada (depois do `userEvent.setup`, que instala a própria). */
function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(writeText) }, configurable: true })
}

beforeEach(() => { Element.prototype.scrollTo = () => {} })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); Reflect.deleteProperty(navigator, 'clipboard'); window.getSelection()?.removeAllRanges() })

describe('regras puras do atleta', () => {
  it('valida o comprovante como o servidor: tamanho, vazio e tipo (extensão sem tipo)', () => {
    expect(receiptFileError({ size: 5 * 1024 * 1024 + 1, type: 'application/pdf', name: 'a.pdf' })).toBe('O arquivo excede o limite de 5 MiB.')
    expect(receiptFileError({ size: 0, type: 'image/png', name: 'a.png' })).toBe('O arquivo enviado está vazio.')
    expect(receiptFileError({ size: 10, type: 'image/gif', name: 'a.gif' })).toBe('Envie o comprovante como imagem (JPEG, PNG ou WebP) ou PDF.')
    expect(receiptFileError({ size: 10, type: '', name: 'comprovante.JPG' })).toBeNull()
    expect(receiptFileError({ size: 5 * 1024 * 1024, type: 'image/webp', name: 'a.webp' })).toBeNull()
  })

  it('prazo da reserva: 48 h ou 12 h antes do início, o que vier primeiro', () => {
    const now = Date.UTC(2026, 9, 12, 12)
    expect(reservationDeadline(new Date(now + 240 * HOUR).toISOString(), now)).toBe(new Date(now + 48 * HOUR).toISOString())
    expect(reservationDeadline(new Date(now + 30 * HOUR).toISOString(), now)).toBe(new Date(now + 18 * HOUR).toISOString())
    expect(reservationDeadline(null, now)).toBeNull()
  })

  it('botão fixo: inscrição, comprovante, encerrado, suspenso, esgotado, sem time e fora da faixa', () => {
    expect(entryCta(detail(), null)).toEqual({ kind: 'enter', label: 'Inscrever-se · R$ 240', teams: [] })
    expect(entryCta(detail({ price_cents: 0 }), null)?.label).toBe('Inscrever-se · Grátis')
    expect(entryCta(detail({ is_organizer: true }), null)).toBeNull()
    expect(entryCta(detail(), myEntry())).toEqual({ kind: 'receipt', label: 'Enviar comprovante' })
    expect(entryCta(detail(), myEntry({ state: 'rejeitada' }))).toEqual({ kind: 'receipt', label: 'Enviar outro' })
    expect(entryCta(detail(), myEntry({ state: 'em_analise', can_send_receipt: false }))).toBeNull()
    expect(entryCta(detail(), myEntry({ state: 'expirada', can_send_receipt: false }))?.kind).toBe('enter')
    expect(entryCta(detail({ registration_open: false }), null)).toEqual({ kind: 'blocked', label: 'Inscrições encerradas' })
    expect(entryCta(detail({ revocation_pending: true, registration_open: false }), null)).toEqual({ kind: 'blocked', label: 'Inscrições suspensas' })
    expect(entryCta(detail({ spots_left: 0 }), null)).toEqual({ kind: 'blocked', label: 'Vagas esgotadas' })
    expect(entryCta(detail({ state: 'cancelado', registration_open: false }), null)).toBeNull()
    const sport = { sport: 'futebol' as const, format: 'society' as const }
    expect(entryCta(detail({ ...sport, eligibility: { eligible: false, reason: 'sem_time', message: 'Para inscrever um time, você precisa ser representante dele.', tier: null, teams: [] } }), null))
      .toEqual({ kind: 'teams', label: 'Crie ou represente um time' })
    const out = detail({ accepted_tiers: ['ouro'], eligibility: { eligible: false, reason: 'fora_da_faixa', message: 'Este evento aceita só Ouro.', tier: 'prata', teams: null } })
    expect(entryCta(out, null)).toEqual({ kind: 'blocked', label: 'Fora da faixa do evento', locked: true })
    expect(isLocked(out)).toBe(true)
    expect(isLocked({ ...out, my_entry: { id: 5, state: 'confirmada', team: null, reserved_until: null } })).toBe(false)
    // Futebol: um time já inscrito não impede inscrever outro time elegível que a pessoa representa.
    const teams = [
      { team: ferrugem, tier: null, eligible: true, reason: null, entry_id: 5 },
      { team: lions, tier: null, eligible: true, reason: null, entry_id: null },
    ]
    const both = detail({ ...sport, eligibility: { eligible: true, reason: null, message: null, tier: null, teams } })
    expect(entryCta(both, myEntry({ state: 'confirmada', can_send_receipt: false }))).toEqual({ kind: 'enter', label: 'Inscrever Leões do Cerrado · R$ 240', teams: [teams[1]] })
  })
})

describe('lista de campeonatos e provas (E2)', () => {
  const open = card({ id: 1, name: 'Copa Sudoeste', sport: 'futebol', format: 'society' })
  const locked = card({ id: 2, name: 'Liga Ouro', sport: 'futebol', format: 'campo', accepted_tiers: ['prata', 'ouro'],
    eligibility: { eligible: false, reason: 'fora_da_faixa', message: 'Este evento aceita só Prata e Ouro.', tier: null, teams: [] } })
  const closed = card({ id: 3, name: 'Copa Encerrada', sport: 'futebol', phase: 'inscricoes_encerradas' })
  const mine = myEntry({ event: { ...open, name: 'Copa Sudoeste' }, subject: { kind: 'time', team: ferrugem, athlete: null }, my_role: 'representante' })
  const otherSport = myEntry({ id: 6, event: { ...open, id: 9, name: 'Open de Tênis', sport: 'tenis' } })

  function renderList(profiles: Profile[] = [football], routes: Record<string, unknown> = {}) {
    const calls = mockApi({
      'GET /me/entries?scope=ativas&limit=50': page([mine, otherSport]),
      [`GET /events?sport=futebol&city_id=${brasilia.id}`]: page([open, locked, closed]),
      'GET /events?sport=futebol': page([]),
      ...routes,
    })
    const onOpen = vi.fn()
    const onSport = vi.fn()
    const onSports = vi.fn()
    render(<EventsPage sport="futebol" profiles={profiles} cities={cities} loading={false} onSport={onSport} onOpen={onOpen} onSports={onSports} onExpired={vi.fn()} />)
    return { calls, onOpen, onSport, onSports }
  }

  it('mostra os cartazes da cidade do perfil, o fora da faixa apagado com cadeado e o motivo, e Minhas inscrições', async () => {
    const ui = userEvent.setup()
    const { onOpen, onSport } = renderList()
    const list = await screen.findByRole('list', { name: 'Campeonatos' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[1].querySelector('[data-slot="event-poster"]')?.hasAttribute('data-locked')).toBe(true)
    expect(within(items[1]).getByText('Fora da faixa')).not.toBeNull()
    expect(within(items[1]).getByText('Este evento aceita só Prata e Ouro.')).not.toBeNull()
    expect(items[0].querySelector('[data-locked]')).toBeNull()
    expect(within(items[2]).getByText('Inscrições encerradas')).not.toBeNull()
    expect(screen.getByText('Brasília')).not.toBeNull()
    // Minhas inscrições: só as da modalidade, com o selo do estado.
    const section = screen.getByRole('region', { name: 'Minhas inscrições' })
    expect(within(section).getAllByRole('button')).toHaveLength(1)
    expect(within(section).getByText('Reservada')).not.toBeNull()
    expect(within(section).queryByText('Open de Tênis')).toBeNull()
    await ui.click(within(section).getByRole('button', { name: /Copa Sudoeste/ }))
    expect(onOpen).toHaveBeenLastCalledWith(1, 'futebol')
    await ui.click(within(items[1]).getByRole('button'))
    expect(onOpen).toHaveBeenLastCalledWith(2, 'futebol')
    await ui.click(screen.getByRole('button', { name: /Corrida/ }))
    expect(onSport).toHaveBeenCalledWith('corrida')
    expect(screen.getByRole('button', { name: /Futebol/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('estado vazio honesto e "Ver todas as cidades" sem o filtro da cidade', async () => {
    const ui = userEvent.setup()
    const { calls } = renderList([football], { [`GET /events?sport=futebol&city_id=${brasilia.id}`]: page([]), 'GET /me/entries?scope=ativas&limit=50': page([]) })
    expect(await screen.findByText('Nenhum campeonato aberto em Brasília')).not.toBeNull()
    expect(screen.queryByRole('region', { name: 'Minhas inscrições' })).toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Ver todas as cidades' }))
    expect(await screen.findByText('Nenhum campeonato aberto')).not.toBeNull()
    expect(calls.find('GET', '/events?sport=futebol')).toHaveLength(1)
    expect(screen.getByText('Todas as cidades')).not.toBeNull()
  })

  it('sem perfil da modalidade, mostra todas as cidades e leva a definir a cidade', async () => {
    const ui = userEvent.setup()
    const { onSports } = renderList([], { 'GET /events?sport=futebol': page([open], 'c1'), 'GET /events?sport=futebol&cursor=c1': page([closed]) })
    expect(await screen.findByText('Sem cidade no perfil de Futebol · todas as cidades')).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Carregar mais campeonatos' }))
    expect(await screen.findByText('Copa Encerrada')).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Definir cidade' }))
    expect(onSports).toHaveBeenCalled()
  })
})

describe('detalhe do evento (D2)', () => {
  it('mostra o cartaz, as abas no teclado (Informações, Tabela, Inscritos) e o contato do organizador', async () => {
    const mine = myEntry({ state: 'confirmada', can_send_receipt: false, can_cancel: false, confirmed_at: fromNow(-1), price_cents: 0 })
    const base = withEntry(detail({ price_cents: 0, pix: null, tennis_bonus: { champion: 40, runner_up: 20, semifinalist: 10, min_entries: 4, applies: false } }), mine)
    const calls = mockApi({
      'GET /events/1': base,
      'GET /entries/5': mine,
      'GET /events/1/entries': page([confirmedEntry(5, 'Ricardo Moura'), confirmedEntry(6, 'Beatriz Lima')]),
    })
    const ui = userEvent.setup()
    renderEvent()
    expect(await screen.findByRole('heading', { level: 2, name: 'Copa Sudoeste' })).not.toBeNull()
    expect(await screen.findByText('Inscrição confirmada')).not.toBeNull()
    const tabs = screen.getByRole('tablist', { name: 'Seções do campeonato' })
    expect(within(tabs).getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Informações', 'Tabela', 'Inscritos'])
    const panel = screen.getByRole('tabpanel')
    expect(within(panel).getByText('Arena Guará · Brasília/DF')).not.toBeNull()
    expect(within(panel).getByText('Gratuito')).not.toBeNull()
    expect(within(panel).getByText('Aberto a todos')).not.toBeNull()
    expect(within(panel).getByText(/campeão \+40, vice \+20, 3º e 4º \+10/)).not.toBeNull()
    expect(bar()).toBeNull()
    // Contato do organizador, numa folha com copiar.
    await ui.click(within(panel).getByRole('button', { name: 'Contato de Copa Sudoeste Eventos' }))
    expect(within(dialog()).getByText('(61) 99999-0000')).not.toBeNull()
    await ui.click(within(dialog()).getByRole('button', { name: 'Fechar' }))
    // Setas do teclado entre as abas.
    within(tabs).getByRole('tab', { name: 'Informações' }).focus()
    await ui.keyboard('{ArrowRight}')
    expect(within(tabs).getByRole('tab', { name: 'Tabela' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('A tabela aparece quando o organizador confirmar o chaveamento.')).not.toBeNull()
    await ui.keyboard('{ArrowRight}')
    const entrants = await screen.findByRole('list', { name: 'Atletas confirmados' })
    expect(within(entrants).getAllByRole('listitem').map(item => item.textContent?.includes('Você'))).toEqual([true, false])
    expect(calls.find('GET', '/events/1/entries')).toHaveLength(1)
  })

  it('corrida: aba Percurso com o local e a descrição do organizador', async () => {
    mockApi({ 'GET /events/1': detail({ sport: 'corrida', distance_km: 10, competition_type: null, price_cents: 0, pix: null, course_notes: 'Largada no Parque da Cidade.' }) })
    const ui = userEvent.setup()
    renderEvent()
    const tabs = await screen.findByRole('tablist', { name: 'Seções da prova' })
    await ui.click(within(tabs).getByRole('tab', { name: 'Percurso' }))
    expect(screen.getByText('10 km · Prova')).not.toBeNull()
    expect(screen.getByText('Largada no Parque da Cidade.')).not.toBeNull()
    expect(bar()?.textContent).toContain('Inscrever-se · Grátis')
  })

  it('inscrição gratuita: confirma na hora e anuncia em aria-live', async () => {
    const flow = stateful(detail({ price_cents: 0, pix: null }), null)
    const confirmed = myEntry({ state: 'confirmada', price_cents: 0, reserved_until: null, confirmed_at: fromNow(0), can_send_receipt: false })
    const calls = mockApi({
      'GET /events/1': () => flow.state.detail,
      'POST /events/1/entries': () => flow.set(confirmed),
      'GET /entries/5': () => flow.state.entry,
    })
    const ui = userEvent.setup()
    renderEvent()
    await ui.click(await screen.findByRole('button', { name: 'Inscrever-se · Grátis' }))
    expect(within(dialog()).getByText(/confirmada na hora/)).not.toBeNull()
    await ui.click(within(dialog()).getByRole('button', { name: 'Confirmar inscrição' }))
    expect(await screen.findByText('Inscrição confirmada em Copa Sudoeste.')).not.toBeNull()
    expect(screen.getByText('Inscrição confirmada em Copa Sudoeste.').closest('[aria-live="polite"]')).not.toBeNull()
    expect(calls.find('POST', '/events/1/entries')[0].body).toEqual({})
    expect(await screen.findByText('Inscrição confirmada')).not.toBeNull()
    await waitFor(() => expect(bar()).toBeNull())
  })

  it('inscrição paga: reserva com o Pix (cópia falha e seleciona a chave), envia o comprovante validado e fica em análise', async () => {
    const flow = stateful(detail(), null)
    const reserved = myEntry()
    const analysing = myEntry({ state: 'em_analise', can_send_receipt: false, can_cancel: false, latest_payment: myReceipt() })
    const calls = mockApi({
      'GET /events/1': () => flow.state.detail,
      'POST /events/1/entries': () => flow.set(reserved),
      'GET /entries/5': () => flow.state.entry,
      'PUT /entries/5/receipt': () => flow.set(analysing),
    })
    const ui = userEvent.setup()
    stubClipboard(() => Promise.reject(new Error('negado')))
    renderEvent()
    const enter = await screen.findByRole('button', { name: 'Inscrever-se · R$ 240' })
    // ⓘ ao lado do preço, no botão fixo.
    await ui.click(within(bar()!).getByRole('button', { name: 'Informações de pagamento' }))
    expect(screen.getByRole('dialog', { name: 'Pagamento e informações' })).not.toBeNull()
    await ui.click(within(dialog()).getByRole('button', { name: 'Fechar' }))
    await ui.click(enter)
    const sheet = screen.getByRole('dialog', { name: 'Reservar vaga' })
    expect(within(sheet).getByText('Pix do organizador')).not.toBeNull()
    expect(within(sheet).getByText(/Comprovante até/)).not.toBeNull()
    await ui.click(within(sheet).getByRole('button', { name: 'Copiar chave Pix' }))
    expect(await within(sheet).findByText('Não foi possível copiar. Selecione a chave e copie manualmente.')).not.toBeNull()
    expect(window.getSelection()?.toString()).toBe('copa.sudoeste@pix.com')
    // ⓘ do bloco Pix abre a folha de pagamento e volta à reserva ao fechar.
    await ui.click(within(sheet).getByRole('button', { name: 'Informações de pagamento' }))
    await ui.click(within(screen.getByRole('dialog', { name: 'Pagamento e informações' })).getByRole('button', { name: 'Fechar' }))
    await ui.click(within(screen.getByRole('dialog', { name: 'Reservar vaga' })).getByRole('button', { name: 'Reservar vaga' }))
    expect(await screen.findByText(/^Vaga reservada\. Envie o comprovante até/)).not.toBeNull()
    expect(await screen.findByText('Vaga reservada')).not.toBeNull()
    expect(document.querySelector('[data-slot="deadline-ring"]')).not.toBeNull()
    // Cartão S1 com "Copiar chave Pix" e "Pagamento" (ⓘ).
    const status = screen.getByRole('region', { name: 'Sua inscrição' })
    expect(within(status).getByRole('button', { name: 'Pagamento' })).not.toBeNull()
    // Enviar comprovante: tamanho e tipo validados antes do envio.
    await ui.click(within(bar()!).getByRole('button', { name: 'Enviar comprovante' }))
    const input = within(dialog()).getByLabelText(/Escolher arquivo/) as HTMLInputElement
    const big = new File(['x'], 'grande.pdf', { type: 'application/pdf' })
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 })
    fireEvent.change(input, { target: { files: [big] } })
    expect(within(dialog()).getByRole('alert').textContent).toBe('O arquivo excede o limite de 5 MiB.')
    expect((within(dialog()).getByRole('button', { name: 'Enviar para análise' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(input, { target: { files: [new File(['GIF89a'], 'pix.gif', { type: 'image/gif' })] } })
    expect(within(dialog()).getByRole('alert').textContent).toBe('Envie o comprovante como imagem (JPEG, PNG ou WebP) ou PDF.')
    const pdf = new File(['%PDF-1.4 ... %%EOF'], 'comprovante-pix.pdf', { type: 'application/pdf' })
    fireEvent.change(input, { target: { files: [pdf] } })
    expect(within(dialog()).queryByRole('alert')).toBeNull()
    expect(within(dialog()).getByText('comprovante-pix.pdf')).not.toBeNull()
    await ui.click(within(dialog()).getByRole('button', { name: 'Enviar para análise' }))
    expect(await screen.findByText('Comprovante em análise')).not.toBeNull()
    const upload = calls.find('PUT', '/entries/5/receipt')[0]
    expect(upload.body).toBeInstanceOf(FormData)
    expect(((upload.body as FormData).get('file') as File).name).toBe('comprovante-pix.pdf')
    expect(screen.getByText('Comprovante enviado. Copa Sudoeste Eventos vai analisar o pagamento.')).not.toBeNull()
    await waitFor(() => expect(bar()).toBeNull())
  })

  it('comprovante recusado: mostra o motivo e reenvia até o fim da reserva', async () => {
    const refused = myEntry({ state: 'rejeitada', latest_payment: myReceipt({ decision: 'recusado', reason_code: 'valor_diferente', reason_detail: 'faltaram R$ 40.' }) })
    const flow = stateful(withEntry(detail(), refused), refused)
    const calls = mockApi({
      'GET /events/1': () => flow.state.detail,
      'GET /entries/5': () => flow.state.entry,
      'PUT /entries/5/receipt': (call: Call) => call.body instanceof FormData
        ? flow.set(myEntry({ state: 'em_analise', can_send_receipt: false, latest_payment: myReceipt({ id: 10, file_type: 'imagem' }) }))
        : apiError(415, 'Envie o arquivo (imagem ou PDF) em multipart/form-data.'),
    })
    const ui = userEvent.setup()
    renderEvent()
    expect(await screen.findByText('Comprovante recusado')).not.toBeNull()
    expect(screen.getByText('Valor diferente: faltaram R$ 40')).not.toBeNull()
    expect(within(screen.getByRole('region', { name: 'Sua inscrição' })).queryByRole('button')).toBeNull()
    await ui.click(within(bar()!).getByRole('button', { name: 'Enviar outro' }))
    expect(within(dialog()).getByText(/Recusado: Valor diferente: faltaram R\$ 40/)).not.toBeNull()
    fireEvent.change(within(dialog()).getByLabelText(/Escolher arquivo/), { target: { files: [new File(['png'], 'novo.png', { type: 'image/png' })] } })
    await ui.click(within(dialog()).getByRole('button', { name: 'Enviar para análise' }))
    expect(await screen.findByText('Comprovante em análise')).not.toBeNull()
    expect(calls.find('PUT', '/entries/5/receipt')).toHaveLength(1)
  })

  it('erro do servidor no envio fica na folha, sem fechar', async () => {
    const reserved = myEntry()
    mockApi({
      'GET /events/1': withEntry(detail(), reserved),
      'GET /entries/5': reserved,
      'PUT /entries/5/receipt': apiError(409, 'O prazo da reserva acabou.'),
    })
    const ui = userEvent.setup()
    renderEvent()
    await ui.click(await screen.findByRole('button', { name: 'Enviar comprovante' }))
    fireEvent.change(within(dialog()).getByLabelText(/Escolher arquivo/), { target: { files: [new File(['%PDF'], 'c.pdf', { type: 'application/pdf' })] } })
    await ui.click(within(dialog()).getByRole('button', { name: 'Enviar para análise' }))
    expect((await within(dialog()).findByRole('alert')).textContent).toBe('O prazo da reserva acabou.')
  })

  it('reserva expirada: "A vaga foi liberada" e inscrição de novo, se houver vaga', async () => {
    const expired = myEntry({ state: 'expirada', can_send_receipt: false, can_cancel: false, expired_at: fromNow(-1), reserved_until: fromNow(-1) })
    mockApi({ 'GET /events/1': withEntry(detail(), expired), 'GET /entries/5': expired })
    renderEvent()
    expect(await screen.findByText('A vaga foi liberada')).not.toBeNull()
    expect(screen.getByText(/inscreva-se de novo/)).not.toBeNull()
    expect((within(bar()!).getByRole('button', { name: 'Inscrever-se · R$ 240' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('desiste da reserva com confirmação', async () => {
    const reserved = myEntry()
    const flow = stateful(withEntry(detail(), reserved), reserved)
    const calls = mockApi({
      'GET /events/1': () => flow.state.detail,
      'GET /entries/5': () => flow.state.entry,
      'DELETE /entries/5': () => { flow.state.detail = { ...flow.state.detail, my_entry: null }; return undefined },
    })
    const ui = userEvent.setup()
    renderEvent()
    await ui.click(await screen.findByRole('button', { name: 'Desistir da inscrição' }))
    expect(within(dialog()).getByText(/Se você já pagou, combine a devolução com o organizador/)).not.toBeNull()
    await ui.click(within(dialog()).getByRole('button', { name: 'Desistir' }))
    expect(await screen.findByText('Inscrição cancelada. A vaga ficou livre.')).not.toBeNull()
    expect(calls.find('DELETE', '/entries/5')[0].body).toBeUndefined()
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Sua inscrição' })).toBeNull())
    expect(within(bar()!).getByRole('button', { name: 'Inscrever-se · R$ 240' })).not.toBeNull()
  })

  describe('devolução (evento cancelado)', () => {
    const cancelled = { state: 'cancelado' as const, phase: 'cancelado' as const, registration_open: false, cancelled_at: fromNow(-30), cancel_reason: 'Chuva forte no fim de semana.', can_read_messages: true }
    const refund = myReceipt({ id: 21, kind: 'devolucao', file_url: '/api/v1/receipts/21/file', file_type: 'imagem', created_at: fromNow(-24), auto_confirm_at: fromNow(24 * 6) })
    const pending = myEntry({ state: 'devolucao_pendente', can_send_receipt: false, can_cancel: false, can_respond_refund: true, refund, latest_payment: myReceipt({ decision: 'aprovado' }) })
    const notices = page([
      { id: 2, kind: 'evento_cancelado', body: 'Chuva forte no fim de semana.', author: null, created_at: fromNow(-30) },
      { id: 1, kind: 'aviso', body: 'Chegue 30 minutos antes.', author: null, created_at: fromNow(-48) },
    ])

    it('mostra o cancelamento, os avisos, o comprovante e confirma o recebimento', async () => {
      const flow = stateful(withEntry(detail(cancelled), pending), pending)
      const calls = mockApi({
        'GET /events/1': () => flow.state.detail,
        'GET /entries/5': () => flow.state.entry,
        'GET /events/1/messages': notices,
        'POST /entries/5/refund-response': () => flow.set(myEntry({ ...pending, state: 'devolvida', can_respond_refund: false, refund: { ...refund, participant_response: 'confirmada', auto_confirm_at: null } })),
      })
      const ui = userEvent.setup()
      renderEvent()
      expect(await screen.findByText('Devolução enviada pelo organizador')).not.toBeNull()
      expect(screen.getByRole('note').textContent).toContain('Motivo: Chuva forte no fim de semana.')
      expect(screen.getByText(/Sem resposta em 7 dias, a devolução conta como recebida/)).not.toBeNull()
      expect(screen.getByRole('link', { name: 'Ver comprovante' }).getAttribute('href')).toBe('http://localhost:8000/api/v1/receipts/21/file')
      const avisos = await screen.findByRole('region', { name: 'Avisos do organizador' })
      const items = within(avisos).getAllByRole('listitem')
      expect(items[0].getAttribute('data-kind')).toBe('evento_cancelado')
      expect(within(items[0]).getByText('Evento cancelado')).not.toBeNull()
      expect(within(items[1]).getByText('Chegue 30 minutos antes.')).not.toBeNull()
      expect(bar()).toBeNull()
      await ui.click(within(screen.getByRole('region', { name: 'Sua inscrição' })).getByRole('button', { name: 'Confirmar recebimento' }))
      await ui.click(within(dialog()).getByRole('button', { name: 'Confirmar recebimento' }))
      expect(await screen.findByText('Devolução recebida')).not.toBeNull()
      expect(calls.find('POST', '/entries/5/refund-response')[0].body).toEqual({ response: 'confirmar' })
    })

    it('contesta com motivo (validado no cliente) e mostra a análise da administração', async () => {
      const flow = stateful(withEntry(detail(cancelled), pending), pending)
      const calls = mockApi({
        'GET /events/1': () => flow.state.detail,
        'GET /entries/5': () => flow.state.entry,
        'GET /events/1/messages': page([]),
        'POST /entries/5/refund-response': (call: Call) => flow.set(myEntry({
          ...pending, state: 'devolucao_contestada', can_respond_refund: false,
          refund: { ...refund, participant_response: 'contestada', contest_reason: (call.body as { reason: string }).reason },
        })),
      })
      const ui = userEvent.setup()
      renderEvent()
      expect(await screen.findByText('Nenhum aviso do organizador por enquanto. Os avisos aparecem aqui e nas suas notificações.')).not.toBeNull()
      await ui.click(await screen.findByRole('button', { name: 'Contestar' }))
      await ui.click(within(dialog()).getByRole('button', { name: 'Contestar devolução' }))
      expect(within(dialog()).getByRole('alert').textContent).toBe('Conte o que aconteceu com a devolução.')
      expect(calls.find('POST', '/entries/5/refund-response')).toHaveLength(0)
      await ui.type(within(dialog()).getByLabelText('O que aconteceu com a devolução?'), 'O valor não entrou na conta.')
      await ui.click(within(dialog()).getByRole('button', { name: 'Contestar devolução' }))
      expect(await screen.findByText('Contestação em análise pela administração')).not.toBeNull()
      expect(screen.getByText('“O valor não entrou na conta.”')).not.toBeNull()
      // O motivo já termina em ponto: o texto não acrescenta outro depois das aspas.
      expect(screen.getByText('“O valor não entrou na conta.”').closest('div')?.textContent).not.toContain('”.')
      expect(calls.find('POST', '/entries/5/refund-response')[0].body).toEqual({ response: 'contestar', reason: 'O valor não entrou na conta.' })
    })
  })

  describe('futebol: inscrição pelo time', () => {
    const society = { sport: 'futebol' as const, format: 'society' as const }
    it('escolhe entre os times elegíveis que a pessoa representa e envia o time', async () => {
      const teams = [
        { team: ferrugem, tier: null, eligible: true, reason: null, entry_id: null },
        { team: lions, tier: null, eligible: true, reason: null, entry_id: null },
        { team: { id: 14, name: 'Real Guará', initials: 'RG', crest_url: null }, tier: null, eligible: false, reason: 'em_classificacao' as const, entry_id: null },
      ]
      const flow = stateful(detail({ ...society, eligibility: { eligible: true, reason: null, message: null, tier: null, teams } }), null)
      const calls = mockApi({
        'GET /events/1': () => flow.state.detail,
        'POST /events/1/entries': () => flow.set(myEntry({ subject: { kind: 'time', team: lions, athlete: null }, my_role: 'representante' })),
        'GET /entries/5': () => flow.state.entry,
      })
      const ui = userEvent.setup()
      renderEvent()
      await ui.click(await screen.findByRole('button', { name: 'Inscrever time · R$ 240' }))
      const group = within(dialog()).getByRole('radiogroup')
      expect(within(group).getAllByRole('radio')).toHaveLength(2)
      expect(within(dialog()).queryByText('Real Guará')).toBeNull()
      await ui.click(within(dialog()).getByText('Leões do Cerrado'))
      await ui.click(within(dialog()).getByRole('button', { name: 'Reservar vaga' }))
      expect(await screen.findByText('Vaga reservada')).not.toBeNull()
      expect(calls.find('POST', '/events/1/entries')[0].body).toEqual({ team_id: 12 })
    })

    it('sem time representado leva a Meus times; fora da faixa fica desabilitado com o cadeado e o motivo', async () => {
      mockApi({ 'GET /events/1': detail({ ...society, eligibility: { eligible: false, reason: 'sem_time', message: 'Para inscrever um time, você precisa ser representante dele.', tier: null, teams: [] } }) })
      const ui = userEvent.setup()
      const { onTeams } = renderEvent()
      expect(await screen.findByText('Inscrição por time')).not.toBeNull()
      await ui.click(within(bar()!).getByRole('button', { name: 'Crie ou represente um time' }))
      expect(onTeams).toHaveBeenCalled()
      cleanup()
      mockApi({ 'GET /events/1': detail({ ...society, accepted_tiers: ['ouro'], eligibility: { eligible: false, reason: 'fora_da_faixa', message: 'Este evento aceita só Ouro.', tier: null, teams: [{ team: ferrugem, tier: 'prata', eligible: false, reason: 'fora_da_faixa', entry_id: null }] } }) })
      renderEvent()
      const blocked = await screen.findByRole('button', { name: 'Fora da faixa do evento' }) as HTMLButtonElement
      expect(blocked.disabled).toBe(true)
      expect(screen.getAllByText(/Este evento aceita só Ouro\./).length).toBeGreaterThan(0)
      expect(document.querySelector('[data-slot="event-poster"]')?.hasAttribute('data-locked')).toBe(true)
    })
  })

  it('o organizador vê o atalho para a gestão, sem botão de inscrição', async () => {
    mockApi({ 'GET /events/1': detail({ is_organizer: true, can_read_messages: true }), 'GET /events/1/messages': page([]) })
    const ui = userEvent.setup()
    const { onManage } = renderEvent()
    await ui.click(await screen.findByRole('button', { name: 'Abrir gestão' }))
    expect(onManage).toHaveBeenCalledWith(1)
    expect(bar()).toBeNull()
  })

  it('evento inexistente mostra o erro e tenta de novo', async () => {
    mockApi({ 'GET /events/1': apiError(404, 'Evento não encontrado.') })
    renderEvent()
    expect((await screen.findByRole('alert')).textContent).toContain('Evento não encontrado.')
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).not.toBeNull()
  })
})
