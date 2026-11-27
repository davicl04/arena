import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import App from '../src/App'
import { LandingScrollContext, sectionProgress, useLandingScroll, useScrollProgress } from '../src/hooks/useLandingScroll'
import { apiError, mockApi } from './teams-fixtures'

const noSession = () => apiError(401, 'Entre na sua conta para continuar.')

beforeEach(() => { Element.prototype.scrollTo = () => {} })
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/') })

async function openLanding() {
  mockApi({ 'GET /me': noSession })
  render(<App />)
  await screen.findByRole('heading', { level: 1, name: 'A arena te chama' })
}

const section = (name: string) => screen.getByRole('region', { name })
const expanded = (button: HTMLElement) => button.getAttribute('aria-expanded')
const reduceMotion = () =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }))

describe('seções da landing', () => {
  it('ficam entre o hero e o fecho, na ordem, com o conteúdo presente sem IntersectionObserver', async () => {
    expect(typeof IntersectionObserver).toBe('undefined')
    await openLanding()
    const order = [
      screen.getByRole('heading', { level: 1, name: 'A arena te chama' }),
      section('Modalidades'),
      section('Como funciona'),
      section('Mais da Arena'),
      screen.getByRole('heading', { level: 2, name: 'Os portões estão abertos.' }),
    ]
    order.slice(1).forEach((node, index) => {
      expect(order[index].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
    // Modalidades: três colunas, a primeira aberta, com descrição e etiquetas.
    const sports = within(section('Modalidades')).getAllByRole('button')
    expect(sports.map(button => button.textContent)).toEqual(['Futebol', 'Tênis', 'Corrida'])
    expect(sports.map(expanded)).toEqual(['true', 'false', 'false'])
    expect(screen.getByText('Monte o seu time e convide amigos, ou entre avulso numa partida aberta.')).toBeTruthy()
    expect(screen.getByText('Registre as suas marcas e se inscreva nas provas da sua cidade.')).toBeTruthy()
    for (const tag of ['Society', 'Campo', 'Futsal', 'Simples', 'Sets', 'Rating', 'Marcas', 'Provas', 'Distâncias']) {
      expect(within(section('Modalidades')).getByText(tag)).toBeTruthy()
    }
    // Como funciona: quatro passos; o nome do botão leva "Passo 0X", sem se confundir com o convite "Crie sua conta".
    const steps = within(section('Como funciona')).getAllByRole('button')
    expect(steps.map(button => button.textContent)).toEqual(['Crie sua conta', 'Monte seus perfis', 'Aperte Jogar', 'Confirme o resultado'])
    expect(within(section('Como funciona')).getByRole('button', { name: 'Passo 04 Confirme o resultado' })).toBe(steps[3])
    expect(steps.map(expanded)).toEqual(['true', 'false', 'false', 'false'])
    expect(screen.getByText('Os dois lados informam o placar, e o ranking se atualiza.')).toBeTruthy()
    // Numerais romanos decorativos.
    const numerals = section('Como funciona').querySelectorAll('svg.landing-numeral')
    expect(numerals).toHaveLength(4)
    numerals.forEach(svg => expect(svg.closest('[aria-hidden="true"]')).toBeTruthy())
    // Mais da Arena: quatro itens, o primeiro aberto, cada texto numa região rotulada pelo nome.
    const more = within(section('Mais da Arena')).getAllByRole('button')
    expect(more.map(button => button.textContent)).toEqual(['Times', 'Campeonatos', 'Comunidade', 'Privacidade'])
    expect(more.map(expanded)).toEqual(['true', 'false', 'false', 'false'])
    expect(within(screen.getByRole('region', { name: 'Privacidade' })).getByText('Seu perfil começa privado. Você decide o que mostrar.')).toBeTruthy()
    // Sem IntersectionObserver, nada fica marcado para revelar.
    expect(document.querySelector('[data-revelar]')).toBeNull()
  })

  it('as colunas alternam a aberta por clique e por teclado, uma por vez, com o painel controlado', async () => {
    await openLanding()
    const ui = userEvent.setup()
    const [football, tennis, running] = within(section('Modalidades')).getAllByRole('button')
    await ui.click(tennis)
    expect([football, tennis, running].map(expanded)).toEqual(['false', 'true', 'false'])
    const panel = document.getElementById(tennis.getAttribute('aria-controls')!)!
    expect(panel.textContent).toContain('Partidas de simples com placar por sets, confirmado pelos dois lados.')
    // Tab leva o foco (e a abertura) à próxima coluna; Enter na aberta a mantém aberta.
    await ui.tab()
    expect(document.activeElement).toBe(running)
    expect([football, tennis, running].map(expanded)).toEqual(['false', 'false', 'true'])
    await ui.keyboard('{Enter}')
    expect(expanded(running)).toBe('true')
    // As colunas de "Como funciona" têm o próprio item aberto.
    const steps = within(section('Como funciona')).getAllByRole('button')
    expect(steps.map(expanded)).toEqual(['true', 'false', 'false', 'false'])
    steps[2].focus()
    await ui.keyboard(' ')
    expect(steps.map(expanded)).toEqual(['false', 'false', 'true', 'false'])
  })

  it('o mouse abre a coluna ao passar; o toque só abre ao tocar', async () => {
    await openLanding()
    const [football, tennis, running] = within(section('Modalidades')).getAllByRole('button')
    fireEvent.pointerEnter(running.closest('li')!, { pointerType: 'touch' })
    expect(expanded(football)).toBe('true')
    fireEvent.pointerEnter(running.closest('li')!, { pointerType: 'mouse' })
    expect([football, tennis, running].map(expanded)).toEqual(['false', 'false', 'true'])
  })

  it('a sanfona abre um item por vez, por clique, teclado e mouse', async () => {
    await openLanding()
    const ui = userEvent.setup()
    const items = within(section('Mais da Arena')).getAllByRole('button')
    await ui.click(items[2])
    expect(items.map(expanded)).toEqual(['false', 'false', 'true', 'false'])
    expect(document.getElementById(items[2].getAttribute('aria-controls')!)!.textContent).toBe('Publique, siga atletas e acompanhe a sua cidade.')
    await ui.tab()
    expect(document.activeElement).toBe(items[3])
    expect(items.map(expanded)).toEqual(['false', 'false', 'false', 'true'])
    await ui.tab({ shift: true })
    await ui.tab({ shift: true })
    expect(items.map(expanded)).toEqual(['false', 'true', 'false', 'false'])
    fireEvent.pointerEnter(items[0].closest('.landing-sanfona-item')!, { pointerType: 'mouse' })
    expect(items.map(expanded)).toEqual(['true', 'false', 'false', 'false'])
  })
})

describe('revelação ao rolar', () => {
  function stubObserver() {
    const observers: { callback: IntersectionObserverCallback; observed: Element[]; disconnect: ReturnType<typeof vi.fn> }[] = []
    vi.stubGlobal('IntersectionObserver', class {
      observed: Element[] = []
      disconnect = vi.fn()
      constructor(callback: IntersectionObserverCallback) { observers.push({ callback, observed: this.observed, disconnect: this.disconnect }) }
      observe(element: Element) { this.observed.push(element) }
      unobserve(element: Element) { this.observed.splice(this.observed.indexOf(element), 1) }
    })
    return observers
  }

  it('marca a landing para revelar e revela cada bloco ao entrar na tela; sai junto com a landing', async () => {
    const observers = stubObserver()
    await openLanding()
    const root = document.querySelector('[data-revelar]')!
    expect(root).toBeTruthy()
    const [observer] = observers
    // Colunas (3 + 4), itens da sanfona (4) e o fecho (título e ações).
    expect(observer.observed).toHaveLength(13)
    const first = observer.observed[0]
    act(() => observer.callback([{ target: first, isIntersecting: true } as unknown as IntersectionObserverEntry], {} as IntersectionObserver))
    expect(first.hasAttribute('data-revelado')).toBe(true)
    expect(observer.observed).toHaveLength(12)
    await userEvent.click(screen.getAllByRole('button', { name: 'Entrar na Arena' })[0])
    await screen.findByLabelText('E-mail')
    expect(observer.disconnect).toHaveBeenCalled()
  })

  it('com "reduzir movimento", não há revelação: tudo visível de imediato', async () => {
    reduceMotion()
    const observers = stubObserver()
    await openLanding()
    expect(observers).toHaveLength(0)
    expect(document.querySelector('[data-revelar]')).toBeNull()
    expect(screen.getByText('Seu perfil começa privado. Você decide o que mostrar.')).toBeTruthy()
  })
})

describe('progresso das seções presas', () => {
  function Pinned({ onProgress }: { onProgress: (progress: number) => void }) {
    const ref = useRef<HTMLDivElement>(null)
    const active = useScrollProgress(ref, onProgress)
    return <div ref={ref} data-testid="presa" data-ativa={active} />
  }
  function Harness({ sections, onProgress }: { sections: number; onProgress: (progress: number) => void }) {
    const rootRef = useRef<HTMLDivElement>(null)
    const scroll = useLandingScroll(rootRef)
    return (
      <LandingScrollContext value={scroll}>
        <div ref={rootRef}>{Array.from({ length: sections }, (_, index) => <Pinned key={index} onProgress={onProgress} />)}</div>
      </LandingScrollContext>
    )
  }
  const scrollListeners = (spy: ReturnType<typeof vi.spyOn>) => spy.mock.calls.filter(([type]) => type === 'scroll').length

  it('calcula o progresso de 0 a 1 pela posição da seção', () => {
    expect(sectionProgress({ top: 100, height: 3000 }, 1000)).toBe(0)
    expect(sectionProgress({ top: -1000, height: 3000 }, 1000)).toBe(0.5)
    expect(sectionProgress({ top: -5000, height: 3000 }, 1000)).toBe(1)
    expect(sectionProgress({ top: -10, height: 500 }, 1000)).toBe(1)
  })

  it('usa um único ouvinte de rolagem por requestAnimationFrame para todas as seções e o remove ao sair', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    let top = 0
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ top, height: window.innerHeight + 1000 }) as DOMRect)
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const onProgress = vi.fn()
    const view = render(<Harness sections={2} onProgress={onProgress} />)
    expect(scrollListeners(add)).toBe(1)
    const [first, second] = screen.getAllByTestId('presa')
    expect(first.dataset.ativa).toBe('true')
    expect(first.style.getPropertyValue('--progresso')).toBe('0.0000')
    top = -250
    window.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('scroll'))
    expect(frames).toHaveLength(1)
    act(() => frames[0](0))
    expect(first.style.getPropertyValue('--progresso')).toBe('0.2500')
    expect(second.style.getPropertyValue('--progresso')).toBe('0.2500')
    expect(onProgress).toHaveBeenLastCalledWith(0.25)
    view.unmount()
    expect(scrollListeners(remove)).toBe(1)
  })

  it('com "reduzir movimento", não acompanha a rolagem e a seção fica estática', () => {
    reduceMotion()
    const add = vi.spyOn(window, 'addEventListener')
    render(<Harness sections={1} onProgress={vi.fn()} />)
    expect(scrollListeners(add)).toBe(0)
    const pinned = screen.getByTestId('presa')
    expect(pinned.dataset.ativa).toBe('false')
    expect(pinned.style.getPropertyValue('--progresso')).toBe('')
  })
})
