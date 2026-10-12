import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CalendarGrid, DateField } from '../src/components/arena/DateField'
import { completeTime, formatTimeInput, parseTime, stepTime, TIME_ERROR, TimeField } from '../src/components/arena/TimeField'
import { addMonths, dayAllowed, dayLabel, initialMonth, monthTitle, monthWeeks } from '../src/utils/calendar'
import { combineDateTime, fromDateKey, splitDateTime, startOfToday, toDateKey } from '../src/utils/dateKey'
import { byLabel, enableAct, press, textOf, type } from './support/native'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())

const h = React.createElement
/** "Hoje" dos testes: segunda-feira, 12 de outubro de 2026. */
const NOW = new Date(2026, 9, 12, 10, 30)

async function render(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(element) })
  return tree
}
const dayButton = (tree: ReactTestRenderer, year: number, month: number, day: number) =>
  tree.root.findAllByType('Pressable' as never).find(entry => entry.props.accessibilityLabel === dayLabel(new Date(year, month, day)))
const pressDay = async (tree: ReactTestRenderer, year: number, month: number, day: number) => {
  const target = dayButton(tree, year, month, day)
  expect(target, `dia ${day}/${month + 1}/${year}`).toBeTruthy()
  await act(async () => { target!.props.onPress() })
}
const pressable = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType('Pressable' as never).find(entry => entry.props.accessibilityLabel === label)

beforeEach(() => { enableAct() })

describe('chaves de dia e hora (utils/dateKey)', () => {
  it('converte o dia local em chave e de volta, recusando datas que não existem', () => {
    expect(toDateKey(new Date(2026, 9, 5))).toBe('2026-10-05')
    expect(fromDateKey('2026-10-05')?.getDate()).toBe(5)
    for (const invalid of ['2026-02-31', '2026-13-01', '26-10-05', '', null, undefined]) expect(fromDateKey(invalid)).toBeUndefined()
    expect(toDateKey(startOfToday(NOW))).toBe('2026-10-12')
    expect(startOfToday(NOW).getHours()).toBe(0)
  })

  it('combina dia e hora num instante ISO e separa de volta no fuso local', () => {
    const iso = combineDateTime('2026-11-15', '09:30')
    expect(iso).toBe(new Date(2026, 10, 15, 9, 30).toISOString())
    expect(splitDateTime(iso)).toEqual({ date: '2026-11-15', time: '09:30' })
    expect(combineDateTime('2026-11-15', '24:00')).toBeNull()
    expect(combineDateTime('2026-11-15', '9:30')).toBeNull()
    expect(combineDateTime('', '09:30')).toBeNull()
    expect(splitDateTime('não é data')).toBeNull()
    expect(splitDateTime(null)).toBeNull()
  })
})

describe('calendário (utils/calendar)', () => {
  it('monta as semanas do mês com o domingo primeiro e células vazias nas pontas', () => {
    const weeks = monthWeeks({ year: 2026, month: 9 })
    expect(weeks).toHaveLength(5)
    expect(weeks[0]).toEqual([null, null, null, null, 1, 2, 3])
    expect(weeks[4]).toEqual([25, 26, 27, 28, 29, 30, 31])
    expect(weeks.every(week => week.length === 7)).toBe(true)
    expect(monthWeeks({ year: 2026, month: 1 }).flat().filter(Boolean)).toHaveLength(28)
  })

  it('navega entre meses virando o ano e escreve o título em português', () => {
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 })
    expect(addMonths({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 })
    expect(addMonths({ year: 2026, month: 9 }, 14)).toEqual({ year: 2027, month: 11 })
    expect(monthTitle({ year: 2026, month: 9 })).toBe('outubro de 2026')
    expect(dayLabel(new Date(2026, 9, 12))).toBe('segunda-feira, 12 de outubro de 2026')
  })

  it('limita os dias entre o mínimo e o máximo, inclusive, e abre no mês do valor ou do mínimo', () => {
    expect(dayAllowed('2026-10-11', '2026-10-12')).toBe(false)
    expect(dayAllowed('2026-10-12', '2026-10-12', '2026-10-20')).toBe(true)
    expect(dayAllowed('2026-10-21', '2026-10-12', '2026-10-20')).toBe(false)
    expect(dayAllowed('2030-01-01')).toBe(true)
    expect(initialMonth('2026-12-25', '2026-10-12', NOW)).toEqual({ year: 2026, month: 11 })
    expect(initialMonth('', '2026-11-03', NOW)).toEqual({ year: 2026, month: 10 })
    expect(initialMonth('', undefined, NOW)).toEqual({ year: 2026, month: 9 })
  })
})

