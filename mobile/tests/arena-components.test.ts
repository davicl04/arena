import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ReactTestRenderer } from 'react-test-renderer'
import * as SecureStore from 'expo-secure-store'
import { Share } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { brandSvgs } from '../src/assets/brand-svgs'
import { Armband } from '../src/components/arena/Armband'
import { ArenaMark } from '../src/components/arena/ArenaMark'
import { EventPoster } from '../src/components/arena/EventPoster'
import { FormatTile } from '../src/components/arena/FormatTile'
import { PixBlock } from '../src/components/arena/PixBlock'
import { PlacementBadge, PlacementMeter } from '../src/components/arena/PlacementMeter'
import { ReceiptImage, PDF_NOTICE } from '../src/components/arena/ReceiptImage'
import { SportIcon } from '../src/components/arena/SportIcon'
import { DeadlineRing, StatusCard, StatusCardButton } from '../src/components/arena/StatusCard'
import { StateBadge } from '../src/components/arena/StateBadge'
import { TeamCrest } from '../src/components/arena/TeamCrest'
import { TierEmblem } from '../src/components/arena/TierEmblem'
import type { PixInfo } from '../src/components/arena/pix'
import { pixShareMessage, shareFeedback } from '../src/components/arena/pix'
import { byLabel, enableAct, textOf } from './support/native'

vi.mock('react-native', async () => (await import('./support/native')).reactNativeMock())
vi.mock('react-native-svg', async () => (await import('./support/native')).svgMock())
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))
vi.mock('../src/data/sportIcons', () => ({ sportIcons: { futebol: 'futebol.png', tenis: 'tenis.png', corrida: 'corrida.png' } }))

const h = React.createElement
const TOKEN = 'test-only-token'

async function render(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer
  await act(async () => { tree = create(element) })
  return tree
}
const all = (tree: ReactTestRenderer, type: string) => tree.root.findAllByType(type as never)
const svgXml = (tree: ReactTestRenderer) => all(tree, 'SvgXml')
/** Elementos nativos (host) com o testID: o mock de cada componente também é um nó, com as mesmas props. */
const byId = (tree: ReactTestRenderer, id: string) => tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === id)

beforeEach(() => {
  enableAct()
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue(TOKEN)
})
afterEach(() => { vi.useRealTimers() })

describe('TierEmblem: o brasão do elo', () => {
  it('renderiza o SVG do elo no tamanho pedido, com o nome para leitores de tela', async () => {
    const tree = await render(h(TierEmblem, { tier: 'ouro', size: 'xl' }))
    expect(svgXml(tree)).toHaveLength(1)
    expect(svgXml(tree)[0].props).toMatchObject({ xml: brandSvgs.ouro, width: 52, height: 52 })
    expect(byLabel(tree, 'Elo Ouro')).toHaveLength(1)
  })

  it('mostra o nome ao lado e esconde o rótulo duplicado, ou fica decorativo', async () => {
    const named = await render(h(TierEmblem, { tier: 'diamante', showName: true }))
    expect(textOf(named)).toBe('Diamante')
    expect(byLabel(named, 'Elo Diamante')).toHaveLength(0)
    const decorative = await render(h(TierEmblem, { tier: 'prata', decorative: true, size: 'xs' }))
    expect(byLabel(decorative, 'Elo Prata')).toHaveLength(0)
    expect(svgXml(decorative)[0].props.width).toBe(16)
  })

  it('não mostra nada para uma chave desconhecida', async () => {
    const tree = await render(h(TierEmblem, { tier: 'ferro' as never }))
    expect(tree.toJSON()).toBeNull()
  })

  it('cada um dos cinco elos tem o próprio brasão', async () => {
    for (const tier of ['bronze', 'prata', 'ouro', 'diamante', 'lendario'] as const) {
      const tree = await render(h(TierEmblem, { tier }))
      expect(svgXml(tree)[0].props.xml).toBe(brandSvgs[tier])
    }
  })
})

