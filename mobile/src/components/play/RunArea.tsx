import type { RunDistance } from '../../data/arena'
import type { useRunBests } from '../../hooks/useRunBests'
import type { Navigation } from '../../navigation/useNavigation'
import { RunMarksSection } from '../run/RunMarksSection'
import { RunPlateActions } from '../run/RunPlateActions'

export interface RunAreaProps {
  /**
   * Onde a área aparece: `plate` é dentro da placa `forest`, no lugar do botão redondo (registrar, nota e a última marca
   * salva); `marks` é logo abaixo da placa, para "Suas marcas" e o histórico de cada distância.
   */
  part: 'plate' | 'marks'
  /** Distância escolhida nos chips da placa (a mesma do `TierLine` acima). */
  distance: RunDistance
  onDistance: (distance: RunDistance) => void
  /** Marcas de `GET /me/run-bests`: as mesmas que alimentam a linha do elo. */
  bests: ReturnType<typeof useRunBests>
  navigation: Navigation
  onExpired: () => void
}

/**
 * Área de ações da corrida na tela Jogar: a placa traz o registro (treino ou prova) e a última marca salva, e logo abaixo
 * ficam "Suas marcas" e o histórico de cada distância. A tela só entrega as propriedades acima e não guarda lógica de corrida.
 */
export function RunArea({ part, ...props }: RunAreaProps) {
  return part === 'plate' ? <RunPlateActions {...props} /> : <RunMarksSection {...props} />
}
