import { describe, expect, it } from 'vitest'
import type { TennisSetInput } from '../src/api/results'
import { localPreview, outcomeFor, pointsPill, scoreText, statSummary, walkoverScoreText } from '../src/components/results/format'
import { draftToInput, emptySets, needsTiebreak, reportToDraft, setWinner, showsThirdSet, validateTennisSets } from '../src/components/results/tennis'
import { lineup, score, stat, tiago } from './results-fixtures'

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
    expect(needsTiebreak({ mine: 7, theirs: 6 })).toBe(true)
    expect(needsTiebreak({ mine: 6, theirs: 7 })).toBe(true)
    expect(needsTiebreak({ mine: 7, theirs: 5 })).toBe(false)
  })

  it('manda os lados A e B da partida: meu lado A fica como está, o lado B troca', () => {
    const mine = draft([6, 4], [3, 6], [10, 7])
    expect(draftToInput(mine, 'a', true)).toEqual([{ a: 6, b: 4 }, { a: 3, b: 6 }, { a: 10, b: 7 }])
    expect(draftToInput(mine, 'b', true)).toEqual([{ a: 4, b: 6 }, { a: 6, b: 3 }, { a: 7, b: 10 }])
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
    expect(reportToDraft(undefined, 'a')).toEqual(emptySets())
  })
})

describe('textos do resultado', () => {
  it('lê o placar do ponto de vista de quem vê', () => {
    expect(scoreText('futebol', score(3, 1), 'a')).toBe('3 × 1')
    expect(scoreText('futebol', score(3, 1), 'b')).toBe('1 × 3')
    const sets = score(2, 1, { winner: 'a', sets: [{ a: 7, b: 6, tiebreak: { a: 7, b: 5 }, super_tiebreak: false }, { a: 3, b: 6, tiebreak: null, super_tiebreak: false }, { a: 10, b: 7, tiebreak: null, super_tiebreak: true }] })
    expect(scoreText('tenis', sets, 'a')).toBe('7-6(5) 3-6 10-7')
    expect(scoreText('tenis', sets, 'b')).toBe('6-7(5) 6-3 7-10')
    expect(scoreText('tenis', score(2, 0), 'b')).toBe('0-2')
    expect(walkoverScoreText('futebol')).toBe('3 × 0')
    expect(walkoverScoreText('tenis')).toBe('6-0 6-0')
  })

  it('formata a pílula de pontos e o resumo do elenco', () => {
    expect(pointsPill(3)).toBe('+3 pts')
    expect(pointsPill(0)).toBe('0 pts')
    expect(statSummary(lineup(tiago))).toBe('Estatísticas não enviadas')
    expect(statSummary(lineup(tiago, { stat: stat({ goals: 2, assists: 0, position_stat: 1 }) }))).toBe('2 gols · 1 finalização no alvo')
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
