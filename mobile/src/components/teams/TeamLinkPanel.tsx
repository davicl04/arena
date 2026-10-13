import { useCallback, useState } from 'react'
import { ActivityIndicator, Platform, Share, Text, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { regenerateLink, teamLink } from '../../api/teams'
import { useResource } from '../../hooks/useResource'
import { useSubmit } from '../../hooks/useSubmit'
import { colors } from '../../theme'
import { ActionButton, Notice } from '../arena/controls'
import { onDark } from './ui'

/** Conteúdo do Compartilhar: o iOS recebe o endereço à parte (`url`); o Android só tem `message`, então o leva no texto. */
export function linkShareContent(teamName: string, url: string, os: string = Platform.OS) {
  const text = `Peça para entrar no ${teamName} no Arena.`
  const title = `Entrar no ${teamName}`
  return os === 'ios' ? { title, message: text, url } : { title, message: `${text} ${url}` }
}

/**
 * Link e QR do time (Q2/Q5): QR em SVG, o link em texto selecionável (toque e segure para copiar, sem a dependência de
 * área de transferência), Compartilhar e "Gerar outro link", com confirmação. O link não expira; gerar outro invalida o
 * anterior na hora.
 */
export function TeamLinkPanel({ teamId, teamName, onExpired }: { teamId: number; teamName: string; onExpired: () => void }) {
  const loaded = useResource(useCallback(() => teamLink(teamId), [teamId]), onExpired, { fallback: 'Não foi possível carregar o link do time.' })
  const { data: link, error: loadError, setData: setLink } = loaded
  const [notice, setNotice] = useState('')
  const [confirming, setConfirming] = useState(false)
  const regenerate = useSubmit(onExpired)

  async function share() {
    if (!link) return
    try {
      // Fechar a folha de compartilhamento não é erro (resultado `dismissedAction`).
      await Share.share(linkShareContent(teamName, link.url))
    } catch {
      setNotice('Não foi possível compartilhar. Toque e segure o link para copiá-lo.')
    }
  }
  async function renew() {
    const value = await regenerate.run(() => regenerateLink(teamId), 'Não foi possível gerar outro link.')
    if (value) { setLink(value); setConfirming(false); setNotice('Novo link gerado. O anterior não vale mais.') }
  }

  return <View style={{ marginTop: 14, alignItems: 'center', gap: 12, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 18, backgroundColor: onDark.card, borderWidth: 1, borderColor: 'rgba(255,255,255,0.11)' }}>
    {!link ? (loadError
      ? <View style={{ width: '100%' }}>
        <Notice surface="dark" tone="error">{loadError}</Notice>
        <ActionButton tone="line" title="Tentar novamente" onPress={loaded.reload} fit />
      </View>
      : <View accessibilityLabel="Carregando o link do time" style={{ paddingVertical: 40, alignItems: 'center' }}>
        <ActivityIndicator color={colors.mint} />
        <Text style={{ marginTop: 8, color: onDark.soft, fontSize: 12 }}>Carregando o link do time…</Text>
      </View>)
      : <>
        <View accessible accessibilityRole="image" accessibilityLabel={`Código QR para entrar no ${teamName}`} style={{ borderRadius: 14, backgroundColor: '#ffffff', padding: 10 }}>
          <QRCode value={link.url} size={168} color={colors.forest} backgroundColor="#ffffff" ecl="M" quietZone={0} />
        </View>
        <Text selectable accessibilityLabel={`Link do time: ${link.url}`} style={{ width: '100%', borderRadius: 12, backgroundColor: onDark.field, paddingHorizontal: 12, paddingVertical: 10, color: colors.mint, fontSize: 11.5, fontWeight: '600', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>{link.url}</Text>
        <View style={{ width: '100%' }}>
          <ActionButton tone="mint" block icon="share" title="Compartilhar" accessibilityLabel="Compartilhar link do time" onPress={() => void share()} />
        </View>
        <Text accessibilityLiveRegion="polite" style={notice ? { color: colors.mint, fontSize: 11.5, fontWeight: '600', textAlign: 'center' } : { height: 0 }}>{notice}</Text>
        <Text style={{ color: onDark.soft, fontSize: 10.5, lineHeight: 16, textAlign: 'center' }}>Quem escanear ou abrir o link pede para entrar, e um representante aprova. O link vale até alguém gerar outro. Toque e segure o link para copiá-lo.</Text>
        {confirming
          ? <View accessibilityLabel="Confirmar novo link" style={{ width: '100%', borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.07)', padding: 12 }}>
            <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: '#ffffff', fontSize: 12.5, fontWeight: '800' }}>Gerar outro link?</Text>
            <Text style={{ marginTop: 2, color: '#ffffff', fontSize: 11.5, lineHeight: 17 }}>O link e o QR atuais deixam de valer na hora. Pedidos já enviados continuam esperando a sua resposta.</Text>
            {regenerate.error ? <Notice surface="dark" tone="error">{regenerate.error}</Notice> : null}
            <View style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
              <ActionButton tone="mint" grow title={regenerate.busy ? 'Gerando…' : 'Gerar outro link'} disabled={regenerate.busy} onPress={() => void renew()} />
              <ActionButton grow tone="line" title="Cancelar" disabled={regenerate.busy} onPress={() => { regenerate.setError(''); setConfirming(false) }} />
            </View>
          </View>
          : <View style={{ alignSelf: 'stretch' }}><ActionButton tone="line" icon="refresh-cw" title="Gerar outro link" onPress={() => setConfirming(true)} fit /></View>}
      </>}
  </View>
}
