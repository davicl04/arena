import { describe, expect, it, vi } from 'vitest'
import type { RunBest } from '../src/api/runs'
import { formatChips } from '../src/components/play/formatChips'
import { matchDetail as matchLine, matchTitle, matchWhen, nextScheduledMatch, positionLabel, sideTierName } from '../src/components/play/matchView'
import { MAX_GOALKEEPER_SLOTS, emptySlots, slotsSummary } from '../src/components/play/slots'
import {
  avulsoLine, facesText, formatDuration, levelsText, lineView, normalizeStandings, rankedTier, runBestLine, teamLine,
} from '../src/components/play/tierLines'
import {
  MAX_DURATION_S, distanceLabel, formatKm, formatPace, formatRunDate, fromSeconds, impactView, originInline, originLabel, paceOf, standardMeters, toSeconds,
} from '../src/components/play/runView'
import {
  courtKindOf, currentSlotCounts, eventWhen, guestSlots, headerNames, matchPhases, maxSlots, nameOf, noSlots, openSlotCounts, orderedSides, shortName,
  sideName, sideOf, slotPositions, slotTotal, whenText,
} from '../src/data/match'
import { formatCountdown, formatElapsed, spokenDuration } from '../src/utils/clock'
import { impact as runImpact, lago, markCard, sec, treino } from './support/runs'
import {
  athleteSide, caio, court, ferrugemRef, fromNow, matchCard, matchDetail, person, scheduled, sides, slot, standings, teamSide,
} from './support/play'

vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))

describe('nomes dos lados e textos da partida (data/match)', () => {
  it('nome do lado: o do time, o do atleta ou o texto padrão', () => {
    const [a, b] = sides()
    expect(sideName(a)).toBe('Ferrugem FC')
    expect(sideName(athleteSide('b', person(9, 'Beatriz Lima')))).toBe('Beatriz Lima')
    expect(sideName(undefined)).toBe('Adversário')
    expect(sideName(null, 'A definir')).toBe('A definir')
    expect(sideOf({ sides: [a, b] }, 'b')).toBe(b)
    expect(sideOf({ sides: [a, b] }, null)).toBeUndefined()
    expect(nameOf({ sides: [a, b] }, 'b')).toBe('Leões do Cerrado')
    expect(nameOf({ sides: [a] }, 'b', 'Seu adversário')).toBe('Seu adversário')
  })

  it('o meu lado vem primeiro; sem lado (administração), A × B', () => {
    const [a, b] = sides()
    expect(orderedSides({ sides: [a, b], my_side: 'b' })).toEqual([b, a])
    expect(orderedSides({ sides: [a, b], my_side: 'a' })).toEqual([a, b])
    expect(orderedSides({ sides: [a, b], my_side: null })).toEqual([a, b])
  })

  it('nome curto e cabeçalho: a primeira palavra, ou o nome inteiro quando as primeiras palavras se repetem', () => {
    const [a, b] = sides()
    expect(shortName(a)).toBe('Ferrugem')
    expect(shortName(undefined)).toBe('Adversário')
    expect(headerNames([a, b])).toEqual(['Ferrugem', 'Leões'])
    const twin = teamSide('b', { id: 30, name: 'Ferrugem Velha', initials: 'FV', crest_url: null })
    expect(headerNames([a, twin])).toEqual(['Ferrugem FC', 'Ferrugem Velha'])
  })

  it('data e hora no fuso do aparelho; inválida ou ausente vira texto vazio', () => {
    expect(whenText('2026-10-20T22:00:00Z')).toMatch(/^ter, 20 out · \d\d:\d\d$/)
    expect(whenText(null)).toBe('')
    expect(whenText('nada')).toBe('')
    expect(eventWhen({ starts_at: '2026-10-20T22:00:00Z' })).toMatch(/^ter, 20 out/)
    expect(eventWhen({ starts_at: 5 })).toBe('')
    expect(eventWhen(null)).toBe('')
  })

  it('o tipo da quadra é o formato do futebol ou tenis', () => {
    expect(courtKindOf({ sport: 'futebol', format: 'campo' })).toBe('campo')
    expect(courtKindOf({ sport: 'tenis', format: null })).toBe('tenis')
    expect(courtKindOf({ sport: 'futebol', format: null })).toBeUndefined()
  })

  it('cada fase do cartão tem rótulo e tom', () => {
    expect(Object.keys(matchPhases)).toHaveLength(13)
    expect(matchPhases.agendada).toEqual({ label: 'Agendada', tone: 'open' })
    expect(matchPhases.wo_contestado).toEqual({ label: 'W.O. contestado', tone: 'danger' })
    expect(matchPhases.informar_resultado.label).toBe('Aguardando placar')
  })
})

