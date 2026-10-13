import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Slider } from '../src/components/ui/slider'

afterEach(cleanup)

describe('Slider', () => {
  it('mantém um único controle de zoom e atualiza o valor escalar pelo teclado', async () => {
    function Harness() {
      const [zoom, setZoom] = useState<number | readonly number[]>(1)
      return <Slider value={zoom} onValueChange={setZoom} min={1} max={3} step={0.05} thumbLabel="Zoom" />
    }
    const user = userEvent.setup()
    render(<Harness />)
    // Base UI aguarda medidas do layout para exibir os thumbs; JSDOM não mede o controle.
    const sliders = screen.getAllByRole('slider', { hidden: true })
    expect(sliders).toHaveLength(1)
    expect(sliders[0].getAttribute('aria-label')).toBe('Zoom')
    sliders[0].focus()
    await user.keyboard('{ArrowRight}')
    expect((sliders[0] as HTMLInputElement).value).toBe('1.05')
  })

  it('respeita value zero mesmo quando defaultValue contém um intervalo', () => {
    render(<Slider value={0} defaultValue={[10, 20]} />)
    const sliders = screen.getAllByRole('slider', { hidden: true })
    expect(sliders).toHaveLength(1)
    expect((sliders[0] as HTMLInputElement).value).toBe('0')
  })

  it('normaliza defaultValue escalar para um único controle', async () => {
    const user = userEvent.setup()
    render(<Slider defaultValue={5} min={0} max={10} />)
    const sliders = screen.getAllByRole('slider', { hidden: true })
    expect(sliders).toHaveLength(1)
    sliders[0].focus()
    await user.keyboard('{ArrowRight}')
    expect((sliders[0] as HTMLInputElement).value).toBe('6')
  })

  it.each(['value', 'defaultValue'] as const)('preserva os dois controles de um intervalo em %s', async (prop) => {
    const user = userEvent.setup()
    function Harness() {
      const [range, setRange] = useState<number | readonly number[]>([10, 20])
      return prop === 'value'
        ? <Slider value={range} onValueChange={setRange} />
        : <Slider defaultValue={[10, 20]} />
    }
    render(<Harness />)
    const sliders = screen.getAllByRole('slider', { hidden: true }) as HTMLInputElement[]
    expect(sliders.map((slider) => slider.value)).toEqual(['10', '20'])
    sliders[1].focus()
    await user.keyboard('{ArrowRight}')
    expect(sliders.map((slider) => slider.value)).toEqual(['10', '21'])
  })

  it('usa um controle em min quando nenhum valor inicial é informado', () => {
    render(<Slider min={5} max={10} />)
    const sliders = screen.getAllByRole('slider', { hidden: true })
    expect(sliders).toHaveLength(1)
    expect((sliders[0] as HTMLInputElement).value).toBe('5')
  })
})
