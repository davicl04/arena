import React from 'react'
import { act, create } from 'react-test-renderer'
import { expect, it, vi } from 'vitest'
import { Avatar, Cover } from '../src/components/media'

vi.mock('react-native', async () => {
  const react = await import('react')
  const element = (name: string) => ({ children, ...props }: Record<string, unknown>) => react.createElement(name, props, children as React.ReactNode)
  return { Image: element('Image'), Text: element('Text'), View: element('View') }
})
vi.mock('../src/api/client', () => ({ apiUrl: (path: string) => path }))

it.each(['avatar', 'capa'] as const)('%s tenta carregar a nova URL após falha da imagem anterior', async _name => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const render = (path: string, token: string) => _name === 'avatar'
    ? React.createElement(Avatar, { path, token, name: 'Atleta' })
    : React.createElement(Cover, { path, token })
  let tree!: ReturnType<typeof create>
  await act(async () => { tree = create(render('/old.webp', 'session-a')) })
  await act(async () => { tree.root.findByType('Image' as never).props.onError() })
  await act(async () => { tree.update(render('/new.webp', 'session-a')) })
  expect(tree.root.findAllByType('Image' as never)).toHaveLength(1)
  expect(tree.root.findByType('Image' as never).props.source.uri).toBe('/new.webp')
  await act(async () => { tree.unmount() })
})

it('tenta novamente a mesma URL quando uma nova sessão é iniciada', async () => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  let tree!: ReturnType<typeof create>
  await act(async () => { tree = create(React.createElement(Avatar, { path: '/avatar.webp', name: 'Atleta', token: 'session-a' })) })
  await act(async () => { tree.root.findByType('Image' as never).props.onError() })
  await act(async () => { tree.update(React.createElement(Avatar, { path: '/avatar.webp', name: 'Atleta', token: 'session-b' })) })
  expect(tree.root.findAllByType('Image' as never)).toHaveLength(1)
  expect(tree.root.findByType('Image' as never).props.source.headers.Authorization).toBe('Bearer session-b')
  await act(async () => { tree.unmount() })
})