describe('vagas para avulsos', () => {
  it('conta as vagas abertas ou oferecidas do meu lado por posição, sem as preenchidas', () => {
    const list = [slot(1, { position: 'goleiro' }), slot(2, { position: 'atacante', state: 'oferecida' }), slot(3, { position: 'atacante', state: 'preenchida', guest: caio }), slot(4, { side: 'b', position: 'defesa' })]
    expect(openSlotCounts(list, 'a')).toEqual({ goleiro: 1, defesa: 0, meio_campo: 0, atacante: 1 })
    expect(openSlotCounts(list, 'b')).toEqual({ goleiro: 0, defesa: 1, meio_campo: 0, atacante: 0 })
    expect(openSlotCounts(list, null)).toEqual(noSlots())
    expect(guestSlots(list, 'a').map(item => item.id)).toEqual([3])
    expect(guestSlots(list, 'b')).toEqual([])
  })

  it('em combinando valem as vagas declaradas na busca; depois, as da partida', () => {
    const declared = { goleiro: 1, defesa: 0, meio_campo: 2, atacante: 0 }
    const arranging = matchDetail({ sides: sides({ declared_slots: declared }) })
    expect(currentSlotCounts(arranging)).toEqual(declared)
    expect(currentSlotCounts(matchDetail({ sides: sides({ declared_slots: null }) }))).toEqual(noSlots())
    const agreed = scheduled(72, { slots: [slot(1, { position: 'defesa' })] })
    expect(currentSlotCounts(agreed)).toEqual({ goleiro: 0, defesa: 1, meio_campo: 0, atacante: 0 })
  })

  it('soma as vagas e limita ao formato menos um', () => {
    expect(slotTotal({ goleiro: 1, defesa: 2 })).toBe(3)
    expect(slotTotal(null)).toBe(0)
    expect([maxSlots('futsal'), maxSlots('society'), maxSlots('campo'), maxSlots(null)]).toEqual([4, 6, 10, 0])
    expect(slotPositions.map(item => item.value)).toEqual(['goleiro', 'defesa', 'meio_campo', 'atacante'])
    expect(MAX_GOALKEEPER_SLOTS).toBe(1)
    expect(emptySlots).toEqual({ goleiro: 0, defesa: 0, meio_campo: 0, atacante: 0 })
  })

  it('resume as vagas em português', () => {
    expect(slotsSummary(null)).toBe('Time completo, sem vagas para avulsos')
    expect(slotsSummary({ goleiro: 0, defesa: 0, meio_campo: 0, atacante: 0 })).toBe('Time completo, sem vagas para avulsos')
    expect(slotsSummary({ goleiro: 1, defesa: 0, meio_campo: 0, atacante: 1 })).toBe('2 vagas para avulsos: goleiro, atacante')
    expect(slotsSummary({ goleiro: 0, defesa: 0, meio_campo: 0, atacante: 1 })).toBe('1 vaga para avulsos: atacante')
    expect(slotsSummary({ goleiro: 0, defesa: 2, meio_campo: 1, atacante: 0 })).toBe('3 vagas para avulsos: 2 defesa, meio de campo')
  })
})

