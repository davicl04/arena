import { describe, expect, it, vi } from 'vitest'
import type { TennisSetInput } from '../src/api/results'
import {
  bracketSummary, competitorInitials, competitorName, nodeScore, nodeSentence, placementLabel, planCompetitors, shortRound, slotName,
} from '../src/components/brackets/bracketText'
import { chatRows } from '../src/components/match/chatRows'
import { DEFERRED_COURT_ID, MAX_DAYS_AHEAD, STEP_MINUTES, termsError } from '../src/components/match/termsRules'
import { rowBadge, rowNames, rowScore, rowSubtitle } from '../src/components/organizer/scheduleRows'
import { SCHEDULE_DAYS_AHEAD, scheduleError, scheduleInput } from '../src/components/organizer/scheduleRules'
import { formatMetric, isRunRanking, metricText, metricUnit } from '../src/components/ranking/metric'
import {
  formatNumber, localPreview, otherSide, outcomeFor, pointsPill, positionAbbreviation, positionStat, scoreSpoken, scoreText, statFieldLabel, statFields,
  statSummary, viewSide, walkoverScoreText,
} from '../src/components/results/format'
import { draftToInput, emptySets, needsTiebreak, reportToDraft, setWinner, showsThirdSet, validateTennisSets } from '../src/components/results/tennis'
import { competitor, eliminationBracket, matchList, roundRobinBracket, row, score as bracketScore } from './support/brackets'
import { caio, court, matchEvent, message, mine, ricardo } from './support/play'
import { asFerrugem, football, lineup, score, stat, tennis, tiago } from './support/results'

vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))

describe('condições da partida (termsRules)', () => {
  const now = new Date(2026, 9, 12, 12, 0)
  const day = '2026-10-20'

  it('aceita data, horário de 15 em 15 minutos no futuro e quadra', () => {
    expect(termsError(day, '16:00', court(), now)).toBeNull()
    expect(termsError(day, '16:45', court(), now)).toBeNull()
  })

  it('recusa o que falta ou o que o servidor recusaria', () => {
    expect(termsError('', '16:00', court(), now)).toBe('Escolha a data da partida.')
    expect(termsError(day, '', court(), now)).toBe('Escolha o horário da partida.')
    expect(termsError(day, '25:00', court(), now)).toBe('Escolha uma data e um horário válidos.')
    expect(termsError(day, '16:10', court(), now)).toBe('Use horários de 15 em 15 minutos.')
    expect(termsError('2026-10-12', '09:00', court(), now)).toBe('Escolha um horário que ainda não passou.')
    expect(termsError(day, '16:00', null, now)).toBe('Escolha a quadra do catálogo ou sugira uma.')
    expect([MAX_DAYS_AHEAD, STEP_MINUTES, DEFERRED_COURT_ID]).toEqual([60, 15, 0])
  })
})

describe('agendamento do organizador (scheduleRules)', () => {
  const now = new Date(2026, 9, 12, 12, 0)

  it('o horário é livre, ao minuto; exige data, horário no futuro e quadra', () => {
    expect(scheduleError('2026-10-20', '19:07', court(), now)).toBeNull()
    expect(scheduleError('', '19:00', court(), now)).toBe('Escolha a data da partida.')
    expect(scheduleError('2026-10-20', '', court(), now)).toBe('Digite o horário de início.')
    expect(scheduleError('2026-10-20', '99:99', court(), now)).toBe('Escolha uma data e um horário válidos.')
    expect(scheduleError('2026-10-12', '09:00', court(), now)).toBe('Escolha um horário que ainda não passou.')
    expect(scheduleError('2026-10-20', '19:00', null, now)).toBe('Escolha a quadra do catálogo ou sugira uma.')
    expect(SCHEDULE_DAYS_AHEAD).toBe(364)
  })

  it('o corpo leva a quadra do catálogo ou a sugestão ainda não enviada', () => {
    expect(scheduleInput('2026-10-20T19:30:00.000Z', court({ id: 7 }))).toEqual({ starts_at: '2026-10-20T19:30:00.000Z', court_id: 7 })
    expect(scheduleInput('2026-10-20T19:30:00.000Z', court({ id: DEFERRED_COURT_ID, name: 'Ginásio do Guará', address: null }))).toEqual({
      starts_at: '2026-10-20T19:30:00.000Z', court_suggestion: { name: 'Ginásio do Guará', address: null },
    })
  })
})

