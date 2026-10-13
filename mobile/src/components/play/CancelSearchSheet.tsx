import { Text, View } from 'react-native'
import { ActionButton } from '../arena/controls'
import { ActionSheet } from '../arena/ActionSheet'

/**
 * Confirmação de "Cancelar busca" (tocar no botão redondo durante a busca). "Continuar buscando" vem primeiro e em menta,
 * para um toque acidental não derrubar a posição na fila; fechar a folha também mantém a busca. Se o cancelamento falha, o
 * toast diz por quê e a folha continua aberta.
 */
export function CancelSearchSheet({ busy, onKeep, onConfirm }: {
  busy: boolean
  onKeep: () => void
  onConfirm: () => void
}) {
  return <ActionSheet title="Cancelar a busca?" dark locked={busy} onClose={onKeep}>
    <Text style={{ marginTop: 4, color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 20 }}>Você sai da fila e perde o tempo de espera. Dá para buscar de novo quando quiser.</Text>
    <View style={{ marginTop: 16, flexDirection: 'row', gap: 8 }}>
      <ActionButton grow tone="mint" title="Continuar buscando" disabled={busy} onPress={onKeep} />
      <ActionButton grow tone="danger" title={busy ? 'Cancelando…' : 'Cancelar busca'} accessibilityLabel="Cancelar busca" busy={busy} onPress={onConfirm} />
    </View>
  </ActionSheet>
}