describe('cartão da partida (matchView)', () => {
  it('título com o meu lado primeiro; sem adversário, "adversário a definir"', () => {
    expect(matchTitle(matchCard())).toBe('Ferrugem FC × Leões do Cerrado')
    expect(matchTitle({ sides: sides(), my_side: 'b' })).toBe('Leões do Cerrado × Ferrugem FC')
    expect(matchTitle({ sides: [teamSide('a', ferrugemRef)], my_side: 'a' })).toBe('Ferrugem FC × adversário a definir')
    expect(matchTitle({ sides: sides(), my_side: null })).toBe('Ferrugem FC × Leões do Cerrado')
  })

  it('data, quadra ou o que falta combinar', () => {
    const now = new Date(2026, 9, 12, 12, 0)
    const starts = new Date(2026, 9, 18, 16, 0).toISOString()
    expect(matchWhen(matchCard({ starts_at: starts, court: court() }), now)).toBe('dom, 18 out · 16:00 · Arena Sudoeste')
    expect(matchWhen(matchCard({ starts_at: starts, court: null }), now)).toBe('dom, 18 out · 16:00')
    expect(matchWhen(matchCard({ phase: 'combinando' }), now)).toBe('Data e quadra a combinar no chat')
    expect(matchWhen(matchCard({ phase: 'agendada' }), now)).toBe('Data a definir')
  })

  it('linha de apoio: o placar final, o prazo do placar ou o horário', () => {
    const now = new Date(2026, 9, 12, 12, 0)
    const starts = new Date(2026, 9, 11, 16, 0).toISOString()
    const score = { a: 3, b: 1, sets: null, winner: 'a' as const }
    expect(matchLine(matchCard({ phase: 'confirmado', state: 'realizada', score, starts_at: starts }), now)).toBe('Placar 3 × 1 · dom, 11 out · 16:00')
    expect(matchLine(matchCard({ phase: 'informar_resultado', state: 'agendada', starts_at: starts, result_deadline: new Date(2026, 9, 13, 16, 0).toISOString() }), now))
      .toBe('Informe o placar até ter, 13 out · 16:00')
    expect(matchLine(matchCard({ phase: 'informar_resultado', state: 'agendada', starts_at: null, result_deadline: null }), now)).toBe('Data a definir')
    expect(matchLine(matchCard({ phase: 'confirmado', score: null, starts_at: starts }), now)).toBe('dom, 11 out · 16:00')
  })

  it('a próxima partida é a agendada, ainda não iniciada, de horário mais próximo', () => {
    const now = Date.now()
    const soon = matchCard({ id: 1, state: 'agendada', phase: 'agendada', starts_at: fromNow(2) })
    const later = matchCard({ id: 2, state: 'agendada', phase: 'agendada', starts_at: fromNow(30) })
    const started = matchCard({ id: 3, state: 'agendada', phase: 'agendada', starts_at: fromNow(-1) })
    const arranging = matchCard({ id: 4, state: 'combinando', starts_at: fromNow(1) })
    expect(nextScheduledMatch([later, soon, started, arranging], now)?.id).toBe(1)
    expect(nextScheduledMatch([started, arranging], now)).toBeNull()
    expect(nextScheduledMatch([], now)).toBeNull()
  })

  it('o elo do lado vem do pareamento; sem ele, nada (nunca se atribui elo antes da classificação)', () => {
    expect(sideTierName(teamSide('a', ferrugemRef, { tier: 'prata' }))).toBe('Prata')
    expect(sideTierName(teamSide('a', ferrugemRef))).toBeNull()
    expect(sideTierName(undefined)).toBeNull()
    expect(sideTierName(teamSide('a', ferrugemRef, { tier: 'ferro' as never }))).toBeNull()
    expect(positionLabel('meio_campo')).toBe('Meio de campo')
    expect(positionLabel('ponta')).toBe('ponta')
  })

  it('chips de formato com o tamanho e o nome falado', () => {
    expect(formatChips).toEqual([
      { value: 'futsal', label: 'Futsal', size: '5×5', accessibilityLabel: 'Futsal 5 contra 5' },
      { value: 'society', label: 'Society', size: '7×7', accessibilityLabel: 'Society 7 contra 7' },
      { value: 'campo', label: 'Campo', size: '11×11', accessibilityLabel: 'Campo 11 contra 11' },
    ])
  })
})

