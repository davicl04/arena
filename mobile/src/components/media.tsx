import { useState } from 'react'
import { Image, Text, View } from 'react-native'
import { apiUrl } from '../api/client'

// Mídias da API são privadas: a imagem é carregada com o Bearer da sessão (SecureStore).
const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()
export const authSource = (path: string, token: string) => ({ uri: apiUrl(path), headers: { Authorization: `Bearer ${token}` } })

export function Avatar({ path, name, token, size = 42 }: { path: string | null; name: string; token: string | null; size?: number }) {
  const [failedImage, setFailedImage] = useState<{ path: string; token: string } | null>(null)
  // Tamanho e raio dependem de `size`: ficam em `style`.
  const shape = { width: size, height: size, borderRadius: size / 2 }
  return path && token && (failedImage?.path !== path || failedImage.token !== token)
    ? <Image key={path} accessibilityLabel={`Foto de ${name}`} source={authSource(path, token)} onError={() => setFailedImage({ path, token })} className="bg-app" style={shape} />
    : <View accessibilityRole="image" accessibilityLabel={`Iniciais de ${name}`} className="items-center justify-center bg-app" style={shape}><Text className="font-bold text-ink" style={{ fontSize: size / 3 }}>{initialsOf(name)}</Text></View>
}

// Sem capa personalizada (ou se a imagem falhar) mostra um bloco neutro da paleta; não há asset de capa padrão no mobile.
export function Cover({ path, token, height = 120 }: { path: string | null; token: string | null; height?: number }) {
  const [failedImage, setFailedImage] = useState<{ path: string; token: string } | null>(null)
  return path && token && (failedImage?.path !== path || failedImage.token !== token)
    ? <Image key={path} accessibilityLabel="Foto de capa" source={authSource(path, token)} onError={() => setFailedImage({ path, token })} resizeMode="cover" className="w-full bg-line" style={{ height }} />
    : <View accessibilityLabel="Capa padrão" className="w-full bg-line" style={{ height }} />
}
