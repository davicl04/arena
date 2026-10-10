import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProfileTabs from '../src/components/ProfileTabs'

afterEach(cleanup)

function Profile() {
  const [tab, setTab] = useState('Atividades')
  return <ProfileTabs value={tab} onChange={setTab} />
}

it('altera seleção ao clicar e mantém somente a aba ativa na sequência de Tab', async () => {
  render(<Profile />)
  await userEvent.click(screen.getByRole('tab', { name: 'Fotos' }))
  expect(screen.getByRole('tab', { name: 'Fotos' }).getAttribute('aria-selected')).toBe('true')
  expect(screen.getByRole('tab', { name: 'Fotos' }).tabIndex).toBe(0)
  expect(screen.getByRole('tab', { name: 'Atividades' }).tabIndex).toBe(-1)
})

it('permite setas com retorno circular, Home e End, mantendo seleção e foco juntos', async () => {
  render(<Profile />)
  const user = userEvent.setup()
  await user.tab()
  for (const [key, name] of [['{ArrowLeft}', 'Partidas'], ['{ArrowRight}', 'Atividades'],
    ['{ArrowRight}', 'Fotos'], ['{End}', 'Partidas'], ['{Home}', 'Atividades'], ['x', 'Atividades']]) {
    await user.keyboard(key)
    expect(document.activeElement).toBe(screen.getByRole('tab', { name }))
    expect(document.activeElement?.getAttribute('aria-selected')).toBe('true')
  }
})
