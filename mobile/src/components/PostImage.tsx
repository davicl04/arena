import { useState } from 'react'
import { Image, Text, View } from 'react-native'
import { cx } from '../styles'
import { authSource } from './media'
// Foto de publicação: privada, carregada com o Bearer da sessão. Sem token ou após falha mostra um bloco neutro.
export default function PostImage({ path, token, label, className }: { path: string; token: string | null; label: string; className?: string }) {
  const [failed, setFailed] = useState<{ path: string; token: string } | null>(null)
  const source = token ? authSource(path, token) : null
  if (token && source && (failed?.path !== path || failed.token !== token)) {
    return <Image key={path} accessibilityLabel={label} source={source} onError={() => setFailed({ path, token })} resizeMode="cover" className={cx('bg-line', className)} />
  }
  return <View accessible accessibilityRole="image" accessibilityLabel={token ? `${label} (imagem indisponível)` : label} className={cx('items-center justify-center bg-line', className)}>
    {token ? <Text className="text-[12px] text-ink-muted">Imagem indisponível</Text> : null}
  </View>
}
