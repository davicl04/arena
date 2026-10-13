import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TOAST_DURATION, TOAST_LIMIT, toast } from '../src/components/ui/toast'
import type { ToastTone } from '../src/components/ui/toast'
import { findToast, queryToast, renderWithToaster, toastRegion } from './toast-utils'

afterEach(() => { cleanup(); vi.useRealTimers() })

const card = async (text: string) => (await findToast(text)).closest<HTMLElement>('[data-tone]')!

describe('durações por tom', () => {
  it('sucesso 4 s, informação 5 s, aviso 7 s; o erro fica até ser fechado', () => {
    expect(TOAST_DURATION).toEqual({ success: 4000, info: 5000, warning: 7000, error: 0 })
    expect(TOAST_LIMIT).toBe(4)
  })

  it.each<[ToastTone, number]>([['success', 4000], ['info', 5000], ['warning', 7000]])('o toast de %s some depois de %s ms, e só então', async (tone, duration) => {
    vi.useFakeTimers()
    renderWithToaster(<div />)
    act(() => { toast[tone]('Pronto.') })
    expect(queryToast('Pronto.')).not.toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(duration - 1) })
    expect(queryToast('Pronto.')).not.toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(queryToast('Pronto.')).toBeNull()
  })

  it('o erro não some sozinho', async () => {
    vi.useFakeTimers()
    renderWithToaster(<div />)
    act(() => { toast.error('Falhou.') })
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000) })
    expect(queryToast('Falhou.')).not.toBeNull()
  })
})

describe('cartão Anel', () => {
  it.each<[ToastTone, string]>([['success', 'Perfil salvo.'], ['info', 'Nada mudou.'], ['warning', 'Placares diferentes.'], ['error', 'Não foi possível salvar.']])(
    'o tom %s mostra título e descrição, com o anel e o X',
    async (tone, title) => {
      renderWithToaster(<div />)
      act(() => { toast[tone](title, { description: 'Detalhe do aviso.' }) })
      const root = await card(title)
      expect(root.getAttribute('data-tone')).toBe(tone)
      expect(within(root).getByText('Detalhe do aviso.')).toBeTruthy()
      const arc = root.querySelector('.toast-ring-arc')!
      // O anel esvazia durante a duração; no erro (sem tempo) fica cheio e parado.
      if (tone === 'error') expect(arc.hasAttribute('data-timed')).toBe(false)
      else expect((arc as SVGElement).style.getPropertyValue('--toast-duration')).toBe(`${TOAST_DURATION[tone]}ms`)
      // O erro (prioridade alta) fica fora da árvore de acessibilidade até receber foco (F6): o alerta oculto o anuncia.
      expect(within(root).getByRole('button', { name: 'Fechar aviso', hidden: tone === 'error' })).toBeTruthy()
      expect(root.getAttribute('role')).toBe('group')
    },
  )

  it('sem descrição nem ação, mostra só o título', async () => {
    renderWithToaster(<div />)
    act(() => { toast.success('Só o título.') })
    const root = await card('Só o título.')
    expect(root.querySelector('p')).toBeNull()
    expect(within(root).getAllByRole('button')).toHaveLength(1)
  })

  it('a ação é uma pílula com o rótulo, chama o clique e não fecha o toast sozinha', async () => {
    renderWithToaster(<div />)
    const onClick = vi.fn()
    act(() => { toast.warning('Vaga reservada.', { description: 'Envie o comprovante.', action: { label: 'Enviar agora', onClick } }) })
    const root = await card('Vaga reservada.')
    await userEvent.setup().click(within(root).getByRole('button', { name: 'Enviar agora' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('o X fecha o toast', async () => {
    renderWithToaster(<div />)
    act(() => { toast.error('Falhou.') })
    const root = await card('Falhou.')
    await userEvent.setup().click(within(root).getByRole('button', { name: 'Fechar aviso', hidden: true }))
    await waitFor(() => expect(queryToast('Falhou.')).toBeNull())
  })

  it('Esc fecha o toast em foco', async () => {
    renderWithToaster(<div />)
    act(() => { toast.error('Falhou.') })
    const root = await card('Falhou.')
    act(() => root.focus())
    await userEvent.setup().keyboard('{Escape}')
    await waitFor(() => expect(queryToast('Falhou.')).toBeNull())
  })

  it('toast.dismiss fecha por id; repetir o id atualiza em vez de empilhar', async () => {
    renderWithToaster(<div />)
    let id = ''
    act(() => { id = toast.info('Primeiro.', { id: 'conexao' }) })
    await findToast('Primeiro.')
    act(() => { toast.info('Segundo.', { id: 'conexao' }) })
    await findToast('Segundo.')
    expect(queryToast('Primeiro.')).toBeNull()
    expect(id).toBe('conexao')
    act(() => toast.dismiss(id))
    await waitFor(() => expect(queryToast('Segundo.')).toBeNull())
  })
})

describe('região viva e prioridade', () => {
  it('a região é única, nomeada e polida, com os toasts dentro', async () => {
    renderWithToaster(<div />)
    act(() => { toast.success('Salvo.') })
    await findToast('Salvo.')
    const region = toastRegion()
    expect(screen.getAllByRole('region', { name: 'Avisos' })).toHaveLength(1)
    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(within(region).getByText('Salvo.')).toBeTruthy()
  })

  it('só o erro tem prioridade alta: é anunciado na hora, em um alerta fora da fila polida', async () => {
    renderWithToaster(<div />)
    act(() => { toast.success('Salvo.') })
    await findToast('Salvo.')
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(0)
    act(() => { toast.error('Falhou ao salvar.') })
    await findToast('Falhou ao salvar.')
    const alerts = document.querySelectorAll('[role="alert"]')
    expect(alerts).toHaveLength(1)
    expect(alerts[0].textContent).toContain('Falhou ao salvar.')
    expect(toastRegion().contains(alerts[0])).toBe(false)
  })
})

describe('baralho', () => {
  it('guarda até 4 toasts: o mais novo na frente, os de trás marcados e o excedente limitado', async () => {
    renderWithToaster(<div />)
    act(() => { for (const name of ['Um', 'Dois', 'Três', 'Quatro', 'Cinco']) toast.success(name) })
    const front = await card('Cinco')
    expect(front.hasAttribute('data-behind')).toBe(false)
    expect((await card('Quatro')).hasAttribute('data-behind')).toBe(true)
    expect((await card('Dois')).hasAttribute('data-limited')).toBe(false)
    expect((await card('Um')).hasAttribute('data-limited')).toBe(true)
    // O X de um toast escondido atrás não entra na árvore de acessibilidade.
    expect(within(front).getByRole('button', { name: 'Fechar aviso' })).toBeTruthy()
    expect(within(await card('Quatro')).queryByRole('button', { name: 'Fechar aviso' })).toBeNull()
  })

  it('sem Toaster montado, chamar toast não faz nada nem lança erro', () => {
    expect(() => toast.success('Ninguém ouve.')).not.toThrow()
  })
})