describe('linhas do chat (chatRows)', () => {
  it('separa os dias, agrupa mensagens seguidas da mesma pessoa e interrompe o grupo no evento', () => {
    const now = new Date(2026, 9, 12, 12, 0)
    const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0).toISOString()
    const rows = chatRows([
      message(1, { author: caio, created_at: at(10, 9) }), message(2, { author: caio, created_at: at(10, 9) }),
      message(3, { author: caio, side: 'a', created_at: at(10, 10) }),
      message(4, { author: ricardo, created_at: at(11, 9) }),
      matchEvent(5, 'condicoes_aceitas', 'Condições aceitas', { created_at: at(12, 8) }),
      mine(6, 'Fechado', { created_at: at(12, 9) }), mine(7, 'Até lá', { created_at: at(12, 9) }),
      message(8, { author: null, created_at: 'nada' }),
    ], now)
    expect(rows.map(item => item.kind === 'group' ? `grupo:${item.messages.map(entry => entry.id).join(',')}` : item.kind === 'day' ? `dia:${item.label}` : `evento:${item.message.id}`)).toEqual([
      'dia:sáb, 10 out', 'grupo:1,2', 'grupo:3', 'dia:Ontem', 'grupo:4', 'dia:Hoje', 'evento:5', 'grupo:6,7', 'grupo:8',
    ])
    expect(rows.map(item => item.key)).toContain('day-1')
    expect(chatRows([])).toEqual([])
  })
})

describe('placar e textos do resultado (results/format)', () => {
  it('lê o placar do ponto de vista de quem vê', () => {
    expect(scoreText('futebol', score(3, 1), 'a')).toBe('3 × 1')
    expect(scoreText('futebol', score(3, 1), 'b')).toBe('1 × 3')
    const sets = score(2, 1, { winner: 'a', sets: [{ a: 7, b: 6, tiebreak: { a: 7, b: 5 }, super_tiebreak: false }, { a: 3, b: 6, tiebreak: null, super_tiebreak: false }, { a: 10, b: 7, tiebreak: null, super_tiebreak: true }] })
    expect(scoreText('tenis', sets, 'a')).toBe('7-6(5) 3-6 10-7')
    expect(scoreText('tenis', sets, 'b')).toBe('6-7(5) 6-3 7-10')
    expect(scoreText('tenis', score(2, 0), 'a')).toBe('2-0')
    expect(scoreText('tenis', score(2, 0), 'b')).toBe('0-2')
    expect(walkoverScoreText('futebol')).toBe('3 × 0')
    expect(walkoverScoreText('tenis')).toBe('6-0 6-0')
  })

  it('texto para leitor de tela e lado de quem vê', () => {
    expect(scoreSpoken(football(), score(3, 1))).toBe('Leões do Cerrado 3, Ferrugem FC 1')
    expect(scoreSpoken(asFerrugem(), score(3, 1))).toBe('Ferrugem FC 1, Leões do Cerrado 3')
    expect(scoreSpoken(tennis(), score(2, 0))).toBe('Ana Souza 2 sets, Beatriz Lima 0')
    expect(scoreSpoken({ ...football(), my_side: null }, score(0, 0))).toBe('Leões do Cerrado 0, Ferrugem FC 0')
    expect(viewSide({ my_side: null })).toBe('a')
    expect(viewSide({ my_side: 'b' })).toBe('b')
    expect(otherSide('a')).toBe('b')
    expect(otherSide('b')).toBe('a')
  })

  it('formata a pílula de pontos, o número e as siglas', () => {
    expect(pointsPill(3)).toBe('+3 pts')
    expect(pointsPill(0)).toBe('0 pts')
    expect(formatNumber(1.5)).toBe('1,5')
    expect(formatNumber(4)).toBe('4')
    expect(positionAbbreviation.meio_campo).toBe('MEI')
    expect(positionStat.atacante.label).toBe('Finalizações no alvo')
    expect(statFields).toEqual(['gols', 'assistencias', 'estatistica_posicao'])
    expect(statFieldLabel('gols', 'atacante')).toBe('Gols')
    expect(statFieldLabel('assistencias', null)).toBe('Assistências')
    expect(statFieldLabel('estatistica_posicao', 'goleiro')).toBe('Defesas')
    expect(statFieldLabel('estatistica_posicao', null)).toBe('Estatística da posição')
  })

  it('resume as estatísticas do elenco', () => {
    expect(statSummary(lineup(tiago))).toBe('Estatísticas não enviadas')
    expect(statSummary(lineup(tiago, { stat: stat({ goals: 2, assists: 0, position_stat: 1 }) }))).toBe('2 gols · 1 finalização no alvo')
    expect(statSummary(lineup(tiago, { stat: stat({ goals: 1, assists: 2, position_stat: 3 }) }))).toBe('1 gol · 2 assistências · 3 finalizações no alvo')
    expect(statSummary(lineup(tiago, { position: null, stat: stat({ goals: 0, assists: 1, position_stat: 2 }) }))).toBe('1 assistência · 2 ocorrências')
    expect(statSummary(lineup(tiago, { position: null, stat: stat({ goals: 0, assists: 0, position_stat: 1 }) }))).toBe('1 ocorrência')
    expect(statSummary(lineup(tiago, { stat: stat({ goals: null, assists: null, position_stat: null }) }))).toBe('Sem números')
  })

  it('a prévia local segue a RN12: presença 1, resultado 3/1/0, gol 1, assistência 1 e posição 0,5 até 4', () => {
    expect(localPreview('vitoria', 2, 1, 4).total).toBe(1 + 3 + 2 + 1 + 2)
    expect(localPreview('empate', 0, 0, 0).total).toBe(2)
    expect(localPreview('derrota', 0, 0, 20).total).toBe(1 + 0 + 4)
    expect(localPreview(null, 1, 0, 0)).toMatchObject({ result: null, total: 2 })
    expect(outcomeFor(score(1, 1), 'a')).toBe('empate')
    expect(outcomeFor(score(0, 2), 'b')).toBe('vitoria')
    expect(outcomeFor(score(0, 2), 'a')).toBe('derrota')
  })
})

