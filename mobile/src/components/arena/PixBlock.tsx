import { useState } from 'react'
import { Pressable, Share, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { Text } from '../Text'
import { pixKeyType } from '../../data/arena'
import { useResolvedTheme, useThemeColors } from '../../hooks/useTheme'
import { formatPrice } from '../../utils/format'
import { Icon } from '../Icon'
import { toast } from '../toast/toastStore'
import { copyFeedback, pixShareMessage, shareFeedback } from './pix'
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

/** Botão só com ícone para copiar (o "Copiar chave Pix" da web); depois de copiar, mostra o visto. */
function CopyButton({ label, copied, onPress }: { label: string; copied: boolean; onPress: () => void }) {
  const c = useThemeColors()
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4}
    style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 }}>
    <Icon name={copied ? 'check' : 'copy'} size={18} color={c.brand} />
  </Pressable>
}

/**
 * Bloco "Pix do organizador" da folha de inscrição: favorecido, chave e, se houver, o código Copia e Cola, ambos em
 * texto selecionável (segure para selecionar e copiar). O botão de copiar ao lado de cada um usa a área de transferência
 * (`expo-clipboard`), com o retorno em toast, como na web; Compartilhar abre o menu do aparelho, e o retorno dele é anunciado
 * em região ao vivo.
 */
export function PixBlock({ pix, priceCents, onInfo, title = 'Pix do organizador' }: PixBlockProps) {
  const c = useThemeColors()
  const night = useResolvedTheme() === 'dark'
  const [status, setStatus] = useState<ShareStatus>('idle')
  const [item, setItem] = useState<PixShareItem | null>(null)
  const kind = pixKeyType[pix.keyType]
  const message = shareFeedback(status, item)
  const [copied, setCopied] = useState<PixShareItem | null>(null)

  async function copy(next: PixShareItem) {
    let ok = false
    try { ok = await Clipboard.setStringAsync(pixShareMessage(pix, next)) } catch { ok = false }
    setCopied(ok ? next : null)
    if (ok) toast.success(copyFeedback(true, next))
    else toast.warning(copyFeedback(false, next))
  }

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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: c['line-strong'], backgroundColor: c.surface, paddingVertical: 2, paddingLeft: 12, paddingRight: 2 }}>
      <Text selectable testID="pix-key" style={{ flex: 1, minWidth: 0, color: c.ink, fontFamily: 'monospace', fontSize: 12.5, fontWeight: '600' }}>{pix.key}</Text>
      <CopyButton label="Copiar chave Pix" copied={copied === 'chave'} onPress={() => void copy('chave')} />
    </View>
    <ShareButton label="Compartilhar chave Pix" onPress={() => void share('chave')} />
    {pix.copyPaste ? <>
      <Text style={{ color: c['ink-muted'], fontSize: 10.5, lineHeight: 15 }}>Pix Copia e Cola{priceCents ? ` · ${formatPrice(priceCents, { compact: true })}` : ''}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingVertical: 4, paddingLeft: 10, paddingRight: 2 }}>
        <Text selectable testID="pix-code" style={{ flex: 1, minWidth: 0, color: c.ink, fontFamily: 'monospace', fontSize: 11 }}>{pix.copyPaste}</Text>
        <CopyButton label="Copiar Pix Copia e Cola" copied={copied === 'codigo'} onPress={() => void copy('codigo')} />
      </View>
      <ShareButton label="Compartilhar Pix Copia e Cola" onPress={() => void share('codigo')} />
      <Text style={{ color: c['ink-muted'], fontSize: 10.5, lineHeight: 15 }}>Cole no app do seu banco. O valor e o favorecido aparecem para conferir antes de pagar.</Text>
    </> : null}
    {message ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: status === 'failed' ? c.error : c.brand, fontSize: 11, lineHeight: 15 }}>{message}</Text> : null}
  </View>
}
