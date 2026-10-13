import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import * as SecureStore from 'expo-secure-store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../src/api/client'
import type { RunInput } from '../src/api/runs'
import { brandSvgs } from '../src/assets/brand-svgs'
import { MEASURE_RANGE, PREVIEW_DELAY_MS, RunEntrySheet, problemsOf } from '../src/components/run/RunEntrySheet'
import { dayLabel } from '../src/utils/calendar'
import { byLabel, enableAct, press, textOf, type } from './support/native'
import { allText, byId, callsTo, findButton, serve } from './support/review'
import { created, impact, lago, lagoRace, preview, run, sec } from './support/runs'

/*
 * Registrar corrida (K2), porta de `web/tests/run-stopwatch.test.tsx`: régua, "Outra", tempo com "vai um", ritmo, prévia com
 * espera de 300 ms, Treino | Prova do Arena, data da janela de 52 semanas, erros da API no campo certo e salvar.
 * O `request` é simulado (tests/support/review `serve`); hoje é segunda-feira, 12 de outubro de 2026, 10h (relógio falso).
 */

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/api/client', async original => ({ ...await original<typeof import('../src/api/client')>(), request: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))

const h = React.createElement
const PREVIEW = 'POST /me/runs/preview'
const SAVE = 'POST /me/runs'
const RACES = 'GET /me/run-races'
const TODAY = '2026-10-12'

beforeEach(() => {
  enableAct()
  vi.useFakeTimers({ now: new Date(2026, 9, 12, 10, 0) })
  vi.mocked(request).mockReset()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test-token')
})
afterEach(() => { vi.useRealTimers() })

async function open(routes: Record<string, unknown> = {}, props: Partial<Parameters<typeof RunEntrySheet>[0]> = {}) {
  serve(routes)
  const handlers = { onClose: vi.fn(), onSaved: vi.fn(), onFindRaces: vi.fn(), onExpired: vi.fn() }
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(h(RunEntrySheet, { initialDistance: 5, ...handlers, ...props })) })
  return { tree, ...handlers }
}
/** Deixa passar `ms` (a espera da prévia, os efeitos e as promessas encadeadas). */
const tick = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const field = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType('TextInput' as never).find(node => node.props.accessibilityLabel === label)!
const shown = (tree: ReactTestRenderer, label: string) => field(tree, label).props.value as string
/** Digita o tempo nos três campos (os dois últimos dígitos valem, como na web). */
async function setTime(tree: ReactTestRenderer, hours: number, minutes: number, seconds: number) {
  await type(tree, 'Horas', String(hours))
  await type(tree, 'Minutos', String(minutes))
  await type(tree, 'Segundos', String(seconds))
}
const pace = (tree: ReactTestRenderer) => byId(tree, 'run-pace')[0].props.children as string
const saveButton = (tree: ReactTestRenderer) => findButton(tree, 'Salvar corrida')!
const bodies = (method: string, path: string) => callsTo(method, path).map(call => call[2] as RunInput)
const pressByTestId = async (tree: ReactTestRenderer, id: string) => { await act(async () => { byId(tree, id)[0].props.onPress() }) }
const fieldFail = (name: string, message: string, status = 422) => new ApiError('Revise os campos informados.', status, [{ field: name, message }])
const ruler = (tree: ReactTestRenderer) => tree.root.findAllByType('Pressable' as never).filter(node => /^((3|5|10|21|42) km|Outra)$/.test(String(node.props.accessibilityLabel)))
const selected = (tree: ReactTestRenderer, label: string) => byLabel(tree, label).find(node => String(node.type) === 'Pressable')?.props.accessibilityState.selected as boolean

