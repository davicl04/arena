import { useState } from 'react'
import { Pressable, Share, Text, View } from 'react-native'
import { pixKeyType } from '../../data/arena'
import { useResolvedTheme, useThemeColors } from '../../hooks/useTheme'
import { formatPrice } from '../../utils/format'
import { Icon } from '../Icon'
import { pixShareMessage, shareFeedback } from './pix'
import type { PixInfo, PixShareItem, ShareStatus } from './pix'

export interface PixBlockProps {
  pix: PixInfo
  /** Valor da inscrição em centavos, mostrado no botão do Copia e Cola. */
  priceCents?: number
  /** Abre a folha "Pagamento e informações" (ícone ⓘ). */
  onInfo?: () => void
  title?: string
}

function ShareButton({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useThemeColors()
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 11, borderWidth: 1, borderColor: c['line-strong'], backgroundColor: c.surface, paddingHorizontal: 11 }}>
    <Icon name="share" size={16} color={c.brand} />
    <Text style={{ color: c.brand, fontSize: 12, fontWeight: '700' }}>{label}</Text>
  </Pressable>
}

/**
 * Bloco "Pix do organizador" da folha de inscrição: favorecido, chave e, se houver, o código Copia e Cola, ambos em
 * texto selecionável (segure para selecionar e copiar). O app não usa a área de transferência: o botão Compartilhar
 * abre o menu do aparelho (que também oferece copiar). O retorno é anunciado em região ao vivo.
 */
export function PixBlock({ pix, priceCents, onInfo, title = 'Pix do organizador' }: PixBlockProps) {
  const c = useThemeColors()
  const night = useResolvedTheme() === 'dark'
  const [status, setStatus] = useState<ShareStatus>('idle')
  const [item, setItem] = useState<PixShareItem | null>(null)
  const kind = pixKeyType[pix.keyType]
  const message = shareFeedback(status, item)

  async function share(next: PixShareItem) {
    setItem(next)
    try {
      const result = await Share.share({ message: pixShareMessage(pix, next) })
      setStatus(result.action === Share.dismissedAction ? 'idle' : 'shared')
    } catch { setStatus('failed') }
  }

  return <View testID="pix-block" style={{ gap: 8, borderRadius: 16, backgroundColor: c['success-bg'], padding: 14, borderWidth: 1, borderColor: night ? 'rgba(143,224,180,0.2)' : 'rgba(0,90,54,0.2)' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Icon name="landmark" size={18} color={c.brand} />
      <Text accessibilityRole="header" style={{ flex: 1, color: c.ink, fontSize: 13, fontWeight: '700' }}>{title}</Text>
      {onInfo ? <Pressable accessibilityRole="button" accessibilityLabel="Informações de pagamento" onPress={onInfo} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="info" size={18} color={c.brand} /></Pressable> : null}
    </View>
    <Text style={{ color: c['ink-muted'], fontSize: 10.5, lineHeight: 15 }}>{pix.holder} · chave por {kind?.inline ?? pix.keyType}</Text>
    <View style={{ borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: c['line-strong'], backgroundColor: c.surface, paddingVertical: 10, paddingHorizontal: 12 }}>
      <Text selectable testID="pix-key" style={{ color: c.ink, fontFamily: 'monospace', fontSize: 12.5, fontWeight: '600' }}>{pix.key}</Text>
    </View>
    <ShareButton label="Compartilhar chave Pix" onPress={() => void share('chave')} />
    {pix.copyPaste ? <>
      <Text style={{ color: c['ink-muted'], fontSize: 10.5, lineHeight: 15 }}>Pix Copia e Cola{priceCents ? ` · ${formatPrice(priceCents, { compact: true })}` : ''}</Text>
      <View style={{ borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, padding: 10 }}>
        <Text selectable testID="pix-code" style={{ color: c.ink, fontFamily: 'monospace', fontSize: 11 }}>{pix.copyPaste}</Text>
      </View>
      <ShareButton label="Compartilhar Pix Copia e Cola" onPress={() => void share('codigo')} />
      <Text style={{ color: c['ink-muted'], fontSize: 10.5, lineHeight: 15 }}>Cole no app do seu banco. O valor e o favorecido aparecem para conferir antes de pagar.</Text>
    </> : null}
    {message ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: status === 'failed' ? c.error : c.brand, fontSize: 11, lineHeight: 15 }}>{message}</Text> : null}
  </View>
}
