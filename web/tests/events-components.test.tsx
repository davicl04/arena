import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { FileSearch } from 'lucide-react'
import { EventPoster, NewEventPoster } from '../src/components/events/EventPoster'
import { PaymentInfoSheet } from '../src/components/events/PaymentInfoSheet'
import { PixBlock } from '../src/components/events/PixBlock'
import type { PixInfo } from '../src/components/events/pix'
import { StateBadge } from '../src/components/events/StateBadge'
import { DeadlineRing, StatusCard, StatusCardButton } from '../src/components/events/StatusCard'
import { findToast, queryToast, renderWithToaster } from './toast-utils'

const pix: PixInfo = {
  holder: 'Rafa Nunes',
  keyType: 'email',
  key: 'copa.sudoeste@pix.com',
  copyPaste: '00020126580014BR.GOV.BCB.PIX0136copa.sudoeste@pix.com5204000053039865406240.00',
  instructions: 'Use o nome do time na descrição do Pix.',
  contact: '(61) 99999-0000',
}
const localIso = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m, d, h, min).toISOString()

/** Área de transferência simulada: `writeText` resolve ou falha. */
function stubClipboard(writeText: (text: string) => Promise<void>) {
  const spy = vi.fn(writeText)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: spy }, configurable: true })
  return spy
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  Reflect.deleteProperty(navigator, 'clipboard')
  window.getSelection()?.removeAllRanges()
})

