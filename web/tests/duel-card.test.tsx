import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DuelCard } from '../src/components/profile-matches/DuelCard'
import { RunDuelCard } from '../src/components/profile-matches/RunDuelCard'
import { daysUntil, groupByMonth, isFaded, markBadge, monthLabel, resultBadge, scoreCells, statsText } from '../src/components/profile-matches/timelineView'
import { athleteSide, match, run, tennisMatch } from './timeline-fixtures'

afterEach(cleanup)

const row = (side: 'a' | 'b') => document.querySelector(`[data-side="${side}"]`) as HTMLElement

describe('DuelCard', () => {
  it('mostra a vitória com o vencedor em destaque, o marcador você e a pílula de pontos', () => {
    render(<DuelCard match={match({ stats: { position: 'atacante', goals: 1, assists: 1, position_stat: null } })} own />)
    expect(screen.getByText('Vitória')).not.toBeNull()
    expect(row('a').getAttribute('data-winner')).toBe('true')
    expect(row('b').getAttribute('data-winner')).toBeNull()
    expect(within(row('a')).getByText('você')).not.toBeNull()
    expect(within(row('b')).queryByText('você')).toBeNull()
    expect(screen.getByText('+3')).not.toBeNull()
    expect(screen.getByText('1 gol · 1 assistência')).not.toBeNull()
    expect(screen.getByText(/Society/)).not.toBeNull()
  })

  it('esconde o marcador você no perfil visitado e não vira botão sem onOpen', () => {
    render(<DuelCard match={match()} own={false} />)
    expect(screen.queryByText('você')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByRole('article', { name: 'Ferrugem FC × Leões do Cerrado' })).not.toBeNull()
  })

  it('mostra empate e derrota com seus selos e pontos', () => {
    const { rerender } = render(<DuelCard match={match({ outcome: 'empate', score: { a: 2, b: 2, sets: null, winner: null }, points: 1 })} own />)
    expect(screen.getByText('Empate')).not.toBeNull()
    expect(screen.getByText('+1')).not.toBeNull()
    expect(document.querySelector('[data-winner]')).toBeNull()
    rerender(<DuelCard match={match({ outcome: 'derrota', score: { a: 0, b: 2, sets: null, winner: 'b' }, points: 0 })} own />)
    expect(screen.getByText('Derrota')).not.toBeNull()
    expect(within(row('b')).getByText('2')).not.toBeNull()
    expect(row('b').getAttribute('data-winner')).toBe('true')
    expect(document.querySelector('[data-slot="duel-points"]')?.textContent).toContain('0')
  })

  it('marca "Ausente" no lado que faltou e indica W.O. no selo', () => {
    render(<DuelCard match={match({ walkover_absent_side: 'b', score: { a: 1, b: 0, sets: null, winner: 'a' } })} own />)
    expect(screen.getByText('Vitória · W.O.')).not.toBeNull()
    expect(within(row('b')).getByText('Ausente')).not.toBeNull()
    expect(within(row('a')).queryByText('Ausente')).toBeNull()
  })

  it('mostra uma coluna por set no tênis, com o tie-break em expoente só no lado que perdeu o set', () => {
    render(<DuelCard match={tennisMatch()} own={false} />)
    expect(row('a').textContent).toContain('637')
    expect(row('b').textContent).toContain('4665')
    expect(screen.getByText('+10')).not.toBeNull()
    expect(row('a').querySelector('sup')).toBeNull()
    expect(row('b').querySelector('sup')?.textContent).toBe('5')
  })

  it('mostra a faixa do campeonato com o evento e a fase', () => {
    render(<DuelCard match={match({ origin: 'campeonato', event: { id: 4, name: 'Copa Sudoeste' }, round_label: 'Semifinal' })} own />)
    const band = document.querySelector('[data-slot="duel-event"]') as HTMLElement
    expect(band.textContent).toContain('Copa Sudoeste')
    expect(band.textContent).toContain('Semifinal')
  })

  it('esmaece cancelada e sem resultado, com – no placar e selo próprio', () => {
    const { rerender } = render(<DuelCard match={match({ state: 'cancelada', score: null, outcome: null, points: null })} own />)
    expect(screen.getByText('Cancelada')).not.toBeNull()
    expect(within(row('a')).getByText('–')).not.toBeNull()
    expect(document.querySelector('[data-slot="duel-points"]')).toBeNull()
    expect(document.querySelector('.opacity-70')).not.toBeNull()
    rerender(<DuelCard match={match({ state: 'sem_resultado', score: null, outcome: null, points: null })} own />)
    expect(screen.getByText('Sem resultado')).not.toBeNull()
  })

  it('vira botão que abre a partida só com onOpen e mostra a quadra do titular', async () => {
    const onOpen = vi.fn()
    render(<DuelCard match={match({ court: { name: 'Arena Sudoeste' } })} own onOpen={onOpen} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /Abrir partida: Ferrugem FC × Leões do Cerrado, Vitória/ }))
    expect(onOpen).toHaveBeenCalledWith(50)
    expect(screen.getByText(/Arena Sudoeste/)).not.toBeNull()
  })

  it('usa o nome do atleta no tênis e o título na ordem dos lados', () => {
    render(<DuelCard match={tennisMatch({ sides: [athleteSide('b', 2, 'Caio Ramos'), athleteSide('a', 1, 'Ricardo Moura', true)] })} own />)
    expect(screen.getByRole('article', { name: 'Ricardo Moura × Caio Ramos' })).not.toBeNull()
  })
})

