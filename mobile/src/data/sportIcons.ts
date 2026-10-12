import type { ImageSourcePropType } from 'react-native'
import type { Sport } from '../api/client'
import corrida from '../../assets/sports/corrida.png'
import futebol from '../../assets/sports/futebol.png'
import tenis from '../../assets/sports/tenis.png'

/** Ícones provisórios das modalidades (PNG com fundo branco, enviados pelo usuário). Use `SportIcon`. */
export const sportIcons: Record<Sport, ImageSourcePropType> = { futebol, tenis, corrida }
