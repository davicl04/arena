import type { ReactNode, Ref } from 'react'
import { View } from 'react-native'
import { Text } from '../Text'
import type { AccessibilityProps } from 'react-native'
import Svg, { Path, Rect, SvgXml } from 'react-native-svg'
import { brandSvgs } from '../../assets/brand-svgs'
import { colors } from '../../theme'
import { ArenaMark } from '../arena/ArenaMark'
import { SportIcon } from '../arena/SportIcon'
import type { EloBar, PlateCell, StickerModel } from './stickerView'

/*
 * Adesivo de resultado em RN/SVG (design aprovado: placa Floresta sólida, barra do elo logo abaixo e assinatura solta
 * embaixo). A geometria é a do protótipo, num quadro de 360×640 unidades (9:16), escalado para a largura pedida; a
 * exportação captura a mesma árvore em 1080×1920 (×3). Escuro por design: as cores são fixas e iguais nos dois temas.
 * O Expo usa a fonte do sistema (não há Sora carregada).
 */

/** Quadro do design, em unidades. */
export const STORY_DESIGN = { width: 360, height: 640 } as const
/** Arquivo exportado, em pixels. */
export const STORY_EXPORT = { width: 1080, height: 1920 } as const
/** Onde a placa e a barra ficam no Story; a assinatura continua embaixo. "Topo" é o design aprovado. */
export type PlatePosition = 'topo' | 'centro' | 'base'

/** Paleta do adesivo (a mesma da web): Floresta quase opaco, rótulos em menta, números em branco. */
export const stickerPalette = {
  panel: 'rgba(16,36,27,0.84)',
  edge: 'rgba(255,255,255,0.12)',
  divider: 'rgba(255,255,255,0.14)',
  track: 'rgba(255,255,255,0.12)',
  /** Preenchimento da barra: a cor do elo (como na web) ou, em classificação, branco translúcido. */
  tierFill: { bronze: '#C98A4B', prata: '#C3CAD1', ouro: '#E0A82E', diamante: '#BFE9F2', lendario: '#F4DE9A' },
  placementFill: 'rgba(255,255,255,0.6)',
  foot: '#9fb2a7',
  down: '#ff8a9a',
  label: colors.mint,
  ink: '#ffffff',
  shadow: 'rgba(0,0,0,0.45)',
  /** Xadrez escuro do fundo transparente (só na prévia; não entra no arquivo). */
  checkerBase: '#5d6661',
  checkerCell: '#6d7671',
} as const

/** Altura do quadro 9:16 de `width` pontos. */
export const storyHeight = (width: number) => Math.round(width * STORY_DESIGN.height / STORY_DESIGN.width)

function Plate({ cells, u }: { cells: PlateCell[]; u: (n: number) => number }) {
  return <View testID="sticker-plate" style={{ alignSelf: 'stretch', flexDirection: 'row', backgroundColor: stickerPalette.panel, borderWidth: u(1), borderColor: stickerPalette.edge, borderRadius: u(18), paddingTop: u(16), paddingBottom: u(15), paddingHorizontal: u(4) }}>
    {cells.map((cell, index) => <View key={cell.label} testID="sticker-cell" style={{ flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: u(6), borderLeftWidth: index ? u(1) : 0, borderLeftColor: stickerPalette.divider }}>
      <Text numberOfLines={1} style={{ marginBottom: u(5), color: stickerPalette.label, fontSize: u(9), lineHeight: u(11), fontWeight: '600', letterSpacing: u(1.44), textTransform: 'uppercase' }}>{cell.label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ color: stickerPalette.ink, fontSize: u(21), lineHeight: u(25), fontWeight: '700', letterSpacing: u(-0.63), fontVariant: ['tabular-nums'] }}>
        {cell.value}{cell.unit ? <Text style={{ fontSize: u(12), fontWeight: '600', letterSpacing: 0 }}>{` ${cell.unit}`}</Text> : null}
      </Text>
    </View>)}
  </View>
}

function Bar({ bar, u }: { bar: EloBar; u: (n: number) => number }) {
  const ranked = bar.state === 'ranqueado'
  const meta = ranked ? bar.meta : { text: bar.meta, tone: 'flat' as const }
  return <View testID="sticker-bar" style={{ width: '82%', marginTop: u(14), gap: u(7), backgroundColor: stickerPalette.panel, borderWidth: u(1), borderColor: stickerPalette.edge, borderRadius: u(16), paddingTop: u(10), paddingHorizontal: u(14), paddingBottom: u(9) }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: u(8) }}>
      <View style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: u(7) }}>
        {ranked
          ? <View testID={`sticker-tier-${bar.tier}`}><SvgXml xml={brandSvgs[bar.tier]} width={u(22)} height={u(22)} /></View>
          : <SportIcon sport={bar.sport} shape="aro" color={stickerPalette.ink} size={u(15)} />}
        <Text style={{ flexShrink: 1, color: stickerPalette.ink, fontSize: u(13), lineHeight: u(15), fontWeight: '700', letterSpacing: u(0.52), textTransform: 'uppercase' }}>{ranked ? bar.tierName : 'Em classificação'}</Text>
      </View>
      {meta ? <Text style={{ color: meta.tone === 'down' ? stickerPalette.down : stickerPalette.label, fontSize: u(12), lineHeight: u(15), fontWeight: '700', fontVariant: ['tabular-nums'] }}>{meta.text}</Text> : null}
    </View>
    <View style={{ height: u(6), borderRadius: u(3), overflow: 'hidden', backgroundColor: stickerPalette.track }}>
      <View testID="sticker-bar-fill" style={{ width: `${Math.round(bar.progress * 1000) / 10}%`, height: '100%', borderRadius: u(3), backgroundColor: ranked ? stickerPalette.tierFill[bar.tier] : stickerPalette.placementFill }} />
    </View>
    {ranked && bar.foot ? <Text numberOfLines={2} style={{ color: stickerPalette.foot, fontSize: u(9.5), lineHeight: u(12), fontWeight: '600' }}>{bar.foot}</Text> : null}
  </View>
}

