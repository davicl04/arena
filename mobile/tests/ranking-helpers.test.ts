import { describe, expect, it, vi } from 'vitest'
import { activeSports, categoryOf, categoryShort, categoryText, rankingKeyOf, subjectNoun } from '../src/components/ranking/category'
import { formSpoken, formatMetric, gapText, markDay, metricText } from '../src/components/ranking/metric'
import { inTier, ofTier, theTier, tierName, tierNeighbor } from '../src/components/ranking/tiers'
import { tierOrder, tierTint } from '../src/data/arena'
import { colors } from '../src/theme'
import { tierCounts } from './support/results'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))

describe('diferenças do Ranking (gapText)', () => {
  it('pontos: "7 pts" e "1 pt"; tênis igual', () => {
    expect(gapText(7, 'futebol_time')).toBe('7 pts')
    expect(gapText(1, 'futebol_time')).toBe('1 pt')
    expect(gapText(2.5, 'tenis')).toBe('2,5 pts')
    expect(gapText(-3, 'tenis')).toBe('3 pts')
  })

  it('média do individual com duas casas e tempo da corrida em m:ss ou h:mm:ss', () => {
    expect(gapText(0.28, 'futebol_individual')).toBe('0,28')
    expect(gapText(1, 'futebol_individual')).toBe('1')
    expect(gapText(42, 'corrida_5')).toBe('0:42')
    expect(gapText(3905, 'corrida_21')).toBe('1:05:05')
  })

  it('a métrica segue o formato do ranking', () => {
    expect(formatMetric(4.256, 'futebol_individual')).toBe('4,26')
    expect(metricText(94, 'futebol_time')).toBe('94 pontos')
    expect(metricText(1452, 'corrida_5')).toBe('24:12')
  })
})

describe('categoria do Ranking', () => {
  const choice = { sport: 'futebol' as const, kind: 'time' as const, format: 'society' as const, position: 'atacante' as const, distance: 5 as const }

  it('só manda os parâmetros da categoria e deriva a chave do ranking', () => {
    expect(categoryOf(choice)).toEqual({ sport: 'futebol', kind: 'time', format: 'society' })
    expect(categoryOf({ ...choice, kind: 'individual' })).toEqual({ sport: 'futebol', kind: 'individual', format: 'society', position: 'atacante' })
    expect(categoryOf({ ...choice, sport: 'tenis' })).toEqual({ sport: 'tenis' })
    expect(categoryOf({ ...choice, sport: 'corrida', distance: 21 })).toEqual({ sport: 'corrida', distance_km: 21 })
    expect(rankingKeyOf({ sport: 'futebol', kind: 'time' })).toBe('futebol_time')
    expect(rankingKeyOf({ sport: 'futebol', kind: 'individual' })).toBe('futebol_individual')
    expect(rankingKeyOf({ sport: 'tenis' })).toBe('tenis')
    expect(rankingKeyOf({ sport: 'corrida', distance_km: 10 })).toBe('corrida_10')
  })

  it('textos da categoria no cartão e nos estados vazios', () => {
    expect(categoryText({ sport: 'futebol', kind: 'time', format: 'society' })).toBe('Futebol · Society 7×7 · Times')
    expect(categoryText({ sport: 'futebol', kind: 'individual', format: 'campo', position: 'meio_campo' })).toBe('Futebol · Campo 11×11 · Meio de campo')
    expect(categoryText({ sport: 'futebol', kind: 'time' })).toBe('Futebol · Times')
    expect(categoryText({ sport: 'tenis' })).toBe('Tênis')
    expect(categoryText({ sport: 'corrida', distance_km: 5 })).toBe('Corrida · 5 km')
    expect(categoryShort({ sport: 'futebol', kind: 'time', format: 'futsal' })).toBe('Futsal')
    expect(categoryShort({ sport: 'futebol', kind: 'individual', format: 'futsal', position: 'defesa' })).toBe('Futsal · Defesa')
    expect(categoryShort({ sport: 'futebol', kind: 'time' })).toBe('')
    expect(categoryShort({ sport: 'tenis' })).toBe('Tênis')
    expect(categoryShort({ sport: 'corrida', distance_km: 42 })).toBe('42 km')
  })

  it('modalidades ativas seguem a ordem do app e os integrantes dependem do ranking', () => {
    expect(activeSports([{ sport: 'corrida' }, { sport: 'futebol' }])).toEqual(['futebol', 'corrida'])
    expect(activeSports([])).toEqual([])
    expect(subjectNoun({ sport: 'futebol', kind: 'time' })).toEqual({ one: 'time', many: 'times' })
    expect(subjectNoun({ sport: 'futebol', kind: 'individual' })).toEqual({ one: 'atleta', many: 'atletas' })
    expect(subjectNoun({ sport: 'tenis' })).toEqual({ one: 'atleta', many: 'atletas' })
  })
})

describe('elos do Ranking', () => {
  it('o vizinho pula os elos vazios nos dois sentidos e é nulo sem nenhum', () => {
    const counts = tierCounts({ bronze: 4, prata: 0, ouro: 0, diamante: 2, lendario: 1 })
    expect(tierNeighbor(counts, 'diamante', -1)).toBe('bronze')
    expect(tierNeighbor(counts, 'bronze', 1)).toBe('diamante')
    expect(tierNeighbor(counts, 'diamante', 1)).toBe('lendario')
    expect(tierNeighbor(counts, 'lendario', 1)).toBeNull()
    expect(tierNeighbor(counts, 'bronze', -1)).toBeNull()
    expect(tierNeighbor(tierCounts({ ouro: 3 }), 'ouro', 1)).toBeNull()
  })

  it('o Lendário é o Salão nas frases', () => {
    expect([tierName('lendario'), inTier('lendario'), ofTier('lendario'), theTier('lendario')]).toEqual(['Salão', 'no Salão', 'do Salão', 'o Salão'])
    expect([tierName('ouro'), inTier('ouro'), ofTier('ouro'), theTier('ouro')]).toEqual(['Ouro', 'no Ouro', 'do Ouro', 'o Ouro'])
  })

  it('a ordem vai do Bronze ao Lendário e cada elo tem o tom do tema', () => {
    expect(tierOrder).toEqual(['bronze', 'prata', 'ouro', 'diamante', 'lendario'])
    expect(tierTint.lendario).toBe(colors['tier-lendario-tint'])
    expect(colors.legend).toBe('#F4DE9A')
  })
})

describe('linha do Ranking', () => {
  it('a data da melhor marca vira dd/mm sem passar pelo fuso', () => {
    expect(markDay('2026-09-03')).toBe('03/09')
    expect(markDay('2026-01-31T23:59:00Z')).toBe('31/01')
    expect(markDay(null)).toBeNull()
    expect(markDay('ontem')).toBeNull()
  })

  it('a forma é lida do mais antigo ao mais recente', () => {
    expect(formSpoken(['V', 'V', 'E', 'D', 'V'])).toBe('Últimos resultados: vitória, vitória, empate, derrota, vitória')
  })
})