describe('RunDuelCard', () => {
  it('compara a marca com o melhor anterior e indica o novo melhor', () => {
    render(<RunDuelCard run={run()} />)
    expect(screen.getByText('Novo melhor')).not.toBeNull()
    expect(screen.getByText('Esta marca')).not.toBeNull()
    expect(screen.getByText('24:12')).not.toBeNull()
    expect(screen.getByText('25:00')).not.toBeNull()
    expect(screen.getByText('Melhor anterior')).not.toBeNull()
    expect(screen.getByText(/Treino/)).not.toBeNull()
  })

  it('mostra a primeira marca sem marca anterior e o nome da prova', () => {
    render(<RunDuelCard run={run({ previous_best_s: null, mark_kind: 'primeira_marca', origin: { source: 'prova', label: 'Corrida do Lago', event_id: 9 } })} />)
    expect(screen.getByText('Primeira marca')).not.toBeNull()
    expect(screen.getByText('Sem marca anterior')).not.toBeNull()
    expect(screen.getByText(/Prova · Corrida do Lago/)).not.toBeNull()
  })

  it('não compara uma distância fora das faixas e não mostra selo sem melhora', () => {
    render(<RunDuelCard run={run({ standard_distance_km: null, previous_best_s: null, mark_kind: null, distance_m: 7500 })} />)
    expect(screen.queryByText('Melhor anterior')).toBeNull()
    expect(screen.queryByText('Sem marca anterior')).toBeNull()
    expect(document.querySelector('[data-slot="state-badge"]')).toBeNull()
    expect(screen.getByText(/7,5 km/)).not.toBeNull()
  })
})

describe('timelineView', () => {
  it('esmaece só sem resultado e cancelada; placar confirmado com a janela aberta (realizada) não', () => {
    expect(isFaded({ state: 'realizada' })).toBe(false)
    expect(isFaded({ state: 'encerrada' })).toBe(false)
    expect(isFaded({ state: 'sem_resultado' })).toBe(true)
    expect(isFaded({ state: 'cancelada' })).toBe(true)
  })

  it('monta selos, textos e meses', () => {
    expect(resultBadge(match({ outcome: 'derrota', walkover_absent_side: 'a' }))).toMatchObject({ label: 'Derrota · W.O.', dashed: false })
    expect(resultBadge(match({ state: 'encerrada', outcome: null })).label).toBe('Sem resultado')
    expect(markBadge('sem_melhora')).toBeNull()
    expect(statsText({ position: 'defesa', goals: 2, assists: 0, position_stat: 3 })).toBe('2 gols · 3 desarmes')
    expect(statsText({ position: null, goals: 0, assists: null, position_stat: null })).toBeNull()
    expect(scoreCells({ sport: 'futebol', score: null }, 'a')).toEqual([{ value: '–', tiebreak: null }])
    expect(monthLabel('2026-10-10T19:00:00Z')).toBe('outubro 2026')
    expect(monthLabel('x')).toBe('')
    expect(groupByMonth([match(), run({ occurred_at: '2026-10-01T00:00:00Z', date: '2026-09-30' })]).map(group => group.month)).toEqual(['outubro 2026', 'setembro 2026'])
    const now = new Date(2026, 9, 12, 10)
    expect(daysUntil(new Date(2026, 9, 12, 20).toISOString(), now)).toBe('Hoje')
    expect(daysUntil(new Date(2026, 9, 13, 8).toISOString(), now)).toBe('Amanhã')
    expect(daysUntil(new Date(2026, 9, 18, 16).toISOString(), now)).toBe('Em 6 dias')
  })
})