describe('EventPoster', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
  })

  it('mostra dia, mês, elos aceitos, formato, preço e a barra de inscrições (E2)', () => {
    const onClick = vi.fn()
    render(<EventPoster name="Copa Sudoeste Society" sport="futebol" startsAt={localIso(2026, 9, 25, 9)} format="society"
      eventType="eliminacao_simples" priceCents={24000} acceptedTiers={['prata', 'ouro']} entries={{ count: 5, capacity: 8 }} onClick={onClick} />)
    const poster = screen.getByRole('button', { name: /Copa Sudoeste Society/ })
    expect(poster.textContent).toContain('domingo, 25 de outubro')
    expect(poster.textContent).toContain('Para Prata e Ouro')
    expect(poster.textContent).toContain('Society 7×7 · Eliminação simples')
    expect(poster.textContent).toContain('5 de 8 times')
    expect(poster.textContent).toContain('R$ 240')
    expect(poster.querySelectorAll('img[src^="/images/brand/"]')).toHaveLength(2)
    expect(within(poster).getByText('25').closest('[aria-hidden="true"]')).toBeTruthy()
    fireEvent.click(poster)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('fica apagado, com cadeado, fora da faixa; aberto a todos mostra o globo', () => {
    const { rerender } = render(<EventPoster name="Desafio Saibro Ouro" sport="tenis" startsAt={localIso(2026, 10, 15)} eventType="todos_contra_todos"
      priceCents={0} acceptedTiers={['ouro']} locked />)
    const poster = document.querySelector<HTMLElement>('[data-slot="event-poster"]')!
    expect(poster.tagName).toBe('DIV')
    expect(poster.hasAttribute('data-locked')).toBe(true)
    expect(poster.className).toContain('opacity-55')
    expect(poster.textContent).toContain('Fora da faixa')
    expect(poster.textContent).toContain('Gratuito')
    expect(poster.querySelector('.lucide-lock')).toBeTruthy()

    rerender(<EventPoster name="Corrida do Lago" sport="corrida" startsAt={null} distanceKm={10} priceCents={6000} acceptedTiers={[]} entryState="confirmada" />)
    expect(poster.hasAttribute('data-locked')).toBe(false)
    expect(poster.textContent).toContain('Aberto a todos')
    expect(poster.textContent).toContain('Sem data definida')
    expect(poster.textContent).toContain('10 km · Prova')
    expect(poster.textContent).toContain('Inscrito')
    expect(poster.querySelector('.lucide-globe')).toBeTruthy()
  })

  it('leva o estado do evento no canto e as pendências do organizador (O3)', () => {
    const { rerender } = render(<EventPoster name="Liga Society Noturna" sport="futebol" startsAt={localIso(2026, 9, 14)} format="society"
      eventType="todos_contra_todos" priceCents={30000} state="em_andamento" pendingCount={3} entries={{ count: 6, capacity: 6 }} />)
    const poster = document.querySelector<HTMLElement>('[data-slot="event-poster"]')!
    expect(within(poster).getByText('Em andamento').getAttribute('data-tone')).toBe('live')
    expect(poster.textContent).toContain('3 pendências')

    rerender(<EventPoster name="Copa Inverno" sport="futebol" startsAt={localIso(2026, 6, 12)} priceCents={18000} state="encerrado" showSport />)
    expect(poster.className).toContain('opacity-60')
    expect(poster.querySelector('[data-slot="sport-icon"]')).toBeTruthy()

    rerender(<EventPoster name="Novo" sport="tenis" startsAt={localIso(2026, 10, 15)} priceCents={8000} state="rascunho" stateLabel="Vai para aprovação" pendingCount={1} />)
    expect(poster.textContent).toContain('Vai para aprovação')
    expect(poster.textContent).toContain('1 pendência')
  })

  it('tem a variante grande do detalhe e da gestão, com organizador e chips (D2/G3)', () => {
    render(<EventPoster size="hero" name="Copa Sudoeste Society" organizer="Liga Sudoeste" sport="futebol" startsAt={localIso(2026, 9, 25)}
      format="society" eventType="eliminacao_simples" priceCents={24000} acceptedTiers={['prata']} state="publicado" onClick={() => {}} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Copa Sudoeste Society' })).toBeTruthy()
    const poster = document.querySelector<HTMLElement>('[data-slot="event-poster"]')!
    expect(poster.getAttribute('data-size')).toBe('hero')
    expect(poster.textContent).toContain('out · dom')
    expect(poster.textContent).toContain('Liga Sudoeste')
    expect(poster.textContent).toContain('Inscrições abertas')
    expect(within(poster).getByText(/^R\$\s240$/).className).toContain('bg-mint')
  })

  it('termina a lista do organizador com o cartaz tracejado "Novo evento"', () => {
    const onClick = vi.fn()
    render(<NewEventPoster onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Novo evento' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('StateBadge', () => {
  it('aplica o tom conforme a superfície', () => {
    const { rerender } = render(<StateBadge tone="pending">Em aprovação</StateBadge>)
    expect(screen.getByText('Em aprovação').className).toContain('bg-warning-bg')
    rerender(<StateBadge tone="open" surface="dark">Inscrições abertas</StateBadge>)
    expect(screen.getByText('Inscrições abertas').className).toContain('bg-mint')
  })
})

describe('StatusCard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
  })

  it('mostra a vaga reservada com o anel das horas restantes e atualiza a cada minuto', () => {
    const deadline = new Date(2026, 9, 14, 8, 0).toISOString()
    const windowStart = new Date(2026, 9, 12, 8, 0).toISOString()
    render(<StatusCard tone="aguardando" title="Vaga reservada" deadline={deadline} windowStart={windowStart}
      actions={<><StatusCardButton>Copiar chave Pix</StatusCardButton><StatusCardButton variant="secondary">Pagamento</StatusCardButton></>}>
      Envie o comprovante até <b>qua, 14 out · 08:00</b>.
    </StatusCard>)
    const card = document.querySelector<HTMLElement>('[data-slot="status-card"]')!
    const ring = card.querySelector<HTMLElement>('[data-slot="deadline-ring"]')!
    expect(card.getAttribute('data-tone')).toBe('aguardando')
    expect(ring.textContent).toContain('46 h')
    expect(ring.textContent).toContain('46 horas restantes')
    expect(Number(ring.getAttribute('data-fraction'))).toBeCloseTo(46 / 48, 3)
    expect(screen.getByRole('button', { name: 'Pagamento' }).className).toContain('border-white/25')
    expect(card.textContent).toContain('qua, 14 out · 08:00')

    act(() => { vi.advanceTimersByTime(60 * 60_000) })
    expect(ring.textContent).toContain('45 horas restantes')
  })

  it('usa a janela de 48 h quando não sabe o início e trata o prazo vencido', () => {
    render(<DeadlineRing deadline={new Date(2026, 9, 13, 10, 0).toISOString()} />)
    const ring = document.querySelector<HTMLElement>('[data-slot="deadline-ring"]')!
    expect(Number(ring.getAttribute('data-fraction'))).toBeCloseTo(0.5, 3)
    act(() => { vi.setSystemTime(new Date(2026, 9, 13, 11, 0)); vi.advanceTimersByTime(60_000) })
    expect(ring.textContent).toContain('Prazo encerrado')
    expect(ring.getAttribute('data-fraction')).toBe('0.000')
  })

  it('tem os estados confirmado, divergente e genérico', () => {
    const { rerender } = render(<StatusCard tone="confirmado" title="Inscrição confirmada" pill="Ferrugem">Pagamento aprovado pelo organizador.</StatusCard>)
    const card = document.querySelector<HTMLElement>('[data-slot="status-card"]')!
    expect(card.querySelector('.lucide-check')).toBeTruthy()
    expect(screen.getByText('Ferrugem').className).toContain('bg-mint')

    rerender(<StatusCard tone="divergente" title="Placares diferentes" actions={<StatusCardButton>Conversar</StatusCardButton>}>
      <b>2 × 1</b> contra <b>1 × 1</b>.
    </StatusCard>)
    expect(card.querySelector('.lucide-equal-not')).toBeTruthy()
    expect(card.className).toContain('items-start')

    rerender(<StatusCard tone="aguardando" title="Comprovante em análise" icon={FileSearch} />)
    expect(card.querySelector('[data-slot="deadline-ring"]')).toBeNull()
    expect(card.querySelector('.lucide-file-search')).toBeTruthy()

    rerender(<StatusCard tone="neutro" title="Inscrições fecham em breve" />)
    expect(card.querySelector('.lucide-info')).toBeTruthy()
    expect(card.querySelector('small')).toBeNull()
  })
})

describe('PixBlock', () => {
  it.each(['sucesso', 'falha'] as const)('aguarda a área de transferência antes de anunciar %s', async outcome => {
    let resolveCopy!: () => void
    let rejectCopy!: (reason: Error) => void
    const pending = new Promise<void>((resolve, reject) => { resolveCopy = resolve; rejectCopy = reject })
    stubClipboard(() => pending)
    renderWithToaster(<PixBlock pix={pix} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copiar chave Pix' }))
    // Com writeText pendente, ainda não há toast nem ✓: o retorno só sai depois da resposta assíncrona.
    await act(async () => {})
    expect(queryToast(/copiada|copiar/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Copiar chave Pix' }).querySelector('.lucide-check')).toBeNull()

    await act(async () => { if (outcome === 'sucesso') resolveCopy(); else rejectCopy(new Error('negado')) })
    const toast = await findToast(outcome === 'sucesso' ? 'Chave Pix copiada.' : 'Não foi possível copiar. Selecione a chave e copie manualmente.')
    expect(toast.closest('[data-tone]')?.getAttribute('data-tone')).toBe(outcome === 'sucesso' ? 'success' : 'warning')
  })

  it('copia a chave e o Copia e Cola e anuncia o retorno', async () => {
    const writeText = stubClipboard(async () => {})
    const onInfo = vi.fn()
    renderWithToaster(<PixBlock pix={pix} priceCents={24000} onInfo={onInfo} />)
    expect(screen.getByText('Rafa Nunes · chave por e-mail')).toBeTruthy()
    expect(screen.getByText(pix.key).tagName).toBe('CODE')

    fireEvent.click(screen.getByRole('button', { name: 'Copiar chave Pix' }))
    expect(writeText).toHaveBeenCalledWith(pix.key)
    expect(await findToast('Chave Pix copiada.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copiar chave Pix' }).querySelector('.lucide-check')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Copiar Pix Copia e Cola · R\$/ }))
    expect(writeText).toHaveBeenLastCalledWith(pix.copyPaste)
    expect(await findToast('Pix Copia e Cola copiado. Cole no app do seu banco.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Informações de pagamento' }))
    expect(onInfo).toHaveBeenCalledOnce()
  })

  it('deixa a chave selecionada e mostra o código quando a cópia falha', async () => {
    stubClipboard(async () => { throw new Error('negado') })
    renderWithToaster(<PixBlock pix={pix} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copiar chave Pix' }))
    expect(await findToast('Não foi possível copiar. Selecione a chave e copie manualmente.')).toBeTruthy()
    expect(window.getSelection()?.getRangeAt(0).toString()).toBe(pix.key)
    expect(screen.queryByRole('textbox')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Copiar Pix Copia e Cola' }))
    const code = await screen.findByRole('textbox', { name: 'Código Pix Copia e Cola' }) as HTMLTextAreaElement
    expect(code.value).toBe(pix.copyPaste)
    expect(code.readOnly).toBe(true)
    expect(document.activeElement).toBe(code)
    expect([code.selectionStart, code.selectionEnd]).toEqual([0, pix.copyPaste!.length])
    expect(await findToast(/Selecione o código/)).toBeTruthy()
  })

  it('falha sem área de transferência e omite o Copia e Cola quando não foi informado', async () => {
    renderWithToaster(<PixBlock pix={{ ...pix, copyPaste: null, keyType: 'cpf' }} title="Pix informado" />)
    expect(screen.getByText('Pix informado')).toBeTruthy()
    expect(screen.getByText('Rafa Nunes · chave por CPF')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Copia e Cola/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Informações de pagamento' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Copiar chave Pix' }))
    expect(await findToast(/Não foi possível copiar/)).toBeTruthy()
  })
})

