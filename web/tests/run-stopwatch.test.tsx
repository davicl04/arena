import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RunInput } from '../src/api/runs'
import { RunStopwatchDialog } from '../src/components/play/RunStopwatchDialog'
import { toDateKey } from '../src/utils/dateKey'
import { apiError, mockApi, reply } from './teams-fixtures'
import { created, impact, lagoRace, preview, run, sec } from './run-fixtures'

/*
 * Registrar corrida (K2), etapa 5: distância, tempo, ritmo, Treino | Prova do Arena, data e a prévia do servidor.
 * `fetch` simulado (tests/teams-fixtures): cada chamada fica registrada com método, caminho e corpo.
 */

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const PREVIEW = 'POST /me/runs/preview'
const SAVE = 'POST /me/runs'
const today = () => toDateKey(new Date())
type Routes = Parameters<typeof mockApi>[0]

function setup(routes: Routes = {}, props: Partial<Parameters<typeof RunStopwatchDialog>[0]> = {}) {
  const api = mockApi(routes)
  const handlers = { onClose: vi.fn(), onSaved: vi.fn(), onExpired: vi.fn(), onFindRaces: vi.fn() }
  render(<RunStopwatchDialog initialDistance={5} {...handlers} {...props} />)
  return { api, ...handlers, ui: userEvent.setup() }
}
const field = (name: string) => screen.getByRole('spinbutton', { name }) as HTMLInputElement
const time = (h: number, m: number, s: number) => {
  fireEvent.change(field('Horas'), { target: { value: String(h) } })
  fireEvent.change(field('Minutos'), { target: { value: String(m) } })
  fireEvent.change(field('Segundos'), { target: { value: String(s) } })
}
/** Espera o foco inicial do diálogo (Base UI) assentar antes de mover o foco à mão. */
const settled = () => waitFor(() => expect(document.activeElement).toBe(screen.getByRole('dialog', { name: 'Registrar corrida' })))
const saveButton = () => screen.getByRole('button', { name: 'Salvar corrida' }) as HTMLButtonElement
const pace = () => screen.getByTestId('run-pace').textContent
const bodies = (api: ReturnType<typeof mockApi>, key: string) => {
  const [method, path] = key.split(' ')
  return api.find(method, path).map(call => call.body as RunInput)
}
const fieldsError = (field: string, message: string) => reply(422, { detail: 'Revise os campos informados.', fields: [{ field, message }] })

