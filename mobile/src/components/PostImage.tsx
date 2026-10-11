import { useState } from 'react'
import { Image, Text, View } from 'react-native'
import type { ImageStyle, StyleProp } from 'react-native'
import { authSource } from './media'

// Foto de publicação: privada, carregada com o Bearer da sessão. Sem token ou após falha mostra um bloco neutro.
export default function PostImage({ path, token, label, style }: { path: string; token: string | null; label: string; style?: StyleProp<ImageStyle> }) {
  const [failed, setFailed] = useState<{ path: string; token: string } | null>(null)
  if (token && (failed?.path !== path || failed.token !== token)) {
    return <Image key={path} accessibilityLabel={label} source={authSource(path, token)} onError={() => setFailed({ path, token })} resizeMode="cover" style={[{ backgroundColor: '#cdd4d0' }, style]} />
  }
  return <View accessible accessibilityRole="image" accessibilityLabel={token ? `${label} (imagem indisponível)` : label} style={[{ backgroundColor: '#cdd4d0', alignItems: 'center', justifyContent: 'center' }, style]}>
    {token ? <Text style={{ color: '#606965', fontSize: 12 }}>Imagem indisponível</Text> : null}
  </View>
}