describe('K2: distância, tempo e ritmo', () => {
  it('abre na distância da placa, sem tempo: ritmo vazio, Salvar desabilitado e a dica da prévia', async () => {
    const { tree } = await open({}, { initialDistance: 10 })
    expect(ruler(tree).map(node => node.props.accessibilityLabel)).toEqual(['3 km', '5 km', '10 km', '21 km', '42 km', 'Outra'])
    expect(ruler(tree).map(node => node.props.accessibilityRole)).toEqual(Array(6).fill('radio'))
    expect(selected(tree, '10 km')).toBe(true)
    expect(selected(tree, '5 km')).toBe(false)
    expect(pace(tree)).toBe('—')
    expect(saveButton(tree).props.disabled).toBe(true)
    expect(textOf(tree)).toContain('Informe o tempo para ver o que ele muda no seu ranking.')
    expect(selected(tree, 'Treino')).toBe(true)
    expect(byLabel(tree, `Data: ${dayLabel(new Date(2026, 9, 12))}`)).toHaveLength(1)
    expect(callsTo('POST', '/me/runs/preview')).toHaveLength(0)
  })

  it('calcula o ritmo ao vivo a partir do tempo e da distância (21 e 42 km são a meia maratona e a maratona)', async () => {
    const { tree } = await open()
    await setTime(tree, 0, 25, 0)
    expect(pace(tree)).toBe('5:00/km')
    await press(tree, '10 km')
    expect(pace(tree)).toBe('2:30/km')
    await press(tree, '21 km')
    await setTime(tree, 1, 45, 0)
    expect(pace(tree)).toBe('4:59/km') // 6300 s em 21,097 km
    await press(tree, '42 km')
    await setTime(tree, 3, 0, 0)
    expect(pace(tree)).toBe('4:16/km')
    expect(byLabel(tree, 'Ritmo 4:16/km')).toHaveLength(1)
  })

  it('cada campo é ajustável para leitores de tela: aumentar e diminuir levam o "vai um" para minutos e horas', async () => {
    const { tree } = await open()
    const minutes = () => field(tree, 'Minutos')
    expect(minutes().props.accessibilityRole).toBe('adjustable')
    expect(minutes().props.accessibilityActions).toEqual([{ name: 'increment', label: 'Aumentar' }, { name: 'decrement', label: 'Diminuir' }])
    const adjust = async (label: string, actionName: 'increment' | 'decrement') => {
      await act(async () => { field(tree, label).props.onAccessibilityAction({ nativeEvent: { actionName } }) })
    }
    await adjust('Minutos', 'increment')
    await adjust('Minutos', 'increment')
    expect(shown(tree, 'Minutos')).toBe('02')
    expect(minutes().props.accessibilityValue).toEqual({ min: 0, max: 59, now: 2, text: '2 minutos' })
    // Os segundos passam de 59 para 00 e levam um minuto; para baixo, pegam emprestado.
    await type(tree, 'Segundos', '59')
    await adjust('Segundos', 'increment')
    expect([shown(tree, 'Horas'), shown(tree, 'Minutos'), shown(tree, 'Segundos')]).toEqual(['00', '03', '00'])
    await adjust('Segundos', 'decrement')
    expect([shown(tree, 'Minutos'), shown(tree, 'Segundos')]).toEqual(['02', '59'])
    // Os minutos passam de 59 para 00 e levam uma hora.
    await type(tree, 'Minutos', '59')
    await adjust('Minutos', 'increment')
    expect([shown(tree, 'Horas'), shown(tree, 'Minutos')]).toEqual(['01', '00'])
    expect(field(tree, 'Horas').props.accessibilityValue).toEqual({ min: 0, max: 24, now: 1, text: '1 hora' })
    await adjust('Minutos', 'decrement')
    expect([shown(tree, 'Horas'), shown(tree, 'Minutos')]).toEqual(['00', '59'])
    // Nunca abaixo de 0:00:00.
    await setTime(tree, 0, 0, 0)
    await adjust('Segundos', 'decrement')
    expect(shown(tree, 'Segundos')).toBe('00')
    // Outras ações de acessibilidade são ignoradas.
    await act(async () => { field(tree, 'Segundos').props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } }) })
    expect(shown(tree, 'Segundos')).toBe('00')
  })

  it('digitar troca os dois últimos dígitos e respeita 59 e as 24 h; as setas servem ao toque', async () => {
    const { tree } = await open()
    await type(tree, 'Minutos', '075')
    expect(shown(tree, 'Minutos')).toBe('59')
    await pressByTestId(tree, 'time-h-plus')
    await pressByTestId(tree, 'time-h-plus')
    expect(shown(tree, 'Horas')).toBe('02')
    await pressByTestId(tree, 'time-s-minus')
    expect([shown(tree, 'Minutos'), shown(tree, 'Segundos')]).toEqual(['58', '59']) // 2:59:00 menos um segundo
    await pressByTestId(tree, 'time-s-plus')
    expect([shown(tree, 'Minutos'), shown(tree, 'Segundos')]).toEqual(['59', '00'])
    await type(tree, 'Horas', '24')
    expect([shown(tree, 'Horas'), shown(tree, 'Minutos')]).toEqual(['24', '00']) // 24:00:00 é o máximo
    await type(tree, 'Horas', 'ab')
    expect(shown(tree, 'Horas')).toBe('00')
    expect(byId(tree, 'time-m-plus')[0].props.accessible).toBe(false)
  })

  it('"Outra" pede a distância em metros: fora de 1 a 100 km a tela avisa sem pedir a prévia; com 7 000 m fica só no histórico', async () => {
    const { tree } = await open({ [PREVIEW]: preview({ distance_m: 7000, standard_distance_km: null, duration_s: sec('40:00'), pace_s_per_km: 343, impact: impact({ kind: 'fora_do_ranking', tier_after: null }) }) })
    await press(tree, 'Outra')
    expect(selected(tree, 'Outra')).toBe(true)
    expect(field(tree, 'Distância em metros').props.keyboardType).toBe('number-pad')
    await setTime(tree, 0, 40, 0)
    await type(tree, 'Distância em metros', '500')
    await tick(PREVIEW_DELAY_MS)
    expect(textOf(tree)).toContain(MEASURE_RANGE)
    expect(field(tree, 'Distância em metros').props.accessibilityHint).toBe(MEASURE_RANGE)
    expect(saveButton(tree).props.disabled).toBe(true)
    expect(pace(tree)).toBe('—')
    expect(callsTo('POST', '/me/runs/preview')).toHaveLength(0)
    await type(tree, 'Distância em metros', '7000')
    expect(textOf(tree)).not.toContain(MEASURE_RANGE)
    expect(pace(tree)).toBe('5:43/km')
    await tick(PREVIEW_DELAY_MS)
    expect(textOf(tree)).toContain('Fica só no histórico')
    expect(bodies('POST', '/me/runs/preview')).toEqual([{ distance_m: 7000, duration_s: 2400, source: 'treino', date: TODAY }])
    // Só dígitos, no máximo seis.
    await type(tree, 'Distância em metros', '12a3456789')
    expect(field(tree, 'Distância em metros').props.value).toBe('123456')
    await type(tree, 'Distância em metros', '')
    expect(textOf(tree)).toContain('Informe a distância em metros.')
  })
})

