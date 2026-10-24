import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOAST_DURATION, TOAST_EXIT_MS, TOAST_LIMIT, createToastStore, toast, toastStore } from '../src/components/toast/toastStore'
import { toastText, toasts } from './support/toast'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('toast: durações e tons', () => {
  it('um só mapa de durações: sucesso 4 s, informação 5 s, aviso 7 s e erro até ser fechado', () => {
    expect(TOAST_DURATION).toEqual({ success: 4000, info: 5000, warning: 7000, error: 0 })
    expect(TOAST_LIMIT).toBe(4)
  })

  it('cada chamada devolve um id, guarda o tom e leva descrição e ação', () => {
    const onClick = vi.fn()
    const first = toast.success('Perfil salvo.')
    const second = toast.warning('Vaga reservada.', { description: 'Envie o comprovante.', action: { label: 'Enviar', onClick } })
    toast.info('Dica'); toast.error('Falhou')
    expect(first).not.toBe(second)
    expect(toasts().map(item => item.tone)).toEqual(['success', 'warning', 'info', 'error'])
    expect(toasts()[1]).toMatchObject({ title: 'Vaga reservada.', description: 'Envie o comprovante.', actionLabel: 'Enviar' })
    toastStore.getState().toasts[1].action?.onClick()
    expect(onClick).toHaveBeenCalledOnce()
    expect(toastText()).toContain('Vaga reservada. Envie o comprovante.')
  })

  it.each([['success', 4000], ['info', 5000], ['warning', 7000]] as const)('o toast de %s sai sozinho depois de %i ms, com a saída animada', (tone, ms) => {
    toast[tone]('Pronto')
    vi.advanceTimersByTime(ms - 1)
    expect(toasts()).toHaveLength(1)
    expect(toasts()[0].ending).toBe(false)
    vi.advanceTimersByTime(1)
    expect(toasts()[0].ending).toBe(true)
    vi.advanceTimersByTime(TOAST_EXIT_MS)
    expect(toasts()).toEqual([])
  })

  it('o erro fica até ser fechado', () => {
    const id = toast.error('Não foi possível salvar.')
    vi.advanceTimersByTime(10 * 60_000)
    expect(toasts()).toHaveLength(1)
    expect(toastStore.getState().toasts[0]).toMatchObject({ duration: 0, runningSince: null })
    toast.dismiss(id)
    vi.advanceTimersByTime(TOAST_EXIT_MS)
    expect(toasts()).toEqual([])
  })
})

describe('toast: dispensar, id repetido e limite', () => {
  it('dispensa um toast pelo id, ou todos sem argumento; dispensar de novo ou um id desconhecido não faz nada', () => {
    const a = toast.error('A'); toast.error('B'); toast.error('C')
    toast.dismiss(a)
    toast.dismiss(a)
    toast.dismiss('nao-existe')
    expect(toasts().map(item => item.ending)).toEqual([true, false, false])
    toast.dismiss()
    expect(toasts().every(item => item.ending)).toBe(true)
    vi.advanceTimersByTime(TOAST_EXIT_MS)
    expect(toasts()).toEqual([])
  })

  it('repetir o id atualiza o toast no lugar e renova o tempo; se estava saindo, ele volta', () => {
    toast.success('Primeiro', { id: 'perfil' })
    vi.advanceTimersByTime(3000)
    toast.success('Segundo', { id: 'perfil' })
    expect(toasts()).toHaveLength(1)
    expect(toasts()[0].title).toBe('Segundo')
    expect(toastStore.getState().toasts[0].updateKey).toBe(1)
    vi.advanceTimersByTime(3999)
    expect(toasts()[0].ending).toBe(false)
    toast.dismiss('perfil')
    expect(toasts()[0].ending).toBe(true)
    toast.error('Voltou', { id: 'perfil' })
    expect(toasts()[0]).toMatchObject({ title: 'Voltou', ending: false, tone: 'error' })
    vi.advanceTimersByTime(TOAST_EXIT_MS * 2)
    expect(toasts()).toHaveLength(1)
  })

  it('a loja guarda todos; o viewport mostra só os quatro mais novos (o resto espera atrás)', () => {
    for (const title of ['1', '2', '3', '4', '5', '6']) toast.error(title)
    expect(toasts()).toHaveLength(6)
    expect(toasts().slice(-TOAST_LIMIT).map(item => item.title)).toEqual(['3', '4', '5', '6'])
  })
})

describe('toast: pausa', () => {
  it('pausar o tempo guarda o que falta e retomar continua dali; duas razões somam', () => {
    toast.success('Pausável')
    toast.error('Sem prazo')
    vi.advanceTimersByTime(1000)
    toastStore.setPaused('touch', true)
    toastStore.setPaused('app', true)
    expect(toastStore.getState().paused).toBe(true)
    expect(toastStore.getState().toasts[0]).toMatchObject({ remaining: 3000, runningSince: null })
    vi.advanceTimersByTime(60_000)
    expect(toasts()[0].ending).toBe(false)
    toastStore.setPaused('touch', false)
    expect(toastStore.getState().paused).toBe(true)
    toastStore.setPaused('app', false)
    expect(toastStore.getState().paused).toBe(false)
    vi.advanceTimersByTime(2999)
    expect(toasts()[0].ending).toBe(false)
    vi.advanceTimersByTime(1)
    expect(toasts()[0].ending).toBe(true)
  })

  it('repetir a mesma razão não muda nada, e um toast novo durante a pausa só corre depois dela', () => {
    toastStore.setPaused('app', true)
    toastStore.setPaused('app', true)
    toast.info('Chegou com o app em segundo plano')
    expect(toastStore.getState().toasts[0].runningSince).toBeNull()
    vi.advanceTimersByTime(30_000)
    expect(toasts()[0].ending).toBe(false)
    toastStore.setPaused('app', false)
    toastStore.setPaused('app', false)
    vi.advanceTimersByTime(5000)
    expect(toasts()[0].ending).toBe(true)
  })

  it('um toast que já está saindo não é pausado nem volta a correr', () => {
    toast.error('Saindo', { id: 'x' })
    toast.success('Outro')
    toast.dismiss('x')
    toastStore.setPaused('touch', true)
    toastStore.setPaused('touch', false)
    expect(toastStore.getState().toasts[0]).toMatchObject({ ending: true, runningSince: null })
  })
})

describe('toast: loja isolada', () => {
  it('assinantes são avisados a cada mudança até cancelarem; reset volta ao estado inicial e cancela os temporizadores', () => {
    const store = createToastStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.add('success', 'Oi')
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    store.add('info', 'Ola')
    expect(listener).toHaveBeenCalledTimes(1)
    store.setPaused('touch', true)
    store.reset()
    expect(store.getState()).toEqual({ toasts: [], paused: false })
    expect(vi.getTimerCount()).toBe(0)
    expect(store.add('error', 'Depois do reset')).toBe('toast-1')
  })
})
