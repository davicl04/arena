import { View } from 'react-native'
import { useSessionToken } from '../../hooks/useSessionToken'
import { colors } from '../../theme'
import { Armband } from '../arena/Armband'
import { Avatar } from '../media'
import { useTeamToken } from './ui'

/**
 * Tamanhos do rosto do atleta (pontos): stack 24 (elenco em miniatura da carteirinha, com contorno da placa) · row 40
 * (listas) · grid 44 (grade E1) · sheet 56 (folha do atleta).
 */
const faceSizes = { stack: 24, row: 40, grid: 44, sheet: 56 } as const
const armbandSizes = { stack: 'sm', row: 'md', grid: 'md', sheet: 'lg' } as const
export type MemberFaceSize = keyof typeof faceSizes

/**
 * Rosto do atleta no elenco: a foto de perfil (iniciais quando não há foto) e a braçadeira "C" dos representantes.
 * `ring="dark"` contorna a braçadeira para fundos escuros.
 */
export function MemberFace({ name, avatarUrl, representative = false, size = 'row', ring = 'light' }: {
  name: string
  avatarUrl: string | null
  representative?: boolean
  size?: MemberFaceSize
  ring?: 'light' | 'dark'
}) {
  const token = useSessionToken(useTeamToken())
  const box = faceSizes[size]
  const stacked = size === 'stack'
  return <View style={{ width: box, height: box, flexShrink: 0 }}>
    {stacked
      ? <View style={{ width: box, height: box, borderRadius: box / 2, borderWidth: 2, borderColor: colors.forest, overflow: 'hidden' }}><Avatar path={avatarUrl} name={name} token={token} size={box - 4} /></View>
      : <Avatar path={avatarUrl} name={name} token={token} size={box} />}
    {representative ? <Armband size={armbandSizes[size]} ring={ring === 'dark' || stacked ? 'dark' : 'light'} /> : null}
  </View>
}