describe('classificação: PlacementBadge, PlacementMeter e FormatTile', () => {
  it('o círculo conta as partidas e limita a 0…3', async () => {
    const two = await render(h(PlacementBadge, { played: 2 }))
    expect(textOf(two)).toBe('2/3')
    expect(byLabel(two, '2 de 3 partidas de classificação')).toHaveLength(1)
    expect(textOf(await render(h(PlacementBadge, { played: 9 })))).toBe('3/3')
    expect(textOf(await render(h(PlacementBadge, { played: -4 })))).toBe('0/3')
    expect(byLabel(await render(h(PlacementBadge, { played: 1, decorative: true })), '1 de 3 partidas de classificação')).toHaveLength(0)
  })

  it('a linha do Jogar mostra "n de 3 partidas", o complemento e três barrinhas (nunca um elo)', async () => {
    const tree = await render(h(PlacementMeter, { played: 2, hint: 'enfrenta qualquer nível' }))
    expect(textOf(tree)).toContain('Em classificação')
    expect(textOf(tree)).toContain('2 de 3 partidas · enfrenta qualquer nível')
    expect(byId(tree, 'placement-bar-on')).toHaveLength(2)
    expect(byId(tree, 'placement-bar')).toHaveLength(1)
    expect(svgXml(tree)).toHaveLength(0)
    const titled = await render(h(PlacementMeter, { played: 0, title: 'Em classificação como goleiro', tone: 'light' }))
    expect(textOf(titled)).toContain('Em classificação como goleiro')
    expect(byId(titled, 'placement-bar-on')).toHaveLength(0)
    expect(textOf(await render(h(PlacementMeter, { played: 7 })))).toContain('3 de 3 partidas')
  })

  it('a célula do formato mostra o elo só com a classificação completa', async () => {
    const ranked = await render(h(FormatTile, { format: 'society', tier: 'ouro', played: 3 }))
    expect(svgXml(ranked)[0].props.xml).toBe(brandSvgs.ouro)
    expect(textOf(ranked)).toContain('Society')
    expect(textOf(ranked)).toContain('Ouro')
    expect(byLabel(ranked, 'Society, elo Ouro')).toHaveLength(1)
  })

  it('em classificação a célula mostra "n/3 jogos" e NUNCA o brasão, mesmo que a API traga um elo', async () => {
    const tree = await render(h(FormatTile, { format: 'futsal', tier: 'ouro', played: 2 }))
    expect(svgXml(tree)).toHaveLength(0)
    expect(textOf(tree)).toContain('2/3 jogos')
    expect(textOf(tree)).not.toContain('Ouro')
    expect(byLabel(tree, 'Futsal, 2 de 3 partidas de classificação')).toHaveLength(1)
  })

  it('sem jogos a célula fica apagada e sem elo', async () => {
    const tree = await render(h(FormatTile, { format: 'campo', tier: 'prata', played: 0 }))
    expect(svgXml(tree)).toHaveLength(0)
    expect(textOf(tree)).toContain('sem jogos')
    expect(byId(tree, 'format-tile-empty')).toHaveLength(1)
    expect(byLabel(tree, 'Campo, sem jogos')).toHaveLength(1)
  })
})