describe('cronômetros (utils/clock)', () => {
  it('tempo decorrido: mm:ss e, a partir de 1 h, h:mm:ss', () => {
    expect(formatElapsed(135_000)).toBe('02:15')
    expect(formatElapsed(3_735_000)).toBe('1:02:15')
    expect(formatElapsed(-5)).toBe('00:00')
  })

  it('contagem regressiva h:mm:ss, arredondando para cima; zero quando o prazo passou', () => {
    expect(formatCountdown(2 * 3_600_000 - 1)).toBe('2:00:00')
    expect(formatCountdown(7_182_000)).toBe('1:59:42')
    expect(formatCountdown(1)).toBe('0:00:01')
    expect(formatCountdown(-1000)).toBe('0:00:00')
  })

  it('duração falada, em minutos', () => {
    expect(spokenDuration(30_000)).toBe('menos de 1 minuto')
    expect(spokenDuration(60_000)).toBe('1 minuto')
    expect(spokenDuration(35 * 60_000)).toBe('35 minutos')
    expect(spokenDuration(65 * 60_000)).toBe('1 hora e 5 minutos')
    expect(spokenDuration(2 * 3_600_000)).toBe('2 horas')
    expect(spokenDuration(-1)).toBe('menos de 1 minuto')
  })
})