describe('PaymentInfoSheet', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
  })

  it('reúne valor, favorecido, chave, código, prazo, passos, instruções e o aviso', async () => {
    const writeText = stubClipboard(async () => {})
    const onClose = vi.fn()
    renderWithToaster(<PaymentInfoSheet eventName="Copa Sudoeste Society" priceCents={24000} sport="futebol" pix={pix}
      receiptDeadline={localIso(2026, 9, 13, 21, 40)} onClose={onClose} />)
    const sheet = screen.getByRole('dialog', { name: 'Pagamento e informações' })
    expect(sheet.textContent).toContain('Copa Sudoeste Society')
    expect(sheet.textContent).toContain('R$ 240,00')
    expect(sheet.textContent).toContain('por time')
    expect(sheet.textContent).toContain('Chave Pix (e-mail)')
    expect(sheet.textContent).toContain('Comprovante até ter, 13 out · 21:40')
    expect(within(sheet).getAllByRole('listitem')).toHaveLength(4)
    expect(sheet.textContent).toContain('Use o nome do time na descrição do Pix.')
    expect(sheet.textContent).toContain('O Arena não recebe nem guarda pagamentos.')

    fireEvent.click(within(sheet).getByRole('button', { name: 'Copiar Pix Copia e Cola' }))
    expect(writeText).toHaveBeenCalledWith(pix.copyPaste)
    expect(await findToast(/Pix Copia e Cola copiado/)).toBeTruthy()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Copiar contato' }))
    expect(writeText).toHaveBeenLastCalledWith(pix.contact)

    fireEvent.click(within(sheet).getByRole('button', { name: 'Fechar' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('explica o prazo sem reserva, omite o que não foi informado e seleciona o item quando a cópia falha', async () => {
    stubClipboard(async () => { throw new Error('negado') })
    renderWithToaster(<PaymentInfoSheet eventName="Corrida do Lago" priceCents={6000} sport="corrida"
      pix={{ holder: 'Assessoria Passo Certo', keyType: 'aleatoria', key: '7f3c-91aa' }} onClose={() => {}} />)
    const sheet = screen.getByRole('dialog')
    expect(sheet.textContent).toContain('Comprovante em até 48 h após reservar')
    expect(sheet.textContent).not.toContain('por time')
    expect(sheet.textContent).toContain('Chave Pix (chave aleatória)')
    expect(within(sheet).queryByRole('button', { name: 'Copiar Pix Copia e Cola' })).toBeNull()
    expect(within(sheet).queryByRole('region', { name: 'Instruções do organizador' })).toBeNull()

    fireEvent.click(within(sheet).getByRole('button', { name: 'Copiar chave Pix' }))
    expect(await findToast(/Selecione a chave/)).toBeTruthy()
    expect(window.getSelection()?.getRangeAt(0).toString()).toBe('7f3c-91aa')
  })

  it('mostra o código selecionável quando o Copia e Cola não copia', async () => {
    stubClipboard(async () => { throw new Error('negado') })
    renderWithToaster(<PaymentInfoSheet eventName="Copa" priceCents={24000} pix={pix} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copiar Pix Copia e Cola' }))
    const code = await screen.findByRole('textbox', { name: 'Código Pix Copia e Cola' }) as HTMLTextAreaElement
    expect(code.value).toBe(pix.copyPaste)
    expect(document.activeElement).toBe(code)
  })
})
