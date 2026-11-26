import { Image, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import type { Sport } from '../../api/client'
import { SELO_COROA, SELO_RAIO_DISCO, SELO_VIEWBOX, SELOS_GEOMETRIA, SIMBOLO_VIEWBOX } from '../../data/selos'
import { sportIcons, sportIconsAlpha } from '../../data/sportIcons'
import { useResolvedTheme, useThemeColors } from '../../hooks/useTheme'

/**
 * Formas vetoriais do ícone de modalidade, desenhadas da geometria gerada (`data/selos.ts`):
 * - `selo`: disco, coroa, anel e símbolo, nas cores do tema (tokens `selo-disco` e `selo-detalhe`), para o ladrilho redondo;
 * - `aro`: o símbolo dentro de um anel fino, numa cor só (`color`), ocupando 85% da caixa;
 * - `marca`: só o símbolo, numa cor só (`color`), a marca d'água grande e translúcida (a opacidade fica com quem usa).
 */
export type SportIconShape = 'selo' | 'aro' | 'marca'

type Base = {
  sport: Sport
  /** Lado da caixa do ícone, em pontos. */
  size?: number
}
type SeloProps = Base & { shape: 'selo' }
type MonoProps = Base & { shape: 'aro' | 'marca'; color: string }
/** Caminho raster provisório (PNG) dos usos ainda não migrados para os selos; sai junto com os PNGs. */
type RasterProps = Base & { shape?: undefined; inverted?: boolean; alpha?: boolean; color?: string }
export type SportIconProps = SeloProps | MonoProps | RasterProps

/** O desenho do símbolo com aro ocupa 85% da caixa reservada (sem ajuste óptico por modalidade). */
const ARO_ESCALA = 0.85

/** Sempre decorativo: o nome da modalidade está no texto vizinho ou no rótulo do controle. */
const hidden = { accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const }
const boxStyle = (size: number) => ({ width: size, height: size, alignItems: 'center' as const, justifyContent: 'center' as const })

function Selo({ sport, size }: { sport: Sport; size: number }) {
  const c = useThemeColors()
  return <Svg width={size} height={size} viewBox={SELO_VIEWBOX}>
    <Circle cx={0} cy={0} r={SELO_RAIO_DISCO} fill={c['selo-disco']} />
    <Path d={SELO_COROA} fill={c['selo-detalhe']} />
    <Path d={SELOS_GEOMETRIA[sport].simbolo} fill={c['selo-detalhe']} />
  </Svg>
}

/**
 * Ícone da modalidade, sempre oculto para leitores de tela (`testID` `sport-icon-{sport}`). A forma vem de `shape`, nunca
 * da medida: `selo` usa as cores do tema e acompanha a troca; `aro` e `marca` pedem a cor do contexto em `color`.
 *
 * Sem `shape`, segue o PNG provisório dos usos ainda não migrados: no claro, o PNG com fundo branco multiplicado sobre o
 * fundo claro; no escuro, a versão com fundo transparente tingida de branco (ou de `color`). `inverted` é para a placa
 * escura (inverte e mistura em `screen`); `alpha` usa a versão transparente nos dois temas, tingida de `color`.
 */
export function SportIcon(props: SportIconProps) {
  const { sport, size = 24 } = props
  const testID = `sport-icon-${sport}`
  if (props.shape === undefined) return <RasterSportIcon {...props} size={size} />
  if (props.shape === 'selo') return <View {...hidden} testID={testID} style={boxStyle(size)}><Selo sport={sport} size={size} /></View>
  const aro = props.shape === 'aro'
  const drawn = aro ? size * ARO_ESCALA : size
  return <View {...hidden} testID={testID} style={boxStyle(size)}>
    <Svg width={drawn} height={drawn} viewBox={aro ? SELO_VIEWBOX : SIMBOLO_VIEWBOX}>
      <Path d={aro ? SELOS_GEOMETRIA[sport].simboloComAro : SELOS_GEOMETRIA[sport].simbolo} fill={props.color} />
    </Svg>
  </View>
}

function RasterSportIcon({ sport, size, inverted = false, alpha = false, color }: RasterProps & { size: number }) {
  const inner = Math.round(size * 1.38)
  const night = useResolvedTheme() === 'dark'
  const box = { width: size, height: size, overflow: 'hidden' as const, alignItems: 'center' as const, justifyContent: 'center' as const }
  if (night || alpha) {
    return <View accessible={false} importantForAccessibility="no-hide-descendants" testID={`sport-icon-${sport}`} style={box}>
      <Image source={sportIconsAlpha[sport]} resizeMode="contain" tintColor={color ?? '#ffffff'} style={{ width: inner, height: inner, flexShrink: 0 }} />
    </View>
  }
  return <View accessible={false} importantForAccessibility="no-hide-descendants" testID={`sport-icon-${sport}`}
    style={[box, inverted ? { mixBlendMode: 'screen', filter: [{ invert: 1 }] } : { mixBlendMode: 'multiply' }]}>
    <Image source={sportIcons[sport]} resizeMode="contain" style={{ width: inner, height: inner, flexShrink: 0 }} />
  </View>
}