describe('K2: distância, tempo e ritmo', () => {
  it('abre na distância da placa, sem tempo: ritmo vazio, Salvar desabilitado e a dica da prévia', () => {
    setup({}, { initialDistance: 10 })
    const dialog = screen.getByRole('dialog', { name: 'Registrar corrida' })
    expect(within(dialog).getByRole('button', { name: '10 km' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(dialog).getByRole('button', { name: '5 km' }).getAttribute('aria-pressed')).toBe('false')
    expect(within(dialog).getAllByRole('button').filter(item => /^(3|5|10|21|42) km$|^Outra$/.test(item.textContent ?? '')).map(item => item.textContent))
      .toEqual(['3 km', '5 km', '10 km', '21 km', '42 km', 'Outra'])
    expect(pace()).toBe('—')
    expect(saveButton().disabled).toBe(true)
    expect(screen.getByRole('status').textContent).toContain('Informe o tempo para ver o que ele muda no seu ranking.')
    expect(within(dialog).getByRole('button', { name: 'Treino' }).getAttribute('aria-pressed')).toBe('true')
    // Data de hoje, de 52 semanas atrás até hoje (o Date Picker do shadcn).
    expect(within(dialog).getByRole('button', { name: /^Data: / })).not.toBeNull()
  })

  it('calcula o ritmo ao vivo a partir do tempo e da distância (21 km é a meia maratona)', () => {
    setup()
    time(0, 25, 0)
    expect(pace()).toBe('5:00/km')
    fireEvent.click(screen.getByRole('button', { name: '10 km' }))
    expect(pace()).toBe('2:30/km')
    fireEvent.click(screen.getByRole('button', { name: '21 km' }))
    time(1, 45, 0)
    expect(pace()).toBe('4:59/km') // 6300 s em 21,097 km
    fireEvent.click(screen.getByRole('button', { name: '42 km' }))
    time(3, 0, 0)
    expect(pace()).toBe('4:16/km')
  })

  it('o teclado muda cada campo: setas somam e tiram uma unidade (com "vai um"), PageUp e PageDown dez', async () => {
    const { ui } = setup()
    await settled()
    const minutes = field('Minutos')
    minutes.focus()
    await ui.keyboard('{ArrowUp}{ArrowUp}')
    expect(minutes.value).toBe('02')
    expect(minutes.getAttribute('aria-valuenow')).toBe('2')
    expect(minutes.getAttribute('aria-valuetext')).toBe('2 minutos')
    await ui.keyboard('{PageUp}')
    expect(minutes.value).toBe('12')
    await ui.keyboard('{ArrowDown}')
    expect(minutes.value).toBe('11')
    // Os segundos passam de 59 para 00 e levam um minuto.
    const seconds = field('Segundos')
    seconds.focus()
    await ui.keyboard('{PageUp}{PageUp}{PageUp}{PageUp}{PageUp}{PageUp}')
    expect(seconds.value).toBe('00')
    expect(minutes.value).toBe('12')
    await ui.keyboard('{ArrowDown}')
    expect(seconds.value).toBe('59')
    expect(minutes.value).toBe('11')
    // Nunca abaixo de 0:00:00.
    time(0, 0, 0)
    seconds.focus()
    await ui.keyboard('{ArrowDown}')
    expect(seconds.value).toBe('00')
    expect(field('Horas').getAttribute('aria-valuetext')).toBe('0 horas')
  })

  it('digitar troca os dois últimos dígitos e respeita 59 e as 24 h; os botões de seta servem ao toque', async () => {
    const { ui } = setup()
    await ui.type(field('Minutos'), '75')
    expect(field('Minutos').value).toBe('59')
    await ui.click(screen.getByRole('button', { name: 'Mais horas' }))
    await ui.click(screen.getByRole('button', { name: 'Mais horas' }))
    expect(field('Horas').value).toBe('02')
    await ui.click(screen.getByRole('button', { name: 'Menos segundos' }))
    expect(field('Segundos').value).toBe('59') // 2:59:00 menos um segundo
    expect(field('Minutos').value).toBe('58')
    await ui.click(screen.getByRole('button', { name: 'Mais segundos' }))
    expect(field('Segundos').value).toBe('00')
    expect(field('Minutos').value).toBe('59')
    fireEvent.change(field('Horas'), { target: { value: '24' } })
    expect(field('Horas').value).toBe('24')
    expect(field('Minutos').value).toBe('00') // 24:00:00 é o máximo
    fireEvent.change(field('Horas'), { target: { value: 'ab' } })
    expect(field('Horas').value).toBe('00')
  })

  it('"Outra" pede a distância em metros: o ritmo usa os metros e fora de 1 a 100 km a tela avisa sem pedir a prévia', async () => {
    const { api, ui } = setup({ [PREVIEW]: preview({ distance_m: 7000, standard_distance_km: null, duration_s: sec('40:00'), pace_s_per_km: 343, impact: impact({ kind: 'fora_do_ranking', tier_after: null }) }) })
    await ui.click(screen.getByRole('button', { name: 'Outra' }))
    const meters = screen.getByLabelText('Distância em metros') as HTMLInputElement
    time(0, 40, 0)
    await ui.type(meters, '500')
    expect(await screen.findByText('A distância deve ficar entre 1 km e 100 km.')).not.toBeNull()
    expect(meters.getAttribute('aria-invalid')).toBe('true')
    expect(saveButton().disabled).toBe(true)
    expect(pace()).toBe('—')
    await ui.clear(meters)
    await ui.type(meters, '7000')
    expect(screen.queryByText('A distância deve ficar entre 1 km e 100 km.')).toBeNull()
    expect(pace()).toBe('5:43/km')
    expect(await screen.findByText('Fica só no histórico')).not.toBeNull()
    expect(bodies(api, PREVIEW)).toEqual([{ distance_m: 7000, duration_s: 2400, source: 'treino', date: today() }])
    // Só dígitos, no máximo 6.
    await ui.clear(meters)
    await ui.type(meters, '12a3456789')
    expect(meters.value).toBe('123456')
  })
})

describe('K2: prévia do servidor', () => {
  it('pede a prévia depois da espera, uma vez para várias mudanças seguidas, e mostra a primeira marca', async () => {
    const { api } = setup({ [PREVIEW]: preview() })
    time(0, 24, 0)
    time(0, 24, 10)
    time(0, 24, 12)
    expect(await screen.findByText('Primeira marca nos 5 km')).not.toBeNull()
    expect(screen.getByText('Você entra no ranking dos 5 km como Ouro.')).not.toBeNull()
    expect(bodies(api, PREVIEW)).toEqual([{ distance_m: 5000, duration_s: sec('24:12'), source: 'treino', date: today() }])
    // O ritmo vem a ser o do servidor quando a prévia confere com os campos.
    expect(pace()).toBe('4:50/km')
    // A região é discreta: um `status` só, que fala quando o texto muda.
    expect(screen.getByRole('status').getAttribute('aria-atomic')).toBe('true')
    expect(document.querySelector('[data-slot="run-preview"]')?.hasAttribute('data-stale')).toBe(false)
  })

  it('novo melhor tempo: "−0:24", "Continua Ouro" e o tempo de antes', async () => {
    setup({ [PREVIEW]: preview({ duration_s: sec('23:48'), impact: impact({ kind: 'novo_melhor', previous_best_s: sec('24:12'), delta_s: -24, tier_before: 'ouro', tier_after: 'ouro' }) }) })
    time(0, 23, 48)
    expect(await screen.findByText('Novo melhor tempo · −0:24')).not.toBeNull()
    expect(screen.getByText('Continua Ouro nos 5 km. Antes: 24:12.')).not.toBeNull()
  })

  it('novo melhor tempo que sobe de elo: "Sobe para Diamante" com o brasão', async () => {
    setup({ [PREVIEW]: preview({ duration_s: sec('21:40'), impact: impact({ kind: 'novo_melhor', previous_best_s: sec('23:48'), delta_s: -128, tier_before: 'ouro', tier_after: 'diamante', tier_up: true }) }) })
    time(0, 21, 40)
    expect(await screen.findByText('Novo melhor tempo · −2:08')).not.toBeNull()
    expect(screen.getByText('Sobe para Diamante nos 5 km. Antes: 23:48.')).not.toBeNull()
    expect(document.querySelector('[data-slot="run-preview"] [data-slot="tier-emblem"]')?.getAttribute('src')).toBe('/images/brand/diamante.svg')
  })

  it('sem melhora e fora do ranking: o melhor continua e a marca fica no histórico', async () => {
    const routes: Routes = { [PREVIEW]: preview({ duration_s: sec('26:00'), impact: impact({ kind: 'sem_melhora', previous_best_s: sec('24:12'), tier_before: 'ouro', tier_after: 'ouro' }) }) }
    const { ui } = setup(routes)
    time(0, 26, 0)
    expect(await screen.findByText('Seu melhor continua 24:12')).not.toBeNull()
    expect(screen.getByText('Esta marca fica no histórico dos 5 km.')).not.toBeNull()
    expect(document.querySelector('[data-slot="run-preview"] [data-slot="tier-emblem"]')).toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Outra' }))
    expect(screen.getByText('Informe a distância em metros.')).not.toBeNull()
  })

  it('a prévia nunca diz "autodeclarado"', async () => {
    setup({ [PREVIEW]: preview() })
    time(0, 24, 12)
    await screen.findByText('Primeira marca nos 5 km')
    expect(document.body.textContent).not.toMatch(/autodeclarad/i)
  })

  it('tempo implausível: o erro do servidor aparece sob o tempo, o campo fica inválido e Salvar desabilita', async () => {
    const message = 'Esse tempo é rápido demais para 5 km (ritmo abaixo de 2:00 por km). Confira o tempo e a distância.'
    const { api } = setup({ [PREVIEW]: fieldsError('duration_s', message) })
    time(0, 1, 30)
    expect(await screen.findByText(message)).not.toBeNull()
    const group = screen.getByRole('group', { name: 'Tempo da corrida' })
    expect(group.getAttribute('aria-describedby')).toBe(screen.getByText(message).id)
    expect(field('Minutos').getAttribute('aria-invalid')).toBe('true')
    expect(saveButton().disabled).toBe(true)
    expect(api.find('POST', '/me/runs')).toHaveLength(0)
    // Corrigido o tempo, o erro sai com a próxima prévia.
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify(preview()), { status: 200 }))
    time(0, 24, 0)
    await waitFor(() => expect(screen.queryByText(message)).toBeNull())
    expect(saveButton().disabled).toBe(false)
  })

  it('data recusada (por exemplo, no futuro): o erro aparece sob a data', async () => {
    setup({ [PREVIEW]: fieldsError('date', 'A data do treino não pode ser no futuro.') })
    time(0, 24, 0)
    const message = await screen.findByText('A data do treino não pode ser no futuro.')
    expect(screen.getByRole('button', { name: /^Data: / }).getAttribute('aria-describedby')).toBe(message.id)
    expect(screen.getByRole('button', { name: /^Data: / }).getAttribute('aria-invalid')).toBe('true')
    expect(saveButton().disabled).toBe(true)
  })

  it('erro sem campo (conexão ou servidor): aviso em alerta, e Salvar continua possível para tentar de novo', async () => {
    setup({ [PREVIEW]: apiError(503, 'Serviço indisponível.') })
    time(0, 24, 0)
    expect((await screen.findByRole('alert')).textContent).toBe('Serviço indisponível.')
    // 503 não é recusa do pedido: repetir pode dar certo.
    expect(saveButton().disabled).toBe(false)
  })

  it('sessão expirada na prévia chama onExpired', async () => {
    const { onExpired } = setup({ [PREVIEW]: apiError(401, 'Entre na sua conta para continuar.') })
    time(0, 24, 0)
    await waitFor(() => expect(onExpired).toHaveBeenCalled())
  })
})