/** Os mesmos casos de `backend/tests/unit/test_match_rules.py`: o cliente recusa o que o servidor recusaria. */
const sets = (...items: number[][]): TennisSetInput[] => items.map(([a, b, tbA, tbB]) => (tbA === undefined ? { a, b } : { a, b, tiebreak: { a: tbA, b: tbB } }))

describe('validação do placar do tênis (espelho do servidor)', () => {
  it.each([
    [sets([6, 4], [6, 0]), false],
    [sets([4, 6], [5, 7]), false],
    [sets([7, 6, 7, 5], [3, 6], [7, 5]), false],
    [sets([6, 7, 8, 10], [6, 2], [6, 7, 4, 7]), false],
    [sets([6, 3], [2, 6], [10, 8]), true],
    [sets([6, 3], [2, 6], [12, 14]), true],
  ])('%#: aceita placares válidos', (raw, superTiebreak) => {
    expect(validateTennisSets(raw, superTiebreak)).toBeNull()
  })

  it.each([
    [sets([6, 4]), false, 'Informe dois ou três sets.'],
    [sets([6, 4], [6, 4], [6, 4], [6, 4]), false, 'Informe dois ou três sets.'],
    [sets([6, 5], [6, 4]), false, 'O 1º set precisa terminar em 6-0 a 6-4, 7-5 ou 7-6.'],
    [sets([8, 6], [6, 4]), false, 'Informe números inteiros de 0 a 7.'],
    [sets([5, 3], [6, 4]), false, 'O 1º set precisa terminar em 6-0 a 6-4, 7-5 ou 7-6.'],
    [sets([6, 4], [4, 4]), false, 'O 2º set precisa terminar em 6-0 a 6-4, 7-5 ou 7-6.'],
    [sets([7, 6], [6, 4]), false, 'Informe o placar do tie-break do 1º set.'],
    [sets([7, 6, 5, 7], [6, 4]), false, 'O tie-break do 1º set vai a 7 pontos, com 2 de vantagem, e é de quem venceu o set.'],
    [sets([7, 6, 7, 6], [6, 4]), false, 'O tie-break do 1º set vai a 7 pontos, com 2 de vantagem, e é de quem venceu o set.'],
    [sets([7, 6, 9, 6], [6, 4]), false, 'O tie-break do 1º set vai a 7 pontos, com 2 de vantagem, e é de quem venceu o set.'],
    [sets([6, 4, 7, 5], [6, 4]), false, 'O 1º set não teve tie-break.'],
    [sets([6, 4], [3, 6]), false, 'Os dois primeiros sets ficaram divididos: informe o terceiro.'],
    [sets([6, 4], [6, 3], [6, 1]), false, 'Quem venceu os dois primeiros sets já ganhou a partida: não há terceiro set.'],
    [sets([6, 4], [3, 6], [10, 9]), true, 'O super tie-break vai a 10 pontos, com 2 de vantagem.'],
    [sets([6, 4], [3, 6], [9, 7]), true, 'O super tie-break vai a 10 pontos, com 2 de vantagem.'],
    [sets([6, 4], [3, 6], [13, 10]), true, 'O super tie-break vai a 10 pontos, com 2 de vantagem.'],
    [sets([6, 4], [3, 6], [7, 6, 7, 3]), true, 'O super tie-break vai a 10 pontos, com 2 de vantagem.'],
  ])('%#: recusa com a mensagem do servidor', (raw, superTiebreak, message) => {
    expect(validateTennisSets(raw, superTiebreak)).toBe(message)
  })

  it('o terceiro set sem super tie-break é um set comum', () => {
    expect(validateTennisSets(sets([6, 4], [3, 6], [10, 7]), false)).toBe('Informe números inteiros de 0 a 7.')
    expect(validateTennisSets(sets([6, 4], [3, 6], [5, 5]), false)).toBe('O 3º set precisa terminar em 6-0 a 6-4, 7-5 ou 7-6.')
    expect(validateTennisSets(sets([6, 4], [3, 6], [6, 2]), false)).toBeNull()
  })
})

