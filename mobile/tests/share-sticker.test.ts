import React from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Checkerboard, ResultSticker, StoryCanvas } from '../src/components/share/ResultSticker'
import { activityCaption, eloBar, gapText, runMeta, stickerDescription, stickerModel } from '../src/components/share/stickerView'
import type { StickerModel } from '../src/components/share/stickerView'
import { enableAct, textOf } from './support/native'
import { placementCategory, shareCategory, shareMatch, shareRun, shareTennis } from './support/share'
import { tennisSides, timelineMatch, timelineRun } from './support/timeline'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())

const h = React.createElement
type Tree = ReturnType<typeof create>
const find = (tree: Tree, testID: string) => tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === testID)
const plate = (model: StickerModel) => model.plate.map(cell => [cell.label, cell.value + (cell.unit ? ` ${cell.unit}` : '')])

async function render(element: React.ReactElement) {
  let tree!: Tree
  await act(async () => { tree = create(element) })
  return tree
}

describe('adesivo: placa por modalidade', () => {
  it('futebol: Resultado, Placar e Você com gols e assistências; sem estatísticas, o formato', () => {
    expect(plate(stickerModel({ kind: 'partida', data: shareMatch() }))).toEqual([['Resultado', 'Vitória'], ['Placar', '3 × 1'], ['Você', '1 G · 1 A']])
    expect(plate(stickerModel({ kind: 'partida', data: shareMatch({ stats: null }) }))).toEqual([['Resultado', 'Vitória'], ['Placar', '3 × 1'], ['Formato', 'Society']])
    // Estatística contada em zero aparece; só gols contados mostra só os gols; nada contado volta ao formato.
    expect(plate(stickerModel({ kind: 'partida', data: shareMatch({ stats: { position: 'defesa', goals: 0, assists: null, position_stat: 2 } }) }))[2]).toEqual(['Você', '0 G'])
    expect(plate(stickerModel({ kind: 'partida', data: shareMatch({ format: 'futsal', stats: { position: 'goleiro', goals: null, assists: null, position_stat: 4 } }) }))[2]).toEqual(['Formato', 'Futsal'])
  })

  it('futebol do ponto de vista do titular: o placar dele primeiro; derrota por W.O. diz "W.O."', () => {
    const away = shareMatch({ owner_side: 'b', score: { a: 1, b: 2, sets: null, winner: 'b' }, outcome: 'vitoria' })
    expect(plate(stickerModel({ kind: 'partida', data: away }))[1]).toEqual(['Placar', '2 × 1'])
    const walkover = shareMatch({ score: { a: 0, b: 3, sets: null, winner: 'b' }, outcome: 'derrota', walkover_absent_side: 'a', points: 0, stats: null })
    expect(plate(stickerModel({ kind: 'partida', data: walkover }))).toEqual([['Resultado', 'Derrota'], ['Placar', 'W.O.'], ['Formato', 'Society']])
  })

  it('tênis: Resultado, sets com tie-break em sobrescrito e o placar de sets', () => {
    expect(plate(stickerModel({ kind: 'partida', data: shareTennis() }))).toEqual([['Resultado', 'Vitória'], ['Placar', '6-4 · 7-6⁵'], ['Sets', '2-0']])
    const lost = shareTennis({ owner_side: 'b', outcome: 'derrota', points: 0 })
    expect(plate(stickerModel({ kind: 'partida', data: lost }))).toEqual([['Resultado', 'Derrota'], ['Placar', '4-6 · 6-7⁵'], ['Sets', '0-2']])
    const superTiebreak = shareTennis({ score: { a: 2, b: 1, sets: [{ a: 6, b: 3, tiebreak: null, super_tiebreak: false }, { a: 3, b: 6, tiebreak: null, super_tiebreak: false }, { a: 10, b: 8, tiebreak: { a: 10, b: 8 }, super_tiebreak: true }], winner: 'a' } })
    expect(plate(stickerModel({ kind: 'partida', data: superTiebreak }))[1]).toEqual(['Placar', '6-3 · 3-6 · 10-8'])
    expect(plate(stickerModel({ kind: 'partida', data: shareTennis({ outcome: 'derrota', walkover_absent_side: 'a', points: 0 }) }))).toEqual([['Resultado', 'Derrota'], ['Placar', 'W.O.']])
  })

  it('corrida: Distância, Tempo e Ritmo', () => {
    expect(plate(stickerModel({ kind: 'corrida', data: shareRun() }))).toEqual([['Distância', '5,02 km'], ['Tempo', '26:14'], ['Ritmo', '5:14 /km']])
    expect(plate(stickerModel({ kind: 'corrida', data: shareRun({ distance_m: 42195, duration_s: 13_510, pace_s_per_km: 320 }) }))).toEqual([['Distância', '42,2 km'], ['Tempo', '3:45:10'], ['Ritmo', '5:20 /km']])
  })
})

