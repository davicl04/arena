import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DatePicker } from '../src/components/ui/date-picker'
import { TimeField } from '../src/components/ui/time-field'
import { Sheet } from '../src/components/ui/sheet'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../src/components/ui/collapsible'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../src/components/ui/dialog'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** Date Picker controlado, como nas folhas que vão usá-lo. */
function Controlled({ initial = '', onChange = () => {}, ...props }: { initial?: string; onChange?: (value: string) => void } & Partial<Parameters<typeof DatePicker>[0]>) {
  const [value, setValue] = useState(initial)
  return <>
    <label htmlFor="data">Data</label>
    <DatePicker id="data" label="Data" value={value} onChange={next => { setValue(next); onChange(next) }} {...props} />
  </>
}

describe('DatePicker', () => {
  beforeEach(() => {
    // Só o relógio: os temporizadores continuam reais para o Base UI e o user-event.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
  })

  it('abre pelo teclado, anda pelos dias com as setas e escolhe com Enter', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} disablePast />)
    const trigger = screen.getByRole('button', { name: 'Data: Escolher data' })
    expect(screen.getByLabelText('Data: Escolher data')).toBe(trigger)

    trigger.focus()
    await user.keyboard('{Enter}')
    const dialog = await screen.findByRole('dialog', { name: 'Escolher data' })
    expect(dialog.textContent).toContain('outubro de 2026')
    await waitFor(() => expect(document.activeElement?.textContent).toBe('12'))

    expect(within(dialog).getByRole('grid', { name: 'outubro de 2026' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Ir para o próximo mês' })).toBeTruthy()

    await user.keyboard('{ArrowRight}{ArrowDown}')
    expect(document.activeElement?.textContent).toBe('20')
    expect(document.activeElement?.getAttribute('aria-label')).toContain('terça-feira, 20 de outubro de 2026')
    await user.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalledWith('2026-10-20')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('button', { name: 'Data: ter, 20 out' })).toBe(trigger)
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('desabilita os dias passados e o mês anterior quando pedido', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} disablePast />)
    await user.click(screen.getByRole('button', { name: /^Data:/ }))
    const dialog = await screen.findByRole('dialog')
    const day = (n: string) => Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-slot="calendar-day"]'))
      .find(button => button.textContent === n && !button.hasAttribute('data-outside'))!

    expect(day('11').disabled).toBe(true)
    expect(day('1').disabled).toBe(true)
    expect(day('12').disabled).toBe(false)
    expect(day('12').hasAttribute('data-today')).toBe(true)
    fireEvent.click(day('11'))
    expect(onChange).not.toHaveBeenCalled()

    const previous = dialog.querySelector<HTMLButtonElement>('.rdp-button_previous')!
    expect(previous.disabled || previous.getAttribute('aria-disabled') === 'true').toBe(true)
    await user.click(dialog.querySelector<HTMLButtonElement>('.rdp-button_next')!)
    expect(dialog.textContent).toContain('novembro de 2026')
    await user.click(day('3'))
    expect(onChange).toHaveBeenCalledWith('2026-11-03')
  })

  it('respeita os limites e aceita datas passadas sem disablePast', async () => {
    const user = userEvent.setup()
    render(<Controlled initial="2026-10-05" min="2026-10-02" max="2026-10-28" />)
    const trigger = screen.getByRole('button', { name: 'Data: seg, 5 out' })
    await user.click(trigger)
    const dialog = await screen.findByRole('dialog')
    const days = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-slot="calendar-day"]:not([data-outside])'))
    const byText = (n: string) => days.find(button => button.textContent === n)!
    expect(byText('1').disabled).toBe(true)
    expect(byText('3').disabled).toBe(false)
    expect(byText('29').disabled).toBe(true)
    expect(byText('5').getAttribute('data-selected-single')).toBe('true')
    await user.click(byText('3'))
    expect(screen.getByRole('button', { name: 'Data: sáb, 3 out' })).toBe(trigger)
  })

  it('fecha só o calendário com Esc dentro de uma folha', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Sheet title="Agendar partida" onClose={onClose}><Controlled /></Sheet>)
    await user.click(screen.getByRole('button', { name: /^Data:/ }))
    await screen.findByRole('dialog', { name: 'Escolher data' })
    await waitFor(() => expect(document.activeElement?.getAttribute('data-slot')).toBe('calendar-day'))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Escolher data' })).toBeNull())
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Agendar partida' })).toBeTruthy()
  })

  it('mostra o estado inválido e o tom escuro', () => {
    render(<Controlled tone="dark" invalid disabled placeholder="Dia do evento" aria-describedby="ajuda" />)
    const trigger = screen.getByRole('button', { name: 'Data: Dia do evento' })
    expect(trigger.getAttribute('aria-invalid')).toBe('true')
    expect(trigger.getAttribute('aria-describedby')).toBe('ajuda')
    expect(trigger.className).toContain('bg-white/5')
    expect((trigger as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('TimeField', () => {
  it('é um campo de hora livre com passo em minutos', () => {
    const onChange = vi.fn()
    const { rerender } = render(<><label htmlFor="hora">Horário</label><TimeField id="hora" value="" onChange={onChange} /></>)
    const input = screen.getByLabelText('Horário') as HTMLInputElement
    expect(input.type).toBe('time')
    expect(input.step).toBe('900')
    fireEvent.change(input, { target: { value: '20:15' } })
    expect(onChange).toHaveBeenCalledWith('20:15')

    rerender(<><label htmlFor="hora">Horário</label><TimeField id="hora" value="20:15" onChange={onChange} stepMinutes={5} tone="dark" invalid /></>)
    expect(input.step).toBe('300')
    expect(input.value).toBe('20:15')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const field = input.closest('[data-slot="time-field"]')!
    expect(field.hasAttribute('data-invalid')).toBe(true)
    expect(field.className).toContain('[color-scheme:dark]')
  })

  it('abre o seletor do navegador pelo relógio, sem atrapalhar a digitação', () => {
    const showPicker = vi.fn()
    const original = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'showPicker')
    Object.defineProperty(HTMLInputElement.prototype, 'showPicker', { value: showPicker, configurable: true })
    try {
      const { container, rerender } = render(<TimeField aria-label="Horário" value="" onChange={() => {}} />)
      const input = screen.getByLabelText('Horário')
      fireEvent.click(input)
      expect(showPicker).not.toHaveBeenCalled()
      fireEvent.click(container.querySelector('svg')!)
      expect(showPicker).toHaveBeenCalledOnce()
      expect(document.activeElement).toBe(input)

      showPicker.mockImplementation(() => { throw new DOMException('Sem gesto', 'NotAllowedError') })
      expect(() => fireEvent.click(container.querySelector('[data-slot="time-field"]')!)).not.toThrow()

      rerender(<TimeField aria-label="Horário" value="" onChange={() => {}} disabled />)
      fireEvent.click(container.querySelector('svg')!)
      expect(showPicker).toHaveBeenCalledTimes(2)
    } finally {
      if (original) Object.defineProperty(HTMLInputElement.prototype, 'showPicker', original)
      else Reflect.deleteProperty(HTMLInputElement.prototype, 'showPicker')
    }
  })
})

describe('Collapsible e Dialog (base para a etapa 3)', () => {
  it('abre e recolhe o conteúdo', async () => {
    const user = userEvent.setup()
    render(<Collapsible><CollapsibleTrigger>Condições da partida</CollapsibleTrigger><CollapsibleContent>Sáb, 18 out · 20:00</CollapsibleContent></Collapsible>)
    const trigger = screen.getByRole('button', { name: 'Condições da partida' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await user.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Sáb, 18 out · 20:00')).toBeTruthy()
  })

  it('abre o diálogo com título e fecha pelo botão "Fechar"', async () => {
    const user = userEvent.setup()
    render(<Dialog>
      <DialogTrigger>Ver proposta</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Partida encontrada</DialogTitle><DialogDescription>Responda em até 2 h.</DialogDescription></DialogHeader>
        <DialogFooter showCloseButton><button type="button">Aceitar partida</button></DialogFooter>
      </DialogContent>
    </Dialog>)
    await user.click(screen.getByRole('button', { name: 'Ver proposta' }))
    const dialog = await screen.findByRole('dialog', { name: 'Partida encontrada' })
    expect(dialog.textContent).toContain('Responda em até 2 h.')
    const closers = screen.getAllByRole('button', { name: 'Fechar' })
    expect(closers).toHaveLength(2)
    await user.click(closers[0])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