describe('rascunho do placar do tênis', () => {
  const draft = (...items: number[][]) => emptySets().map((set, index) => (items[index]
    ? { mine: items[index][0], theirs: items[index][1], tbMine: items[index][2] ?? 0, tbTheirs: items[index][3] ?? 0 } : set))

  it('o terceiro set aparece só quando os dois primeiros foram divididos', () => {
    expect(showsThirdSet(draft([6, 4], [6, 3]))).toBe(false)
    expect(showsThirdSet(draft([6, 4], [3, 6]))).toBe(true)
    expect(showsThirdSet(draft([6, 4]))).toBe(false)
    expect(setWinner({ mine: 3, theirs: 3 })).toBeNull()
    expect(setWinner({ mine: 6, theirs: 3 })).toBe('mine')
    expect(needsTiebreak({ mine: 7, theirs: 6 })).toBe(true)
    expect(needsTiebreak({ mine: 6, theirs: 7 })).toBe(true)
    expect(needsTiebreak({ mine: 7, theirs: 5 })).toBe(false)
  })

  it('manda os lados A e B da partida: meu lado A fica como está, o lado B troca', () => {
    const mineDraft = draft([6, 4], [3, 6], [10, 7])
    expect(draftToInput(mineDraft, 'a', true)).toEqual([{ a: 6, b: 4 }, { a: 3, b: 6 }, { a: 10, b: 7 }])
    expect(draftToInput(mineDraft, 'b', true)).toEqual([{ a: 4, b: 6 }, { a: 6, b: 3 }, { a: 7, b: 10 }])
    // Sem terceiro set, o rascunho do terceiro não vai.
    expect(draftToInput(draft([6, 4], [6, 3], [9, 9]), 'a', false)).toEqual([{ a: 6, b: 4 }, { a: 6, b: 3 }])
  })

  it('o tie-break vai só no set de 7-6, e nunca no super tie-break', () => {
    const tie = draft([7, 6, 7, 5], [3, 6], [10, 7, 1, 1])
    expect(draftToInput(tie, 'a', true)).toEqual([{ a: 7, b: 6, tiebreak: { a: 7, b: 5 } }, { a: 3, b: 6 }, { a: 10, b: 7 }])
    expect(draftToInput(draft([6, 7, 5, 7], [6, 4]), 'b', false)[0]).toEqual({ a: 7, b: 6, tiebreak: { a: 7, b: 5 } })
  })

  it('volta do placar informado para o rascunho do meu lado', () => {
    const reported = score(1, 2, {
      winner: 'b', sets: [{ a: 6, b: 7, tiebreak: { a: 5, b: 7 }, super_tiebreak: false }, { a: 6, b: 3, tiebreak: null, super_tiebreak: false },
        { a: 7, b: 10, tiebreak: null, super_tiebreak: true }],
    })
    expect(reportToDraft(reported, 'a')[0]).toEqual({ mine: 6, theirs: 7, tbMine: 5, tbTheirs: 7 })
    expect(reportToDraft(reported, 'b')[2]).toEqual({ mine: 10, theirs: 7, tbMine: 0, tbTheirs: 0 })
    expect(reportToDraft(reported, 'b')[0]).toEqual({ mine: 7, theirs: 6, tbMine: 7, tbTheirs: 5 })
    expect(reportToDraft(undefined, 'a')).toEqual(emptySets())
  })
})

