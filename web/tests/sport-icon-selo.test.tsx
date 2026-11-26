import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Profile, Sport } from '../src/api/client'
import SportIcon, { SeloLadrilho } from '../src/components/SportIcon'
import { TimelineHeader } from '../src/components/profile-matches/TimelineHeader'
import { TimelineRail } from '../src/components/profile-matches/TimelineRail'
import { CategoryCard } from '../src/components/ranking/CategoryCard'
import { CategorySheet } from '../src/components/ranking/CategorySheet'
import type { RankingCategory } from '../src/components/ranking/category'
import { IconTile } from '../src/components/ui/icon-tile'
import { SELO_COROA, SELOS_GEOMETRIA } from '../src/data/selos'
import { match, run, tennisMatch } from './timeline-fixtures'

afterEach(cleanup)

const SPORTS: Sport[] = ['futebol', 'tenis', 'corrida']

/** Nenhum PNG de modalidade nem compensação (máscara, inversão, mistura) dentro do elemento. */
function expectNoRaster(element: Element) {
  expect(element.querySelector('img')).toBeNull()
  expect(element.innerHTML).not.toMatch(/images\/sports|\.png|mask|invert|blend/)
}

/** O selo da modalidade dentro do ladrilho redondo, a 75% do diâmetro, oculto à acessibilidade. */
function expectSeloLadrilho(element: Element, sport: Sport, size: number) {
  const icon = element.querySelector<SVGElement>('[data-slot="sport-icon"]')!
  expect(icon.getAttribute('data-forma')).toBe('selo')
  expect(icon.querySelectorAll('path')[1].getAttribute('d')).toBe(SELOS_GEOMETRIA[sport].simbolo)
  expect(icon.getAttribute('width')).toBe(String(Math.round(size * 0.75)))
  const tile = icon.closest<HTMLElement>('[data-slot="icon-tile"]')!
  expect(tile.getAttribute('data-shape')).toBe('round')
  expect(tile.style.width).toBe(`${size}px`)
  expect(tile.getAttribute('aria-hidden')).toBe('true')
  expectNoRaster(tile)
}

describe('SportIcon: três formas vetoriais', () => {
  it.each(SPORTS)('desenha o selo, o símbolo com aro e a marca d\'água de %s em SVG, ocultos e sem PNG', sport => {
    const { container } = render(<>
      <SportIcon sport={sport} forma="selo" size={30} />
      <SportIcon sport={sport} forma="aro" size={20} cor="var(--color-on-brand)" />
      <SportIcon sport={sport} forma="marca" size={150} />
    </>)
    const [selo, aro, marca] = container.querySelectorAll<SVGElement>('[data-slot="sport-icon"]')
    for (const icon of [selo, aro, marca]) {
      expect(icon.tagName.toLowerCase()).toBe('svg')
      expect(icon.getAttribute('aria-hidden')).toBe('true')
    }
    // Selo: disco no token do disco e coroa + símbolo no token dos detalhes.
    expect(selo.getAttribute('data-forma')).toBe('selo')
    expect(selo.getAttribute('width')).toBe('30')
    expect(selo.querySelector('circle')?.getAttribute('class')).toContain('fill-selo-disco')
    expect(selo.querySelector('g')?.getAttribute('class')).toContain('fill-selo-detalhe')
    expect([...selo.querySelectorAll('g > path')].map(path => path.getAttribute('d'))).toEqual([SELO_COROA, SELOS_GEOMETRIA[sport].simbolo])
    // Símbolo com aro: um caminho só, na cor pedida, com o desenho a 85% da caixa.
    expect(aro.getAttribute('data-forma')).toBe('aro')
    expect(aro.querySelector('path')?.getAttribute('d')).toBe(SELOS_GEOMETRIA[sport].simboloComAro)
    expect(aro.querySelector('path')?.style.fill).toBe('var(--color-on-brand)')
    const [, , lado] = aro.getAttribute('viewBox')!.split(' ').map(Number)
    expect(512 / lado).toBeCloseTo(0.85, 5)
    // Marca d'água: só o símbolo, na cor do texto por padrão.
    expect(marca.getAttribute('data-forma')).toBe('marca')
    expect(marca.getAttribute('viewBox')).toBe('-172 -172 344 344')
    expect(marca.querySelectorAll('path')).toHaveLength(1)
    expect(marca.querySelector('path')?.getAttribute('d')).toBe(SELOS_GEOMETRIA[sport].simbolo)
    expect(marca.querySelector('path')?.style.fill).toBe('currentcolor')
    expectNoRaster(container)
  })

  it('o ícone não entra no nome acessível de quem o contém', () => {
    render(<button type="button"><SportIcon sport="tenis" forma="aro" size={20} />Tênis</button>)
    expect(screen.getByRole('button').textContent).toBe('Tênis')
    expect(screen.getByRole('button', { name: 'Tênis' })).not.toBeNull()
  })
})

