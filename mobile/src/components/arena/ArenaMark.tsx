import { SvgXml } from 'react-native-svg'
import { brandSvgs } from '../../assets/brand-svgs'

/**
 * Símbolo do Coliseu na cor atual (`color`). `compact` usa o trecho de muralha, que fica no botão JOGAR.
 * Tamanho padrão 44×32 (30×32 no compacto); a imagem se ajusta ao quadro sem distorcer.
 */
export function ArenaMark({ compact = false, width = compact ? 30 : 44, height = 32, color = '#ffffff' }: { compact?: boolean; width?: number; height?: number; color?: string }) {
  return <SvgXml xml={compact ? brandSvgs.arenaWall : brandSvgs.coliseum} width={width} height={height} color={color} />
}
