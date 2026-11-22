import type { ImageSourcePropType } from 'react-native'
import type { Sport } from '../api/client'
import corridaAlpha from '../../assets/sports/corrida-alfa.png'
import corrida from '../../assets/sports/corrida.png'
import futebolAlpha from '../../assets/sports/futebol-alfa.png'
import futebol from '../../assets/sports/futebol.png'
import tenisAlpha from '../../assets/sports/tenis-alfa.png'
import tenis from '../../assets/sports/tenis.png'

/** Ícones provisórios das modalidades (PNG com fundo branco, enviados pelo usuário). Use `SportIcon`. */
export const sportIcons: Record<Sport, ImageSourcePropType> = { futebol, tenis, corrida }
/** Versões com fundo transparente (traço opaco), tingidas por `SportIcon` no escuro e nas faixas da tela de modalidades. */
export const sportIconsAlpha: Record<Sport, ImageSourcePropType> = { futebol: futebolAlpha, tenis: tenisAlpha, corrida: corridaAlpha }