describe('K2: salvar', () => {
  it('envia o treino com a data escolhida e entrega a marca salva', async () => {
    const result = created({ run: run({ duration_s: sec('24:12') }) })
    const { api, ui, onSaved } = setup({ [PREVIEW]: preview(), [SAVE]: reply(201, result) })
    time(0, 24, 12)
    await screen.findByText('Primeira marca nos 5 km')
    await ui.click(saveButton())
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(result))
    expect(bodies(api, SAVE)).toEqual([{ distance_m: 5000, duration_s: sec('24:12'), source: 'treino', date: today() }])
  })

  it('mostra "Salvando…", não envia duas vezes e, no 422, leva o erro ao campo certo', async () => {
    let release: (value: unknown) => void = () => {}
    const message = 'Esse tempo é longo demais para 5 km (ritmo acima de 15:00 por km). Confira o tempo e a distância.'
    const { api, ui, onSaved } = setup({
      [PREVIEW]: preview(),
      [SAVE]: () => new Promise(resolve => { release = resolve }),
    })
    time(0, 24, 12)
    await screen.findByText('Primeira marca nos 5 km')
    await ui.click(saveButton())
    expect(screen.getByRole('button', { name: 'Salvando…' })).toHaveProperty('disabled', true)
    await ui.click(screen.getByRole('button', { name: 'Salvando…' }))
    release(fieldsError('duration_s', message))
    expect(await screen.findByText(message)).not.toBeNull()
    expect(onSaved).not.toHaveBeenCalled()
    expect(api.find('POST', '/me/runs')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Salvar corrida' })).toHaveProperty('disabled', true)
  })

  it('conflito (409) vira alerta no rodapé e bloqueia repetir o mesmo pedido', async () => {
    const { ui } = setup({ [PREVIEW]: preview(), [SAVE]: apiError(409, 'Você já registrou a marca desta prova.') })
    time(0, 24, 12)
    await screen.findByText('Primeira marca nos 5 km')
    await ui.click(saveButton())
    expect((await screen.findByRole('alert')).textContent).toBe('Você já registrou a marca desta prova.')
    expect(saveButton().disabled).toBe(true)
    // Mudar o tempo é outro pedido: Salvar volta.
    time(0, 24, 30)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('queda de conexão ao salvar deixa tentar de novo', async () => {
    const { ui } = setup({ [PREVIEW]: preview(), [SAVE]: apiError(503, 'Serviço indisponível.') })
    time(0, 24, 12)
    await screen.findByText('Primeira marca nos 5 km')
    await ui.click(saveButton())
    expect((await screen.findByRole('alert')).textContent).toBe('Serviço indisponível.')
    expect(saveButton().disabled).toBe(false)
  })
})

describe('K2: Prova do Arena', () => {
  it('lista as provas de run-races, ajusta a distância, esconde a data e envia entry_id sem date', async () => {
    const result = created({ run: run({ distance_m: 10_000, standard_distance_km: 10, origin: { source: 'prova', label: 'Corrida do Lago', event_id: 9 } }) })
    const { api, ui, onSaved } = setup({
      'GET /me/run-races': { items: [lagoRace(), lagoRace({ entry_id: 32, event_id: 10, event_name: 'Meia do Parque', distance_km: 21, date: '2026-09-20' })] },
      [PREVIEW]: preview({ distance_m: 10_000, standard_distance_km: 10, origin: { source: 'prova', label: 'Corrida do Lago', event_id: 9 } }),
      [SAVE]: reply(201, result),
    })
    await ui.click(screen.getByRole('button', { name: 'Prova do Arena' }))
    const races = await screen.findByRole('group', { name: 'Prova do Arena' })
    expect(within(races).getAllByRole('button').map(item => item.textContent)).toEqual(['Corrida do Lago10 km · 8 out', 'Meia do Parque21 km · 20 set'])
    // Na prova a data é a da prova: o seletor de data sai.
    expect(screen.queryByRole('button', { name: /^Data: / })).toBeNull()
    expect(screen.getByText('O dia da marca é o dia da prova.')).not.toBeNull()
    time(0, 52, 40)
    expect(saveButton().disabled).toBe(true) // sem prova escolhida
    expect(screen.getByText('Escolha a prova para ver o efeito no seu ranking.')).not.toBeNull()
    expect(api.find('POST', '/me/runs/preview')).toHaveLength(0)
    await ui.click(within(races).getByRole('button', { name: /Corrida do Lago/ }))
    expect(screen.getByRole('button', { name: '10 km' }).getAttribute('aria-pressed')).toBe('true')
    expect(await screen.findByText('Primeira marca nos 10 km')).not.toBeNull()
    expect(bodies(api, PREVIEW)).toEqual([{ distance_m: 10_000, duration_s: sec('52:40'), source: 'prova', entry_id: 31 }])
    await ui.click(saveButton())
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(result))
    expect(bodies(api, SAVE)).toEqual([{ distance_m: 10_000, duration_s: sec('52:40'), source: 'prova', entry_id: 31 }])
  })

  it('sem provas elegíveis: texto honesto, nada inventado e o caminho para as provas', async () => {
    const { ui, onFindRaces } = setup({ 'GET /me/run-races': { items: [] } })
    await ui.click(screen.getByRole('button', { name: 'Prova do Arena' }))
    expect(await screen.findByText('Nenhuma prova para registrar')).not.toBeNull()
    expect(screen.getByText(/inscrição confirmada em uma prova de corrida das últimas 52 semanas/)).not.toBeNull()
    expect(screen.queryByRole('group', { name: 'Prova do Arena' })).toBeNull()
    time(0, 52, 40)
    expect(saveButton().disabled).toBe(true)
    await ui.click(screen.getByRole('button', { name: 'Ver provas' }))
    expect(onFindRaces).toHaveBeenCalled()
  })

  it('erro ao ler as provas oferece tentar de novo; voltar a Treino traz a data de volta', async () => {
    const routes = { 'GET /me/run-races': apiError(503, 'Serviço indisponível.') }
    const { ui } = setup(routes)
    await ui.click(screen.getByRole('button', { name: 'Prova do Arena' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Serviço indisponível.')
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ items: [lagoRace()] }), { status: 200 }))
    await ui.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByRole('group', { name: 'Prova do Arena' })).not.toBeNull()
    await ui.click(screen.getByRole('button', { name: 'Treino' }))
    expect(screen.getByRole('button', { name: /^Data: / })).not.toBeNull()
  })

  it('a prova recusada por distância mostra o erro no campo da distância', async () => {
    const message = 'A distância informada não corresponde aos 10 km desta prova.'
    const { ui } = setup({ 'GET /me/run-races': { items: [lagoRace()] }, [PREVIEW]: fieldsError('distance_m', message) })
    await ui.click(screen.getByRole('button', { name: 'Prova do Arena' }))
    await ui.click(await screen.findByRole('button', { name: /Corrida do Lago/ }))
    await ui.click(screen.getByRole('button', { name: '5 km' }))
    time(0, 25, 0)
    expect(await screen.findByText(message)).not.toBeNull()
    expect(screen.getByRole('group', { name: 'Distância' }).getAttribute('aria-describedby')).toBe(screen.getByText(message).id)
  })
})

