const { getDefaultConfig } = require('expo/metro-config')
const { withNativewind } = require('nativewind/metro')

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname)
const nativewind = withNativewind(config)

/*
 * O NativeWind 5 (react-native-css 3.1.0-rc.0) troca todo `import … from 'react-native'` por um proxy próprio que ainda
 * não tem o `AssetRegistry` do React Native 0.88. O expo-asset o importa para carregar as fontes (Inter e Sora): sem ele,
 * o `useFonts` falha com "Cannot read property 'getAssetByID' of undefined" e o app cai na fonte do sistema. O expo-asset
 * não desenha componentes com `className`, então ele resolve o `react-native` de verdade.
 */
const resolveRequest = nativewind.resolver.resolveRequest
nativewind.resolver.resolveRequest = (context, moduleName, platform) =>
  moduleName === 'react-native' && /[\\/]expo-asset[\\/]/.test(context.originModulePath)
    ? context.resolveRequest(context, moduleName, platform)
    : resolveRequest(context, moduleName, platform)

module.exports = nativewind
