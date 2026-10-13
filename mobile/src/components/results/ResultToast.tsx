import { Text, View } from 'react-native'
import { colors } from '../../theme'
import { Icon } from '../Icon'
import type { ToastState } from './useToast'

/*
 * Toast do Jogar (S1): pílula `forest` com o ícone menta, na região viva do cartão. Na web ele flutua sobre o painel; no
 * app fica no fluxo, no topo do cartão de resultado (um elemento absoluto dentro da rolagem da partida sairia de vista).
 * A região viva existe sempre, vazia e sem altura, para o leitor de tela anunciar a mudança de texto; a pílula some sozinha
 * depois de alguns segundos (`useToast`).
 */
export function ResultToast({ toast }: { toast: ToastState | null }) {
  return <View testID="result-toast" accessibilityLiveRegion="polite" style={toast ? { alignItems: 'center' } : { height: 0 }}>
    {toast ? <View key={toast.id} style={{ maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 999, backgroundColor: colors.forest, paddingVertical: 8, paddingRight: 16, paddingLeft: 8 }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mint }}>
        <Icon name={toast.icon === 'info' ? 'info' : 'check'} size={15} color={colors.night} />
      </View>
      <Text style={{ flexShrink: 1, color: '#ffffff', fontSize: 12, fontWeight: '600' }}>{toast.text}</Text>
    </View> : null}
  </View>
}
