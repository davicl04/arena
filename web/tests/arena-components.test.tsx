import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Armband } from '../src/components/arena/Armband'
import { FormatTile } from '../src/components/arena/FormatTile'
import { PlacementBadge, PlacementMeter } from '../src/components/arena/PlacementMeter'
import { TeamCrest } from '../src/components/arena/TeamCrest'
import { TierEmblem } from '../src/components/arena/TierEmblem'
import type { TierKey } from '../src/data/arena'

afterEach(cleanup)

describe('TeamCrest', () => {
  it('usa o escudo neutro com as iniciais, sem conectivos, quando não há brasão', () => {
    const { container } = render(<TeamCrest name="Leões do Cerrado" />)
    const crest = screen.getByRole('img', { name: 'Brasão de Leões do Cerrado' })
    expect(crest.textContent).toBe('LC')
    expect(container.querySelector('image')).toBeNull()
    expect(crest.getAttribute('class')).toContain('w-[34px]')
  })

  it('recorta o brasão enviado no escudo e volta às iniciais se a imagem falhar', () => {
    const { container, rerender } = render(<TeamCrest name="Ferrugem FC" path="/api/v1/media/crest.webp" size="xs" />)
    const image = container.querySelector('image')!
    expect(image.getAttribute('href')).toBe('http://localhost:8000/api/v1/media/crest.webp')
    const clip = container.querySelector('clipPath')!
    expect(image.getAttribute('clip-path')).toBe(`url(#${clip.id})`)
    expect(screen.getByRole('img', { name: 'Brasão de Ferrugem FC' }).getAttribute('class')).toContain('w-5')
    expect(screen.getByRole('img').textContent).toBe('')

    fireEvent.error(image)
    expect(container.querySelector('image')).toBeNull()
    expect(screen.getByRole('img').textContent).toBe('FF')

    rerender(<TeamCrest name="Ferrugem FC" path="/api/v1/media/novo.webp" size="xs" />)
    expect(container.querySelector('image')?.getAttribute('href')).toContain('/novo.webp')
  })

  it('prefere as iniciais enviadas pela API', () => {
    render(<TeamCrest name="Clube Atlético do Lago" initials="CA" />)
    expect(screen.getByRole('img', { name: 'Brasão de Clube Atlético do Lago' }).textContent).toBe('CA')
  })

  it('fica oculto para leitores de tela quando o nome aparece ao lado', () => {
    const { container } = render(<TeamCrest name="Amigos do Lago" decorative size="2xl" />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('TierEmblem', () => {
  it('mostra o brasão do elo com texto alternativo ou com o nome ao lado', () => {
    const { rerender } = render(<TierEmblem tier="prata" />)
    const image = screen.getByRole('img', { name: 'Elo Prata' })
    expect(image.getAttribute('src')).toBe('/images/brand/prata.svg')

    rerender(<TierEmblem tier="lendario" showName size="lg" className="text-white" />)
    expect(screen.queryByRole('img', { name: /Elo/ })).toBeNull()
    expect(screen.getByText('Lendário').textContent).toBe('Elo Lendário')
    expect(document.querySelector('img')?.getAttribute('src')).toBe('/images/brand/lendario.svg')

    rerender(<TierEmblem tier="ouro" showName decorative />)
    expect(screen.getByText('Ouro').textContent).toBe('Ouro')
  })

  it('não inventa elo para uma chave ausente ou desconhecida', () => {
    const { container, rerender } = render(<TierEmblem tier={null as unknown as TierKey} />)
    expect(container.innerHTML).toBe('')
    rerender(<TierEmblem tier={'ferro' as TierKey} showName />)
    expect(container.innerHTML).toBe('')
  })
})

describe('PlacementBadge e PlacementMeter', () => {
  it('mostra n/3 no círculo tracejado e limita a contagem', () => {
    const { rerender } = render(<PlacementBadge played={1} />)
    expect(screen.getByRole('img', { name: '1 de 3 partidas de classificação' }).textContent).toBe('1/3')
    rerender(<PlacementBadge played={7} tone="light" size="xs" />)
    expect(screen.getByRole('img').textContent).toBe('3/3')
    rerender(<PlacementBadge played={-2} decorative />)
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('mostra a linha da classificação com três barrinhas e o complemento', () => {
    const { container, rerender } = render(<PlacementMeter played={2} hint="enfrenta qualquer nível" />)
    expect(screen.getByText('Em classificação')).not.toBeNull()
    expect(screen.getByText('2 de 3 partidas · enfrenta qualquer nível')).not.toBeNull()
    expect(container.querySelector('[data-slot=placement-badge]')?.textContent).toBe('2/3')
    const bars = container.querySelectorAll('[aria-hidden=true] > span')
    expect(bars).toHaveLength(3)
    expect([...bars].map(bar => bar.hasAttribute('data-on'))).toEqual([true, true, false])
    expect(container.querySelector('img')).toBeNull()

    rerender(<PlacementMeter played={0} title="Em classificação como goleiro" tone="light" />)
    expect(screen.getByText('Em classificação como goleiro')).not.toBeNull()
    expect(screen.getByText('0 de 3 partidas')).not.toBeNull()
  })
})

describe('FormatTile', () => {
  it('mostra o elo do formato só com a classificação completa', () => {
    const { container } = render(<FormatTile format="society" tier="prata" played={5} />)
    expect(container.firstElementChild?.getAttribute('data-state')).toBe('ranked')
    expect(screen.getByText('Society')).not.toBeNull()
    expect(screen.getByText('Prata').textContent).toBe('Elo Prata')
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/images/brand/prata.svg')
  })

  it('nunca exibe elo para quem está em classificação, mesmo que a resposta traga a chave', () => {
    const { container } = render(<FormatTile format="futsal" tier="ouro" played={1} />)
    expect(container.firstElementChild?.getAttribute('data-state')).toBe('placement')
    expect(container.querySelector('img')).toBeNull()
    expect(screen.queryByText(/Ouro/)).toBeNull()
    expect(screen.getByText('1/3 jogos')).not.toBeNull()
    expect(screen.getByText('1 de 3 partidas de classificação')).not.toBeNull()
  })

  it('mostra "sem jogos" apagado quando o time não jogou no formato', () => {
    const { container } = render(<FormatTile format="campo" tier={null} played={0} />)
    const tile = container.firstElementChild!
    expect(tile.getAttribute('data-state')).toBe('empty')
    expect(tile.className).toContain('opacity-55')
    expect(screen.getByText('Campo')).not.toBeNull()
    expect(screen.getByText('sem jogos')).not.toBeNull()
  })
})

describe('Armband', () => {
  it('identifica o representante no canto da foto e ao lado do nome', () => {
    const { rerender } = render(<Armband />)
    const corner = screen.getByRole('img', { name: 'Representante' })
    expect(corner.textContent).toBe('C')
    expect(corner.className).toContain('absolute')
    expect(corner.className).toContain('border-white')

    rerender(<Armband ring="dark" size="lg" />)
    expect(screen.getByRole('img', { name: 'Representante' }).className).toContain('border-forest')

    rerender(<Armband variant="inline" />)
    const inline = screen.getByRole('img', { name: 'Representante' })
    expect(inline.className).not.toContain('absolute')
    expect(inline.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })
})