describe('linha do elo da placa (tierLines)', () => {
  const ranked = { state: 'ranqueado' as const, tier: 'ouro' as const, played: 5, required: 3, rank_position: 4, metric_value: 38, faces: ['prata' as const, 'ouro' as const], faces_any_level: false }
  const lines = standings()

  it('o elo só vale ranqueado e com a classificação completa', () => {
    expect(rankedTier(ranked)).toBe('ouro')
    expect(rankedTier({ ...ranked, played: 2 })).toBeNull()
    expect(rankedTier({ ...ranked, state: 'classificacao' })).toBeNull()
    expect(rankedTier({ ...ranked, required: 0 })).toBe('ouro')
    expect(rankedTier(undefined)).toBeNull()
  })

  it('"Enfrenta…" lista as faixas da API; sem elos ou em qualquer nível, "qualquer nível"', () => {
    expect(levelsText(ranked)).toBe('Prata ou Ouro')
    expect(levelsText({ ...ranked, faces: ['bronze', 'prata', 'ouro'] })).toBe('Bronze, Prata ou Ouro')
    expect(levelsText({ ...ranked, faces: ['ouro'] })).toBe('Ouro')
    expect(levelsText({ ...ranked, faces_any_level: true })).toBe('qualquer nível')
    expect(levelsText({ ...ranked, faces: [] })).toBe('qualquer nível')
    expect(levelsText({ ...ranked, faces: undefined as never })).toBe('qualquer nível')
    expect(facesText(ranked)).toBe('Enfrenta Prata ou Ouro')
  })

  it('uma linha ranqueada mostra o elo; sem jogos ou em classificação, "n de 3"', () => {
    expect(lineView(ranked)).toEqual({ kind: 'ranked', tier: 'ouro', title: 'Ouro', detail: 'Enfrenta Prata ou Ouro', levels: 'Prata ou Ouro' })
    expect(lineView({ ...ranked, state: 'classificacao', played: 2 })).toEqual({ kind: 'placement', title: 'Em classificação', played: 2, required: 3 })
    expect(lineView(undefined)).toEqual({ kind: 'placement', title: 'Em classificação', played: 0, required: 3 })
  })

  it('com meu time: a linha do formato escolhido no time representado', () => {
    const team = lines.futebol.teams[0]
    expect(teamLine(team, 'society')).toEqual({ kind: 'placement', title: 'Em classificação', played: 0, required: 3 })
    const withRank = { ...team, formats: team.formats.map(line => (line.format === 'campo' ? { ...line, ...ranked } : line)) }
    expect(teamLine(withRank, 'campo')).toMatchObject({ kind: 'ranked', tier: 'ouro' })
    expect(teamLine(undefined, 'society')).toMatchObject({ kind: 'placement', played: 0 })
  })

  it('avulso: o maior elo entre as posições, com formato e posição; senão a classificação da posição', () => {
    const individual = [
      { ...ranked, tier: 'prata' as const, position: 'atacante' as const, format: 'futsal' as const },
      { ...ranked, tier: 'diamante' as const, position: 'atacante' as const, format: 'society' as const },
      { ...ranked, state: 'classificacao' as const, tier: null, played: 2, position: 'goleiro' as const, format: 'campo' as const },
    ]
    expect(avulsoLine(individual, 'qualquer')).toMatchObject({ kind: 'ranked', tier: 'diamante', title: 'Diamante no society como atacante' })
    expect(avulsoLine(individual, 'atacante')).toMatchObject({ kind: 'ranked', tier: 'diamante' })
    expect(avulsoLine(individual, 'goleiro')).toEqual({ kind: 'placement', title: 'Em classificação como goleiro', played: 2, required: 3 })
    expect(avulsoLine(individual, 'defesa')).toEqual({ kind: 'placement', title: 'Em classificação como defesa', played: 0, required: 3 })
    expect(avulsoLine([], 'qualquer')).toEqual({ kind: 'placement', title: 'Em classificação', played: 0, required: 3 })
    expect(avulsoLine([{ ...ranked, position: 'defesa', format: 'campo' }, { ...ranked, tier: 'bronze', position: 'defesa', format: 'campo' }], 'defesa')).toMatchObject({ tier: 'ouro' })
  })

  it('corrida: o elo da distância e a melhor marca; sem marca, o texto do contrato (nunca elo)', () => {
    const bests: RunBest[] = [markCard(5, ['25:00', '24:12']), markCard(10, ['50:00'], { tier: null }), { ...markCard(3, ['12:00']), best: null }]
    expect(runBestLine(bests, 5)).toEqual({ kind: 'ranked', tier: 'ouro', title: 'Ouro nos 5 km', levels: 'qualquer nível', detail: 'Melhor 24:12 · treino' })
    const race = markCard(21, ['1:45:00'], { best: { id: 1, distance_m: 21097, duration_s: sec('1:45:00'), pace_s_per_km: 299, date: '2026-10-08', origin: lago } })
    expect(runBestLine([race], 21)).toMatchObject({ kind: 'ranked', title: 'Ouro nos 21 km', detail: 'Melhor 1:45:00 · Corrida do Lago' })
    expect(runBestLine(bests, 10)).toEqual({ kind: 'no-mark', title: 'Sem marca nos 10 km', detail: 'Registre um treino ou prova para entrar no ranking' })
    expect(runBestLine(bests, 3)).toMatchObject({ kind: 'no-mark' })
    expect(runBestLine([], 42)).toMatchObject({ kind: 'no-mark', title: 'Sem marca nos 42 km' })
  })

  it('formata a duração da marca e normaliza as classificações incompletas', () => {
    expect(formatDuration(24 * 60 + 12)).toBe('24:12')
    expect(formatDuration(3750)).toBe('1:02:30')
    expect(formatDuration(-3)).toBe('0:00')
    expect(normalizeStandings(null)).toEqual({ teams: [], individual: [], tenis: undefined, corrida: [] })
    expect(normalizeStandings(lines).teams).toHaveLength(1)
    expect(normalizeStandings({ calc_version: 1 })).toEqual({ teams: [], individual: [], tenis: undefined, corrida: [] })
  })
})