describe('K2: prévia do servidor', () => {
  it('espera 300 ms depois da última mudança: várias mudanças seguidas viram uma prévia, a primeira marca', async () => {
    const { tree } = await open({ [PREVIEW]: preview({ pace_s_per_km: 291 }) })
    await setTime(tree, 0, 24, 0)
    await tick(PREVIEW_DELAY_MS - 1)
    await setTime(tree, 0, 24, 12)
    await tick(PREVIEW_DELAY_MS - 1)
    expect(callsTo('POST', '/me/runs/preview')).toHaveLength(0)
    expect(textOf(tree)).toContain('Calculando o efeito no seu ranking…')
    await tick(1)
    expect(bodies('POST', '/me/runs/preview')).toEqual([{ distance_m: 5000, duration_s: sec('24:12'), source: 'treino', date: TODAY }])
    expect(textOf(tree)).toContain('Primeira marca nos 5 km')
    expect(textOf(tree)).toContain('Você entra no ranking dos 5 km como Ouro.')
    // O ritmo passa a ser o do servidor quando a prévia confere com os campos.
    expect(pace(tree)).toBe('4:51/km')
    const card = byId(tree, 'run-preview')[0]
    expect(card.props.accessibilityLiveRegion).toBe('polite')
    expect(card.props.accessibilityLabel).toBe('Primeira marca nos 5 km. Você entra no ranking dos 5 km como Ouro.')
    expect(card.props.style.opacity).toBe(1)
    expect(tree.root.findAllByType('SvgXml' as never).some(node => node.props.xml === brandSvgs.ouro)).toBe(true)
    // Mudar o tempo esmaece a prévia velha até a nova chegar.
    await type(tree, 'Segundos', '30')
    expect(byId(tree, 'run-preview')[0].props.style.opacity).toBe(0.6)
    await tick(PREVIEW_DELAY_MS)
    expect(byId(tree, 'run-preview')[0].props.style.opacity).toBe(1)
  })

  it('novo melhor tempo: "−0:24", "Continua Ouro" e o tempo de antes', async () => {
    const { tree } = await open({ [PREVIEW]: preview({ duration_s: sec('23:48'), impact: impact({ kind: 'novo_melhor', previous_best_s: sec('24:12'), delta_s: -24, tier_before: 'ouro', tier_after: 'ouro' }) }) })
    await setTime(tree, 0, 23, 48)
    await tick(PREVIEW_DELAY_MS)
    expect(textOf(tree)).toContain('Novo melhor tempo · −0:24')
    expect(textOf(tree)).toContain('Continua Ouro nos 5 km. Antes: 24:12.')
  })

  it('novo melhor tempo que sobe de elo: "Sobe para Diamante" com o brasão', async () => {
    const { tree } = await open({ [PREVIEW]: preview({ duration_s: sec('21:40'), impact: impact({ kind: 'novo_melhor', previous_best_s: sec('23:48'), delta_s: -128, tier_before: 'ouro', tier_after: 'diamante', tier_up: true }) }) })
    await setTime(tree, 0, 21, 40)
    await tick(PREVIEW_DELAY_MS)
    expect(textOf(tree)).toContain('Novo melhor tempo · −2:08')
    expect(textOf(tree)).toContain('Sobe para Diamante nos 5 km. Antes: 23:48.')
    expect(tree.root.findAllByType('SvgXml' as never).some(node => node.props.xml === brandSvgs.diamante)).toBe(true)
  })

  it('sem melhora: o melhor continua e não há brasão; nunca diz "autodeclarado"', async () => {
    const { tree } = await open({ [PREVIEW]: preview({ duration_s: sec('26:00'), impact: impact({ kind: 'sem_melhora', previous_best_s: sec('24:12'), tier_before: 'ouro', tier_after: 'ouro' }) }) })
    await setTime(tree, 0, 26, 0)
    await tick(PREVIEW_DELAY_MS)
    expect(textOf(tree)).toContain('Seu melhor continua 24:12')
    expect(textOf(tree)).toContain('Esta marca fica no histórico dos 5 km.')
    expect(tree.root.findAllByType('SvgXml' as never).some(node => Object.values(brandSvgs).includes(node.props.xml) && node.props.xml === brandSvgs.ouro)).toBe(false)
    expect(allText(tree)).not.toMatch(/autodeclarad/i)
  })

  it('tempo implausível: o erro do servidor aparece sob o tempo, o campo fica inválido e Salvar desabilita', async () => {
    const message = 'Esse tempo é rápido demais para 5 km (ritmo abaixo de 2:00 por km). Confira o tempo e a distância.'
    let answer: unknown = fieldFail('duration_s', message)
    const { tree } = await open({ [PREVIEW]: () => answer })
    await setTime(tree, 0, 1, 30)
    await tick(PREVIEW_DELAY_MS)
    expect(textOf(tree)).toContain(message)
    expect(byLabel(tree, 'Minutos')[0].props.style.borderColor).toBe('#ff8a9a')
    expect(saveButton(tree).props.disabled).toBe(true)
    expect(callsTo('POST', '/me/runs')).toHaveLength(0)
    // Corrigido o tempo, o erro sai com a próxima prévia.
    answer = preview()
    await setTime(tree, 0, 24, 0)
    await tick(PREVIEW_DELAY_MS)
    expect(textOf(tree)).not.toContain(message)
    expect(saveButton(tree).props.disabled).toBe(false)
  })

  it('data recusada pelo servidor: o erro aparece sob a data e o campo fica inválido', async () => {
    const { tree } = await open({ [PREVIEW]: fieldFail('date', 'A data do treino não pode ser no futuro.') })
    await setTime(tree, 0, 24, 0)
    await tick(PREVIEW_DELAY_MS)
    expect(textOf(tree)).toContain('A data do treino não pode ser no futuro.')
    expect(saveButton(tree).props.disabled).toBe(true)
  })

  it('erro sem campo (servidor fora do ar): aviso em alerta, e Salvar continua possível para tentar de novo', async () => {
    const { tree } = await open({ [PREVIEW]: new ApiError('Serviço indisponível.', 503) })
    await setTime(tree, 0, 24, 0)
    await tick(PREVIEW_DELAY_MS)
    const alert = tree.root.findAll(node => String(node.type) === 'View' && node.props.accessibilityRole === 'alert')
    expect(alert).toHaveLength(1)
    expect(textOf(tree)).toContain('Serviço indisponível.')
    // 503 não é recusa do pedido: repetir pode dar certo.
    expect(saveButton(tree).props.disabled).toBe(false)
  })

  it('erro que não é da API vira a mensagem padrão', () => {
    expect(problemsOf(new Error('falhou'), 'Não foi possível calcular a prévia.')).toEqual({ general: 'Não foi possível calcular a prévia.', blocked: false })
    expect(problemsOf(new ApiError('Algo deu errado.', 422, [{ field: 'outro', message: 'Campo desconhecido.' }]), 'x')).toEqual({ general: 'Campo desconhecido.', blocked: true })
    expect(problemsOf(new ApiError('', 500), 'Padrão.')).toEqual({ general: 'Padrão.', blocked: false })
  })

  it('sessão expirada na prévia chama onExpired', async () => {
    const { tree, onExpired } = await open({ [PREVIEW]: new ApiError('Entre na sua conta para continuar.', 401) })
    await setTime(tree, 0, 24, 0)
    await tick(PREVIEW_DELAY_MS)
    expect(onExpired).toHaveBeenCalled()
  })
})

