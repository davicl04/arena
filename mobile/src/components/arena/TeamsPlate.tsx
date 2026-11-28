import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { Text } from '../Text'
import { colors } from '../../theme'
import { Icon } from '../Icon'
import { ArenaMark } from './ArenaMark'
import { useTopArea } from '../../navigation/topArea'
import { pageTitle } from '../../styles'

const MARK_WIDTH = 420
const MARK_HEIGHT = 240
const CORNER_WIDTH = 230
const CORNER_HEIGHT = 130

/**
 * Placa `forest` com o Coliseu em marca-d'água (.plate), de ponta a ponta no topo de Meus times e de Entrar no time. Os
 * filhos ficam acima da marca-d'água. `round` arredonda os quatro cantos com esse raio (a placa "Para responder" do Início); sem
 * ele, só os de baixo, com 28.
 */
export function TeamsPlate({ children, bottom = 0, round, mark = 'center', testID = 'teams-plate' }: {
  children: ReactNode; bottom?: number; round?: number
  /** Coliseu centrado na base (padrão) ou no canto inferior direito, como o Placar da web. */
  mark?: 'center' | 'corner'
  testID?: string
}) {
  // A placa de ponta a ponta encosta no topo da tela: a faixa da barra de status fica `forest` (navigation/topArea).
  useTopArea(round === undefined ? 'forest' : null)
  const corners = round === undefined ? { borderBottomLeftRadius: 28, borderBottomRightRadius: 28 } : { borderRadius: round }
  return <View testID={testID} style={{ overflow: 'hidden', ...corners, backgroundColor: colors.forest, paddingBottom: bottom }}>
    <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
      style={mark === 'corner'
        ? { position: 'absolute', right: -30, bottom: -24, width: CORNER_WIDTH, height: CORNER_HEIGHT, opacity: 0.06 }
        : { position: 'absolute', bottom: -30, left: '50%', marginLeft: -MARK_WIDTH / 2, width: MARK_WIDTH, height: MARK_HEIGHT, opacity: 0.045 }}>
      <ArenaMark width={mark === 'corner' ? CORNER_WIDTH : MARK_WIDTH} height={mark === 'corner' ? CORNER_HEIGHT : MARK_HEIGHT} color="#ffffff" />
    </View>
    {children}
  </View>
}

/**
 * Fundo escuro das telas de Criar e Convidar (F2, I5): ocupa a área sob a barra do app, com os cantos de cima
 * arredondados, e entrega o conteúdo ao `ScrollView` dentro dele.
 */
export function DarkScreen({ children }: { children: ReactNode }) {
  useTopArea('forest')
  return <View style={{ flex: 1, overflow: 'hidden', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.forest }}>{children}</View>
}

/** Sobretítulo menta da placa e das telas escuras (.eyebrow dentro de .dk). */
export function DarkEyebrow({ children }: { children: string }) {
  return <Text style={{ color: colors.mint, fontSize: 9, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' }}>{children}</Text>
}

/**
 * Barra do topo das telas escuras (.topbar da web): voltar ou fechar, sobretítulo menta e título. O título é o cabeçalho
 * da tela: o shell não desenha o cabeçalho claro nas telas de Meus times e do organizador (`hasOwnHeader`). `trailing`
 * fica à direita do título (ex.: Entrar com QR, Criar evento).
 */
export function DarkTopBar({ eyebrow, title, onBack, icon = 'back', backLabel, trailing }: {
  eyebrow: string
  title: string
  onBack: () => void
  icon?: 'back' | 'close'
  backLabel?: string
  trailing?: ReactNode
}) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 10 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={backLabel ?? (icon === 'close' ? 'Fechar' : 'Voltar')} onPress={onBack}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 }}>
      <Icon name={icon === 'close' ? 'x' : 'arrow-left'} size={21} color="#ffffff" />
    </Pressable>
    <View style={{ flex: 1, minWidth: 0 }}>
      <DarkEyebrow>{eyebrow}</DarkEyebrow>
      <Text accessibilityRole="header" style={{ color: '#ffffff', ...pageTitle }}>{title}</Text>
    </View>
    {trailing ? <View style={{ paddingRight: 8 }}>{trailing}</View> : null}
  </View>
}