describe('corrida: ritmo, tempo e textos da prévia (runView)', () => {
  it('metros das distâncias da régua e rótulos', () => {
    expect(standardMeters).toEqual({ 3: 3000, 5: 5000, 10: 10_000, 21: 21_097, 42: 42_195 })
    expect(distanceLabel(21)).toBe('21 km')
    expect(formatKm(5000)).toBe('5 km')
    expect(formatKm(7500)).toBe('7,5 km')
    expect(formatKm(10_150)).toBe('10,15 km')
  })

  it('ritmo em segundos por km, arredondado como o servidor', () => {
    expect(paceOf(1452, 5000)).toBe(290)
    expect(paceOf(0, 5000)).toBeNull()
    expect(paceOf(1452, 0)).toBeNull()
    expect(formatPace(302)).toBe('5:02/km')
    expect(formatPace(290)).toBe('4:50/km')
  })

  it('converte o tempo em h/min/s e de volta, limitado a 24 h', () => {
    expect(fromSeconds(3750)).toEqual({ h: 1, m: 2, s: 30 })
    expect(toSeconds({ h: 1, m: 2, s: 30 })).toBe(3750)
    expect(fromSeconds(-5)).toEqual({ h: 0, m: 0, s: 0 })
    expect(toSeconds(fromSeconds(MAX_DURATION_S + 100))).toBe(MAX_DURATION_S)
  })

  it('data da marca: dia e mês, com o ano fora do ano corrente; data inválida volta como veio', () => {
    expect(formatRunDate('2026-10-12', new Date(2026, 5, 1))).toBe('12 out')
    expect(formatRunDate('2025-03-04', new Date(2026, 5, 1))).toBe('4 mar 2025')
    expect(formatRunDate('ontem')).toBe('ontem')
  })

  it('origem da marca: o rótulo, ou o nome da prova no meio da frase', () => {
    expect(originLabel(treino)).toBe('Treino')
    expect(originInline(treino)).toBe('treino')
    expect(originInline(lago)).toBe('Corrida do Lago')
  })

  it('prévia: primeira marca, novo melhor, sem melhora e fora do ranking', () => {
    expect(impactView(runImpact(), '5 km')).toEqual({
      tone: 'best', tier: 'ouro', title: 'Primeira marca nos 5 km', detail: 'Você entra no ranking dos 5 km como Ouro.',
    })
    expect(impactView(runImpact({ tier_after: null }), '5 km', { saved: true }).detail).toBe('Você entrou no ranking dos 5 km.')
    expect(impactView(runImpact({ tier_after: 'ouro' }), '5 km', { saved: true }).detail).toBe('Você entrou no ranking dos 5 km como Ouro.')
    expect(impactView(runImpact({ kind: 'novo_melhor', previous_best_s: 1476, delta_s: -24, tier_up: true, tier_after: 'ouro' }), '5 km')).toEqual({
      tone: 'best', tier: 'ouro', title: 'Novo melhor tempo · −0:24', detail: 'Sobe para Ouro nos 5 km. Antes: 24:36.',
    })
    expect(impactView(runImpact({ kind: 'novo_melhor', previous_best_s: null, delta_s: null, tier_up: false, tier_after: 'prata' }), '5 km'))
      .toMatchObject({ title: 'Novo melhor tempo', detail: 'Continua Prata nos 5 km.' })
    expect(impactView(runImpact({ kind: 'novo_melhor', previous_best_s: null, delta_s: null, tier_after: null }), '5 km').detail).toBe('')
    expect(impactView(runImpact({ kind: 'sem_melhora', previous_best_s: 1452 }), '5 km')).toEqual({
      tone: 'plain', tier: null, title: 'Seu melhor continua 24:12', detail: 'Esta marca fica no histórico dos 5 km.',
    })
    expect(impactView(runImpact({ kind: 'sem_melhora', previous_best_s: null }), '5 km').title).toBe('Sem melhora nesta distância')
    expect(impactView(runImpact({ kind: 'fora_do_ranking' }), '5 km')).toMatchObject({ tone: 'plain', title: 'Fica só no histórico' })
  })
})