describe('K2: data da marca (janela de 52 semanas)', () => {
  it('o calendário vai de hoje − 364 dias até hoje, e o dia escolhido segue na prévia', async () => {
    const { tree } = await open({ [PREVIEW]: preview() })
    await press(tree, `Data: ${dayLabel(new Date(2026, 9, 12))}`)
    const day = (date: Date) => tree.root.findAllByType('Pressable' as never).find(node => node.props.accessibilityLabel === dayLabel(date))!
    expect(day(new Date(2026, 9, 12)).props.accessibilityState.disabled).toBe(false)
    expect(day(new Date(2026, 9, 13)).props.accessibilityState.disabled).toBe(true) // futuro
    expect(day(new Date(2026, 9, 1)).props.accessibilityState.disabled).toBe(false) // dias passados valem (não é a data de um evento)
    for (let month = 0; month < 12; month++) await press(tree, 'Mês anterior')
    expect(day(new Date(2025, 9, 12)).props.accessibilityState.disabled).toBe(true) // 365 dias atrás
    expect(day(new Date(2025, 9, 13)).props.accessibilityState.disabled).toBe(false) // 364 dias atrás
    expect(byLabel(tree, 'Mês anterior')[0].props.disabled).toBe(true) // não volta antes da janela
    await act(async () => { day(new Date(2025, 9, 13)).props.onPress() })
    expect(byLabel(tree, `Data: ${dayLabel(new Date(2025, 9, 13))}`)).toHaveLength(1)
    await setTime(tree, 0, 24, 0)
    await tick(PREVIEW_DELAY_MS)
    expect(bodies('POST', '/me/runs/preview')).toEqual([{ distance_m: 5000, duration_s: 1440, source: 'treino', date: '2025-10-13' }])
  })
})

