import { useState } from 'react'
import { Image, View } from 'react-native'
import { Text } from './Text'
import { apiUrl } from '../api/client'
import { isApiPath } from '../api/path'
import { Wash } from './ranking/Wash'
import defaultCover from '../../assets/images/arena-cover.jpg'

// Mídias da API são privadas: a imagem é carregada com o Bearer da sessão (SecureStore).
const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()
/**
 * Fonte autenticada de uma mídia da API: o endereço absoluto e o Bearer da sessão. O Bearer só vai para caminhos
 * relativos à API (`/api/v1/...`); qualquer outra forma (`@host/x`, `//host/x`, URL absoluta) devolve `null` (sem imagem
 * e sem cabeçalho), para a sessão nunca sair para outro servidor.
 */
export const authSource = (path: string, token: string) => isApiPath(path) ? { uri: apiUrl(path), headers: { Authorization: `Bearer ${token}` } } : null

/** Foto da pessoa ou, sem ela, as iniciais em verde e extranegrito sobre o fundo da tela (o `SocialPhoto` da web). */
export function Avatar({ path, name, token, size = 42 }: { path: string | null; name: string; token: string | null; size?: number }) {
  const [failedImage, setFailedImage] = useState<{ path: string; token: string } | null>(null)
  // Tamanho e raio dependem de `size`: ficam em `style`.
  const shape = { width: size, height: size, borderRadius: size / 2 }
  const source = path && token ? authSource(path, token) : null
  return path && token && source && (failedImage?.path !== path || failedImage.token !== token)
    ? <Image key={path} accessibilityLabel={`Foto de ${name}`} source={source} onError={() => setFailedImage({ path, token })} className="bg-app" style={shape} />
    : <View accessibilityRole="image" accessibilityLabel={`Iniciais de ${name}`} className="items-center justify-center bg-app" style={shape}><Text className="font-extrabold text-brand" style={{ fontSize: Math.round(size * 0.28) }}>{initialsOf(name)}</Text></View>
}

/**
 * Capa do perfil, como a `ProfileCover` da web: a foto personalizada ou, sem ela (ou se falhar), a capa padrão do Arena
 * (assets/images/arena-cover.jpg, a mesma imagem da web), recortada perto do centro. `hero` é a capa do topo do perfil: cantos de
 * baixo arredondados e o degradê escuro no topo, que deixa legíveis a barra de status e os botões sobre a foto.
 */
export function Cover({ path, token, height = 120, hero = false }: { path: string | null; token: string | null; height?: number; hero?: boolean }) {
  const [failedImage, setFailedImage] = useState<{ path: string; token: string } | null>(null)
  const source = path && token ? authSource(path, token) : null
  const custom = Boolean(path && token && source && (failedImage?.path !== path || failedImage.token !== token))
  return <View className="w-full overflow-hidden bg-[#2b3a33]" style={{ height, ...(hero ? { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 } : null) }}>
    {custom && source
      ? <Image key={path} accessibilityLabel="Foto de capa" source={source} onError={() => setFailedImage({ path: path!, token: token! })} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
      : <Image accessibilityLabel="Capa padrão" source={defaultCover} resizeMode="cover" style={{ width: '100%', height: '100%' }} />}
    {hero ? <Wash id="cover-shade" color="#000000" from={0.4} reach={0.55} /> : null}
  </View>
}
