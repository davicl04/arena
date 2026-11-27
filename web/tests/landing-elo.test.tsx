import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import App from '../src/App'
import { apiError, mockApi } from './teams-fixtures'

const noSession = () => apiError(401, 'Entre na sua conta para continuar.')

const eyebrow = 'Sua ascensão · um ranking para cada modalidade'
const tiers = [
  ['Bronze', 'Toda lenda começa na primeira partida. Depois de 3, a arena define o seu nível inicial.'],
  ['Prata', 'Cada vitória confirmada pelos dois lados reergue mais um pedaço do seu Coliseu.'],
  ['Ouro', 'O Coliseu quase inteiro. Rivais à altura, na sua cidade, a cada partida.'],
  ['Diamante', 'Poucos chegam aqui. O Coliseu está de pé e a torcida sabe o seu nome.'],
  ['Lendário', 'O topo da arena. Seu nome gravado no Salão dos Lendários.'],
] as const

beforeEach(() => { Element.prototype.scrollTo = () => {} })
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/') })

const reduceMotion = () =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }))
const scrollListeners = (spy: ReturnType<typeof vi.spyOn>) => spy.mock.calls.filter(([type]) => type === 'scroll').length

async function openLanding() {
  mockApi({ 'GET /me': noSession })
  render(<App />)
  await screen.findByRole('heading', { level: 1, name: 'A arena te chama' })
  return screen.getByRole('region', { name: eyebrow })
}

/** Os cinco elos como leitores de tela os encontram: nome (h3) e texto, na ordem, independentemente da rolagem. */
function expectFiveTiers(section: HTMLElement) {
  const items = within(section).getAllByRole('listitem')
  expect(items).toHaveLength(5)
  items.forEach((item, index) => {
    const [name, text] = tiers[index]
    expect(within(item).getByRole('heading', { level: 3, name })).toBeTruthy()
    expect(within(item).getByText(text)).toBeTruthy()
  })
}

/** Texto da seção fora do que é decorativo (`aria-hidden`). */
function readableText(section: HTMLElement) {
  const copy = section.cloneNode(true) as HTMLElement
  copy.querySelectorAll('[aria-hidden="true"]').forEach(node => node.remove())
  return copy.textContent
}

describe('subida de elo', () => {
  it('fica entre as modalidades e "Como funciona", com o sobretítulo e os cinco elos, sem IntersectionObserver', async () => {
    expect(typeof IntersectionObserver).toBe('undefined')
    const section = await openLanding()
    const sports = screen.getByRole('region', { name: 'Modalidades' })
    const steps = screen.getByRole('region', { name: 'Como funciona' })
    expect(sports.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(section.compareDocumentPosition(steps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(section).getByRole('heading', { level: 2, name: eyebrow })).toBeTruthy()
    expectFiveTiers(section)
    // Brasões e trilho são decorativos: nenhum brasão vira imagem nomeada e o trilho fica fora da leitura.
    expect(section.querySelectorAll('img')).toHaveLength(5)
    expect(within(section).queryAllByRole('img')).toHaveLength(0)
    const rail = section.querySelector('.landing-elo-trilho')!
    expect(rail.getAttribute('aria-hidden')).toBe('true')
    // Explicativa: o que se lê é só o sobretítulo e os elos com o texto da spec (sem rating, pontos, posições nem pessoa).
    expect(readableText(section)).toBe(eyebrow + tiers.map(([name, text]) => name + text).join(''))
  })

  it('com movimento, a rolagem troca o elo ativo e preenche o trilho, pelo ouvinte único da landing', async () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    let top = 0
    const rect = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      // A seção presa tem cinco telas de altura; o restante da página mede como no jsdom.
      return this.classList.contains('landing-elo') ? ({ top, height: window.innerHeight * 5 } as DOMRect) : rect.call(this)
    })
    const add = vi.spyOn(window, 'addEventListener')
    const section = await openLanding()
    expect(scrollListeners(add)).toBe(1)
    const items = within(section).getAllByRole('listitem')
    const labels = Array.from(section.querySelectorAll('.landing-elo-trilho span'))
    expect(labels.map(label => label.textContent)).toEqual(tiers.map(([name]) => name))
    const active = () => [
      section.dataset.elo,
      items.findIndex(item => item.hasAttribute('data-ativo')),
      labels.findIndex(label => label.hasAttribute('data-ativo')),
    ]
    expect(section.hasAttribute('data-presa')).toBe(true)
    expect(active()).toEqual(['bronze', 0, 0])
    expect(section.style.getPropertyValue('--progresso')).toBe('0.0000')

    const scrollTo = (progress: number) => {
      top = -progress * window.innerHeight * 4
      window.dispatchEvent(new Event('scroll'))
      act(() => frames.splice(0).forEach(frame => frame(0)))
    }
    scrollTo(0.5)
    expect(active()).toEqual(['ouro', 2, 2])
    expect(section.style.getPropertyValue('--progresso')).toBe('0.5000')
    scrollTo(0.7)
    expect(active()).toEqual(['diamante', 3, 3])
    scrollTo(1)
    expect(active()).toEqual(['lendario', 4, 4])
    expect(section.style.getPropertyValue('--progresso')).toBe('1.0000')
    // A troca é visual: os cinco nomes e textos continuam na leitura em qualquer posição.
    expectFiveTiers(section)
  })

  it('com "reduzir movimento", não fica presa nem troca: os cinco elos aparecem em sequência', async () => {
    reduceMotion()
    const add = vi.spyOn(window, 'addEventListener')
    const section = await openLanding()
    expect(scrollListeners(add)).toBe(0)
    expect(section.hasAttribute('data-presa')).toBe(false)
    expect(section.style.getPropertyValue('--progresso')).toBe('')
    expect(section.querySelector('.landing-elo-trilho')).toBeNull()
    expect(section.querySelector('[data-ativo]')).toBeNull()
    expectFiveTiers(section)
  })
})