describe('K2: salvar', () => {
  it('envia o treino com a data e entrega a marca salva', async () => {
    const result = created({ run: run({ duration_s: sec('24:12') }) })
    const { tree, onSaved } = await open({ [PREVIEW]: preview(), [SAVE]: result })
    await setTime(tree, 0, 24, 12)
    await tick(PREVIEW_DELAY_MS)
    await act(async () => { saveButton(tree).props.onPress() })
    await tick()
    expect(onSaved).toHaveBeenCalledWith(result)
    expect(bodies('POST', '/me/runs')).toEqual([{ distance_m: 5000, duration_s: sec('24:12'), source: 'treino', date: TODAY }])
  })

  it('mostra "Salvando…", não envia duas vezes e, no 422, leva o erro ao campo certo', async () => {
    let release: (value: unknown) => void = () => undefined
    const message = 'Esse tempo é longo demais para 5 km (ritmo acima de 15:00 por km). Confira o tempo e a distância.'
    const { tree, onSaved } = await open({ [PREVIEW]: preview(), [SAVE]: () => new Promise(resolve => { release = resolve }) })
    await setTime(tree, 0, 24, 12)
    await tick(PREVIEW_DELAY_MS)
    await act(async () => { saveButton(tree).props.onPress() })
    const saving = findButton(tree, 'Salvando…')!
    expect(saving.props.disabled).toBe(true)
    expect(saving.props.accessibilityState).toMatchObject({ busy: true })
    expect(byLabel(tree, 'Fechar')[0].props.disabled).toBe(true)
    // Segundo toque no mesmo instante: o envio em curso basta.
    await act(async () => { saving.props.onPress() })
    await act(async () => { release(fieldFail('duration_s', message)) })
    await tick()
    expect(textOf(tree)).toContain(message)
    expect(onSaved).not.toHaveBeenCalled()
    expect(callsTo('POST', '/me/runs')).toHaveLength(1)
    expect(saveButton(tree).props.disabled).toBe(true)
  })

  it('conflito (409) vira alerta no rodapé e bloqueia repetir o mesmo pedido; mudar o tempo é outro pedido', async () => {
    const { tree } = await open({ [PREVIEW]: preview(), [SAVE]: new ApiError('Você já registrou a marca desta prova.', 409) })
    await setTime(tree, 0, 24, 12)
    await tick(PREVIEW_DELAY_MS)
    await act(async () => { saveButton(tree).props.onPress() })
    await tick()
    expect(textOf(tree)).toContain('Você já registrou a marca desta prova.')
    expect(saveButton(tree).props.disabled).toBe(true)
    await type(tree, 'Segundos', '30')
    expect(textOf(tree)).not.toContain('Você já registrou a marca desta prova.')
    expect(saveButton(tree).props.disabled).toBe(false)
  })

  it('queda de conexão ao salvar deixa tentar de novo; a sessão expirada chama onExpired', async () => {
    const { tree, onExpired } = await open({ [PREVIEW]: preview(), [SAVE]: new ApiError('Serviço indisponível.', 503) })
    await setTime(tree, 0, 24, 12)
    await tick(PREVIEW_DELAY_MS)
    await act(async () => { saveButton(tree).props.onPress() })
    await tick()
    expect(textOf(tree)).toContain('Serviço indisponível.')
    expect(saveButton(tree).props.disabled).toBe(false)
    expect(onExpired).not.toHaveBeenCalled()
    serve({ [PREVIEW]: preview(), [SAVE]: new ApiError('Entre na sua conta para continuar.', 401) })
    await act(async () => { saveButton(tree).props.onPress() })
    await tick()
    expect(onExpired).toHaveBeenCalled()
  })
})