describe('métrica do Ranking (ranking/metric)', () => {
  it('pontos e média com casas decimais; na corrida, o tempo', () => {
    expect(formatMetric(38, 'futebol_time')).toBe('38')
    expect(formatMetric(12.5, 'tenis')).toBe('12,5')
    expect(formatMetric(4.256, 'futebol_individual')).toBe('4,26')
    expect(formatMetric(1452, 'corrida_5')).toBe('24:12')
    expect(formatMetric(3750, 'corrida_42')).toBe('1:02:30')
    expect(isRunRanking('corrida_10')).toBe(true)
    expect(isRunRanking('tenis')).toBe(false)
  })

  it('nome da métrica e frase', () => {
    expect([metricUnit('futebol_time'), metricUnit('tenis'), metricUnit('futebol_individual'), metricUnit('corrida_3')]).toEqual(['pontos', 'pontos', 'média', 'tempo'])
    expect(metricText(38, 'futebol_time')).toBe('38 pontos')
    expect(metricText(4.256, 'futebol_individual')).toBe('4,26 média')
    expect(metricText(1452, 'corrida_5')).toBe('24:12')
  })
})

describe('árvore e tabela do campeonato (bracketText)', () => {
  const tree = eliminationBracket()

  it('nomes e iniciais do competidor: time, atleta ou nada', () => {
    const team = competitor(1, 'Leões do Cerrado')
    const athlete = competitor(2, 'Ana Souza', null, 'atleta')
    expect(competitorName(team)).toBe('Leões do Cerrado')
    expect(competitorName(athlete)).toBe('Ana Souza')
    expect(competitorName(null)).toBe('A definir')
    expect(competitorName(undefined, 'Folga')).toBe('Folga')
    expect(competitorInitials(team)).toBe('LD')
    expect(competitorInitials(athlete)).toBe('AS')
    expect(competitorInitials(null)).toBe('?')
  })

  it('o que ocupa o lugar: o competidor, "Folga" ou "Vencedor J1"', () => {
    const [first] = tree.rounds[0].nodes
    expect(slotName(first.slots[0])).toBe('Novo Horizonte')
    expect(slotName(first.slots[1])).toBe('Folga')
    expect(slotName({ ...first.slots[1], placeholder: null })).toBe('Folga')
    expect(slotName({ kind: 'vencedor', competitor: null, placeholder: null, from_match: 1, advanced_by_bye: false, place: null, winner: false })).toBe('A definir')
    // Na segunda fase: quem passou pela folga já está no lugar; o outro lado espera o vencedor do jogo.
    expect(slotName(tree.rounds[1].nodes[0].slots[0])).toBe('Novo Horizonte')
    expect(slotName(tree.rounds[1].nodes[0].slots[1])).toBe('Vencedor J1')
    expect(slotName(tree.rounds[1].nodes[1].slots[1])).toBe('Vencedor J2')
  })

  it('cabeçalho curto da coluna e rótulo da colocação', () => {
    expect(['Oitavas de final', 'Quartas de final', 'Semifinal', 'Final', 'Rodada 3'].map(shortRound)).toEqual(['Oitavas', 'Quartas', 'Semi', 'Final', 'Rodada 3'])
    expect(placementLabel(1, 'eliminacao_simples')).toBe('Campeão')
    expect(placementLabel(2, 'todos_contra_todos')).toBe('Vice-campeão')
    expect(placementLabel(3, 'eliminacao_simples')).toBe('Semifinalista')
    expect(placementLabel(3, 'todos_contra_todos')).toBe('3º lugar')
  })

  it('resumo do tipo e do tamanho', () => {
    expect(bracketSummary(tree)).toBe('Eliminação simples · chave de 8 · 2 folgas')
    expect(bracketSummary({ ...tree, byes: 1 })).toBe('Eliminação simples · chave de 8 · 1 folga')
    expect(bracketSummary({ ...tree, byes: 0 })).toBe('Eliminação simples · chave de 8')
    expect(bracketSummary({ ...tree, size: null, byes: 0 })).toBe('Eliminação simples')
    expect(bracketSummary(roundRobinBracket())).toBe('Todos contra todos · 5 times')
    expect(bracketSummary({ ...roundRobinBracket(), sport: 'tenis' })).toBe('Todos contra todos · 5 atletas')
    expect(bracketSummary({ ...roundRobinBracket(), size: null })).toBe('Todos contra todos')
    expect(bracketSummary({ ...tree, kind: 'rodizio' as never })).toBe('Campeonato · 8 times')
  })

  it('frase do confronto para o leitor de tela e a lista alternativa', () => {
    const withMatches = eliminationBracket(undefined, {}, true)
    expect(nodeSentence(tree.rounds[0].nodes[0], 'futebol')).toBe('Novo Horizonte avança direto (folga)')
    expect(nodeSentence(tree.rounds[0].nodes[1], 'futebol')).toBe('J1: Atlético Guará contra Unidos do Lago.')
    expect(nodeSentence(withMatches.rounds[0].nodes[1], 'futebol')).toBe('J1: Atlético Guará contra Unidos do Lago, sem data.')
    const played = { ...withMatches.rounds[0].nodes[1], match: { ...withMatches.rounds[0].nodes[1].match!, score: bracketScore(2, 1), awaiting_decision: true } }
    expect(nodeSentence(played, 'futebol')).toBe('J1: Atlético Guará contra Unidos do Lago, placar 2 × 1, aguarda a decisão do organizador.')
    const scheduled = { ...withMatches.rounds[0].nodes[1], match: { ...withMatches.rounds[0].nodes[1].match!, starts_at: '2026-10-20T22:00:00Z', court_name: 'Quadra Central' } }
    expect(nodeSentence(scheduled, 'futebol')).toMatch(/^J1: Atlético Guará contra Unidos do Lago, ter, 20 out · \d\d:\d\d em Quadra Central\.$/)
    const noCourt = { ...scheduled, match: { ...scheduled.match!, court_name: null } }
    expect(nodeSentence(noCourt, 'futebol')).toMatch(/ter, 20 out · \d\d:\d\d\.$/)
    const unlabeled = { ...withMatches.rounds[0].nodes[1], label: null }
    expect(nodeSentence(unlabeled, 'futebol')).toMatch(/^Jogo: /)
    // A folga no lado A: quem avança é o lado B (a ordem dos lados não importa).
    const [bye, present] = [tree.rounds[0].nodes[0].slots[1], tree.rounds[0].nodes[2].slots[0]]
    expect(nodeSentence({ ...tree.rounds[0].nodes[2], slots: [bye, present], bye: true }, 'futebol')).toBe('Leões do Cerrado avança direto (folga)')
    expect(nodeScore('futebol', bracketScore(2, 1))).toBe('2 × 1')
    expect(nodeScore('tenis', bracketScore(2, 0))).toBe('2-0')
    expect(nodeScore('futebol', null)).toBeNull()
  })

  it('competidores do plano na ordem do sorteio, inclusive quem folga no todos contra todos', () => {
    expect(planCompetitors(tree.rounds).map(item => item.place)).toEqual([0, 2, 3, 4, 6, 7])
    const robin = roundRobinBracket()
    const names = planCompetitors(robin.rounds).map(item => item.team?.name)
    expect(names).toEqual(['Novo Horizonte', 'Leões do Cerrado', 'Unidos do Lago', 'Ferrugem FC', 'Atlético Guará'])
    expect(planCompetitors([])).toEqual([])
    expect(planCompetitors([{ number: 1, name: 'Rodada 1', nodes: [], rest: { ...competitor(9, 'Sem lugar'), place: null } }])).toHaveLength(1)
  })
})

