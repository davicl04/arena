import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import ProfileHeader from '../src/components/ProfileHeader'

afterEach(cleanup)

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void

function mockObserver() {
  const observers: { callback: Callback; options?: IntersectionObserverInit; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = []
  vi.stubGlobal('IntersectionObserver', class {
    observe = vi.fn()
    disconnect = vi.fn()
    unobserve = vi.fn()
    constructor(callback: Callback, options?: IntersectionObserverInit) { observers.push({ callback, options, observe: this.observe, disconnect: this.disconnect }) }
  })
  return observers
}

const renderHeader = () => render(<main>
  <ProfileHeader mode="visitor" name="Atleta Dois" username="atleta.dois" avatar={<span />} coverUrl={null} isPublic
    followerCount={1} followingCount={2} leading={<button aria-label="Voltar" />} trailing={<button aria-label="Ações da conta" />}
    onFollowers={vi.fn()} onFollowing={vi.fn()} />
</main>)

it('mantém os botões na barra fixa antes da capa e condensa com @usuário quando a capa passa por baixo dela', () => {
  const observers = mockObserver()
  const { container, unmount } = renderHeader()
  // Barra identificada pelo atributo de estado; a capa é o elemento seguinte (sem depender de classes CSS).
  const topbar = screen.getByRole('button', { name: 'Voltar' }).closest('[data-condensed]') as HTMLElement
  const cover = topbar.nextElementSibling as HTMLElement
  expect(cover.style.backgroundImage).toContain('arena-cover')
  expect(topbar.contains(screen.getByRole('button', { name: 'Voltar' }))).toBe(true)
  expect(topbar.contains(screen.getByRole('button', { name: 'Ações da conta' }))).toBe(true)
  expect(cover.querySelector('button')).toBeNull()
  expect(topbar.textContent).toBe('@atleta.dois')

  expect(observers).toHaveLength(1)
  expect(observers[0].observe).toHaveBeenCalledWith(cover)
  expect(observers[0].options).toMatchObject({ root: container.querySelector('main'), rootMargin: '-56px 0px 0px 0px' })
  expect(topbar.dataset.condensed).toBe('false')
  act(() => observers[0].callback([{ isIntersecting: false }]))
  expect(topbar.dataset.condensed).toBe('true')
  act(() => observers[0].callback([{ isIntersecting: true }]))
  expect(topbar.dataset.condensed).toBe('false')
  unmount()
  expect(observers[0].disconnect).toHaveBeenCalled()
})

it('funciona sem IntersectionObserver, mantendo a barra expandida', () => {
  vi.stubGlobal('IntersectionObserver', undefined)
  renderHeader()
  expect((screen.getByRole('button', { name: 'Voltar' }).closest('[data-condensed]') as HTMLElement).dataset.condensed).toBe('false')
  expect(screen.getByRole('heading', { name: '@atleta.dois' })).not.toBeNull()
})
