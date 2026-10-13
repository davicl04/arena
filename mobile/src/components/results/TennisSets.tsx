import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { useThemeColors } from '../../hooks/useTheme'
import { Stepper } from './Stepper'
import { needsTiebreak, setWinner, showsThirdSet } from './tennis'
import type { SetDraft } from './tennis'

export interface TennisSetsProps {
  sets: SetDraft[]
  /** Altera o set `index` (games e pontos do tie-break); quem usa guarda o rascunho. */
  onPatch: (index: number, change: Partial<SetDraft>) => void
  /** Nome do primeiro lado (os valores `mine`); no cartão do atleta, "Você". */
  mineName: string
  theirName: string
  /** Super tie-break combinado: o terceiro "set" são os pontos, até 10 com 2 de vantagem. */
  superTiebreak: boolean
  disabled?: boolean
}

/** Duas colunas de mesma largura separadas por um travessão: o lado do primeiro nome e o do segundo. */
function Pair({ left, right }: { left: ReactNode; right: ReactNode }) {
  const muted = { color: useThemeColors()['ink-muted'] }
  return <View style={{ flexDirection: 'row', alignItems: 'center' }}>
    <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>{left}</View>
    <Text accessibilityElementsHidden importantForAccessibility="no" style={{ width: 14, textAlign: 'center', ...muted }}>–</Text>
    <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>{right}</View>
  </View>
}

/**
 * Placar do tênis por sets (R4): os games de cada lado, o tie-break em 7-6 e o terceiro set (ou o super tie-break
 * combinado) só quando os dois primeiros foram divididos. O rascunho fica do ponto de vista do primeiro nome (`mineName`);
 * quem usa converte para os lados A e B com `draftToInput`. Serve ao cartão de resultado dos times e à decisão do
 * organizador (D3). Cada set é uma linha com o nome do set acima dos dois contadores, que cabem em 320 pt de largura.
 */
export function TennisSets({ sets, onPatch, mineName, theirName, superTiebreak, disabled = false }: TennisSetsProps) {
  const muted = { color: useThemeColors()['ink-muted'] }
  const third = showsThirdSet(sets)
  const mine = mineName === 'Você' ? 'seus' : `de ${mineName}`
  return <View accessibilityLabel="Placar por sets" style={{ gap: 10 }}>
    <Pair
      left={<Text numberOfLines={1} style={{ maxWidth: '100%', fontSize: 10, fontWeight: '700', ...muted }}>{mineName}</Text>}
      right={<Text numberOfLines={1} style={{ maxWidth: '100%', fontSize: 10, fontWeight: '700', ...muted }}>{theirName}</Text>} />
    {sets.slice(0, third ? 3 : 2).map((set, index) => {
      const number = index + 1
      const isSuper = index === 2 && superTiebreak
      const name = isSuper ? 'super tie-break' : `set ${number}`
      const max = isSuper ? 99 : 7
      return <View key={index} style={{ gap: 4 }}>
        <Text accessibilityRole="header" style={{ fontSize: 11, fontWeight: '700', ...muted }}>{isSuper ? 'Super tie-break' : `Set ${number}`}</Text>
        <Pair
          left={<Stepper label={`${isSuper ? 'Pontos' : 'Games'} ${mine} no ${name}`} value={set.mine} max={max} disabled={disabled} onChange={value => onPatch(index, { mine: value })} />}
          right={<Stepper label={`${isSuper ? 'Pontos' : 'Games'} de ${theirName} no ${name}`} value={set.theirs} max={max} disabled={disabled} onChange={value => onPatch(index, { theirs: value })} />} />
        {!isSuper && needsTiebreak(set) ? <>
          <Text style={{ fontSize: 10, ...muted }}>Tie-break</Text>
          <Pair
            left={<Stepper label={`Pontos ${mine} no tie-break do set ${number}`} value={set.tbMine} max={99} disabled={disabled} onChange={value => onPatch(index, { tbMine: value })} />}
            right={<Stepper label={`Pontos de ${theirName} no tie-break do set ${number}`} value={set.tbTheirs} max={99} disabled={disabled} onChange={value => onPatch(index, { tbTheirs: value })} />} />
        </> : null}
      </View>
    })}
    {!third && setWinner(sets[0]) && setWinner(sets[1]) ? <Text style={{ fontSize: 10.5, lineHeight: 15, ...muted }}>Quem venceu os dois primeiros sets já ganhou a partida.</Text> : null}
    {third && superTiebreak ? <Text style={{ fontSize: 10.5, lineHeight: 15, ...muted }}>Os dois primeiros sets ficaram divididos: o desempate é um super tie-break até 10, com 2 de vantagem.</Text> : null}
  </View>
}