describe('Armband, StateBadge, SportIcon e ArenaMark', () => {
  it('a braçadeira se anuncia como "Representante" nas duas variantes', async () => {
    expect(byLabel(await render(h(Armband, {})), 'Representante')).toHaveLength(1)
    expect(textOf(await render(h(Armband, { size: 'lg', ring: 'dark' })))).toBe('C')
    const inline = await render(h(Armband, { variant: 'inline' }))
    expect(byLabel(inline, 'Representante')).toHaveLength(1)
    expect(all(inline, 'SvgText')[0].props.children).toBe('C')
  })

  it('o selo de estado usa o tom pedido', async () => {
    const tree = await render(h(StateBadge, { tone: 'danger', surface: 'dark', children: 'Recusado' }))
    expect(textOf(tree)).toBe('Recusado')
    expect(byId(tree, 'state-badge-danger')).toHaveLength(1)
    expect(textOf(await render(h(StateBadge, { tone: 'open', children: 'Inscrições abertas' })))).toBe('Inscrições abertas')
  })

  it('o ícone da modalidade usa o PNG local e fica oculto para leitores de tela', async () => {
    const tree = await render(h(SportIcon, { sport: 'tenis', size: 30 }))
    expect(all(tree, 'Image')[0].props.source).toBe('tenis.png')
    expect(byId(tree, 'sport-icon-tenis')[0].props.accessible).toBe(false)
    expect(all(await render(h(SportIcon, { sport: 'corrida', inverted: true })), 'Image')[0].props.source).toBe('corrida.png')
  })

  it('o símbolo do Coliseu e a muralha vêm dos SVGs da marca, na cor pedida', async () => {
    const coliseum = svgXml(await render(h(ArenaMark, { color: '#8fe0b4' })))[0].props
    expect(coliseum).toMatchObject({ xml: brandSvgs.coliseum, width: 44, height: 32, color: '#8fe0b4' })
    expect(svgXml(await render(h(ArenaMark, { compact: true })))[0].props).toMatchObject({ xml: brandSvgs.arenaWall, width: 30 })
  })
})

describe('TeamCrest: brasão com Bearer ou escudo com iniciais', () => {
  it('sem imagem, mostra o escudo neutro com as iniciais da API ou calculadas do nome', async () => {
    const withInitials = await render(h(TeamCrest, { name: 'Leões do Cerrado', initials: 'LC', token: TOKEN }))
    expect(all(withInitials, 'SvgText')[0].props.children).toBe('LC')
    expect(byLabel(withInitials, 'Brasão de Leões do Cerrado')).toHaveLength(1)
    expect(all(await render(h(TeamCrest, { name: 'Ferrugem FC', token: null })), 'SvgText')[0].props.children).toBe('FF')
  })

  it('com imagem enviada, carrega com o header Authorization da sessão', async () => {
    const tree = await render(h(TeamCrest, { name: 'Leões', path: '/api/v1/teams/3/crest?v=abc', size: 'lg' }))
    const image = all(tree, 'Image')[0]
    expect(image.props.source).toEqual({ uri: 'http://10.0.2.2:8000/api/v1/teams/3/crest?v=abc', headers: { Authorization: `Bearer ${TOKEN}` } })
    expect(all(tree, 'SvgText')).toHaveLength(0)
  })

  it('espera o token (escudo neutro) e cai no escudo se a imagem falhar', async () => {
    const noToken = await render(h(TeamCrest, { name: 'Leões', path: '/api/v1/teams/3/crest', token: null }))
    expect(all(noToken, 'Image')).toHaveLength(0)
    const tree = await render(h(TeamCrest, { name: 'Leões', path: '/api/v1/teams/3/crest', token: TOKEN }))
    await act(async () => { all(tree, 'Image')[0].props.onError() })
    expect(all(tree, 'Image')).toHaveLength(0)
    expect(all(tree, 'SvgText')[0].props.children).toBe('LE')
  })

  it('a prévia local não usa o Bearer e o modo decorativo oculta o brasão', async () => {
    const preview = await render(h(TeamCrest, { name: 'Leões', previewUri: 'file:///cache/recorte.jpg', decorative: true, token: TOKEN }))
    expect(all(preview, 'Image')[0].props.source).toEqual({ uri: 'file:///cache/recorte.jpg' })
    expect(byLabel(preview, 'Brasão de Leões')).toHaveLength(0)
  })
})

