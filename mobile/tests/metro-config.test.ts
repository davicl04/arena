import { describe, expect, it, vi } from 'vitest'

/** O metro.config.js é CommonJS e sem tipos: o caminho em variável evita que o TypeScript procure um módulo tipado. */
const configPath = '../metro.config.js'

describe('Metro: fontes com o NativeWind 5', () => {
  it('o expo-asset resolve o react-native de verdade (o proxy do NativeWind não tem o AssetRegistry); o resto passa pelo NativeWind', async () => {
    const config = (await import(/* @vite-ignore */ configPath) as { default: { resolver: { resolveRequest: (context: unknown, name: string, platform: string) => unknown } } }).default as { resolver: { resolveRequest: (context: unknown, name: string, platform: string) => unknown } }
    const real = vi.fn(() => ({ type: 'sourceFile', filePath: '/node_modules/react-native/index.js' }))
    const context = (origin: string) => ({ originModulePath: origin, resolveRequest: real })
    expect(config.resolver.resolveRequest(context('/app/node_modules/expo/node_modules/expo-asset/build/Asset.js'), 'react-native', 'ios'))
      .toEqual({ type: 'sourceFile', filePath: '/node_modules/react-native/index.js' })
    expect(real).toHaveBeenCalledWith(expect.anything(), 'react-native', 'ios')
  })
})
