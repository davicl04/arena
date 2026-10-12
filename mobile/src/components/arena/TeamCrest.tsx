import { useState } from 'react'
import { Image, View } from 'react-native'
import Svg, { Path, Text as SvgText } from 'react-native-svg'
import { useSessionToken } from '../../hooks/useSessionToken'
import { colors } from '../../theme'
import { teamInitials } from '../../utils/teamInitials'
import { authSource } from '../media'

/* Contorno do escudo (viewBox 40×44), o mesmo dos protótipos de Times e do Jogar. */
const shield = 'M20 2 L37 8 V21 C37 31 29 38 20 42 C11 38 3 31 3 21 V8 Z'

/**
 * Tamanhos (largura × altura, em pontos) dos protótipos: xs 20×22 (linhas da árvore, tabela cruzada, chips) ·
 * sm 26×29 (árvore espelhada, pílulas, faixa do convite, notificações) · md 34×37 (carteirinha C5) ·
 * lg 52×57 (cabeçalhos) · xl 78×86 (destaque da placa) · 2xl 120×132 (prévia do Criar time).
 */
export const crestSizes = { xs: [20, 22], sm: [26, 29], md: [34, 37], lg: [52, 57], xl: [78, 86], '2xl': [120, 132] } as const
export type TeamCrestSize = keyof typeof crestSizes

export interface TeamCrestProps {
  /** Nome do time: texto alternativo ("Brasão de …") e, sem `initials`, as iniciais do escudo neutro. */
  name: string
  /** Iniciais vindas da API (`initials`); sem elas, calculadas do nome pela mesma regra do servidor. */
  initials?: string
  /** Caminho do brasão enviado (`crest_url` da API), carregado com o Bearer da sessão. Sem ele, ou se falhar, usa o escudo neutro. */
  path?: string | null
  /** Prévia local de um recorte ainda não enviado (URI do arquivo escolhido), usada no lugar de `path` (Criar e Editar time). */
  previewUri?: string | null
  size?: TeamCrestSize
  /** Use quando o nome do time já aparece ao lado: o brasão fica oculto para leitores de tela. */
  decorative?: boolean
  /** Token da sessão, quando a tela já o leu; sem ele, o componente lê do SecureStore. */
  token?: string | null
}

/**
 * Brasão do time: a imagem enviada recortada em formato de escudo, com filete claro, ou o escudo neutro com as
 * iniciais. Times não têm cores próprias; o neutro usa os tons do aplicativo. A imagem é um `Image` com cantos
 * de escudo (o React Native não recorta por caminho SVG).
 */
export function TeamCrest({ name, initials, path, previewUri, size = 'md', decorative = false, token: provided }: TeamCrestProps) {
  const token = useSessionToken(provided)
  const [failed, setFailed] = useState<string | null>(null)
  const [width, height] = crestSizes[size]
  const source = previewUri ? { uri: previewUri } : path && token ? authSource(path, token) : null
  const key = previewUri || path || ''
  const a11y = decorative
    ? { accessible: false, importantForAccessibility: 'no-hide-descendants' as const }
    : { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: `Brasão de ${name}` }
  if (source && failed !== key) {
    return <View {...a11y} style={{ width, height, overflow: 'hidden', backgroundColor: colors.tile, borderTopLeftRadius: width * 0.14, borderTopRightRadius: width * 0.14, borderBottomLeftRadius: width * 0.5, borderBottomRightRadius: width * 0.5, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)' }}>
      <Image source={source} resizeMode="cover" onError={() => setFailed(key)} style={{ width: '100%', height: '100%' }} />
    </View>
  }
  return <View {...a11y} style={{ width, height }}>
    <Svg width={width} height={height} viewBox="0 0 40 44">
      <Path d={shield} fill={colors.tile} stroke={colors['line-strong']} strokeWidth={1.4} />
      <SvgText x={20} y={25} textAnchor="middle" fontSize={11} fontWeight="800" fill={colors.ink}>{initials || teamInitials(name)}</SvgText>
    </Svg>
  </View>
}