describe('Ladrilho redondo', () => {
  it.each([[40, 30], [38, 29], [34, 26], [24, 18]])('no ladrilho de %i px, o selo (três quartos do diâmetro) tem %i px', (size, selo) => {
    const { container } = render(<SeloLadrilho sport="futebol" size={size} />)
    expectSeloLadrilho(container, 'futebol', size)
    expect(container.querySelector('svg')?.getAttribute('height')).toBe(String(selo))
  })

  it('o quadro de ícone dos demais usos continua com cantos arredondados', () => {
    const { container } = render(<><IconTile>a</IconTile><IconTile shape="round">b</IconTile></>)
    const [square, round] = container.querySelectorAll('[data-slot="icon-tile"]')
    expect(square.getAttribute('data-shape')).toBe('square')
    expect(square.className).toContain('rounded-xl')
    expect(round.className).toContain('rounded-full')
    expect(round.className).toContain('bg-icon-tile')
  })
})

describe('Usos do selo', () => {
  it('o card de categoria do ranking mostra o selo no ladrilho redondo de 38 px e mantém o nome acessível', () => {
    render(<CategoryCard sport="tenis" text="Tênis" onOpen={vi.fn()} />)
    const button = screen.getByRole('button', { name: /^Categoria\s*Tênis$/ })
    expect(button.textContent).toBe('CategoriaTênis')
    expectSeloLadrilho(button, 'tenis', 38)
  })

  it('as opções de modalidade da folha de categoria mostram o selo no ladrilho redondo, com os mesmos nomes', () => {
    const profile = (id: number, sport: Sport): Profile => ({ id, sport, city_id: 1, city: { id: 1, name: 'Brasília', state: 'DF' }, position: null, looking_for: false, is_public: false, level: null })
    const category: RankingCategory = { sport: 'futebol', kind: 'time', format: 'society', position: 'atacante', distance: 5 }
    render(<CategorySheet profiles={[profile(1, 'futebol'), profile(2, 'tenis'), profile(3, 'corrida')]} category={category} onChange={vi.fn()} onClose={vi.fn()} />)
    const group = within(screen.getByRole('dialog', { name: 'Categoria do ranking' })).getByRole('group', { name: 'Modalidade' })
    const options = within(group).getAllByRole('button')
    expect(options.map(option => option.textContent)).toEqual(['Futebol', 'Tênis', 'Corrida'])
    options.forEach((option, index) => expectSeloLadrilho(option, SPORTS[index], 34))
  })

  it('o trilho da linha do tempo mostra o selo no nó redondo de cada registro', () => {
    const { container } = render(<TimelineRail items={[match(), tennisMatch(), run()]} own={false} />)
    const nodes = container.querySelectorAll('[data-slot="timeline-node"]')
    expect(nodes).toHaveLength(3)
    ;(['futebol', 'tenis', 'corrida'] as const).forEach((sport, index) => expectSeloLadrilho(nodes[index], sport, 30))
  })

  it('as opções do filtro da linha do tempo mostram o selo no ladrilho redondo, com os nomes dos rádios iguais', async () => {
    const ui = userEvent.setup()
    render(<TimelineHeader total={3} filter="todas" onFilter={vi.fn()} />)
    await ui.click(screen.getByRole('button', { name: 'Filtrar por modalidade' }))
    const group = await screen.findByRole('radiogroup', { name: 'Modalidade' })
    expect(within(group).getAllByRole('radio').map(radio => radio.closest('label')?.textContent)).toEqual(['Todas', 'Futebol', 'Tênis', 'Corrida'])
    for (const sport of SPORTS) {
      const label = within(group).getByText(sportName(sport)).closest('label')!
      expectSeloLadrilho(label, sport, 24)
    }
  })
})

function sportName(sport: Sport) {
  return { futebol: 'Futebol', tenis: 'Tênis', corrida: 'Corrida' }[sport]
}