describe('K2: Prova do Arena', () => {
  const lakeOrigin = lago
  const second = lagoRace({ entry_id: 32, event_id: 10, event_name: 'Meia do Parque', distance_km: 21, date: '2026-09-20' })

  it('lista as provas de run-races, ajusta a distância, esconde a data e envia entry_id sem date', async () => {
    const result = created({ run: run({ distance_m: 10_000, standard_distance_km: 10, origin: lakeOrigin }) })
    const { tree, onSaved } = await open({
      [RACES]: { items: [lagoRace(), second] },
      [PREVIEW]: preview({ distance_m: 10_000, standard_distance_km: 10, origin: lakeOrigin }),
      [SAVE]: result,
    })
    expect(callsTo('GET', '/me/run-races')).toHaveLength(0) // só lê ao escolher a prova
    await press(tree, 'Prova do Arena')
    await tick()
    expect(selected(tree, 'Prova do Arena')).toBe(true)
    expect(byLabel(tree, 'Prova do Arena').find(node => String(node.type) === 'View')?.props.accessibilityRole).toBe('radiogroup')
    expect(tree.root.findAllByType('Pressable' as never).filter(node => node.props.accessibilityRole === 'radio' && /, \d+ km · /.test(String(node.props.accessibilityLabel))).map(node => node.props.accessibilityLabel))
      .toEqual(['Corrida do Lago, 10 km · 8 out', 'Meia do Parque, 21 km · 20 set'])
    // Na prova a data é a da prova: o campo de data sai.
    expect(byLabel(tree, `Data: ${dayLabel(new Date(2026, 9, 12))}`)).toHaveLength(0)
    expect(textOf(tree)).toContain('O dia da marca é o dia da prova.')
    await setTime(tree, 0, 52, 40)
    await tick(PREVIEW_DELAY_MS)
    expect(saveButton(tree).props.disabled).toBe(true) // sem prova escolhida: a escolha é manual, mesmo com mais de uma
    expect(textOf(tree)).toContain('Escolha a prova para ver o efeito no seu ranking.')
    expect(callsTo('POST', '/me/runs/preview')).toHaveLength(0)
    await press(tree, 'Corrida do Lago, 10 km · 8 out')
    expect(selected(tree, '10 km')).toBe(true) // a distância acompanha a prova
    expect(selected(tree, 'Corrida do Lago, 10 km · 8 out')).toBe(true)
    await tick(PREVIEW_DELAY_MS)
    expect(textOf(tree)).toContain('Primeira marca nos 10 km')
    expect(bodies('POST', '/me/runs/preview')).toEqual([{ distance_m: 10_000, duration_s: sec('52:40'), source: 'prova', entry_id: 31 }])
    await act(async () => { saveButton(tree).props.onPress() })
    await tick()
    expect(onSaved).toHaveBeenCalledWith(result)
    expect(bodies('POST', '/me/runs')).toEqual([{ distance_m: 10_000, duration_s: sec('52:40'), source: 'prova', entry_id: 31 }])
    // Outra prova: a distância vai a 21 km (meia maratona, 21 097 m).
    await press(tree, 'Meia do Parque, 21 km · 20 set')
    expect(selected(tree, '21 km')).toBe(true)
    await tick(PREVIEW_DELAY_MS)
    expect(bodies('POST', '/me/runs/preview').at(-1)).toEqual({ distance_m: 21_097, duration_s: sec('52:40'), source: 'prova', entry_id: 32 })
  })

  it('sem provas elegíveis: texto honesto, nada inventado e o caminho para as provas', async () => {
    const { tree, onFindRaces } = await open({ [RACES]: { items: [] } })
    await press(tree, 'Prova do Arena')
    await tick()
    expect(textOf(tree)).toContain('Nenhuma prova para registrar')
    expect(textOf(tree)).toContain('inscrição confirmada em uma prova de corrida das últimas 52 semanas')
    expect(byLabel(tree, 'Prova do Arena').some(node => node.props.accessibilityRole === 'radiogroup')).toBe(false)
    expect(textOf(tree)).not.toContain('O dia da marca é o dia da prova.')
    await setTime(tree, 0, 52, 40)
    expect(saveButton(tree).props.disabled).toBe(true)
    await press(tree, 'Ver provas')
    expect(onFindRaces).toHaveBeenCalledTimes(1)
  })

  it('enquanto lê as provas, diz que está carregando e não afirma que não há prova', async () => {
    let release: (value: unknown) => void = () => undefined
    const { tree } = await open({ [RACES]: () => new Promise(resolve => { release = resolve }) })
    await press(tree, 'Prova do Arena')
    expect(textOf(tree)).toContain('Carregando suas provas…')
    expect(textOf(tree)).not.toContain('Nenhuma prova para registrar')
    await act(async () => { release({ items: [lagoRace()] }) })
    await tick()
    expect(textOf(tree)).not.toContain('Carregando suas provas…')
    expect(byLabel(tree, 'Corrida do Lago, 10 km · 8 out')).toHaveLength(1)
  })

  it('erro ao ler as provas: aviso, tentar de novo e a data de volta em Treino', async () => {
    let answer: unknown = new ApiError('Serviço indisponível.', 503)
    const { tree } = await open({ [RACES]: () => answer })
    await press(tree, 'Prova do Arena')
    await tick()
    expect(textOf(tree)).toContain('Serviço indisponível.')
    expect(textOf(tree)).not.toContain('Nenhuma prova para registrar') // sem leitura, nada de "sem prova"
    answer = { items: [lagoRace()] }
    await press(tree, 'Tentar novamente')
    await tick()
    expect(textOf(tree)).not.toContain('Serviço indisponível.')
    expect(byLabel(tree, 'Corrida do Lago, 10 km · 8 out')).toHaveLength(1)
    await press(tree, 'Treino')
    expect(byLabel(tree, `Data: ${dayLabel(new Date(2026, 9, 12))}`)).toHaveLength(1)
  })

  it('a prova recusada por distância mostra o erro no campo da distância; a recusa da inscrição, no da prova', async () => {
    const distance = 'A distância informada não corresponde aos 10 km desta prova.'
    let answer: unknown = fieldFail('distance_m', distance)
    const { tree } = await open({ [RACES]: { items: [lagoRace()] }, [PREVIEW]: () => answer })
    await press(tree, 'Prova do Arena')
    await tick()
    await press(tree, 'Corrida do Lago, 10 km · 8 out')
    await press(tree, '5 km')
    await setTime(tree, 0, 25, 0)
    await tick(PREVIEW_DELAY_MS)
    expect(textOf(tree)).toContain(distance)
    expect(bodies('POST', '/me/runs/preview').at(-1)).toMatchObject({ distance_m: 5000, entry_id: 31 })
    answer = fieldFail('entry_id', 'Escolha a prova do Arena.')
    await type(tree, 'Segundos', '10')
    await tick(PREVIEW_DELAY_MS)
    expect(textOf(tree)).toContain('Escolha a prova do Arena.')
    expect(saveButton(tree).props.disabled).toBe(true)
  })
})

describe('K2: saída', () => {
  it('Fechar e o botão voltar do Android saem sem gravar', async () => {
    const { tree, onClose } = await open()
    await press(tree, 'Fechar')
    expect(onClose).toHaveBeenCalledTimes(1)
    await act(async () => { tree.root.findByType('Modal' as never).props.onRequestClose() })
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(callsTo('POST', '/me/runs')).toHaveLength(0)
    expect(vi.mocked(request).mock.calls).toHaveLength(0)
  })

  it('durante o envio, o botão voltar do Android não fecha', async () => {
    const { tree, onClose } = await open({ [PREVIEW]: preview(), [SAVE]: () => new Promise(() => undefined) })
    await setTime(tree, 0, 24, 12)
    await tick(PREVIEW_DELAY_MS)
    await act(async () => { saveButton(tree).props.onPress() })
    await act(async () => { tree.root.findByType('Modal' as never).props.onRequestClose() })
    expect(onClose).not.toHaveBeenCalled()
  })
})