describe('K2: teclado e saída', () => {
  it('Esc fecha o diálogo e o botão Fechar também; o foco começa no diálogo', async () => {
    const { ui, onClose } = setup()
    const dialog = screen.getByRole('dialog', { name: 'Registrar corrida' })
    await waitFor(() => expect(document.activeElement).toBe(dialog))
    await ui.keyboard('{Escape}')
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    await ui.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('durante o salvamento "Fechar" e Esc ficam parados, para não perder a resposta; depois voltam', async () => {
    let release: (value: unknown) => void = () => {}
    const { ui, onClose, onSaved } = setup({
      [PREVIEW]: preview(),
      [SAVE]: () => new Promise(resolve => { release = resolve }),
    })
    time(0, 24, 12)
    await screen.findByText('Primeira marca nos 5 km')
    expect((screen.getByRole('button', { name: 'Fechar' }) as HTMLButtonElement).disabled).toBe(false)
    await ui.click(saveButton())
    const close = screen.getByRole('button', { name: 'Fechar' }) as HTMLButtonElement
    expect(close.disabled).toBe(true)
    await ui.click(close)
    await ui.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    release(apiError(503, 'Serviço indisponível.'))
    expect((await screen.findByRole('alert')).textContent).toBe('Serviço indisponível.')
    expect(onSaved).not.toHaveBeenCalled()
    await waitFor(() => expect((screen.getByRole('button', { name: 'Fechar' }) as HTMLButtonElement).disabled).toBe(false))
    await ui.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a régua anda com as setas do teclado e Enter escolhe a distância', async () => {
    const { ui } = setup()
    await settled()
    screen.getByRole('button', { name: '5 km' }).focus()
    await ui.keyboard('{ArrowRight}')
    expect(document.activeElement?.textContent).toBe('10 km')
    await ui.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: '10 km' }).getAttribute('aria-pressed')).toBe('true')
  })
})