describe('DateField', () => {
  it('mostra "não escolhida", abre o calendário e desabilita os dias passados', async () => {
    const onChange = vi.fn()
    const tree = await render(h(DateField, { value: '', onChange, label: 'Data do evento', now: NOW }))
    expect(byLabel(tree, 'Data do evento: não escolhida')).toHaveLength(1)
    expect(textOf(tree)).toContain('Escolher a data')
    expect(byLabel(tree, 'outubro de 2026')).toHaveLength(0)
    await press(tree, 'Data do evento: não escolhida')
    expect(textOf(tree)).toContain('outubro de 2026')
    expect(dayButton(tree, 2026, 9, 11)!.props.accessibilityState).toMatchObject({ disabled: true })
    expect(dayButton(tree, 2026, 9, 1)!.props.accessibilityState).toMatchObject({ disabled: true })
    expect(dayButton(tree, 2026, 9, 12)!.props.accessibilityState).toMatchObject({ disabled: false })
    expect(dayButton(tree, 2026, 9, 31)!.props.accessibilityState).toMatchObject({ disabled: false })
    // Um dia passado não dispara a escolha, mesmo que o toque chegue.
    expect(dayButton(tree, 2026, 9, 11)!.props.disabled).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('escolher um dia entrega a chave "AAAA-MM-DD" e fecha a folha', async () => {
    const onChange = vi.fn()
    const tree = await render(h(DateField, { value: '', onChange, label: 'Data do evento', now: NOW }))
    await press(tree, 'Data do evento: não escolhida')
    await pressDay(tree, 2026, 9, 25)
    expect(onChange).toHaveBeenCalledWith('2026-10-25')
    expect(textOf(tree)).not.toContain('outubro de 2026')
  })

  it('mostra o dia escolhido por extenso para leitores de tela e abre no mês dele', async () => {
    const tree = await render(h(DateField, { value: '2026-12-25', onChange: vi.fn(), label: 'Fim das inscrições', now: NOW }))
    expect(byLabel(tree, 'Fim das inscrições: sexta-feira, 25 de dezembro de 2026')).toHaveLength(1)
    expect(textOf(tree)).toContain('sex, 25 dez')
    await press(tree, 'Fim das inscrições: sexta-feira, 25 de dezembro de 2026')
    expect(textOf(tree)).toContain('dezembro de 2026')
    expect(dayButton(tree, 2026, 11, 25)!.props.accessibilityState).toMatchObject({ selected: true })
    expect(dayButton(tree, 2026, 11, 24)!.props.accessibilityState).toMatchObject({ selected: false })
  })

  it('troca de mês nos dois sentidos e não deixa voltar antes do mês de hoje', async () => {
    const tree = await render(h(DateField, { value: '', onChange: vi.fn(), label: 'Data', now: NOW }))
    await press(tree, 'Data: não escolhida')
    expect(pressable(tree, 'Mês anterior')!.props.accessibilityState).toMatchObject({ disabled: true })
    await press(tree, 'Próximo mês')
    expect(textOf(tree)).toContain('novembro de 2026')
    expect(pressable(tree, 'Mês anterior')!.props.accessibilityState).toMatchObject({ disabled: false })
    // Em novembro, nenhum dia está no passado.
    expect(dayButton(tree, 2026, 10, 1)!.props.accessibilityState).toMatchObject({ disabled: false })
    for (let month = 0; month < 3; month += 1) await press(tree, 'Próximo mês')
    expect(textOf(tree)).toContain('fevereiro de 2027')
    await press(tree, 'Mês anterior')
    expect(textOf(tree)).toContain('janeiro de 2027')
  })

  it('respeita o dia máximo (fim das inscrições até o dia do evento)', async () => {
    const tree = await render(h(DateField, { value: '', onChange: vi.fn(), label: 'Fim', max: '2026-11-05', now: NOW }))
    await press(tree, 'Fim: não escolhida')
    await press(tree, 'Próximo mês')
    expect(dayButton(tree, 2026, 10, 5)!.props.accessibilityState).toMatchObject({ disabled: false })
    expect(dayButton(tree, 2026, 10, 6)!.props.accessibilityState).toMatchObject({ disabled: true })
    expect(pressable(tree, 'Próximo mês')!.props.accessibilityState).toMatchObject({ disabled: true })
  })

  it('aceita dias passados com disablePast falso e o mínimo próprio; desabilitado não abre', async () => {
    const free = await render(h(DateField, { value: '', onChange: vi.fn(), label: 'Jogo', disablePast: false, now: NOW }))
    await press(free, 'Jogo: não escolhida')
    expect(dayButton(free, 2026, 9, 1)!.props.accessibilityState).toMatchObject({ disabled: false })
    const bounded = await render(h(DateField, { value: '', onChange: vi.fn(), label: 'Jogo', min: '2026-10-20', now: NOW }))
    await press(bounded, 'Jogo: não escolhida')
    expect(dayButton(bounded, 2026, 9, 19)!.props.accessibilityState).toMatchObject({ disabled: true })
    expect(dayButton(bounded, 2026, 9, 20)!.props.accessibilityState).toMatchObject({ disabled: false })
    const off = await render(h(DateField, { value: '', onChange: vi.fn(), label: 'Jogo', disabled: true, now: NOW }))
    expect(pressable(off, 'Jogo: não escolhida')!.props.disabled).toBe(true)
  })

  it('a grade sozinha marca hoje e entrega a escolha', async () => {
    const onSelect = vi.fn()
    const tree = await render(h(CalendarGrid, { value: '', min: undefined, max: undefined, today: NOW, onSelect }))
    expect(byLabel(tree, 'Mês anterior')).toHaveLength(1)
    await pressDay(tree, 2026, 9, 3)
    expect(onSelect).toHaveBeenCalledWith('2026-10-03')
  })
})

describe('TimeField: texto, máscara e passos', () => {
  it('aplica a máscara de HH:MM e completa a hora digitada pela metade', () => {
    expect(formatTimeInput('0930')).toBe('09:30')
    expect(formatTimeInput('9')).toBe('9')
    expect(formatTimeInput('093')).toBe('09:3')
    expect(formatTimeInput('09:30xx')).toBe('09:30')
    expect(formatTimeInput('123456')).toBe('12:34')
    expect(parseTime('09:30')).toBe('09:30')
    expect(parseTime('24:00')).toBeNull()
    expect(parseTime('09:60')).toBeNull()
    expect(parseTime('9:30')).toBeNull()
    expect(completeTime('9')).toBe('09:00')
    expect(completeTime('21')).toBe('21:00')
    expect(completeTime('930')).toBe('09:30')
    expect(completeTime('0930')).toBe('09:30')
    expect(completeTime('')).toBe('')
    expect(completeTime('25')).toBeNull()
    expect(completeTime('0975')).toBeNull()
    expect(completeTime('12345')).toBeNull()
  })

  it('anda de 15 em 15 minutos pela grade do passo e vira o dia', () => {
    expect(stepTime('09:00', 1)).toBe('09:15')
    expect(stepTime('09:10', 1)).toBe('09:15')
    expect(stepTime('09:10', -1)).toBe('09:00')
    expect(stepTime('09:00', -1)).toBe('08:45')
    expect(stepTime('23:45', 1)).toBe('00:00')
    expect(stepTime('00:00', -1)).toBe('23:45')
    expect(stepTime('09:00', 1, 30)).toBe('09:30')
    expect(stepTime('', 1)).toBe('09:00')
    expect(stepTime('xx', -1, 15, '23:45')).toBe('23:45')
  })

  const input = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType('TextInput' as never).find(entry => entry.props.accessibilityLabel === label)!

  it('digitar entrega a hora já completada ao pai e normaliza o texto ao sair do campo', async () => {
    const onChange = vi.fn()
    const tree = await render(h(TimeField, { value: '', onChange, label: 'Hora do início' }))
    await type(tree, 'Hora do início', '0930')
    expect(onChange).toHaveBeenLastCalledWith('09:30')
    expect(input(tree, 'Hora do início').props.value).toBe('09:30')
    await type(tree, 'Hora do início', '9')
    expect(onChange).toHaveBeenLastCalledWith('09:00')
    expect(input(tree, 'Hora do início').props.value).toBe('9')
    await act(async () => { input(tree, 'Hora do início').props.onBlur() })
    expect(input(tree, 'Hora do início').props.value).toBe('09:00')
    await type(tree, 'Hora do início', '')
    expect(onChange).toHaveBeenLastCalledWith('')
    expect(textOf(tree)).not.toContain(TIME_ERROR)
  })

  it('hora fora de 00:00 a 23:59 mostra o erro e entrega vazio', async () => {
    const onChange = vi.fn()
    const tree = await render(h(TimeField, { value: '', onChange, label: 'Hora' }))
    await type(tree, 'Hora', '2575')
    expect(onChange).toHaveBeenLastCalledWith('')
    await act(async () => { input(tree, 'Hora').props.onBlur() })
    expect(textOf(tree)).toContain(TIME_ERROR)
    expect(byLabel(tree, 'Hora').length).toBeGreaterThan(0)
    await type(tree, 'Hora', '2')
    expect(textOf(tree)).not.toContain(TIME_ERROR)
  })

  it('os botões − e + andam de 15 em 15 minutos; vazio começa em 09:00 (ou no início dado)', async () => {
    const onChange = vi.fn()
    const tree = await render(h(TimeField, { value: '09:10', onChange, label: 'Hora do início' }))
    await press(tree, 'Hora do início: mais 15 minutos')
    expect(onChange).toHaveBeenLastCalledWith('09:15')
    expect(input(tree, 'Hora do início').props.value).toBe('09:15')
    await press(tree, 'Hora do início: menos 15 minutos')
    expect(onChange).toHaveBeenLastCalledWith('09:00')
    const empty = await render(h(TimeField, { value: '', onChange, label: 'Fim', emptyStart: '23:45' }))
    await press(empty, 'Fim: mais 15 minutos')
    expect(onChange).toHaveBeenLastCalledWith('23:45')
    const custom = await render(h(TimeField, { value: '10:00', onChange, label: 'Jogo', stepMinutes: 5 }))
    await press(custom, 'Jogo: mais 5 minutos')
    expect(onChange).toHaveBeenLastCalledWith('10:05')
  })

  it('acompanha a mudança de valor vinda de fora (rascunho carregado) e respeita o campo desabilitado', async () => {
    const onChange = vi.fn()
    const tree = await render(h(TimeField, { value: '', onChange, label: 'Hora' }))
    await act(async () => { tree.update(h(TimeField, { value: '18:45', onChange, label: 'Hora' })) })
    expect(input(tree, 'Hora').props.value).toBe('18:45')
    expect(onChange).not.toHaveBeenCalled()
    const off = await render(h(TimeField, { value: '08:00', onChange, label: 'Hora', disabled: true, tone: 'dark', invalid: true }))
    expect(input(off, 'Hora').props.editable).toBe(false)
    expect(pressable(off, 'Hora: mais 15 minutos')!.props.disabled).toBe(true)
  })
})
