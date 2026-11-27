import { afterEach, describe, expect, it, vi } from 'vitest'
import { stickerContent, gapText, setsText } from '../src/components/share/stickerContent'
import type { StickerContent } from '../src/components/share/stickerContent'
import { approximateMeasure, layoutTexts, stickerLayout, STICKER_HEIGHT, TIER_COLORS } from '../src/components/share/stickerLayout'
import { drawSticker, ensureStickerFonts, loadColiseum, measuredLayout, parseSvgPaths, stickerPng } from '../src/components/share/stickerCanvas'
import { athleteSide, ferrugem, leoes } from './timeline-fixtures'
import { coliseumSvg, fakeContext, FakePath2D, placement, ranked, shareMatch, shareRun, shareTennis } from './share-fixtures'

const matchContent = (overrides: Parameters<typeof shareMatch>[0] = {}) => stickerContent({ kind: 'partida', match: shareMatch(overrides) })
const tennisContent = (overrides: Parameters<typeof shareTennis>[0] = {}) => stickerContent({ kind: 'partida', match: shareTennis(overrides) })
const runContent = (overrides: Parameters<typeof shareRun>[0] = {}) => stickerContent({ kind: 'corrida', run: shareRun(overrides) })
const plate = (content: StickerContent) => content.columns.map(column => [column.label, column.value, column.unit ?? null])

describe('conteúdo do adesivo: placa', () => {
  it('futebol: resultado, placar e "Você" com gols e assistências contados', () => {
    expect(plate(matchContent())).toEqual([['Resultado', 'Vitória', null], ['Placar', '3 × 1', null], ['Você', '1 G · 1 A', null]])
  })

  it('futebol: placar do lado do titular primeiro e só o que foi contado', () => {
    const content = matchContent({
      sides: [ferrugem(false), { ...leoes(), is_owner: true }], owner_side: 'b', outcome: 'derrota', points: 0,
      stats: { position: 'defesa', goals: 0, assists: null, position_stat: 3 },
    })
    expect(plate(content)).toEqual([['Resultado', 'Derrota', null], ['Placar', '1 × 3', null], ['Você', '0 G', null]])
  })

  it('futebol sem estatísticas (ou sem gols e assistências contados): o formato no terceiro número', () => {
    expect(plate(matchContent({ stats: null }))[2]).toEqual(['Formato', 'Society', null])
    expect(plate(matchContent({ stats: { position: 'goleiro', goals: null, assists: null, position_stat: 4 }, format: 'futsal' }))[2]).toEqual(['Formato', 'Futsal', null])
    expect(matchContent({ stats: null, format: null }).columns).toHaveLength(2)
  })

  it('futebol: derrota por W.O. mostra "W.O." no placar', () => {
    const content = matchContent({ outcome: 'derrota', walkover_absent_side: 'a', points: 0, stats: null, score: { a: 0, b: 3, sets: null, winner: 'b' } })
    expect(plate(content)).toEqual([['Resultado', 'Derrota', null], ['Placar', 'W.O.', null], ['Formato', 'Society', null]])
  })

  it('tênis: sets com tie-break e o placar de sets, do lado do titular', () => {
    expect(plate(tennisContent())).toEqual([['Resultado', 'Vitória', null], ['Placar', '6-4 · 3-6 · 7-6(5)', null], ['Sets', '2-1', null]])
    const flipped = tennisContent({ owner_side: 'b', outcome: 'derrota', points: 0, sides: [athleteSide('a', 1, 'Ricardo Moura'), athleteSide('b', 2, 'Caio Ramos', true)] })
    expect(plate(flipped)).toEqual([['Resultado', 'Derrota', null], ['Placar', '4-6 · 6-3 · 6-7(5)', null], ['Sets', '1-2', null]])
    expect(setsText({ a: 2, b: 1, winner: 'a', sets: [{ a: 10, b: 8, tiebreak: { a: 10, b: 8 }, super_tiebreak: true }] }, 'a')).toBe('10-8')
    expect(setsText({ a: 0, b: 0, winner: null, sets: null }, 'a')).toBeNull()
  })

  it('tênis sem sets no placar: só o resultado e os sets vencidos', () => {
    expect(plate(tennisContent({ score: { a: 2, b: 0, winner: 'a', sets: null } }))).toEqual([['Resultado', 'Vitória', null], ['Sets', '2-0', null]])
  })

  it('corrida: distância, tempo e ritmo, com as unidades', () => {
    expect(plate(runContent())).toEqual([['Distância', '5,02', 'km'], ['Tempo', '26:14', null], ['Ritmo', '5:14', '/km']])
    expect(plate(runContent({ distance_m: 21097, duration_s: 6330, pace_s_per_km: 300 }))[1]).toEqual(['Tempo', '1:45:30', null])
  })
})