describe('adesivo: barra do elo pelo bloco category', () => {
  it('classificado: elo, pontos da partida, posição no elo e "faltam" arredondado para cima', () => {
    expect(stickerModel({ kind: 'partida', data: shareMatch() }).bar).toEqual({ state: 'ranqueado', tier: 'prata', tierName: 'Prata', meta: { text: '+3 pts', tone: 'up' }, progress: 0.42, foot: '3º na Prata · faltam 71 para Ouro' })
    const draw = stickerModel({ kind: 'partida', data: shareMatch({ outcome: 'empate', points: 1, category: shareCategory({ tier: 'ouro', tier_position: 1, next_tier: 'diamante', gap: { amount: 0.2, unit: 'rating' } }) }) }).bar
    expect(draw).toMatchObject({ tierName: 'Ouro', meta: { text: '+1 pts' }, foot: '1º no Ouro · faltam 1 para Diamante' })
    expect(stickerModel({ kind: 'partida', data: shareTennis({ outcome: 'derrota', points: 0 }) }).bar).toMatchObject({ meta: { text: '0 pts', tone: 'flat' } })
  })

  it('unidades: média com vírgula, segundos em m:ss, posições até o Lendário e pontos inteiros', () => {
    expect(gapText({ amount: 0.65, unit: 'media' })).toBe('0,65')
    expect(gapText({ amount: 0.6512, unit: 'media' })).toBe('0,66')
    expect(gapText({ amount: 240, unit: 'segundos' })).toBe('4:00')
    expect(gapText({ amount: 61.2, unit: 'segundos' })).toBe('1:02')
    expect(gapText({ amount: 1, unit: 'posicoes' })).toBe('1 posição')
    expect(gapText({ amount: 3, unit: 'posicoes' })).toBe('3 posições')
    expect(gapText({ amount: 12, unit: 'pontos' })).toBe('12')
    expect(gapText({ amount: 70, unit: 'rating' })).toBe('70')
  })

  it('Diamante: posições até o Lendário; sem vagas, barra cheia e sem "faltam"; Lendário cheio e sem "faltam"', () => {
    const diamond = eloBar(shareCategory({ tier: 'diamante', tier_position: 2, next_tier: 'lendario', progress: 0.2727, gap: { amount: 3, unit: 'posicoes' } }), 'futebol', null)
    expect(diamond).toMatchObject({ tierName: 'Diamante', progress: 0.2727, foot: '2º no Diamante · faltam 3 posições para Lendário', meta: null })
    const noSlots = eloBar(shareCategory({ tier: 'diamante', tier_position: 1, next_tier: 'lendario', progress: 1, gap: null }), 'tenis', null)
    expect(noSlots).toMatchObject({ progress: 1, foot: '1º no Diamante' })
    const legend = eloBar(shareCategory({ tier: 'lendario', tier_position: 1, next_tier: null, progress: 1, gap: null }), 'futebol', null)
    expect(legend).toMatchObject({ tierName: 'Lendário', progress: 1, foot: '1º no Lendário' })
  })

  it('em classificação: sem elo, com o progresso de partidas (corrida: marcas)', () => {
    expect(stickerModel({ kind: 'partida', data: shareTennis({ category: placementCategory({ ranking: 'tenis' }) }) }).bar).toEqual({ state: 'classificacao', sport: 'tenis', meta: '2 de 3 partidas', progress: 0.6667 })
    expect(eloBar(placementCategory({ ranking: 'corrida_5', played: 0, required: 1, progress: 0 }), 'corrida', null)).toEqual({ state: 'classificacao', sport: 'corrida', meta: '0 de 1 marca', progress: 0 })
    // Uma chave de elo em classificação não vira elo, e o progresso fica entre 0 e 1.
    expect(eloBar(placementCategory({ tier: 'ouro', progress: 1.4 }), 'futebol', null)).toMatchObject({ state: 'classificacao', progress: 1 })
  })

  it('corrida padrão: a diferença para a melhor anterior ou a 1ª marca; corrida livre sem barra', () => {
    expect(stickerModel({ kind: 'corrida', data: shareRun() }).bar).toEqual({ state: 'ranqueado', tier: 'prata', tierName: 'Prata', meta: { text: '−0:49 nos 5 km', tone: 'up' }, progress: 0.5, foot: '3º na Prata · faltam 4:00 para Ouro' })
    expect(runMeta(shareRun({ mark_kind: 'primeira_marca', previous_best_s: null }))).toEqual({ text: '1ª marca nos 5 km', tone: 'flat' })
    expect(runMeta(shareRun({ mark_kind: 'sem_melhora', duration_s: 1639 }))).toEqual({ text: '+0:16 nos 5 km', tone: 'down' })
    expect(runMeta(shareRun({ mark_kind: 'sem_melhora', duration_s: 1623 }))).toEqual({ text: '+0:00 nos 5 km', tone: 'flat' })
    expect(runMeta(shareRun({ standard_distance_km: 21, previous_best_s: null, mark_kind: 'sem_melhora' }))).toBeNull()
    expect(stickerModel({ kind: 'corrida', data: shareRun({ distance_m: 7300, standard_distance_km: null, mark_kind: null, previous_best_s: null, category: null }) }).bar).toBeNull()
  })
})

