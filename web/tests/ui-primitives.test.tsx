import { StrictMode, useLayoutEffect, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CalendarDays, Grid3x3, LogOut, UserCog } from 'lucide-react'
import { Button, IconButton } from '../src/components/ui/button'
import { Chip, ChipLabel } from '../src/components/ui/chip'
import { Glass } from '../src/components/ui/glass'
import { ListGroup, ListHeading, ListRow } from '../src/components/ui/list-row'
import { PersonRow } from '../src/components/ui/person-row'
import { Sheet } from '../src/components/ui/sheet'
import { Tabs } from '../src/components/ui/tabs'
import { EmptyState } from '../src/components/ui/empty-state'
import { Card } from '../src/components/ui/card'
import { cn } from '../src/lib/utils'

afterEach(cleanup)

describe('Tabs', () => {
  function Harness() {
    const [value, setValue] = useState<'Fotos' | 'Partidas'>('Fotos')
    return <Tabs items={[{ value: 'Fotos', label: 'Fotos', Icon: Grid3x3 }, { value: 'Partidas', label: 'Partidas', Icon: CalendarDays }]}
      value={value} onChange={setValue} label="Conteúdo do perfil" idPrefix="tab-" controls="profile-content" />
  }

  it('mantém o teclado de ProfileTabs: tabindex itinerante, setas circulares, Home e End', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const list = screen.getByRole('tablist', { name: 'Conteúdo do perfil' })
    expect(screen.getByRole('tab', { name: 'Fotos' }).id).toBe('tab-Fotos')
    expect(screen.getByRole('tab', { name: 'Fotos' }).getAttribute('aria-controls')).toBe('profile-content')
    expect(screen.getByRole('tab', { name: 'Partidas' }).tabIndex).toBe(-1)
    await user.tab()
    for (const [key, name] of [['{ArrowLeft}', 'Partidas'], ['{ArrowRight}', 'Fotos'], ['{End}', 'Partidas'], ['{Home}', 'Fotos'], ['x', 'Fotos']]) {
      await user.keyboard(key)
      expect(document.activeElement).toBe(screen.getByRole('tab', { name }))
      expect(document.activeElement?.getAttribute('aria-selected')).toBe('true')
    }
    await user.click(screen.getByRole('tab', { name: 'Partidas' }))
    expect(screen.getByRole('tab', { name: 'Partidas' }).tabIndex).toBe(0)
    expect(list.dataset.slot).toBe('tabs')
  })
})

describe('Sheet', () => {
  it('é modal, foca [data-autofocus], fecha por Esc, fundo e botão Fechar', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<Sheet title="Nome" description="Aparece no seu perfil." onClose={onClose}><input aria-label="Campo" data-autofocus /></Sheet>)
    const dialog = screen.getByRole('dialog', { name: 'Nome' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByText('Aparece no seu perfil.')).not.toBeNull()
    expect(document.activeElement).toBe(screen.getByLabelText('Campo'))
    await user.keyboard('{Escape}')
    await user.click(screen.getByTestId('sheet-scrim'))
    await user.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(onClose).toHaveBeenCalledTimes(3)
  })
})