describe('conteúdo do adesivo: barra do elo', () => {
  it('classificado: elo, pontos da partida, posição no elo e quanto falta (rating arredondado para cima)', () => {
    expect(matchContent().bar).toEqual({
      kind: 'ranqueado', tier: 'prata', tierName: 'Prata', meta: { text: '+3 pts', tone: 'up' }, progress: 0.42,
      foot: '3º na Prata · faltam 71 para Ouro',
    })
    expect(matchContent({ points: 0, outcome: 'derrota', category: ranked({ tier: 'ouro', tier_position: 1, next_tier: 'diamante' }) }).bar)
      .toMatchObject({ meta: { text: '0 pts', tone: 'flat' }, foot: '1º no Ouro · faltam 71 para Diamante' })
  })

  it('formata a distância por unidade e nunca mostra "faltam 0"', () => {
    expect(gapText({ amount: 0.0004, unit: 'rating' })).toBe('1')
    expect(gapText({ amount: 12, unit: 'rating' })).toBe('12')
    expect(gapText({ amount: 0.65, unit: 'media' })).toBe('0,65')
    expect(gapText({ amount: 0.001, unit: 'media' })).toBe('0,01')
    expect(gapText({ amount: 1.333, unit: 'media' })).toBe('1,34')
    expect(gapText({ amount: 240, unit: 'segundos' })).toBe('4:00')
    expect(gapText({ amount: 1, unit: 'posicoes' })).toBe('1 posição')
    expect(gapText({ amount: 3, unit: 'posicoes' })).toBe('3 posições')
    expect(gapText({ amount: 4.2, unit: 'pontos' })).toBe('5 pts')
  })

  it('Diamante: posições até o Lendário; sem vagas de Lendário, barra cheia e sem "faltam"', () => {
    const withSlots = matchContent({ category: ranked({ tier: 'diamante', tier_position: 2, next_tier: 'lendario', progress: 0.27, gap: { amount: 1, unit: 'posicoes' } }) }).bar
    expect(withSlots).toMatchObject({ tier: 'diamante', progress: 0.27, foot: '2º no Diamante · faltam 1 posição para Lendário' })
    const noSlots = matchContent({ category: ranked({ tier: 'diamante', tier_position: 1, next_tier: 'lendario', progress: 0.4, gap: null }) }).bar
    expect(noSlots).toMatchObject({ progress: 1, foot: '1º no Diamante' })
  })

  it('Lendário: barra cheia, sem "faltam"', () => {
    expect(matchContent({ category: ranked({ tier: 'lendario', tier_position: 1, next_tier: null, gap: null, progress: 1 }) }).bar)
      .toMatchObject({ kind: 'ranqueado', tierName: 'Lendário', progress: 1, foot: '1º no Lendário' })
  })

  it('em classificação: "N de M partidas" (corrida: marcas), sem elo', () => {
    expect(tennisContent({ category: placement() }).bar).toEqual({ kind: 'classificacao', sport: 'tenis', meta: '2 de 3 partidas', progress: 0.6667 })
    expect(runContent({ category: placement({ ranking: 'corrida_5', played: 0, required: 1, progress: 0 }) }).bar)
      .toEqual({ kind: 'classificacao', sport: 'corrida', meta: '0 de 1 marca', progress: 0 })
    // Uma chave de elo em classificação nunca vira elo atribuído.
    expect(matchContent({ category: ranked({ state: 'classificacao', tier: 'ouro' }) }).bar?.kind).toBe('classificacao')
  })

  it('corrida: a diferença para a melhor anterior ou a primeira marca no lugar dos pontos', () => {
    expect(runContent().bar).toMatchObject({ meta: { text: '−0:49 nos 5 km', tone: 'up' }, foot: '3º na Prata · faltam 4:00 para Ouro' })
    expect(runContent({ mark_kind: 'primeira_marca', previous_best_s: null }).bar).toMatchObject({ meta: { text: '1ª marca nos 5 km' } })
    expect(runContent({ mark_kind: 'sem_melhora', duration_s: 1639, previous_best_s: 1623 }).bar).toMatchObject({ meta: { text: '+0:16 nos 5 km', tone: 'down' } })
    expect(runContent({ mark_kind: 'sem_melhora', duration_s: 1623, previous_best_s: 1623 }).bar).toMatchObject({ meta: { text: 'Igual à melhor nos 5 km' } })
    expect(runContent({ mark_kind: 'sem_melhora', previous_best_s: null }).bar).toMatchObject({ meta: null })
  })

  it('corrida fora das distâncias do ranking: sem barra', () => {
    const content = runContent({ standard_distance_km: null, distance_m: 7300, mark_kind: null, previous_best_s: null, category: null })
    expect(content.bar).toBeNull()
    expect(content.spoken).toBe('Adesivo de resultado: Distância 7,3 km, Tempo 26:14, Ritmo 5:14 /km.')
  })

  it('descreve o adesivo por extenso e nunca menciona cidade', () => {
    expect(matchContent().spoken).toBe('Adesivo de resultado: Resultado Vitória, Placar 3 × 1, Você 1 G · 1 A. Elo Prata, +3 pts, 3º na Prata · faltam 71 para Ouro.')
    expect(tennisContent({ category: placement() }).spoken).toContain('Em classificação, 2 de 3 partidas.')
    expect(matchContent().spoken).not.toMatch(/Brasília|#/)
  })
})

describe('geometria do adesivo', () => {
  it('posiciona a placa no topo do design, a barra logo abaixo e a assinatura embaixo', () => {
    const layout = stickerLayout(matchContent())
    expect(layout.plate.box).toEqual({ x: 20, y: 118, w: 320, h: 73 })
    expect(layout.bar?.box.y).toBe(118 + 73 + 14)
    expect(layout.bar?.box.w).toBeCloseTo(262.4)
    expect(layout.bar?.icon).toMatchObject({ kind: 'tier', tier: 'prata' })
    expect(layout.bar?.fill.color).toBe(TIER_COLORS.prata)
    expect(layout.bar?.fill.w).toBeCloseTo((layout.bar?.track.w ?? 0) * 0.42)
    expect(layout.signature.word.text).toBe('arena')
    expect(layout.signature.mark.y + layout.signature.mark.h / 2).toBe(STICKER_HEIGHT - 96 - 10)
    expect(layoutTexts(layout)).toEqual(['RESULTADO', 'Vitória', 'PLACAR', '3 × 1', 'VOCÊ', '1 G · 1 A', 'PRATA', '+3 pts', '3º na Prata · faltam 71 para Ouro', 'arena'])
  })

  it('usa colunas iguais quando tudo cabe e alarga a do placar longo do tênis', () => {
    const even = stickerLayout(matchContent(), { measure: () => 60 }).plate
    expect(even.dividers.map(divider => Math.round(divider.x))).toEqual([128, 232])
    expect(even.columns.map(column => column.value.font.size)).toEqual([21, 21, 21])
    const tennis = stickerLayout(tennisContent()).plate
    const [, placar] = tennis.columns
    const widths = [tennis.dividers[0].x - 24, tennis.dividers[1].x - tennis.dividers[0].x]
    expect(widths[1]).toBeGreaterThan(widths[0])
    expect(placar.value.font.size).toBeLessThanOrEqual(21)
    expect(placar.value.font.size).toBeGreaterThanOrEqual(11)
  })

  it('posiciona a unidade ao lado do número na corrida', () => {
    const [distance] = stickerLayout(runContent()).plate.columns
    expect(distance.value).toMatchObject({ text: '5,02', align: 'left' })
    expect(distance.unit).toMatchObject({ text: 'km', align: 'left' })
    expect(distance.unit!.x).toBeGreaterThan(distance.value.x)
  })

  it('em classificação usa o selo com aro e desce o progresso para o rodapé quando não cabe ao lado', () => {
    const layout = stickerLayout(tennisContent({ category: placement() }))
    expect(layout.bar?.icon).toMatchObject({ kind: 'aro', sport: 'tenis' })
    expect(layout.bar?.title.text).toBe('EM CLASSIFICAÇÃO')
    expect(layout.bar?.meta).toBeNull()
    expect(layout.bar?.foot.map(item => item.text)).toEqual(['2 de 3 partidas'])
    const wide = stickerLayout(tennisContent({ category: placement() }), { measure: () => 10 })
    expect(wide.bar?.meta?.text).toBe('2 de 3 partidas')
    expect(wide.bar?.foot).toEqual([])
  })

  it('quebra o rodapé longo em duas linhas nos separadores', () => {
    const layout = stickerLayout(matchContent({ category: ranked({ tier: 'diamante', tier_position: 12, next_tier: 'lendario', gap: { amount: 3, unit: 'posicoes' } }) }))
    expect(layout.bar?.foot.map(item => item.text)).toEqual(['12º no Diamante', 'faltam 3 posições para Lendário'])
    expect(layout.bar!.box.h).toBeGreaterThan(stickerLayout(matchContent()).bar!.box.h)
  })

  it('sem barra na corrida livre; centro e base deslocam só a placa e a barra', () => {
    const free = stickerLayout(runContent({ standard_distance_km: null, category: null }))
    expect(free.bar).toBeNull()
    const topo = stickerLayout(matchContent())
    const centro = stickerLayout(matchContent(), { position: 'centro' })
    const base = stickerLayout(matchContent(), { position: 'base' })
    expect(centro.plate.box.y).toBeGreaterThan(topo.plate.box.y)
    expect(base.plate.box.y).toBeGreaterThan(centro.plate.box.y)
    expect(base.bar!.box.y + base.bar!.box.h).toBeLessThan(base.signature.mark.y)
    expect(centro.signature).toEqual(topo.signature)
  })

  it('a medida aproximada considera o espaçamento entre letras', () => {
    expect(approximateMeasure('abc', { weight: 600, size: 10, family: 'Inter, system-ui, sans-serif', letterSpacing: 1 })).toBeCloseTo(3 * 5.4 + 2)
  })
})

describe('desenho em Canvas', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('lê os caminhos e a regra de preenchimento do SVG do Coliseu', () => {
    expect(parseSvgPaths(coliseumSvg)).toEqual([{ d: 'M0 0L10 10Z', rule: 'evenodd' }, { d: 'M5 5L6 6Z', rule: 'nonzero' }])
    expect(parseSvgPaths('<svg><path fill="red"/></svg>')).toEqual([])
  })

  it('desenha a mesma geometria em qualquer escala, com o xadrez só na prévia', async () => {
    vi.stubGlobal('Path2D', FakePath2D)
    const coliseum = [{ path: new FakePath2D('M0 0Z') as unknown as Path2D, rule: 'evenodd' as const }]
    const content = matchContent()
    const preview = fakeContext()
    const layout = measuredLayout(preview.ctx as unknown as CanvasRenderingContext2D, content)
    drawSticker(preview.ctx as unknown as CanvasRenderingContext2D, layout, { coliseum }, { scale: 0.8, background: 'checker' })
    const exported = fakeContext()
    drawSticker(exported.ctx as unknown as CanvasRenderingContext2D, layout, { coliseum }, { scale: 3 })
    expect(preview.texts.map(item => item.text)).toEqual(exported.texts.map(item => item.text))
    expect(exported.texts.map(item => item.text)).toEqual(layoutTexts(layout))
    const vitoria = exported.texts.find(item => item.text === 'Vitória')!
    const vitoriaPreview = preview.texts.find(item => item.text === 'Vitória')!
    expect(vitoria.x / vitoriaPreview.x).toBeCloseTo(3 / 0.8)
    expect(vitoria.font).toContain('63px')
    // O xadrez pinta o quadro inteiro antes do adesivo; o PNG só limpa.
    expect(preview.ctx.fillRect).toHaveBeenCalledWith(0, 0, 288, 512)
    expect(exported.ctx.fillRect).not.toHaveBeenCalledWith(0, 0, 1080, 1920)
    expect(exported.ctx.clearRect).toHaveBeenCalledWith(0, 0, 1080, 1920)
    // Coliseu do elo e da assinatura, pela regra do SVG.
    expect(exported.ctx.fill).toHaveBeenCalledWith(coliseum[0].path, 'evenodd')
  })

  it('aceita um fundo próprio (a foto do editor) e desenha o selo com aro na classificação', () => {
    vi.stubGlobal('Path2D', FakePath2D)
    const { ctx } = fakeContext()
    const background = vi.fn()
    const layout = stickerLayout(tennisContent({ category: placement() }))
    drawSticker(ctx as unknown as CanvasRenderingContext2D, layout, { coliseum: [] }, { scale: 1, background })
    expect(background).toHaveBeenCalledWith(ctx, 360, 640)
    expect(ctx.fill.mock.calls.some(([path]) => path instanceof FakePath2D)).toBe(true)
  })

  it('carrega Inter e Sora antes de desenhar, quando o navegador tem a API de fontes', async () => {
    const load = vi.fn(async () => [])
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load, ready: Promise.resolve() } })
    await ensureStickerFonts()
    expect(load).toHaveBeenCalledWith('700 21px Sora, system-ui, sans-serif')
    expect(load).toHaveBeenCalledWith('600 9px Inter, system-ui, sans-serif')
    Reflect.deleteProperty(document, 'fonts')
  })

  it('exporta o PNG 1080×1920 transparente e lê o Coliseu uma vez', async () => {
    vi.stubGlobal('Path2D', FakePath2D)
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => coliseumSvg }))
    vi.stubGlobal('fetch', fetchMock)
    const { ctx } = fakeContext()
    const canvases: HTMLCanvasElement[] = []
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) { canvases.push(this); return ctx as never })
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['png'], { type: 'image/png' })))
    const blob = await stickerPng(matchContent())
    expect(blob.type).toBe('image/png')
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png', undefined)
    expect([canvases[0].width, canvases[0].height]).toEqual([1080, 1920])
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 1080, 1920)
    expect((await loadColiseum()).map(shape => shape.rule)).toEqual(['evenodd', 'nonzero'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('recusa a exportação quando o Canvas não gera o arquivo', async () => {
    vi.stubGlobal('Path2D', FakePath2D)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => coliseumSvg })))
    const { ctx } = fakeContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as never)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(null))
    await expect(stickerPng(matchContent())).rejects.toThrow('Não foi possível gerar a imagem.')
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
    await expect(stickerPng(matchContent())).rejects.toThrow('Não foi possível gerar a imagem.')
  })
})
