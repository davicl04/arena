import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { Profile, Sport } from '../src/api/client'
import { LandingSports } from '../src/components/landing/LandingSections'
import { SportBand } from '../src/components/sports-profile/SportBand'
import { SIMBOLO_VIEWBOX, SELOS_GEOMETRIA } from '../src/data/selos'
import { goiania } from './teams-fixtures'

/*
 * Ticket 04: marca d'água de modalidade (só o símbolo, em SVG) nas faixas de "Suas modalidades" e nas colunas de
 * modalidade da landing, no lugar do ícone de louros em PNG com máscara.
 */

afterEach(cleanup)

const SPORTS: Sport[] = ['futebol', 'tenis', 'corrida']
const LABELS: Record<Sport, string> = { futebol: 'Futebol', tenis: 'Tênis', corrida: 'Corrida' }

const profile = (sport: Sport): Profile =>
  ({ id: 7, sport, city_id: goiania.id, city: goiania, position: null, looking_for: false, is_public: false, level: null })

/** A marca d'água da modalidade: só o símbolo, na caixa do símbolo, numa cor herdada, oculta e sem PNG nem compensação. */
function expectMarca(element: Element, sport: Sport) {
  const icons = element.querySelectorAll<SVGElement>('[data-slot="sport-icon"]')
  expect(icons).toHaveLength(1)
  const [icon] = icons
  expect(icon.tagName.toLowerCase()).toBe('svg')
  expect(icon.getAttribute('data-forma')).toBe('marca')
  expect(icon.getAttribute('viewBox')).toBe(SIMBOLO_VIEWBOX)
  const paths = icon.querySelectorAll('path')
  expect(paths).toHaveLength(1)
  expect(paths[0].getAttribute('d')).toBe(SELOS_GEOMETRIA[sport].simbolo)
  expect(paths[0].style.fill).toBe('currentcolor')
  expect(icon.getAttribute('aria-hidden')).toBe('true')
  expect(element.querySelector('img')).toBeNull()
  expect(element.innerHTML).not.toMatch(/images\/sports|\.png|mask|invert|blend|--sport-icon-color/)
  return icon
}

describe('marca d\'água nas faixas de "Suas modalidades"', () => {
  it.each(SPORTS)('a faixa inativa e a ativa de %s mostram a marca d\'água do símbolo, oculta, com o mesmo nome acessível', sport => {
    const { rerender } = render(<SportBand sport={sport} label={LABELS[sport]} description="Descrição" onOpen={vi.fn()} />)
    const inactive = screen.getByRole('button', { name: `${LABELS[sport]}, ativar` })
    expectMarca(inactive, sport)
    expect(within(inactive).queryByRole('img')).toBeNull()

    rerender(<SportBand sport={sport} label={LABELS[sport]} description="Descrição" profile={profile(sport)} onOpen={vi.fn()} />)
    const active = screen.getByRole('button', { name: `${LABELS[sport]}, ativa, editar` })
    expectMarca(active, sport)
    expect(within(active).queryByRole('img')).toBeNull()
  })
})

describe('marca d\'água nas colunas de modalidade da landing', () => {
  it('cada coluna mostra a marca d\'água do símbolo da sua modalidade, dentro da decoração oculta', () => {
    render(<LandingSports id="modalidades" />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.map(button => button.textContent)).toEqual(['Futebol', 'Tênis', 'Corrida'])
    buttons.forEach((button, index) => {
      const icon = expectMarca(button.closest('li')!, SPORTS[index])
      expect(icon.closest('.landing-coluna-decoracao')?.getAttribute('aria-hidden')).toBe('true')
    })
  })
})