describe('linhas da lista de partidas do campeonato (scheduleRows)', () => {
  it('quem joga, ou o "Vencedor J1" que ocupa o lugar', () => {
    expect(rowNames(row('J3', 3, ['Ferrugem FC', 'Leões do Cerrado']))).toEqual(['Ferrugem FC', 'Leões do Cerrado'])
    expect(rowNames(row('J3', 3, ['Ferrugem FC', null]))).toEqual(['Ferrugem FC', 'Vencedor J2'])
    expect(rowNames(row('J3', 3, [null, null], { placeholders: [null, null] }))).toEqual(['A definir', 'A definir'])
  })

  it('subtítulo: placar, cancelada, data e quadra, o jogo anterior que falta ou sem data', () => {
    const played = row('J1', 1, ['Ferrugem FC', 'Leões do Cerrado'], {}, { state: 'encerrada', phase: 'encerrada', score: bracketScore(2, 1) })
    expect(rowScore(played)).toBe('2 × 1')
    expect(rowSubtitle(played)).toBe('2 × 1 · Quartas de final')
    expect(rowSubtitle(row('J1', 1, ['Ferrugem FC', 'Leões do Cerrado'], {}, { state: 'cancelada', phase: 'cancelada' }))).toBe('Partida cancelada · Quartas de final')
    const scheduled = row('J1', 1, ['Ferrugem FC', 'Leões do Cerrado'], {}, { state: 'agendada', phase: 'agendada', starts_at: '2026-10-20T22:00:00Z', court: court() })
    expect(rowSubtitle(scheduled)).toMatch(/^ter, 20 out · \d\d:\d\d · Arena Sudoeste$/)
    expect(rowSubtitle(row('J1', 1, ['Ferrugem FC', 'Leões do Cerrado'], {}, { starts_at: '2026-10-20T22:00:00Z' }))).toMatch(/^ter, 20 out · \d\d:\d\d$/)
    expect(rowSubtitle(row('J3', 3, ['Ferrugem FC', null]))).toBe('Espera o resultado de J2 · Quartas de final')
    expect(rowSubtitle(row('J3', 3, [null, null]))).toBe('Espera o resultado de J1 e J2 · Quartas de final')
    expect(rowSubtitle(row('J3', 3, [null, null], { placeholders: [null, null] }))).toBe('Espera o resultado de jogo anterior · Quartas de final')
    expect(rowSubtitle(row('J1', 1, ['Ferrugem FC', 'Leões do Cerrado']))).toBe('Sem data · Quartas de final')
    expect(rowScore(row('J1', 1, ['Ferrugem FC', 'Leões do Cerrado']))).toBeNull()
  })

  it('selo: o que o organizador faz agora (Agendar, Decidir) ou como a partida está', () => {
    const two: [string, string] = ['Ferrugem FC', 'Leões do Cerrado']
    expect(rowBadge(row('J1', 1, two, { awaiting_decision: true }))).toEqual({ label: 'Decidir', tone: 'danger' })
    expect(rowBadge(row('J1', 1, two, {}, { state: 'cancelada', phase: 'cancelada' }))).toEqual({ label: 'Cancelada', tone: 'danger' })
    expect(rowBadge(row('J1', 1, two, {}, { state: 'realizada', phase: 'confirmado' }))).toEqual({ label: 'Encerrada', tone: 'closed' })
    expect(rowBadge(row('J1', 1, two, {}, { state: 'encerrada', phase: 'encerrada' }))).toEqual({ label: 'Encerrada', tone: 'closed' })
    expect(rowBadge(row('J1', 1, two, {}, { state: 'agendada', phase: 'agendada' }))).toEqual({ label: 'Agendada', tone: 'open' })
    expect(rowBadge(row('J1', 1, two, {}, { state: 'agendada', phase: 'informar_resultado' }))).toEqual({ label: 'Aguardando placar', tone: 'live' })
    expect(rowBadge(row('J1', 1, two))).toEqual({ label: 'Agendar', tone: 'pending' })
    expect(rowBadge(row('J3', 3, ['Ferrugem FC', null]))).toEqual({ label: 'Aguardando', tone: 'draft' })
  })

  it('a lista traz os contadores do servidor para as seções da gestão', () => {
    const list = matchList([row('J1', 1, ['Ferrugem FC', 'Leões do Cerrado']), row('J2', 2, ['Ferrugem FC', null]), row('J3', 3, ['Ferrugem FC', 'Leões do Cerrado'], { awaiting_decision: true })])
    expect(list.counts).toEqual({ total: 3, to_schedule: 2, waiting: 1, scheduled: 0, to_decide: 1, finished: 0 })
  })
})