describe('adesivo: folha e descrição', () => {
  it('a linha da folha resume a atividade tocada', () => {
    expect(activityCaption(timelineMatch())).toBe('Vitória · 3 × 1 · Society')
    expect(activityCaption(timelineMatch({ sport: 'tenis', format: null, sides: tennisSides, score: { a: 2, b: 1, sets: [], winner: 'a' } }))).toBe('Vitória · 2 × 1 · Tênis')
    expect(activityCaption(timelineMatch({ sport: 'tenis', format: null, sides: tennisSides, score: { a: 0, b: 2, sets: [{ a: 4, b: 6, tiebreak: null, super_tiebreak: false }, { a: 3, b: 6, tiebreak: null, super_tiebreak: false }], winner: 'b' }, outcome: 'derrota' }))).toBe('Derrota · 0-2 em sets · Tênis')
    expect(activityCaption(timelineMatch({ outcome: 'derrota', walkover_absent_side: 'a' }))).toBe('Derrota · W.O. · Society')
    expect(activityCaption(timelineRun())).toBe('5 km · 25:12 · Treino')
    expect(activityCaption(timelineRun({ origin: { source: 'prova', label: 'Corrida do Cerrado', event_id: 3 } }))).toBe('5 km · 25:12 · Corrida do Cerrado')
  })

  it('a descrição falada traz a placa, a barra e a assinatura', () => {
    expect(stickerDescription(stickerModel({ kind: 'partida', data: shareMatch() }))).toBe('Adesivo de resultado. Resultado: Vitória; Placar: 3 × 1; Você: 1 G · 1 A. Elo Prata, +3 pts, 3º na Prata · faltam 71 para Ouro. Assinatura arena.')
    expect(stickerDescription(stickerModel({ kind: 'corrida', data: shareRun({ category: placementCategory({ ranking: 'corrida_5', played: 0, required: 1 }) }) }))).toContain('Em classificação, 0 de 1 marca.')
    expect(stickerDescription(stickerModel({ kind: 'corrida', data: shareRun({ category: null }) }))).toBe('Adesivo de resultado. Distância: 5,02 km; Tempo: 26:14; Ritmo: 5:14 /km. Assinatura arena.')
  })
})