describe('Glass', () => {
  it('na variante screen é modal e rotulado pelo título; voltar e fechar chamam os callbacks', async () => {
    const onClose = vi.fn(); const onBack = vi.fn()
    const user = userEvent.setup()
    render(<Glass variant="screen" label="Ações" title="Bloquear conta" badge={2} onClose={onClose} onBack={onBack} backLabel="Voltar ao menu"><button>Ação</button></Glass>)
    const dialog = screen.getByRole('dialog', { name: 'Bloquear conta' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.dataset.variant).toBe('screen')
    expect(screen.getByText('2')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Voltar ao menu' }))
    await user.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('na variante media não é modal e usa o rótulo quando não há título', () => {
    render(<Glass variant="media" label="Ações da publicação" onClose={vi.fn()}><p>menu</p></Glass>)
    const dialog = screen.getByRole('dialog', { name: 'Ações da publicação' })
    expect(dialog.getAttribute('aria-modal')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Voltar' })).toBeNull()
  })

  it('devolve o foco ao gatilho mesmo quando ele perde o foco no commit em que o vidro abre', async () => {
    // Simula o Chrome: a pílula fica `visibility: hidden` junto com a abertura, é desfocada antes dos efeitos e não
    // aceita foco enquanto o vidro está aberto (aqui, `disabled` faz o papel do `visibility: hidden`).
    function Blurs({ target }: { target: () => HTMLElement | null }) {
      useLayoutEffect(() => { target()?.blur() }, [target])
      return null
    }
    function Harness() {
      const [open, setOpen] = useState(false)
      const trigger = () => document.querySelector<HTMLElement>('[data-trigger]')
      return <>
        <button data-trigger="" disabled={open} onClick={() => setOpen(true)}>Comentários (2)</button>
        {open && <><Blurs target={trigger} /><Glass variant="media" label="Comentários" onClose={() => setOpen(false)}><p>lista</p></Glass></>}
      </>
    }
    const user = userEvent.setup()
    // StrictMode repete o efeito com o foco já no vidro (como no desenvolvimento).
    render(<StrictMode><Harness /></StrictMode>)
    const trigger = screen.getByRole('button', { name: 'Comentários (2)' })
    trigger.focus()
    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(screen.getByRole('dialog', { name: 'Comentários' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Comentários' })).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})

describe('listas, pessoas, chips e estados', () => {
  it('ListRow é botão com chevron quando tem ação, estática sem ação e sem chevron no tom de perigo', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    const { container } = render(<><ListHeading>Conta</ListHeading><ListGroup>
      <ListRow Icon={UserCog} label="Editar perfil" value="Alterar" onClick={onClick} />
      <ListRow Icon={UserCog} label="E-mail" value="a@example.com" />
      <ListRow Icon={LogOut} label="Sair da conta" tone="danger" onClick={onClick} />
    </ListGroup></>)
    expect(screen.getByRole('heading', { name: 'Conta' })).not.toBeNull()
    await user.click(screen.getByRole('button', { name: /Editar perfil/ }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /E-mail/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Sair da conta/ }).dataset.tone).toBe('danger')
    expect(screen.getByRole('button', { name: /Editar perfil/ }).querySelectorAll('svg')).toHaveLength(2)
    expect(screen.getByRole('button', { name: /Sair da conta/ }).querySelectorAll('svg')).toHaveLength(1)
    expect(container.querySelectorAll('[data-slot="list-row"]')).toHaveLength(3)
  })

  it('PersonRow abre o perfil pelo rótulo e mostra informação e ações', async () => {
    const onOpen = vi.fn()
    const user = userEvent.setup()
    const person = { id: 7, name: 'Ana Souza', username: 'ana', avatar_url: null, cover_url: null, social_public: true, post_count: 0,
      follower_count: 0, following_count: 0, follows_you: true, follow_state: 'none' as const }
    render(<PersonRow person={person} info="Segue você" onOpen={onOpen} actions={<Button variant="secondary" size="compact">Remover</Button>} />)
    await user.click(screen.getByRole('button', { name: 'Abrir perfil de Ana Souza' }))
    expect(onOpen).toHaveBeenCalledWith(7)
    expect(screen.getByText('@ana')).not.toBeNull()
    expect(screen.getByText('Segue você')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Remover' })).not.toBeNull()
  })

  it('Chip expõe o estado ativo em data-active (usado pelo ícone da modalidade) e estados vazios têm título', () => {
    render(<><Chip aria-pressed>Futebol</Chip><Chip aria-pressed={false}>Tênis</Chip><ChipLabel size="sm" active>Corrida</ChipLabel>
      <IconButton aria-label="Fechar">x</IconButton>
      <EmptyState Icon={UserCog} title="Nada por aqui" text="Ainda vazio." /><Card radius="panel" elevated aria-label="Cartão" /></>)
    expect(screen.getByRole('button', { name: 'Futebol' }).hasAttribute('data-active')).toBe(true)
    expect(screen.getByRole('button', { name: 'Tênis' }).hasAttribute('data-active')).toBe(false)
    expect(screen.getByText('Corrida').hasAttribute('data-active')).toBe(true)
    expect(screen.getByRole('heading', { name: 'Nada por aqui' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Fechar' }).dataset.slot).toBe('icon-button')
    expect(screen.getByLabelText('Cartão').className).toContain('rounded-panel')
  })

  it('cn resolve conflitos também com os tokens ARENA', () => {
    expect(cn('rounded-card z-nav shadow-card', 'rounded-panel z-sheet shadow-primary')).toBe('rounded-panel z-sheet shadow-primary')
    expect(cn('text-ink text-[12px]', 'text-brand')).toBe('text-[12px] text-brand')
  })
})