describe('StatusCard (S1) e o anel do prazo', () => {
  const NOW = Date.parse('2026-10-12T12:00:00Z')
  const inHours = (hours: number) => new Date(NOW + hours * 3_600_000).toISOString()
  const dash = (tree: ReactTestRenderer) => all(tree, 'Circle')[1].props.strokeDasharray as number[]

  it('aguardando com prazo troca o ícone pelo anel e anuncia as horas restantes', async () => {
    vi.useFakeTimers({ now: NOW })
    const tree = await render(h(StatusCard, { tone: 'aguardando', title: 'Vaga reservada', deadline: inHours(24), pill: 'Ferrugem FC' }, 'Envie o comprovante até a hora marcada.'))
    expect(textOf(tree)).toContain('Vaga reservada')
    expect(textOf(tree)).toContain('24 h')
    expect(byId(tree, 'deadline-ring')).toHaveLength(1)
    expect(textOf(tree)).toContain('Ferrugem FC')
    expect(byLabel(tree, '24 horas restantes')).toHaveLength(1)
    const [filled, whole] = dash(tree)
    expect(filled / whole).toBeCloseTo(0.5, 2)
  })

  it('o anel acompanha o relógio a cada minuto', async () => {
    vi.useFakeTimers({ now: NOW })
    const tree = await render(h(DeadlineRing, { deadline: inHours(24) }))
    await act(async () => { await vi.advanceTimersByTimeAsync(6 * 3_600_000) })
    expect(byLabel(tree, '18 horas restantes')).toHaveLength(1)
    const [filled, whole] = dash(tree)
    expect(filled / whole).toBeCloseTo(0.375, 2)
    await act(async () => { await vi.advanceTimersByTimeAsync(24 * 3_600_000) })
    expect(byLabel(tree, 'Prazo encerrado')).toHaveLength(1)
    expect(dash(tree)[0]).toBe(0)
    await act(async () => { tree.unmount() })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('usa o início da janela quando informado e limita a fração a 100%', async () => {
    vi.useFakeTimers({ now: NOW })
    const tree = await render(h(DeadlineRing, { deadline: inHours(2), windowStart: inHours(-2) }))
    expect(dash(tree)[0] / dash(tree)[1]).toBeCloseTo(0.5, 2)
    const wide = await render(h(DeadlineRing, { deadline: inHours(100), windowHours: 48 }))
    expect(dash(wide)[0]).toBe(dash(wide)[1])
    expect(textOf(await render(h(DeadlineRing, { deadline: new Date(NOW + 20 * 60_000).toISOString() })))).toBe('20 min')
  })

  it('os demais tons mostram o ícone do estado, sem anel e sem timer', async () => {
    vi.useFakeTimers({ now: NOW })
    for (const tone of ['confirmado', 'divergente', 'neutro'] as const) {
      const tree = await render(h(StatusCard, { tone, title: 'Resultado', deadline: inHours(5) }))
      expect(byId(tree, 'deadline-ring')).toHaveLength(0)
      expect(all(tree, 'Path').length).toBeGreaterThan(0)
    }
    expect(vi.getTimerCount()).toBe(0)
    const sem = await render(h(StatusCard, { tone: 'aguardando', title: 'Sem prazo', deadline: 'inválido' }))
    expect(byId(sem, 'deadline-ring')).toHaveLength(0)
  })

  it('exibe as ações do cartão e aciona o botão', async () => {
    const onPress = vi.fn()
    const tree = await render(h(StatusCard, { tone: 'divergente', title: 'Comprovante recusado', actions: h(StatusCardButton, { title: 'Enviar outro', onPress }) }, 'Valor diferente.'))
    const send = tree.root.findAllByType('Pressable' as never).find(entry => entry.props.accessibilityRole === 'button')
    expect(send).toBeTruthy()
    await act(async () => { send!.props.onPress() })
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(textOf(tree)).toContain('Enviar outro')
    const secondary = await render(h(StatusCardButton, { title: 'Ver', onPress, variant: 'secondary', disabled: true }))
    expect(secondary.root.findAllByType('Pressable' as never)[0].props.disabled).toBe(true)
  })
})

describe('PixBlock: texto selecionável e Compartilhar', () => {
  const pix: PixInfo = { holder: 'Rafa Nunes', keyType: 'email', key: 'copa@example.com', copyPaste: '00020126580014br.gov.bcb.pix0136copa@example.com5204000053039865406240.00', instructions: null, contact: null }
  const press = async (tree: ReactTestRenderer, label: string) => {
    const target = tree.root.findAllByType('Pressable' as never).find(entry => entry.props.accessibilityLabel === label)
    expect(target, label).toBeTruthy()
    await act(async () => { target!.props.onPress() })
  }

  it('mostra favorecido, tipo da chave e a chave e o código em texto selecionável', async () => {
    const tree = await render(h(PixBlock, { pix, priceCents: 24000 }))
    expect(textOf(tree)).toContain('Rafa Nunes · chave por e-mail')
    const key = byId(tree, 'pix-key')[0]
    const code = byId(tree, 'pix-code')[0]
    expect(key.props.selectable).toBe(true)
    expect(key.props.children).toBe('copa@example.com')
    expect(code.props.selectable).toBe(true)
    expect(code.props.children).toBe(pix.copyPaste)
    expect(textOf(tree)).toMatch(/Pix Copia e Cola · R\$.240/)
  })

  it('Compartilhar chave Pix envia só a chave ao menu do aparelho e anuncia o resultado', async () => {
    vi.mocked(Share.share).mockResolvedValue({ action: Share.sharedAction })
    const tree = await render(h(PixBlock, { pix }))
    await press(tree, 'Compartilhar chave Pix')
    expect(Share.share).toHaveBeenCalledWith({ message: 'copa@example.com' })
    expect(textOf(tree)).toContain('Chave Pix enviada ao Compartilhar do aparelho.')
  })

  it('Compartilhar Pix Copia e Cola envia só o código', async () => {
    vi.mocked(Share.share).mockResolvedValue({ action: Share.sharedAction })
    const tree = await render(h(PixBlock, { pix }))
    await press(tree, 'Compartilhar Pix Copia e Cola')
    expect(Share.share).toHaveBeenCalledWith({ message: pix.copyPaste })
    expect(textOf(tree)).toContain('Código Pix Copia e Cola enviado ao Compartilhar do aparelho.')
  })

  it('fechar o menu não diz nada; uma falha manda selecionar e copiar à mão', async () => {
    const tree = await render(h(PixBlock, { pix }))
    vi.mocked(Share.share).mockResolvedValue({ action: Share.dismissedAction })
    await press(tree, 'Compartilhar chave Pix')
    expect(textOf(tree)).not.toContain('enviada')
    vi.mocked(Share.share).mockRejectedValue(new Error('indisponível'))
    await press(tree, 'Compartilhar Pix Copia e Cola')
    expect(textOf(tree)).toContain('Mantenha o dedo sobre o código para selecionar e copiar.')
    expect(tree.root.findAllByType('Text' as never).find(node => node.props.accessibilityRole === 'alert')).toBeTruthy()
  })

  it('sem Copia e Cola só há a chave; o ⓘ abre as informações de pagamento', async () => {
    const onInfo = vi.fn()
    const tree = await render(h(PixBlock, { pix: { ...pix, copyPaste: null }, onInfo, title: 'Pix de quem recebe' }))
    expect(byId(tree, 'pix-code')).toHaveLength(0)
    expect(tree.root.findAllByType('Pressable' as never).filter(entry => String(entry.props.accessibilityLabel).startsWith('Compartilhar'))).toHaveLength(1)
    expect(textOf(tree)).toContain('Pix de quem recebe')
    await press(tree, 'Informações de pagamento')
    expect(onInfo).toHaveBeenCalledTimes(1)
  })

  it('monta a mensagem e o retorno de cada item', () => {
    expect(pixShareMessage(pix, 'chave')).toBe('copa@example.com')
    expect(pixShareMessage({ key: 'k', copyPaste: undefined }, 'codigo')).toBe('')
    expect(shareFeedback('idle', 'chave')).toBe('')
    expect(shareFeedback('shared', null)).toBe('')
    expect(shareFeedback('failed', 'chave')).toContain('selecionar e copiar')
  })
})

describe('ReceiptImage: imagem autorizada e aviso do PDF', () => {
  const receipt = { file_url: '/api/v1/receipts/9/file', file_type: 'imagem' as const, size_bytes: 25_600 }

  it('carrega a imagem pela rota autorizada com o header Authorization', async () => {
    const tree = await render(h(ReceiptImage, { receipt, title: 'Comprovante enviado por Ferrugem FC' }))
    const image = all(tree, 'Image')[0]
    expect(image.props.source).toEqual({ uri: 'http://10.0.2.2:8000/api/v1/receipts/9/file', headers: { Authorization: `Bearer ${TOKEN}` } })
    expect(image.props.accessibilityLabel).toBe('Comprovante enviado por Ferrugem FC')
    expect(all(tree, 'ActivityIndicator')).toHaveLength(1)
    await act(async () => { image.props.onLoad() })
    expect(all(tree, 'ActivityIndicator')).toHaveLength(0)
  })

  it('PDF não abre no aparelho: mostra o aviso honesto, sem tentar carregar o arquivo', async () => {
    const tree = await render(h(ReceiptImage, { receipt: { ...receipt, file_type: 'pdf' }, title: 'Comprovante' }))
    expect(PDF_NOTICE).toBe('Abra este comprovante pela web.')
    expect(textOf(tree)).toContain('Comprovante em PDF')
    expect(textOf(tree)).toContain('25 KB · Abra este comprovante pela web.')
    expect(all(tree, 'Image')).toHaveLength(0)
    const thumb = await render(h(ReceiptImage, { receipt: { ...receipt, file_type: 'pdf' }, title: 'Comprovante', variant: 'thumb' }))
    expect(textOf(thumb)).toBe('PDF')
    expect(byLabel(thumb, 'Comprovante em PDF. Abra este comprovante pela web.')).toHaveLength(1)
  })

  it('mostra o erro quando a imagem não carrega, na folha e na miniatura', async () => {
    const full = await render(h(ReceiptImage, { receipt, title: 'Comprovante', token: TOKEN }))
    await act(async () => { all(full, 'Image')[0].props.onError() })
    expect(textOf(full)).toContain('Não foi possível carregar o comprovante.')
    expect(all(full, 'Image')).toHaveLength(0)
    const thumb = await render(h(ReceiptImage, { receipt, title: 'Comprovante', variant: 'thumb', token: TOKEN }))
    await act(async () => { all(thumb, 'Image')[0].props.onError() })
    expect(textOf(thumb)).toBe('Indisponível')
  })

  it('espera o token da sessão antes de pedir a imagem', async () => {
    const tree = await render(h(ReceiptImage, { receipt, title: 'Comprovante', token: null }))
    expect(all(tree, 'Image')).toHaveLength(0)
  })
})

describe('EventPoster: cartaz E2/O3', () => {
  const startsAt = new Date(2026, 9, 25, 16, 0).toISOString()
  const base = { name: 'Copa Sudoeste Society', sport: 'futebol' as const, startsAt, format: 'society' as const, eventType: 'eliminacao_simples' as const, priceCents: 24000 }

  it('mostra dia, mês, nome, formato, preço e a barra de inscrições', async () => {
    const tree = await render(h(EventPoster, { ...base, acceptedTiers: ['prata', 'ouro'], entries: { count: 3, capacity: 8 }, phase: 'inscricoes_abertas', state: 'publicado' }))
    const text = textOf(tree)
    expect(text).toContain('25')
    expect(text).toContain('OUT')
    expect(text).toContain('Copa Sudoeste Society')
    expect(text).toContain('Society 7×7 · Eliminação simples')
    expect(text).toMatch(/R\$.240/)
    expect(text).toContain('3 de 8 times')
    expect(text).toContain('Inscrições abertas')
    expect(byId(tree, 'poster-fill')[0].props.style.width).toBe('37.5%')
    expect(byLabel(tree, 'Para Prata e Ouro')).toHaveLength(1)
    expect(svgXml(tree)).toHaveLength(2)
  })

  it('sem elos aceitos, é aberto a todos (globo)', async () => {
    const tree = await render(h(EventPoster, { ...base, acceptedTiers: null }))
    expect(byLabel(tree, 'Aberto a todos')).toHaveLength(1)
    expect(svgXml(tree)).toHaveLength(0)
  })

  it('rascunho: sem data, "A definir" e gratuito quando zero', async () => {
    const draft = await render(h(EventPoster, { name: 'Rascunho', sport: null, startsAt: null, priceCents: null, state: 'rascunho' }))
    expect(textOf(draft)).toContain('—')
    expect(textOf(draft)).toContain('SEM DATA')
    expect(textOf(draft)).toContain('A definir')
    expect(textOf(draft)).toContain('Rascunho')
    expect(textOf(await render(h(EventPoster, { ...base, priceCents: 0 })))).toContain('Gratuito')
  })

  it('o rodapé mostra a inscrição de quem vê, "Fora da faixa" ou as pendências do organizador', async () => {
    expect(textOf(await render(h(EventPoster, { ...base, entryState: 'confirmada' })))).toContain('Inscrito')
    const locked = await render(h(EventPoster, { ...base, locked: true }))
    expect(textOf(locked)).toContain('Fora da faixa')
    const pending = await render(h(EventPoster, { ...base, pendingCount: 2 }))
    expect(byLabel(pending, '2 pendências')).toHaveLength(1)
    expect(byLabel(await render(h(EventPoster, { ...base, pendingCount: 1 })), '1 pendência')).toHaveLength(1)
    const sport = await render(h(EventPoster, { ...base, showSport: true }))
    expect(all(sport, 'Image')[0].props.source).toBe('futebol.png')
  })

  it('o cartaz da lista é um botão com a descrição completa; o hero não', async () => {
    const onPress = vi.fn()
    const card = await render(h(EventPoster, { ...base, onPress, state: 'publicado', locked: false }))
    const button = card.root.findAllByType('Pressable' as never)[0]
    expect(button.props.accessibilityLabel).toContain('Copa Sudoeste Society')
    expect(button.props.accessibilityLabel).toContain('domingo, 25 de outubro')
    await act(async () => { button.props.onPress() })
    expect(onPress).toHaveBeenCalledTimes(1)
    const hero = await render(h(EventPoster, { ...base, size: 'hero', organizer: 'Rafa Nunes', onPress, entries: { count: 0, capacity: 0 } }))
    expect(hero.root.findAllByType('Pressable' as never)).toHaveLength(0)
    expect(textOf(hero)).toContain('Rafa Nunes')
    expect(textOf(hero)).toContain('Society 7×7')
    expect(textOf(hero)).not.toContain('de 0')
  })

  it('corrida: distância e "Prova"; evento encerrado fica apagado', async () => {
    const run = await render(h(EventPoster, { name: 'Corrida do Parque', sport: 'corrida', startsAt, distanceKm: 10, priceCents: 8000, state: 'encerrado', entries: { count: 10, capacity: 10 } }))
    expect(textOf(run)).toContain('10 km · Prova')
    expect(textOf(run)).toContain('10 de 10 corredores')
    expect(textOf(run)).toContain('Encerrado')
    expect(textOf(await render(h(EventPoster, { ...base, stateLabel: 'Vai para aprovação', state: 'em_aprovacao' })))).toContain('Vai para aprovação')
  })
})