describe('ResultSticker: a árvore RN/SVG do adesivo', () => {
  beforeEach(enableAct)

  it('a barra usa a cor do elo, como na web', async () => {
    const base = shareMatch()
    const model = stickerModel({ kind: 'partida', data: shareMatch({ category: { ...base.category!, tier: 'ouro', next_tier: 'diamante' } }) })
    const tree = await render(h(ResultSticker, { model, width: 180 }))
    expect(find(tree, 'sticker-bar-fill')[0].props.style.backgroundColor).toBe('#E0A82E')
    await act(async () => { tree.unmount() })
  })

  it('classificado: placa de três colunas, barra com o brasão do elo e a assinatura, no topo e na escala da prévia', async () => {
    const model = stickerModel({ kind: 'partida', data: shareMatch() })
    const tree = await render(h(ResultSticker, { model, width: 180 }))
    const text = textOf(tree)
    for (const piece of ['Resultado', 'Vitória', 'Placar', '3 × 1', 'Você', '1 G · 1 A', 'Prata', '+3 pts', '3º na Prata · faltam 71 para Ouro', 'arena']) expect(text).toContain(piece)
    expect(find(tree, 'sticker-cell')).toHaveLength(3)
    expect(find(tree, 'sticker-tier-prata')).toHaveLength(1)
    expect(find(tree, 'sticker-bar-fill')[0].props.style.width).toBe('42%')
    expect(find(tree, 'sticker-bar-fill')[0].props.style.backgroundColor).toBe('#C3CAD1')
    // Metade do quadro de 360: o topo do design (118) vira 59 e a assinatura fica a 48 da base.
    expect(find(tree, 'sticker-block-topo')[0].props.style.top).toBe(59)
    expect(find(tree, 'sticker-signature')[0].props.style.bottom).toBe(48)
    expect(text).not.toMatch(/Brasília|#\d/)
    await act(async () => { tree.unmount() })
  })

  it('em classificação mostra o aro da modalidade (sem brasão); corrida livre não tem barra; centro e base deslocam a placa', async () => {
    const placement = await render(h(ResultSticker, { model: stickerModel({ kind: 'partida', data: shareTennis({ category: placementCategory({ ranking: 'tenis' }) }) }), width: 360, plate: 'centro' }))
    expect(textOf(placement)).toContain('Em classificação')
    expect(textOf(placement)).toContain('2 de 3 partidas')
    expect(find(placement, 'sport-icon-tenis')).toHaveLength(1)
    expect(find(placement, 'sticker-bar-fill')[0].props.style.backgroundColor).toBe('rgba(255,255,255,0.6)')
    expect(placement.root.findAll(node => typeof node.type === 'string' && String(node.props.testID).startsWith('sticker-tier-'))).toHaveLength(0)
    expect(find(placement, 'sticker-block-centro')[0].props.style).toMatchObject({ top: 0, bottom: 0, justifyContent: 'center' })
    await act(async () => { placement.unmount() })
    const free = await render(h(ResultSticker, { model: stickerModel({ kind: 'corrida', data: shareRun({ standard_distance_km: null, category: null }) }), width: 360, plate: 'base' }))
    expect(find(free, 'sticker-bar')).toHaveLength(0)
    expect(textOf(free)).toContain('Distância')
    expect(find(free, 'sticker-block-base')[0].props.style.bottom).toBe(150)
    await act(async () => { free.unmount() })
  })

  it('o quadro capturado é transparente e fixo na vista nativa; o xadrez fica fora dele', async () => {
    const model = stickerModel({ kind: 'corrida', data: shareRun() })
    const tree = await render(h(React.Fragment, null, h(Checkerboard, { width: 90 }), h(StoryCanvas, { model, width: 90, accessibilityLabel: 'Adesivo' })))
    const canvas = find(tree, 'story-canvas')[0]
    expect(canvas.props.collapsable).toBe(false)
    expect(canvas.props.style).toMatchObject({ width: 90, height: 160, backgroundColor: 'transparent' })
    expect(canvas.findAll(node => node.props.testID === 'story-checkerboard')).toHaveLength(0)
    expect(find(tree, 'story-checkerboard')[0].findAllByType('Path' as never)[0].props.d).toMatch(/^M0\.00 0\.00h3\.00v3\.00h-3\.00z/)
    await act(async () => { tree.unmount() })
  })
})
