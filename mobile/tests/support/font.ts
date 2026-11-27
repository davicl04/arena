// Substitui o `expo-font`, os arquivos .ttf do `@expo-google-fonts` e as imagens locais .jpg (a capa padrão) nos testes (Node, sem
// runtime nativo nem Metro). O carregamento das fontes "falha", como num aparelho sem elas: o `App` segue com a fonte do sistema e os
// estilos chegam intactos aos componentes. As imagens viram o número 0, uma fonte de imagem qualquer.
export const useFonts = (): [boolean, Error | null] => [false, new Error('Fontes indisponíveis nos testes')]
const file = 0
export default file
export const Inter_400Regular = file, Inter_500Medium = file, Inter_600SemiBold = file, Inter_700Bold = file
export const Sora_600SemiBold = file, Sora_700Bold = file, Sora_800ExtraBold = file
