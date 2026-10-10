import { useState } from 'react'
import { Image, Text, View } from 'react-native'
import { apiUrl } from '../api/client'

// Mídias da API são privadas: a imagem é carregada com o Bearer da sessão (SecureStore).
const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()

export function Avatar({ path, name, token, size = 42 }: { path: string | null; name: string; token: string | null; size?: number }) {
  const [failed, setFailed] = useState(false)
  const shape = { width: size, height: size, borderRadius: size / 2, backgroundColor: '#e2e4e9' }
  return path && token && !failed
    ? <Image key={path} accessibilityLabel={`Foto de ${name}`} source={{ uri: apiUrl(path), headers: { Authorization: `Bearer ${token}` } }} onError={() => setFailed(true)} style={shape} />
    : <View accessibilityRole="image" accessibilityLabel={`Iniciais de ${name}`} style={[shape, { alignItems: 'center', justifyContent: 'center' }]}><Text style={{ fontWeight: '700', color: '#343d39', fontSize: size / 3 }}>{initialsOf(name)}</Text></View>
}

// Sem capa personalizada (ou se a imagem falhar) mostra um bloco neutro da paleta; não há asset de capa padrão no mobile.
export function Cover({ path, token, height = 120 }: { path: string | null; token: string | null; height?: number }) {
  const [failed, setFailed] = useState(false)
  const shape = { width: '100%' as const, height, backgroundColor: '#cdd4d0' }
  return path && token && !failed
    ? <Image key={path} accessibilityLabel="Foto de capa" source={{ uri: apiUrl(path), headers: { Authorization: `Bearer ${token}` } }} onError={() => setFailed(true)} resizeMode="cover" style={shape} />
    : <View accessibilityLabel="Capa padrão" style={shape} />
}
