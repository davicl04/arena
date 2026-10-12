import { useEffect, useRef, useState } from 'react'
import { Linking, Modal, Pressable, Text, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { colors } from '../../theme'
import { joinTokenFromUrl } from '../../utils/joinLink'
import { Screen } from '../Screen'
import { ActionButton } from '../arena/controls'
import { onDark } from './ui'
import { Icon } from '../Icon'

export const QR_INVALID = 'Este QR não é de um time do Arena. Aponte para o QR do link do time.'
/** Mesmo código lido de novo dentro desta janela não repete o aviso (a câmera dispara várias leituras por segundo). */
const REPEAT_MS = 2500
const NOTICE_MS = 4000

/**
 * Leitor do QR do time ("Entrar com QR"): pede a permissão da câmera (o texto da solicitação está no `app.json`) e lê
 * `http(s)://…/entrar/{token}` ou `arena://entrar/{token}`. Um código de outro endereço mostra um aviso e continua
 * lendo; sem permissão, a tela diz o que fazer em vez de uma câmera preta. O token só passa a `onToken`; nada é gravado.
 */
export function QrScanner({ onToken, onClose }: { onToken: (token: string) => void; onClose: () => void }) {
  const [permission, requestPermission] = useCameraPermissions()
  const [invalid, setInvalid] = useState(false)
  const done = useRef(false)
  const last = useRef<{ data: string; at: number } | null>(null)

  useEffect(() => {
    if (!invalid) return
    const timer = setTimeout(() => setInvalid(false), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [invalid])

  function scanned({ data }: { data: string }) {
    if (done.current) return
    const token = joinTokenFromUrl(data)
    if (token) { done.current = true; onToken(token); return }
    const now = Date.now()
    if (last.current?.data === data && now - last.current.at < REPEAT_MS) return
    last.current = { data, at: now }
    setInvalid(true)
  }

  const waiting = permission === null
  const granted = permission?.granted === true
  return <Modal visible animationType="slide" onRequestClose={onClose}>
    <Screen className="grow basis-0 bg-forest">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar leitor de QR" onPress={onClose} style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="x" size={22} color="#ffffff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.mint, fontSize: 9, fontWeight: '700', letterSpacing: 1.1 }}>ENTRAR NO TIME</Text>
          <Text accessibilityRole="header" style={{ color: '#ffffff', fontSize: 19, fontWeight: '800' }}>Ler QR do time</Text>
        </View>
      </View>
      <View style={{ flex: 1, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        {granted ? <>
          <View accessible accessibilityLabel="Câmera aberta para ler o QR do time" style={{ width: 288, height: 288, overflow: 'hidden', borderRadius: 24, borderWidth: 3, borderColor: colors.mint, backgroundColor: '#000000' }}>
            <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={scanned} />
          </View>
          <Text style={{ textAlign: 'center', color: onDark.soft, fontSize: 12.5, lineHeight: 19 }}>Aponte a câmera para o QR que o representante mostra em Link e QR do time.</Text>
        </> : waiting ? <Text accessibilityLiveRegion="polite" style={{ color: onDark.soft, fontSize: 13 }}>Verificando a permissão da câmera…</Text>
          : <View testID="qr-no-permission" style={{ alignItems: 'center', gap: 12 }}>
            <Icon name="camera-off" size={40} color={colors.mint} />
            <Text accessibilityRole="header" style={{ color: '#ffffff', fontSize: 16, fontWeight: '800', textAlign: 'center' }}>Sem acesso à câmera</Text>
            <Text style={{ textAlign: 'center', color: onDark.soft, fontSize: 12.5, lineHeight: 19 }}>
              {permission?.canAskAgain === false
                ? 'A câmera está bloqueada para o Arena. Libere o acesso nas configurações do aparelho para ler o QR do time.'
                : 'O Arena usa a câmera só para ler o QR do link do time. Nada é gravado.'}
            </Text>
            {permission?.canAskAgain === false
              ? <ActionButton tone="mint" icon="camera" title="Abrir configurações" onPress={() => void Linking.openSettings()} fit />
              : <ActionButton tone="mint" icon="camera" title="Permitir câmera" onPress={() => void requestPermission()} fit />}
          </View>}
        {invalid && granted ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ borderRadius: 10, overflow: 'hidden', backgroundColor: 'rgba(185,55,73,0.25)', paddingHorizontal: 12, paddingVertical: 8, color: '#ffd0d7', fontSize: 12, lineHeight: 18, textAlign: 'center' }}>{QR_INVALID}</Text> : null}
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 28 }}>
        <ActionButton tone="line" block title="Cancelar" onPress={onClose} />
      </View>
    </Screen>
  </Modal>
}
