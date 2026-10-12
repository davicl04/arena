// Imagens locais (PNG) importadas pelo Metro como fontes de imagem do React Native.
declare module '*.png' {
  import type { ImageSourcePropType } from 'react-native'
  const source: ImageSourcePropType
  export default source
}

// Só nos testes: o Vite lê o SVG da web como texto (`?raw`) para conferir o módulo gerado da marca.
declare module '*.svg?raw' {
  const content: string
  export default content
}