/** Assinatura: Coliseu e `arena.` em branco com sombra, sem caixa (o ponto menta circular na base das letras). */
function Signature({ u }: { u: (n: number) => number }) {
  const shadow = { textShadowColor: stickerPalette.shadow, textShadowOffset: { width: 0, height: u(2) }, textShadowRadius: u(8) }
  return <View testID="sticker-signature" style={{ position: 'absolute', left: 0, right: 0, bottom: u(96), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: u(8) }}>
    <View style={{ filter: `drop-shadow(0px ${u(2)}px ${u(8)}px ${stickerPalette.shadow})` }}><ArenaMark width={u(30)} height={u(30 * 146 / 260)} color={stickerPalette.ink} /></View>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      <Text style={{ color: stickerPalette.ink, fontSize: u(20), lineHeight: u(23), fontWeight: '800', letterSpacing: u(-1.2), ...shadow }}>arena</Text>
      <View style={{ width: u(5), height: u(5), marginLeft: u(2), marginBottom: u(5), borderRadius: u(2.5), backgroundColor: colors.mint }} />
    </View>
  </View>
}

/**
 * O adesivo sobre fundo transparente, num quadro 9:16 de `width` pontos: placa, barra do elo (quando há categoria) e
 * assinatura. `plate` desloca a placa e a barra (o seletor Topo / Centro / Base do editor); o padrão é o design aprovado.
 */
export function ResultSticker({ model, width, plate = 'topo' }: { model: StickerModel; width: number; plate?: PlatePosition }) {
  const k = width / STORY_DESIGN.width
  const u = (n: number) => n * k
  const place = plate === 'centro'
    ? { top: 0, bottom: 0, justifyContent: 'center' as const }
    : plate === 'base' ? { bottom: u(150) } : { top: u(118) }
  return <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height: storyHeight(width) }}>
    <View testID={`sticker-block-${plate}`} style={{ position: 'absolute', left: u(20), right: u(20), alignItems: 'center', ...place }}>
      <Plate cells={model.plate} u={u} />
      {model.bar ? <Bar bar={model.bar} u={u} /> : null}
    </View>
    <Signature u={u} />
  </View>
}

/**
 * Quadro capturado (`captureRef`): transparente, com a camada de foto opcional por baixo (`photo`) e o adesivo por cima.
 * `collapsable={false}` mantém a vista nativa no Android para a captura. `accessibility` troca o papel de imagem pelo
 * do enquadramento (ajustável, com ações) quando há foto.
 */
export function StoryCanvas({ ref, model, width, plate, photo, accessibilityLabel, accessibility }: {
  ref?: Ref<View>; model: StickerModel; width: number; plate?: PlatePosition; photo?: ReactNode; accessibilityLabel?: string; accessibility?: AccessibilityProps
}) {
  return <View ref={ref} collapsable={false} testID="story-canvas" accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} {...accessibility}
    style={{ width, height: storyHeight(width), overflow: 'hidden', backgroundColor: 'transparent' }}>
    {photo}
    <ResultSticker model={model} width={width} plate={plate} />
  </View>
}

/** Xadrez escuro que indica o fundo transparente na prévia (casas de 12 unidades). Fica fora do quadro capturado. */
export function Checkerboard({ width }: { width: number }) {
  const height = storyHeight(width)
  const cell = 12 * width / STORY_DESIGN.width
  const columns = Math.ceil(width / cell)
  const rows = Math.ceil(height / cell)
  let d = ''
  for (let row = 0; row < rows; row++) {
    for (let column = row % 2; column < columns; column += 2) d += `M${(column * cell).toFixed(2)} ${(row * cell).toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`
  }
  return <View testID="story-checkerboard" accessible={false} importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: 0, top: 0 }}>
    <Svg width={width} height={height}>
      <Rect x={0} y={0} width={width} height={height} fill={stickerPalette.checkerBase} />
      <Path d={d} fill={stickerPalette.checkerCell} />
    </Svg>
  </View>
}
